import { join } from "node:path";
import {
  type ChannelFileResult,
  type ChannelSettings,
  parseChannelFile,
  parseLocalChannelFile,
} from "../shared/channel";

export const DEVELOPMENT_SETTINGS: ChannelSettings = {
  channel: "staging",
  dataFolder: "purosur-pos-development",
};

export interface ChannelSettingsSource {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  // Only honored in an unpackaged run (development and end-to-end tests).
  readonly overridePath: string | undefined;
  readonly readFile: (path: string) => string;
}

export function loadChannelSettings(source: ChannelSettingsSource): ChannelFileResult {
  const path = source.isPackaged ? join(source.resourcesPath, "channel.json") : source.overridePath;
  if (path === undefined) {
    return { ok: true, settings: DEVELOPMENT_SETTINGS };
  }

  let text: string;
  try {
    text = source.readFile(path);
  } catch (error) {
    return { ok: false, reason: `cannot read ${path}: ${String(error)}` };
  }

  const result = source.isPackaged ? parseChannelFile(text) : parseLocalChannelFile(text);
  return result.ok ? result : { ok: false, reason: `${path}: ${result.reason}` };
}
