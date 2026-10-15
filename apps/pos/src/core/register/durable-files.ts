import { open } from "node:fs/promises";

export interface Durability {
  file(path: string): Promise<void>;
  folder(path: string): Promise<void>;
}

async function flush(path: string, flags: string): Promise<void> {
  const handle = await open(path, flags);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Windows cannot open a folder to flush it; NTFS journals the directory entry itself.
export async function syncFolderOn(platform: NodeJS.Platform, path: string): Promise<void> {
  if (platform === "win32") {
    return;
  }
  await flush(path, "r");
}

export const nodeDurability: Durability = {
  file: (path) => flush(path, "r+"),
  folder: (path) => syncFolderOn(process.platform, path),
};
