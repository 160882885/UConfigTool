const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const configPath = path.join(root, 'template.init.json');
const fallbackTemplatePath = path.join(root, 'scripts', 'templates', 'init.config.example.json');
const packageJsonPath = path.join(root, 'package.json');
const appConfigPath = path.join(root, 'src', 'renderer', 'app', 'config.ts');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toSafeTsString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function updateAppConfigFile(filePath, productName) {
  const input = fs.readFileSync(filePath, 'utf8');

  const withTitle = input.replace(
    /title: '([^']*)'/,
    `title: '${toSafeTsString(productName)}'`
  );

  const withBrand = withTitle.replace(
    /sidebarBrand: '([^']*)'/,
    `sidebarBrand: '${toSafeTsString(productName)}'`
  );

  fs.writeFileSync(filePath, withBrand, 'utf8');
}

function main() {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found. Run this script in template root.');
  }

  if (!fs.existsSync(appConfigPath)) {
    throw new Error('src/renderer/app/config.ts not found.');
  }

  if (!fs.existsSync(configPath)) {
    if (!fs.existsSync(fallbackTemplatePath)) {
      throw new Error('template.init.json not found and no example template available.');
    }
    fs.copyFileSync(fallbackTemplatePath, configPath);
    console.log('[init] template.init.json was missing; created from example. Please edit it and rerun.');
    return;
  }

  const initConfig = readJson(configPath);
  const pkg = readJson(packageJsonPath);

  const appName = (initConfig.name || '').trim();
  const productName = (initConfig.productName || '').trim();
  const appId = (initConfig.appId || '').trim();
  const description = (initConfig.description || '').trim();
  const version = (initConfig.version || '').trim();

  if (!appName || !productName || !appId || !description) {
    throw new Error('template.init.json requires non-empty name, productName, appId, description.');
  }

  pkg.name = appName;
  pkg.productName = productName;
  pkg.description = description;

  if (version) {
    pkg.version = version;
  }

  pkg.build = pkg.build || {};
  pkg.build.appId = appId;
  pkg.build.productName = productName;

  writeJson(packageJsonPath, pkg);
  updateAppConfigFile(appConfigPath, productName);

  console.log('[init] project metadata updated:');
  console.log(`  - package name: ${pkg.name}`);
  console.log(`  - product name: ${productName}`);
  console.log(`  - appId: ${appId}`);
  console.log(`  - description: ${description}`);
  if (version) {
    console.log(`  - version: ${version}`);
  }
}

main();
