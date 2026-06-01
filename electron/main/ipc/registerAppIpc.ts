import { BrowserWindow, ipcMain } from 'electron';

import type {
  CreateConfigNodeInput,
  DeleteConfigNodeInput,
  ExportConfigInput,
  MoveConfigNodeInput,
  RenameConfigNodeInput,
  SaveConfigEnumSchemaInput,
  SaveConfigTableInput,
  SaveConfigTypeSchemaInput
} from '../../../shared/contracts';
import {
  createConfigNode,
  deleteConfigNode,
  getConfigStoreSnapshot,
  moveConfigNode,
  renameConfigNode,
  saveConfigEnumSchema,
  saveConfigTable,
  saveConfigTypeSchema
} from '../configStore';
import { createRuntimeBootstrap, TEMPLATE_CAPABILITIES } from '../config/runtimeBootstrap';
import { exportConfigs } from '../exportService';
import { createLogger } from '../logger';
import { createProject, getCurrentProject, openProject, showCurrentProjectFolder } from '../projectStore';
import { resolveAppRuntimeMeta } from '../runtimeMeta';
import { IPC_CHANNELS } from './channels';
import { wrapIpc } from './result';

// IPC 模块日志器：记录关键 IPC 调用与启动数据请求。
const logger = createLogger('main:ipc');

function registerAppIpcHandlers() {
  // 心跳接口：用于端到端连通性校验。
  ipcMain.handle(IPC_CHANNELS.ping, async () => wrapIpc(async () => 'pong'));

  // 返回应用元信息（名称、版本、环境）。
  ipcMain.handle(IPC_CHANNELS.getAppMeta, async () =>
    wrapIpc(async () => {
      return resolveAppRuntimeMeta();
    })
  );

  // 返回模板能力声明，便于渲染层做能力感知。
  ipcMain.handle(IPC_CHANNELS.getCapabilities, async () =>
    wrapIpc(async () => {
      return TEMPLATE_CAPABILITIES;
    })
  );

  // 一次性返回运行时 bootstrap 载荷（推荐作为前端启动入口）。
  ipcMain.handle(IPC_CHANNELS.getBootstrap, async () =>
    wrapIpc(async () => {
      const appMeta = resolveAppRuntimeMeta();
      const data = createRuntimeBootstrap({ appMeta });
      logger.info('Runtime bootstrap payload requested', {
        generatedAt: data.generatedAt,
        capabilityCount: data.capabilities.length,
        flagCount: data.featureFlags.length
      });
      return data;
    })
  );

  ipcMain.handle(IPC_CHANNELS.getCurrentProject, async () =>
    wrapIpc(async () => {
      return getCurrentProject();
    })
  );

  ipcMain.handle(IPC_CHANNELS.createProject, async (event) =>
    wrapIpc(async () => {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      return createProject(ownerWindow);
    })
  );

  ipcMain.handle(IPC_CHANNELS.openProject, async (event) =>
    wrapIpc(async () => {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      return openProject(ownerWindow);
    })
  );

  ipcMain.handle(IPC_CHANNELS.showCurrentProjectFolder, async () =>
    wrapIpc(async () => {
      return showCurrentProjectFolder();
    })
  );

  ipcMain.handle(IPC_CHANNELS.getConfigStoreSnapshot, async () =>
    wrapIpc(async () => {
      return getConfigStoreSnapshot();
    })
  );

  ipcMain.handle(IPC_CHANNELS.exportConfigs, async (_event, input: ExportConfigInput) =>
    wrapIpc(async () => {
      return exportConfigs(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.createConfigNode, async (_event, input: CreateConfigNodeInput) =>
    wrapIpc(async () => {
      return createConfigNode(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.deleteConfigNode, async (_event, input: DeleteConfigNodeInput) =>
    wrapIpc(async () => {
      return deleteConfigNode(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.renameConfigNode, async (_event, input: RenameConfigNodeInput) =>
    wrapIpc(async () => {
      return renameConfigNode(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.moveConfigNode, async (_event, input: MoveConfigNodeInput) =>
    wrapIpc(async () => {
      return moveConfigNode(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.saveConfigTypeSchema, async (_event, input: SaveConfigTypeSchemaInput) =>
    wrapIpc(async () => {
      return saveConfigTypeSchema(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.saveConfigEnumSchema, async (_event, input: SaveConfigEnumSchemaInput) =>
    wrapIpc(async () => {
      return saveConfigEnumSchema(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.saveConfigTable, async (_event, input: SaveConfigTableInput) =>
    wrapIpc(async () => {
      return saveConfigTable(input);
    })
  );

}

export {
  registerAppIpcHandlers
};
