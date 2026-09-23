#!/usr/bin/env node
/**
 * Run one /perf phase: read or create the investigation, run the phase's
 * runner from lib/perf, record state and the investigation log, advance to
 * the next phase, and checkpoint.
 *
 * Usage:
 *   node scripts/perf-phase.js "<raw /perf arguments>"
 *   node scripts/perf-phase.js --resume --phase baseline --runs 5
 *
 * The phase logic is deterministic, so it lives here instead of in the
 * command prompt. The command decides what to run next and talks to the user.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const investigationState = require(path.join(root, 'lib/perf/investigation-state.js'));
const baselineStore = require(path.join(root, 'lib/perf/baseline-store.js'));
const benchmarkRunner = require(path.join(root, 'lib/perf/benchmark-runner.js'));
const breakingPointRunner = require(path.join(root, 'lib/perf/breaking-point-runner.js'));
const constraintRunner = require(path.join(root, 'lib/perf/constraint-runner.js'));
const profilingRunner = require(path.join(root, 'lib/perf/profiling-runner.js'));
const optimizationRunner = require(path.join(root, 'lib/perf/optimization-runner.js'));
const consolidation = require(path.join(root, 'lib/perf/consolidation.js'));
const checkpoint = require(path.join(root, 'lib/perf/checkpoint.js'));
const argumentParser = require(path.join(root, 'lib/perf/argument-parser.js'));
const codePaths = require(path.join(root, 'lib/perf/code-paths.js'));
const { getStateDir, getStateDirPath } = require(path.join(root, 'lib/platform/state-dir'));

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function parseOptions(argv) {
  const args = argumentParser.parseArguments(argv.length === 1 ? argv[0] : argv);
  const options = {
    resume: false, phase: null, id: null, scenario: '', command: '', version: '',
    duration: null, runs: null, aggregate: '', quote: '', hypothesesFile: '',
    paramEnv: 'PERF_PARAM_VALUE', paramMin: 1, paramMax: 500, cpu: '1', memory: '1GB',
    change: '', verdict: '', rationale: ''
  };
  const stringFlags = {
    '--phase': 'phase', '--id': 'id', '--scenario': 'scenario', '--command': 'command',
    '--version': 'version', '--aggregate': 'aggregate', '--quote': 'quote',
    '--hypotheses-file': 'hypothesesFile', '--param-env': 'paramEnv', '--cpu': 'cpu',
    '--memory': 'memory', '--change': 'change', '--verdict': 'verdict', '--rationale': 'rationale'
  };
  const numberFlags = { '--duration': 'duration', '--runs': 'runs', '--param-min': 'paramMin', '--param-max': 'paramMax' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--resume') options.resume = true;
    else if (stringFlags[arg] && args[i + 1] !== undefined) options[stringFlags[arg]] = args[++i];
    else if (numberFlags[arg] && args[i + 1] !== undefined) options[numberFlags[arg]] = Number(args[++i]);
  }
  return options;
}

/**
 * Checkpoint only when every pending change is inside the perf state dir.
 * commitCheckpoint falls back to `git add -A` when the state dir cannot be
 * staged (for example when it is gitignored), which would commit the user's
 * unrelated work under a perf message.
 */
