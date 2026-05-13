import type { AppMeta, FeatureFlag, RuntimeBootstrap, TemplateCapability } from '../../../shared/contracts';

interface RuntimeOptions {
  appMeta: AppMeta;
}

// 模板能力声明：用于渲染层能力感知与诊断展示。
const TEMPLATE_CAPABILITIES: TemplateCapability[] = [
  'feature-manifest',
  'typed-ipc-contract',
  'toolbox-shell',
  'split-pane',
  'bootstrap-pipeline',
  'feature-flags'
];

// 默认功能开关：后续项目可按环境注入或远程下发。
const FEATURE_FLAGS: FeatureFlag[] = [
  { key: 'shell.runtimeMeta', enabled: true },
  { key: 'shell.featureFlags', enabled: true },
  { key: 'feature.placeholder.jsonTool', enabled: true },
  { key: 'feature.placeholder.renameTool', enabled: true },
  { key: 'feature.placeholder.launchSoftware', enabled: true }
];

function createRuntimeBootstrap(options: RuntimeOptions): RuntimeBootstrap {
  // 统一构建前端启动所需数据，避免多次 IPC 往返。
  return {
    appMeta: options.appMeta,
    capabilities: TEMPLATE_CAPABILITIES,
    featureFlags: FEATURE_FLAGS,
    generatedAt: new Date().toISOString()
  };
}

export {
  createRuntimeBootstrap,
  FEATURE_FLAGS,
  TEMPLATE_CAPABILITIES
};
