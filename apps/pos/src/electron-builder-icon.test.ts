import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

const originalPosChannel = process.env["POS_CHANNEL"];

afterEach(() => {
  if (originalPosChannel === undefined) {
    delete process.env["POS_CHANNEL"];
  } else {
    process.env["POS_CHANNEL"] = originalPosChannel;
  }
});

// electron-builder.config.mjs reads POS_CHANNEL at import time; resetModules forces a fresh
// import instead of vitest handing back the other channel's already-cached config.
async function loadConfig(channel: string) {
  vi.resetModules();
  process.env["POS_CHANNEL"] = channel;
  const config = await import("../electron-builder.config.mjs");
  return config.default;
}

describe.each(["production", "staging"] as const)(
  "the %s register's electron-builder config",
  (channel) => {
    it("points the Windows app at the isotype icon", async () => {
      const config = await loadConfig(channel);

      expect(config.win?.icon).toBe("build/icon.ico");
    });
  },
);

describe("the register's app icon file", () => {
  it("is a complete ICO holding square frames, including the 256px frame electron-builder requires on Windows", async () => {
    const config = await loadConfig("production");
    const icon = readFileSync(join(APP_ROOT, String(config.win?.icon)));

    // ICO format: 2 reserved bytes, a type field (1 = icon), then an image count; each 16-byte
    // entry holds width/height in bytes 0-1 (0 means 256) and byte length/offset in bytes 8 and 12.
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    const imageCount = icon.readUInt16LE(4);
    const frames: [number, number][] = [];
    for (let i = 0; i < imageCount; i++) {
      const entryOffset = 6 + i * 16;
      const width = icon.readUInt8(entryOffset) || 256;
      const height = icon.readUInt8(entryOffset + 1) || 256;
      const byteLength = icon.readUInt32LE(entryOffset + 8);
      const byteOffset = icon.readUInt32LE(entryOffset + 12);
      expect(byteLength).toBeGreaterThan(0);
      expect(byteOffset + byteLength).toBeLessThanOrEqual(icon.length);
      frames.push([width, height]);
    }

    expect(frames.every(([width, height]) => width === height)).toBe(true);
    expect(frames.map(([width]) => width).sort((a, b) => a - b)).toEqual([
      16, 24, 32, 48, 64, 128, 256,
    ]);
  });
});