function safeCheckpoint(input, cwd) {
  let status;
  try {
    status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  } catch {
    return console.log('[INFO] Checkpoint skipped: not a git repository');
  }
  const perfPrefix = `${getStateDir(cwd)}/perf/`;
  const other = status.split('\n').filter(Boolean).map(line => line.slice(3)).filter(p => !p.startsWith(perfPrefix));
  if (other.length > 0) {
    return console.log(`[INFO] Checkpoint skipped: ${other.length} changed path(s) outside ${perfPrefix}, not committing unrelated work`);
  }
  const result = checkpoint.commitCheckpoint(input);
  console.log(result.ok ? `[OK] Checkpoint: ${result.message}` : `[INFO] Checkpoint skipped: ${result.reason}`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const cwd = process.cwd();

  if (options.phase && !investigationState.PHASES.includes(options.phase)) {
    fail(`Invalid phase: ${options.phase}. Allowed: ${investigationState.PHASES.join(', ')}`);
  }

  let state = investigationState.readInvestigation(cwd);
  if (options.resume) {
    if (!state) fail('No active investigation found. Run /perf without --resume first.');
    if (options.phase) state = investigationState.updateInvestigation({ phase: options.phase }, cwd);
  } else {
    state = investigationState.initializeInvestigation({ id: options.id, phase: options.phase, scenario: options.scenario }, cwd);
  }

  const durationOpt = Number.isFinite(options.duration) ? options.duration : undefined;
  if (options.command || options.version || options.scenario) {
    state = investigationState.updateInvestigation({
      scenario: {
        description: options.scenario || state.scenario?.description || '',
        metrics: state.scenario?.metrics || [],
        successCriteria: state.scenario?.successCriteria || '',
        scenarios: state.scenario?.scenarios || []
      },
      benchmark: {
        command: options.command || state.benchmark?.command || '',
        version: options.version || state.benchmark?.version || '',
        duration: durationOpt ?? state.benchmark?.duration,
        runs: Number.isFinite(options.runs) ? options.runs : state.benchmark?.runs,
        aggregate: options.aggregate || state.benchmark?.aggregate
      }
    }, cwd);
  }

  const phase = state.phase;
  const command = state.benchmark?.command || options.command;
  const version = state.benchmark?.version || options.version;
  const runs = Number.isFinite(options.runs) ? options.runs : state.benchmark?.runs;
  const aggregate = options.aggregate || state.benchmark?.aggregate;
  const duration = durationOpt ?? state.benchmark?.duration;
  const userQuote = options.quote || options.scenario || 'n/a';

  const needs = {
    setup: [[state.scenario?.description, '--scenario'], [command, '--command'], [version, '--version']],
    baseline: [[command, '--command'], [version, '--version']],
    'breaking-point': [[command, '--command']],
    constraints: [[command, '--command']],
    hypotheses: [[state.scenario?.description, '--scenario']],
    'code-paths': [[state.scenario?.description, '--scenario']],
    optimization: [[options.change, '--change']],
    decision: [[options.verdict, '--verdict'], [options.rationale, '--rationale']],
    consolidation: [[version, '--version']]
  };
  const missing = (needs[phase] || []).filter(([value]) => !value).map(([, flag]) => flag);
  if (missing.length > 0) fail(`Missing required input(s) for ${phase}: ${missing.join(', ')}`);

  console.log(`## /perf ${state.id} | phase: ${phase} | scenario: ${state.scenario?.description || 'n/a'}`);
  const cp = (deltaSummary = 'n/a') => safeCheckpoint({ phase, id: state.id, baselineVersion: version || 'n/a', deltaSummary }, cwd);

  switch (phase) {
    case 'setup': {
      let repoIntelContext = '';
      try {
        const mapFile = path.join(getStateDirPath(cwd), 'repo-intel.json');
        if (fs.existsSync(mapFile)) {
          const binary = require(path.join(root, 'lib/binary'));
          const ps = JSON.parse(await binary.runAnalyzerAsync(['repo-intel', 'query', 'painspots', '--top', '5', '--map-file', mapFile, cwd]));
          if (Array.isArray(ps) && ps.length > 0) {
            repoIntelContext = 'Top pain spots (hotspot x complexity x bug density, likely investigation targets):\n' +
              ps.map(p => `- ${p.path}: pain=${p.painScore?.toFixed(2)}, complexity=${p.complexityMax}, bugRate=${p.bugFixRate?.toFixed(2)}`).join('\n');
            console.log(repoIntelContext);
          }
        }
      } catch (e) {
        console.log(`[WARN] repo-intel painspots unavailable: ${e.message}`);
      }
      state = investigationState.updateInvestigation({ phase: 'baseline', repoIntelContext }, cwd);
      investigationState.appendSetupLog({ id: state.id, userQuote, scenario: state.scenario?.description || '', command, version, duration, runs, aggregate }, cwd);
      cp();
      break;
    }
    case 'baseline': {
      const result = benchmarkRunner.runBenchmarkSeries(command, { duration: durationOpt, runs, aggregate });
      baselineStore.writeBaseline(version, { command, metrics: result.metrics }, cwd);
      const baselinePath = baselineStore.getBaselinePath(version, cwd);
      investigationState.appendBaselineLog({
        id: state.id, userQuote, command, metrics: result.metrics, baselinePath, duration, runs,
        aggregate: aggregate || (runs ? 'median' : undefined), scenarios: state.scenario?.scenarios
      }, cwd);
      investigationState.updateInvestigation({ phase: 'breaking-point' }, cwd);
      console.log(JSON.stringify({ baseline: baselinePath, metrics: result.metrics }, null, 2));
      cp();
      break;
    }
    case 'breaking-point': {
      const result = await breakingPointRunner.runBreakingPointSearch({ command, paramEnv: options.paramEnv, min: options.paramMin, max: options.paramMax });
      investigationState.updateInvestigation({ breakingPoint: result.breakingPoint, breakingPointHistory: result.history, phase: 'constraints' }, cwd);
      investigationState.appendBreakingPointLog({
        id: state.id, userQuote, paramEnv: options.paramEnv, min: options.paramMin, max: options.paramMax,
        breakingPoint: result.breakingPoint, history: result.history
      }, cwd);
      console.log(JSON.stringify({ breakingPoint: result.breakingPoint }, null, 2));
      cp(`breakingPoint=${result.breakingPoint ?? 'n/a'}`);
      break;
    }
    case 'constraints': {
      const results = constraintRunner.runConstraintTest({ command, constraints: { cpu: options.cpu, memory: options.memory }, duration: durationOpt, runs, aggregate });
      const all = Array.isArray(state.constraintResults) ? state.constraintResults : [];
      all.push(results);
      investigationState.updateInvestigation({ constraintResults: all, phase: 'hypotheses' }, cwd);
      investigationState.appendConstraintLog({ id: state.id, userQuote, constraints: results.constraints, delta: results.delta }, cwd);
      console.log(JSON.stringify({ constraints: results.constraints, delta: results.delta }, null, 2));
      cp('constraints');
      break;
    }
    case 'hypotheses': {
      let hypotheses = Array.isArray(state.hypotheses) ? state.hypotheses : [];
      if (hypotheses.length === 0) {
        if (!options.hypothesesFile) fail('Missing hypotheses. Run perf-theory-gatherer and pass --hypotheses-file.');
        try {
          const parsed = JSON.parse(fs.readFileSync(options.hypothesesFile, 'utf8'));
          hypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses : parsed;
        } catch (e) {
          fail(`Failed to load hypotheses file: ${e.message}`);
        }
      }
      investigationState.updateInvestigation({ hypotheses, phase: 'code-paths' }, cwd);
      investigationState.appendHypothesesLog({ id: state.id, userQuote, hypotheses, gitHistory: checkpoint.getRecentCommits(5), hypothesesFile: options.hypothesesFile || null }, cwd);
      cp();
      break;
    }
    case 'code-paths': {
      const repoMap = require(path.join(root, 'lib/repo-map'));
      const mapStatus = repoMap.status(cwd);
      const repoMapStatus = mapStatus.exists
        ? `available (files=${mapStatus.status?.files ?? 'n/a'}, symbols=${mapStatus.status?.symbols ?? 'n/a'})`
        : 'missing';
      if (!mapStatus.exists) console.log('[INFO] Repo map not found. /repo-intel init gives better code-path coverage.');
      const result = codePaths.collectCodePaths(repoMap.load(cwd), state.scenario?.description || '');
      investigationState.updateInvestigation({ codePaths: result.paths, phase: 'profiling' }, cwd);
      investigationState.appendCodePathsLog({ id: state.id, userQuote, keywords: result.keywords, paths: result.paths, repoMapStatus }, cwd);
      console.log(JSON.stringify({ keywords: result.keywords, paths: result.paths }, null, 2));
      cp(`paths=${result.paths.length}`);
      break;
    }
    case 'profiling': {
      const result = profilingRunner.runProfiling({ repoPath: cwd, command });
      if (!result.ok) fail(`Profiling failed: ${result.error}`);
      const all = Array.isArray(state.profilingResults) ? state.profilingResults : [];
      all.push(result.result);
      investigationState.updateInvestigation({ profilingResults: all, phase: 'optimization' }, cwd);
      investigationState.appendProfilingLog({
        id: state.id, userQuote, tool: result.result.tool, command: result.result.command,
        artifacts: result.result.artifacts, hotspots: result.result.hotspots
      }, cwd);
      console.log(JSON.stringify({ tool: result.result.tool, hotspots: result.result.hotspots, artifacts: result.result.artifacts }, null, 2));
      cp();
      break;
    }
    case 'optimization': {
      const result = optimizationRunner.runOptimizationExperiment({ command, changeSummary: options.change, duration: durationOpt, runs, aggregate });
      const all = Array.isArray(state.results) ? state.results : [];
      all.push(result);
      investigationState.updateInvestigation({ results: all, phase: 'decision' }, cwd);
      investigationState.appendOptimizationLog({
        id: state.id, userQuote, change: options.change, delta: result.delta, verdict: result.verdict,
        gitHistory: checkpoint.getRecentCommits(5), runs, aggregate: aggregate || (runs ? 'median' : undefined)
      }, cwd);
      console.log(JSON.stringify({ change: options.change, delta: result.delta, verdict: result.verdict }, null, 2));
      cp();
      break;
    }
    case 'decision': {
      investigationState.updateInvestigation({ decision: { verdict: options.verdict, rationale: options.rationale }, phase: 'consolidation' }, cwd);
      investigationState.appendDecisionLog({
        id: state.id, userQuote, verdict: options.verdict, rationale: options.rationale,
        resultsCount: Array.isArray(state.results) ? state.results.length : 0
      }, cwd);
      cp();
      break;
    }
    case 'consolidation': {
      const baseline = baselineStore.readBaseline(version, cwd);
      if (!baseline) fail(`Baseline not found for version ${version}`);
      const result = consolidation.consolidateBaseline({ version, baseline }, cwd);
      investigationState.appendConsolidationLog({ id: state.id, userQuote, version, path: result.path }, cwd);
      investigationState.updateInvestigation({ phase: 'complete' }, cwd);
      cp();
      break;
    }
    default:
      console.log(`[INFO] Nothing to run for phase "${phase}".`);
      return;
  }

  const next = investigationState.readInvestigation(cwd);
  console.log(`[OK] ${phase} done. Next phase: ${next?.phase || 'n/a'}`);
}

main().catch(error => fail(error.stack || error.message));
