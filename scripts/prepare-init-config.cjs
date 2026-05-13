const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const templatePath = path.join(root, 'scripts', 'templates', 'init.config.example.json');
const outputPath = path.join(root, 'template.init.json');

if (!fs.existsSync(templatePath)) {
  throw new Error('Template file not found.');
}

if (!fs.existsSync(outputPath)) {
  fs.copyFileSync(templatePath, outputPath);
  console.log('[init] created template.init.json');
} else {
  console.log('[init] template.init.json already exists');
}
