const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const targets = ['dist', 'build-electron', 'release', '.npm-cache'];

for (const target of targets) {
  const fullPath = path.join(root, target);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`[clean] removed ${target}`);
  }
}
