import type { AppMeta, FeatureFlag, RuntimeBootstrap, TemplateCapability } from '../../../../shared/contracts';

interface RuntimeState {
  bootstrap: RuntimeBootstrap | null;
  appMeta: AppMeta | null;
  capabilities: TemplateCapability[];
  featureFlags: FeatureFlag[];
  bootError: string;
}

const runtimeState: RuntimeState = {
  bootstrap: null,
  appMeta: null,
  capabilities: [],
  featureFlags: [],
  bootError: ''
};

function setRuntimeBootstrap(bootstrap: RuntimeBootstrap) {
  // 单次写入启动载荷，同时派生缓存常用字段。
  runtimeState.bootstrap = bootstrap;
  runtimeState.appMeta = bootstrap.appMeta;
  runtimeState.capabilities = bootstrap.capabilities;
  runtimeState.featureFlags = bootstrap.featureFlags;
}

function setRuntimeError(message: string) {
  runtimeState.bootError = message;
}

function getRuntimeState(): RuntimeState {
  return runtimeState;
}

function isFeatureEnabled(key: string): boolean {
  const found = runtimeState.featureFlags.find((item) => item.key === key);
  return Boolean(found?.enabled);
}

export {
  getRuntimeState,
  isFeatureEnabled,
  setRuntimeBootstrap,
  setRuntimeError
};
