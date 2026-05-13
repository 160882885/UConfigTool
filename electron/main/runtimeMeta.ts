import { app } from 'electron';

import type { AppMeta } from '../../shared/contracts';

function resolveAppRuntimeMeta(): AppMeta {
  return {
    name: app.getName(),
    version: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'development'
  };
}

export {
  resolveAppRuntimeMeta
};
