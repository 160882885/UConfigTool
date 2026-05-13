import fs from 'node:fs';
import { BrowserWindow } from 'electron';

import { devServerUrl, isProd, paths } from './env';
import { createLogger } from './logger';
import { attachWindowSecurity } from './security';

// 窗口模块日志器：记录窗口加载流程、降级分支和异常路径。
const logger = createLogger('main:window');

async function isDevServerAvailable(url: string): Promise<boolean> {
  try {
    // 开发环境下优先探测 Vite 是否可访问。
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(1200)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function getFallbackHtml(message?: string) {
  const detail = message ? `<p><code>${message}</code></p>` : '';

  // 当 dev server 与 dist 同时不可用时，用内联页明确给出排障提示。
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Renderer Not Ready</title>
  <style>
    body { margin: 0; background: #101423; color: #dce6ff; font-family: "Segoe UI", sans-serif; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { max-width: 780px; background: #171d31; border: 1px solid #2e3b68; border-radius: 12px; padding: 20px; line-height: 1.6; }
    code { background: #0f1526; border: 1px solid #2e3b68; border-radius: 6px; padding: 2px 6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h2>Renderer not ready</h2>
      <p>No renderer resource was found.</p>
      <p>Expected path: <code>${paths.distHtml}</code></p>
      <p>Run <code>npm run dev</code> for development or <code>npm run build</code> before production start.</p>
      ${detail}
    </div>
  </div>
</body>
</html>`;
}

async function showFallbackPage(win: BrowserWindow, reason?: string) {
  logger.warn('Show fallback page', { reason });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getFallbackHtml(reason))}`);
}

async function loadRenderer(win: BrowserWindow) {
  if (isProd) {
    // 生产环境优先加载 dist 打包产物。
    if (fs.existsSync(paths.distHtml)) {
      logger.info('Loading production dist html', { path: paths.distHtml });
      await win.loadFile(paths.distHtml);
      return;
    }

    await showFallbackPage(win, 'dist/index.html not found');
    return;
  }

  // 开发环境优先连接 dev server。
  const devServerReady = await isDevServerAvailable(devServerUrl);
  if (devServerReady) {
    logger.info('Loading renderer from dev server', { devServerUrl });
    await win.loadURL(devServerUrl);
    return;
  }

  // 如果开发服务不可达，尝试回退到 dist（便于临时验证）。
  if (fs.existsSync(paths.distHtml)) {
    logger.warn('Dev server unavailable, fallback to dist html', { path: paths.distHtml });
    await win.loadFile(paths.distHtml);
    return;
  }

  await showFallbackPage(win, 'dev server not ready and dist/index.html not found');
}

async function createMainWindow(): Promise<BrowserWindow> {
  const isWindows = process.platform === 'win32';

  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#1e1e1e',
    // 清空标题，避免在最小化按钮旁出现多余文字。
    title: '',
    // Windows 下使用隐藏标题栏 + overlay，维持 Toolbox 风格壳层。
    titleBarStyle: isWindows ? 'hidden' : 'default',
    titleBarOverlay: isWindows
      ? {
          color: '#252526',
          symbolColor: '#cccccc',
          height: 32
        }
      : false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: paths.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  attachWindowSecurity(win);

  win.webContents.on('did-fail-load', async (_event, errorCode, errorDescription) => {
    if (errorCode === -3) {
      // -3 通常是导航中断，可忽略。
      return;
    }

    logger.error('Window did-fail-load', {
      errorCode,
      errorDescription
    });
    await showFallbackPage(win, `did-fail-load: ${errorCode} ${errorDescription}`);
  });

  // 等页面可展示后再显示窗口，减少白屏闪烁。
  win.once('ready-to-show', () => {
    logger.info('Main window ready-to-show');
    win.show();
  });

  // 双重确保隐藏原生菜单栏。
  win.setMenuBarVisibility(false);

  await loadRenderer(win);
  return win;
}

export { createMainWindow };
