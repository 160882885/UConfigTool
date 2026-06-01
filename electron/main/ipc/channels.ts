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
  createConfigNode: 'config-store:create-node',
  deleteConfigNode: 'config-store:delete-node',
  renameConfigNode: 'config-store:rename-node',
  moveConfigNode: 'config-store:move-node',
  saveConfigTypeSchema: 'config-store:save-type-schema',
  saveConfigEnumSchema: 'config-store:save-enum-schema',
  saveConfigTable: 'config-store:save-table'
} as const;

export {
  IPC_CHANNELS
};
