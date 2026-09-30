import { win32 } from "node:path";

// Electron names no machine-local folder: its app data on Windows is the roaming one, which a
// domain profile may copy between machines, so the database goes under %LOCALAPPDATA% instead.
export function localDataFolderFor(options: {
  platform: NodeJS.Platform;
  localAppData: string | undefined;
  dataFolder: string;
  userData: string;
}): string {
  if (options.platform === "win32" && options.localAppData) {
    return win32.join(options.localAppData, options.dataFolder);
  }
  return options.userData;
}
