const path = require('node:path');
const { spawn } = require('node:child_process');

const START_PORT = 5180;
const rootDir = process.cwd();

function spawnNodeScript(scriptPath, args, extraEnv = {}) {
  return spawn(process.execPath, [scriptPath, ...args], {
    cwd: rootDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...extraEnv
    }
  });
}

function pipeWithCapture(stream, writeTo, onLine) {
  let buffer = '';
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    writeTo.write(text);
    buffer += text;
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      onLine(line);
      idx = buffer.indexOf('\n');
    }
  });
}

function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function runOfflineElectronRepair() {
  const repairScript = path.join(rootDir, 'scripts', 'repair-electron-offline.cjs');
  return spawn(process.execPath, [repairScript], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  });
}

function runElectronBuild(args = []) {
  const tscBin = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
  return spawnNodeScript(tscBin, ['-p', 'tsconfig.electron.build.json', ...args]);
}

async function buildElectronArtifacts() {
  const buildProc = runElectronBuild();
  buildProc.stdout.pipe(process.stdout);
  buildProc.stderr.pipe(process.stderr);

  const buildCode = await new Promise((resolve) => {
    buildProc.on('exit', (code) => resolve(code ?? 1));
  });

  if (buildCode !== 0) {
    process.exit(buildCode);
  }
}

async function main() {
  const repairProc = runOfflineElectronRepair();
  const repairCode = await new Promise((resolve) => {
    repairProc.on('exit', (code) => resolve(code ?? 1));
  });

  if (repairCode !== 0) {
    process.exit(repairCode);
  }

  await buildElectronArtifacts();

  const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const electronCli = path.join(rootDir, 'node_modules', 'electron', 'cli.js');

  const electronBuildWatchProc = runElectronBuild(['--watch', '--preserveWatchOutput']);
  const viteProc = spawnNodeScript(viteBin, ['--port', String(START_PORT)]);
  let electronProc = null;
  let shuttingDown = false;
  let electronStarted = false;

  electronBuildWatchProc.stdout.pipe(process.stdout);
  electronBuildWatchProc.stderr.pipe(process.stderr);

  const shutdown = (code = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    if (electronProc && !electronProc.killed) {
      electronProc.kill('SIGTERM');
    }
    if (!electronBuildWatchProc.killed) {
      electronBuildWatchProc.kill('SIGTERM');
    }
    if (!viteProc.killed) {
      viteProc.kill('SIGTERM');
    }

    setTimeout(() => process.exit(code), 50);
  };

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  const tryStartElectronFromLine = (line) => {
    if (electronStarted) {
      return;
    }

    const clean = stripAnsi(line);
    const match = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d+)/i);
    if (!match) {
      return;
    }

    const rendererUrl = `http://localhost:${match[1]}`;
    electronStarted = true;
    console.log(`[dev] Renderer ready at ${rendererUrl}`);

    electronProc = spawnNodeScript(electronCli, ['.'], {
      NODE_ENV: 'development',
      NODE_OPTIONS: '--import=tsx',
      ELECTRON_RENDERER_URL: rendererUrl
    });

    electronProc.stdout.pipe(process.stdout);
    electronProc.stderr.pipe(process.stderr);

    electronProc.on('exit', (code) => {
      if (shuttingDown) {
        return;
      }
      shutdown(code ?? 0);
    });
  };

  pipeWithCapture(viteProc.stdout, process.stdout, tryStartElectronFromLine);
  pipeWithCapture(viteProc.stderr, process.stderr, tryStartElectronFromLine);

  viteProc.on('exit', (code) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[dev] Vite exited with code ${code ?? 1}`);
    shutdown(code ?? 1);
  });
}

main().catch((error) => {
  console.error('[dev] Failed to start dev environment:', error);
  process.exit(1);
});
