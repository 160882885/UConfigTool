import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApiResult } from '../../shared/contracts';
import App from './App';

function ok<TData>(data: TData): ApiResult<TData> {
  return {
    ok: true,
    data
  };
}

describe('App shell', () => {
  it('renders app shell', async () => {
    Object.defineProperty(window, 'appApi', {
      configurable: true,
      value: {
        ping: vi.fn().mockResolvedValue(ok('pong')),
        getAppMeta: vi.fn().mockResolvedValue(
          ok({
            name: 'UConfigTool',
            version: '1.0.0',
            environment: 'development'
          })
        ),
        getCapabilities: vi.fn().mockResolvedValue(
          ok(['toolbox-shell', 'split-pane', 'feature-manifest', 'typed-ipc-contract'])
        ),
        getBootstrap: vi.fn().mockResolvedValue(
          ok({
            appMeta: {
              name: 'UConfigTool',
              version: '1.0.0',
              environment: 'development'
            },
            capabilities: [
              'feature-manifest',
              'typed-ipc-contract',
              'toolbox-shell',
              'split-pane',
              'bootstrap-pipeline',
              'feature-flags'
            ],
            featureFlags: [{ key: 'shell.featureFlags', enabled: true }],
            generatedAt: '2026-05-12T00:00:00.000Z'
          })
        ),
        getCurrentProject: vi.fn().mockResolvedValue(ok(null)),
        createProject: vi.fn().mockResolvedValue(ok(null)),
        openProject: vi.fn().mockResolvedValue(ok(null)),
        showCurrentProjectFolder: vi.fn().mockResolvedValue(ok(false)),
        getConfigStoreSnapshot: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] })),
        exportConfigs: vi.fn().mockResolvedValue(ok(null)),
        createConfigNode: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] })),
        deleteConfigNode: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] })),
        renameConfigNode: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] })),
        moveConfigNode: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] })),
        saveConfigTypeSchema: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] })),
        saveConfigEnumSchema: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] })),
        saveConfigTable: vi.fn().mockResolvedValue(ok({ nodes: [], typeSchemas: [], enumSchemas: [], tables: [] }))
      }
    });

    render(<App />);

    expect(screen.getByRole('button', { name: 'UConfigTool 图标' })).toBeTruthy();
    expect(screen.getByText('配置管理')).toBeTruthy();
  });
});

