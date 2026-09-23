'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const script = path.resolve(__dirname, '..', 'scripts', 'perf-phase.js');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-phase-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, 'bench.sh'), 'echo PERF_METRICS_START; echo \'{"latency_ms": 12}\'; echo PERF_METRICS_END\n');
  git('add', 'bench.sh');
  git('commit', '-qm', 'init');
  return dir;
}

function run(dir, args) {
  return execFileSync('node', [script, args], { cwd: dir, encoding: 'utf8', env: { ...process.env, AI_STATE_DIR: '' } });
}

function commitCount(dir) {
  return Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim());
}

test('setup then baseline records state and checkpoints only perf files', () => {
  const dir = makeRepo();
  try {
    const setup = run(dir, '--phase setup --scenario "smoke" --command "sh bench.sh" --version v0 --runs 2');
    assert.match(setup, /setup done\. Next phase: baseline/);
    assert.equal(commitCount(dir), 2, 'setup checkpoint commits the perf state');

    const baseline = run(dir, '--resume --runs 2');
    assert.match(baseline, /"latency_ms": 12/);
    assert.match(baseline, /Next phase: breaking-point/);
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'perf', 'baselines', 'v0.json')));
    assert.equal(commitCount(dir), 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('checkpoint is skipped when the user has unrelated changes', () => {
  const dir = makeRepo();
  try {
    fs.writeFileSync(path.join(dir, 'user-work.txt'), 'not perf state\n');
    const out = run(dir, '--phase setup --scenario "smoke" --command "sh bench.sh" --version v0 --runs 2');
    assert.match(out, /Checkpoint skipped: 1 changed path\(s\) outside/);
    assert.equal(commitCount(dir), 1, 'no commit was made');
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
    assert.match(status, /\?\? user-work\.txt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a second call without --resume does not reset an investigation in progress', () => {
  const dir = makeRepo();
  try {
    run(dir, '--phase setup --scenario "smoke" --command "sh bench.sh" --version v0 --runs 2');
    const before = fs.readFileSync(path.join(dir, '.claude', 'perf', 'investigation.json'), 'utf8');
    assert.throws(() => run(dir, '--phase decision --verdict stop --rationale "no gain"'), /in progress.*--resume/);
    const after = fs.readFileSync(path.join(dir, '.claude', 'perf', 'investigation.json'), 'utf8');
    assert.equal(after, before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing required inputs fail with the flag names', () => {
  const dir = makeRepo();
  try {
    assert.throws(() => run(dir, '--phase setup --scenario "smoke"'), /--command, --version/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
