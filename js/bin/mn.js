#!/usr/bin/env node
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getBinaryPath() {
  const root = getProjectRoot();
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return path.join(root, 'build', 'Release', `mn${suffix}`);
}

function runNodeGypRebuild(root) {
  const nodeGyp = process.env.npm_config_node_gyp;
  const cmd = nodeGyp ? process.execPath : 'node-gyp';
  const args = nodeGyp ? [nodeGyp, 'rebuild'] : ['rebuild'];
  const res = childProcess.spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: !nodeGyp && process.platform === 'win32',
  });
  if (res.status && res.status !== 0) {
    process.exit(res.status);
  }
}

function spawnBinary(binPath, argv) {
  const child = childProcess.spawn(binPath, argv, { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function main() {
  const root = getProjectRoot();
  const binPath = getBinaryPath();
  if (!fs.existsSync(binPath)) {
    runNodeGypRebuild(root);
  }
  spawnBinary(binPath, process.argv.slice(2));
}

main();
