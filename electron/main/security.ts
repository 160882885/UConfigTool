import { shell, type BrowserWindow } from 'electron';

import { createLogger } from './logger';

// 安全模块日志器：用于审计外链与导航拦截。
const logger = createLogger('main:security');

function attachWindowSecurity(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      // 统一禁止应用内新窗口，外链交给系统浏览器处理。
      void shell.openExternal(url);
      logger.info('Blocked in-app window open and forwarded external URL', { url });
    } catch {
      logger.warn('Failed to open external URL', { url });
    }
    return { action: 'deny' as const };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    const currentUrl = win.webContents.getURL();

    if (!currentUrl || targetUrl === currentUrl) {
      return;
    }

    // file -> file 允许导航（本地资源跳转场景）。
    if (currentUrl.startsWith('file://') && targetUrl.startsWith('file://')) {
      return;
    }

    try {
      const next = new URL(targetUrl);
      const current = new URL(currentUrl);
      if (next.origin === current.origin) {
        return;
      }
    } catch {
      // URL 解析失败视为不可信目标。
    }

    // 跨源导航默认阻断，避免加载未知页面。
    event.preventDefault();
    logger.warn('Blocked cross-origin navigation', {
      from: currentUrl,
      to: targetUrl
    });
  });
}

export {
  attachWindowSecurity
};
