const IPC_CHANNELS = {
  ping: 'app:ping',
  getAppMeta: 'app:get-meta',
  getCapabilities: 'app:get-capabilities',
  getBootstrap: 'app:get-bootstrap',
  getCurrentProject: 'project:get-current',
  createProject: 'project:create',
  openProject: 'project:open',
  showCurrentProjectFolder: 'project:show-folder',
  getConfigStoreSnapshot: 'config-store:get-snapshot',
  exportConfigs: 'config-store:export',
  createConfigType: 'config-store:create-type',
  deleteConfigType: 'config-store:delete-type',
  createConfigTable: 'config-store:create-table',
  deleteConfigTable: 'config-store:delete-table',
  saveConfigTypeSchema: 'config-store:save-type-schema',
  saveConfigTable: 'config-store:save-table'
} as const;

export {
  IPC_CHANNELS
};
