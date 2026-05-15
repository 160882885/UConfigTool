import { promises as fs } from 'node:fs';
import path from 'node:path';

import { app, dialog, shell, type BrowserWindow } from 'electron';

import type { ProjectInfo } from '../../shared/contracts';

const PROJECT_STATE_FILE = 'project-state.json';

interface ProjectState {
  currentProjectPath: string | null;
}

function getStateFilePath(): string {
  return path.join(app.getPath('userData'), PROJECT_STATE_FILE);
}

function normalizeProjectPath(rawPath: string | null | undefined): string | null {
  if (!rawPath || typeof rawPath !== 'string') {
    return null;
  }
  const trimmed = rawPath.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

async function readProjectState(): Promise<ProjectState> {
  const filePath = getStateFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProjectState>;
    return {
      currentProjectPath: normalizeProjectPath(parsed.currentProjectPath)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { currentProjectPath: null };
    }
    throw error;
  }
}

async function writeProjectState(state: ProjectState): Promise<void> {
  const filePath = getStateFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        currentProjectPath: normalizeProjectPath(state.currentProjectPath)
      },
      null,
      2
    ),
    'utf8'
  );
}

function mapProjectInfo(projectPath: string): ProjectInfo {
  return {
    path: projectPath,
    name: path.basename(projectPath)
  };
}

async function ensureDirectory(dirPath: string): Promise<void> {
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error('所选路径不是文件夹。');
  }
}

async function pickProjectFolder(_window: BrowserWindow | null, title: string): Promise<string | null> {
  const dialogOptions = {
    title,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    buttonLabel: '选择项目文件夹'
  };

  const filePaths = (dialog as unknown as { showOpenDialogSync: (options: unknown) => string[] | undefined }).showOpenDialogSync(
    dialogOptions
  );

  if (!filePaths || filePaths.length === 0) {
    return null;
  }

  return normalizeProjectPath(filePaths[0]);
}

async function setCurrentProject(projectPath: string | null): Promise<ProjectInfo | null> {
  const normalized = normalizeProjectPath(projectPath);
  await writeProjectState({ currentProjectPath: normalized });
  if (!normalized) {
    return null;
  }
  return mapProjectInfo(normalized);
}

async function getCurrentProjectPath(): Promise<string | null> {
  const state = await readProjectState();
  const projectPath = state.currentProjectPath;
  if (!projectPath) {
    return null;
  }

  try {
    await ensureDirectory(projectPath);
    return projectPath;
  } catch {
    await writeProjectState({ currentProjectPath: null });
    return null;
  }
}

async function getCurrentProject(): Promise<ProjectInfo | null> {
  const currentPath = await getCurrentProjectPath();
  if (!currentPath) {
    return null;
  }
  return mapProjectInfo(currentPath);
}

async function createProject(window: BrowserWindow | null): Promise<ProjectInfo | null> {
  const selected = await pickProjectFolder(window, '创建项目');
  if (!selected) {
    return null;
  }

  await fs.mkdir(selected, { recursive: true });
  await ensureDirectory(selected);
  return setCurrentProject(selected);
}

async function openProject(window: BrowserWindow | null): Promise<ProjectInfo | null> {
  const selected = await pickProjectFolder(window, '打开项目');
  if (!selected) {
    return null;
  }

  await ensureDirectory(selected);
  return setCurrentProject(selected);
}

async function showCurrentProjectFolder(): Promise<boolean> {
  const currentPath = await getCurrentProjectPath();
  if (!currentPath) {
    return false;
  }

  await shell.openPath(currentPath);
  return true;
}

export {
  createProject,
  getCurrentProject,
  getCurrentProjectPath,
  openProject,
  showCurrentProjectFolder
};
