const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const electronDir = path.join(root, 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');

function getPlatformExecutable() {
  switch (process.platform) {
    case 'win32':
      return 'electron.exe';
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return 'electron';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function existsFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function existsDir(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function ensurePathMarker(executablePath) {
  fs.mkdirSync(electronDir, { recursive: true });
  fs.writeFileSync(pathTxt, executablePath, 'utf8');
}

function getCurrentMarkerOrDefault() {
  if (!existsFile(pathTxt)) {
    return getPlatformExecutable();
  }
  const marker = fs.readFileSync(pathTxt, 'utf8').trim();
  return marker || getPlatformExecutable();
}

function isElectronReady() {
  if (!existsDir(electronDir) || !existsDir(distDir)) {
    return false;
  }
  const executablePath = getCurrentMarkerOrDefault();
  const absoluteExecutablePath = path.join(distDir, executablePath);
  return existsFile(absoluteExecutablePath);
}

function collectSourceCandidates() {
  const fromEnv = process.env.ELECTRON_OFFLINE_DIST;
  const fromSiblingTemplate = path.resolve(root, '..', 'ElectronTemplate', 'node_modules', 'electron', 'dist');

  const fromBuildConfig = (() => {
    const packageJsonPath = path.join(root, 'package.json');
    if (!existsFile(packageJsonPath)) {
      return null;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const configured = pkg?.build?.electronDist;
      if (typeof configured !== 'string' || configured.trim() === '') {
        return null;
      }
      return path.resolve(root, configured);
    } catch {
      return null;
    }
  })();

  const candidates = [];
  if (fromEnv) {
    candidates.push(path.resolve(root, fromEnv));
  }
  if (fromBuildConfig) {
    candidates.push(fromBuildConfig);
  }
  candidates.push(fromSiblingTemplate);
  return candidates;
}

function copyDistFrom(sourceDistPath) {
  if (!existsDir(sourceDistPath)) {
    return false;
  }

  const executablePath = getPlatformExecutable();
  const sourceExecutable = path.join(sourceDistPath, executablePath);
  if (!existsFile(sourceExecutable)) {
    return false;
  }

  fs.mkdirSync(distDir, { recursive: true });
  fs.cpSync(sourceDistPath, distDir, { recursive: true, force: true });
  ensurePathMarker(executablePath);
  return true;
}

function main() {
  if (!existsDir(electronDir)) {
    console.error('[repair:electron:offline] missing node_modules/electron. Run npm install first.');
    process.exit(1);
  }

  if (isElectronReady()) {
    console.log('[repair:electron:offline] electron binary already ready.');
    return;
  }

  const candidates = collectSourceCandidates();
  for (const candidate of candidates) {
    if (copyDistFrom(candidate) && isElectronReady()) {
      console.log(`[repair:electron:offline] restored electron dist from: ${candidate}`);
      return;
    }
  }

  console.error('[repair:electron:offline] failed to restore electron binary from offline sources.');
  console.error('[repair:electron:offline] set ELECTRON_OFFLINE_DIST to a dist folder containing electron binary.');
  process.exit(1);
}

main();
