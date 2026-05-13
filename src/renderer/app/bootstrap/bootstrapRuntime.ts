import type { RuntimeBootstrap } from '../../../../shared/contracts';

import { appBridge } from '../../shared/api/appBridge';
import { createLogger } from '../../shared/logging/logger';

const logger = createLogger('renderer:bootstrapRuntime');

async function bootstrapRuntime(): Promise<RuntimeBootstrap> {
  // 统一启动入口：一次拉取应用启动所需全部数据，避免多次 IPC 往返。
  const data = await appBridge.getBootstrap();
  logger.info('bootstrap payload received', data);
  return data;
}

export {
  bootstrapRuntime
};
