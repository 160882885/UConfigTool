import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

import type { ProjectInfo } from '../../../../shared/contracts';
import { appBridge } from '../../shared/api/appBridge';

interface WorkspaceContextValue {
  currentProject: ProjectInfo | null;
  isProjectLoading: boolean;
  workspaceRevision: number;
  reloadCurrentProject: () => Promise<ProjectInfo | null>;
  createProject: () => Promise<ProjectInfo | null>;
  openProject: () => Promise<ProjectInfo | null>;
  showCurrentProjectFolder: () => Promise<boolean>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);

  const updateProjectAndRevision = useCallback((nextProject: ProjectInfo | null) => {
    setCurrentProject(nextProject);
    setWorkspaceRevision((previous) => previous + 1);
    return nextProject;
  }, []);

  const reloadCurrentProject = useCallback(async () => {
    setIsProjectLoading(true);
    try {
      const nextProject = await appBridge.getCurrentProject();
      setCurrentProject(nextProject ?? null);
      return nextProject ?? null;
    } finally {
      setIsProjectLoading(false);
    }
  }, []);

  const createProject = useCallback(async () => {
    const nextProject = await appBridge.createProject();
    if (!nextProject) {
      return null;
    }
    return updateProjectAndRevision(nextProject);
  }, [updateProjectAndRevision]);

  const openProject = useCallback(async () => {
    const nextProject = await appBridge.openProject();
    if (!nextProject) {
      return null;
    }
    return updateProjectAndRevision(nextProject);
  }, [updateProjectAndRevision]);

  const showCurrentProjectFolder = useCallback(async () => {
    return appBridge.showCurrentProjectFolder();
  }, []);

  useEffect(() => {
    void reloadCurrentProject();
  }, [reloadCurrentProject]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      currentProject,
      isProjectLoading,
      workspaceRevision,
      reloadCurrentProject,
      createProject,
      openProject,
      showCurrentProjectFolder
    }),
    [createProject, currentProject, isProjectLoading, openProject, reloadCurrentProject, showCurrentProjectFolder, workspaceRevision]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider.');
  }
  return context;
}

export { WorkspaceProvider, useWorkspace };
