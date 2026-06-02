import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const isProd = app.isPackaged || process.env.NODE_ENV === 'production';
const devServerUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5180';

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, '..', 'preload', 'index.js'),
    path.join(__dirname, '..', '..', 'build-electron', 'electron', 'preload', 'index.js'),
    path.join(process.resourcesPath, 'app.asar', 'build-electron', 'electron', 'preload', 'index.js')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 回退到预期路径，便于尽早暴露构建/拷贝问题。
  return candidates[0];
}

function resolveDistHtmlPath(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'dist', 'index.html'),
    path.join(__dirname, '..', '..', '..', 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

const paths = {
  preload: resolvePreloadPath(),
  distHtml: resolveDistHtmlPath()
};

export {
  devServerUrl,
  isProd,
  paths
};
