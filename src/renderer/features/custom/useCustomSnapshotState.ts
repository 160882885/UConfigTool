import { useEffect, useState } from 'react';

import type { ProjectInfo, ConfigStoreSnapshot } from '../../../../shared/contracts';
import { appBridge } from '../../shared/api/appBridge';

import { EMPTY_SNAPSHOT } from './runtime';

interface CustomSnapshotState {
  snapshot: ConfigStoreSnapshot;
  setSnapshot: React.Dispatch<React.SetStateAction<ConfigStoreSnapshot>>;
  loading: boolean;
  errorMessage: string | null;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
}

function useCustomSnapshotState(currentProject: ProjectInfo | null, workspaceRevision: number): CustomSnapshotState {
  const [snapshot, setSnapshot] = useState<ConfigStoreSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      if (!currentProject) {
        if (!active) {
          return;
        }
        setSnapshot(EMPTY_SNAPSHOT);
        setErrorMessage(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        const next = await appBridge.getConfigStoreSnapshot();
        if (!active) {
          return;
        }
        setSnapshot(next);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '加载配置数据失败。');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSnapshot();

    return () => {
      active = false;
    };
  }, [currentProject, workspaceRevision]);

  return {
    snapshot,
    setSnapshot,
    loading,
    errorMessage,
    setErrorMessage
  };
}

export { useCustomSnapshotState };
