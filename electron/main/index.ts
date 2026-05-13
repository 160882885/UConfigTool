import { app, Menu } from 'electron';

import { registerIpcHandlers } from './ipc';
import { setupLifecycleEvents } from './lifecycle';
import { createLogger } from './logger';
import { createMainWindow } from './window';

// 主进程入口日志器：用于记录应用生命周期关键节点。
const logger = createLogger('main:index');

async function bootstrap() {
  // 等待 Electron 完成初始化后再进行窗口与 IPC 注册。
  await app.whenReady();

  // 统一注册主进程可用 IPC 能力。
  registerIpcHandlers();

  // 仅使用渲染层自定义顶部菜单，禁用系统原生菜单。
  Menu.setApplicationMenu(null);

  // 绑定应用生命周期事件（激活、窗口关闭等）。
  setupLifecycleEvents(createMainWindow);

  // 创建主窗口并加载渲染资源。
  await createMainWindow();

  logger.info('Electron bootstrap completed');
}

bootstrap().catch((error: unknown) => {
  // 启动失败时记录错误并主动退出，避免应用半初始化状态。
  logger.error('Failed to bootstrap electron app', error);
  app.quit();
});
