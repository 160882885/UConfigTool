const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'README.md',
  'src/renderer/App.tsx',
  'src/renderer/app/bootstrap/bootstrapRuntime.ts',
  'src/renderer/app/shell/AppShell.tsx',
  'src/renderer/shared/api/appBridge.ts',
  'src/renderer/shared/logging/logger.ts',
  'src/renderer/shared/state/runtimeState.ts',
  'src/renderer/styles.css',
  'src/renderer/shared/hooks/useSplitPane.ts',
  'electron/main/index.ts',
  'electron/main/logger.ts',
  'electron/main/window.ts',
  'electron/main/runtimeMeta.ts',
  'electron/main/config/runtimeBootstrap.ts',
  'electron/preload/index.ts',
  'shared/contracts.ts',
  'scripts/dev-runner.cjs',
  'scripts/repair-electron-offline.cjs',
  'scripts/init-project.cjs',
  'scripts/scaffold-feature.cjs',
  'scripts/template-doctor.cjs',
  '.github/workflows/ci.yml',
  'docs/ARCHITECTURE.md',
  'docs/CONVENTIONS.md',
  'docs/ONBOARDING.md',
  'docs/RELEASE.md',
  'docs/PROJECT_STRUCTURE_DETAILED.md'
];

const requiredScripts = [
  'dev',
  'typecheck',
  'lint',
  'test',
  'build',
  'build:electron',
  'check:all',
  'doctor',
  'repair:electron:offline',
  'init:project',
  'scaffold:feature'
];

function checkFiles() {
  return requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
}

function checkScripts(pkg) {
  const scripts = pkg.scripts || {};
  return requiredScripts.filter((key) => !scripts[key]);
}

function checkWindowMenuDisabled(mainIndex, windowSource) {
  return (
    mainIndex.includes('Menu.setApplicationMenu(null)') &&
    windowSource.includes('win.setMenuBarVisibility(false)') &&
    windowSource.includes('autoHideMenuBar: true')
  );
}

function checkToolboxShell(appShellSource) {
  return (
    appShellSource.includes('TopMenuBar') &&
    appShellSource.includes('SidebarTabs') &&
    appShellSource.includes('app-shell')
  );
}

function checkContracts(sharedContracts, preloadSource, ipcSource, bootstrapSource) {
  return (
    sharedContracts.includes('ApiResult') &&
    sharedContracts.includes('getCapabilities') &&
    sharedContracts.includes('getBootstrap') &&
    preloadSource.includes('getCapabilities') &&
    preloadSource.includes('getBootstrap') &&
    ipcSource.includes('getCapabilities') &&
    ipcSource.includes('getBootstrap') &&
    bootstrapSource.includes('createRuntimeBootstrap')
  );
}

function main() {
  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found in current directory.');
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const missingFiles = checkFiles();
  const missingScripts = checkScripts(pkg);

  const mainIndex = fs.readFileSync(path.join(root, 'electron/main/index.ts'), 'utf8');
  const windowSource = fs.readFileSync(path.join(root, 'electron/main/window.ts'), 'utf8');
  const appShellSource = fs.readFileSync(path.join(root, 'src/renderer/app/shell/AppShell.tsx'), 'utf8');
  const sharedContracts = fs.readFileSync(path.join(root, 'shared/contracts.ts'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(root, 'electron/preload/index.ts'), 'utf8');
  const ipcSource = fs.readFileSync(path.join(root, 'electron/main/ipc/registerAppIpc.ts'), 'utf8');
  const bootstrapSource = fs.readFileSync(path.join(root, 'electron/main/config/runtimeBootstrap.ts'), 'utf8');

  const findings = [];

  if (missingFiles.length > 0) {
    findings.push(`Missing files:\n  - ${missingFiles.join('\n  - ')}`);
  }

  if (missingScripts.length > 0) {
    findings.push(`Missing scripts in package.json:\n  - ${missingScripts.join('\n  - ')}`);
  }

  if (!checkWindowMenuDisabled(mainIndex, windowSource)) {
    findings.push('Window menu baseline mismatch: native menu may not be fully hidden.');
  }

  if (!checkToolboxShell(appShellSource)) {
    findings.push('App shell baseline mismatch: expected Toolbox topbar/sidebar/content structure.');
  }

  if (!checkContracts(sharedContracts, preloadSource, ipcSource, bootstrapSource)) {
    findings.push('Contract/bootstrap mismatch: ApiResult + getBootstrap chain not fully wired.');
  }

  if (findings.length > 0) {
    console.error('[doctor] template verification failed');
    for (const finding of findings) {
      console.error(`\n${finding}`);
    }
    process.exit(1);
  }

  console.log('[doctor] template verification passed');
}

main();
