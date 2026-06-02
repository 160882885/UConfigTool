import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';

async function pickDirectory(
  options: OpenDialogOptions,
  window?: BrowserWindow | null
): Promise<string | null> {
  const result = (await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))) as
    | string[]
    | { filePaths?: string[] };

  const filePaths = Array.isArray(result) ? result : result.filePaths ?? [];
  if (filePaths.length === 0) {
    return null;
  }

  return filePaths[0] ?? null;
}

export { pickDirectory };
