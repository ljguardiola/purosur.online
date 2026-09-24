import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CHANNELS, serializeChannelFile } from "./src/shared/channel.ts";

// The production and staging installers are chosen via POS_CHANNEL (see package.json's
// pack:production/pack:staging scripts). They differ in appId and productName so NSIS
// installs each one to its own directory, Start Menu shortcut and uninstall registry key, letting
// both be installed side by side on the same machine.
const channel = process.env.POS_CHANNEL;
if (!CHANNELS.includes(channel)) {
  throw new Error(`POS_CHANNEL must be one of ${CHANNELS.join(", ")}; got ${channel}`);
}

const channelConfig = {
  production: {
    appId: "online.purosur.pos",
    packageName: "purosur-pos",
    productName: "Puro Sur",
  },
  staging: {
    appId: "online.purosur.pos.staging",
    packageName: "purosur-pos-staging",
    // The name store staff see in the Start Menu, so it uses their word for staging.
    productName: "Puro Sur Homologación",
  },
};

const { appId, packageName, productName } = channelConfig[channel];
const updateFeedUrl = process.env.POS_UPDATE_FEED_URL;
const sentryDsn = process.env.POS_SENTRY_DSN;

const channelFile = serializeChannelFile({ channel, ...(sentryDsn ? { sentryDsn } : {}) });

/** @type {import('electron-builder').Configuration} */
export default {
  appId,
  productName,
  directories: {
    output: `release/${channel}`,
  },
  files: ["out/**/*"],
  // electron-vite has already bundled everything the app runs, and nothing has native bindings to
  // rebuild.
  npmRebuild: false,
  forceCodeSigning: false,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    // electron-builder embeds this icon in the packaged exe, and Windows shows the window, taskbar
    // button, shortcuts and the NSIS installer and uninstaller with it; the app never sets one at
    // runtime.
    icon: "build/icon.ico",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  // Only where each channel's updates are published; nothing checks the feed yet.
  publish: updateFeedUrl ? [{ provider: "generic", url: updateFeedUrl, channel }] : null,
  // app.asar's package.json is copied from disk untouched, so it is the same for both channels,
  // but electron-builder also names the updater's cache folder (in app-update.yml and in the
  // installer, which keeps a copy of itself there) after the in-memory package name. Renaming only
  // that copy keeps the two channels' caches apart without changing the app code.
  beforePack: (context) => {
    context.packager.info.metadata.name = packageName;
  },
  // The channel lives next to app.asar rather than inside it, the same way electron-builder writes
  // the update feed's app-update.yml, before the installer is built from this folder.
  afterPack: async (context) => {
    const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
    await writeFile(join(resourcesDir, "channel.json"), channelFile);
  },
};
