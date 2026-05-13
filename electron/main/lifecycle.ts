import { app, BrowserWindow } from 'electron';

import { createLogger } from './logger';

const logger = createLogger('main:lifecycle');

function setupLifecycleEvents(createMainWindow: () => Promise<BrowserWindow>) {
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('App activated with no windows. Creating main window.');
      await createMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    logger.info('All windows closed');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

export {
  setupLifecycleEvents
};
