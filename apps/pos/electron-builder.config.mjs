import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CHANNELS, serializeChannelFile } from "./src/shared/channel.ts";

// production and staging differ in appId and productName so NSIS installs each to its own
// directory, Start Menu shortcut and registry key, letting both run side by side.
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
const version = process.env.POS_VERSION;
if (version !== undefined && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error(`POS_VERSION must be X.Y.Z; got ${version}`);
}
const sentryDsn = process.env.POS_SENTRY_DSN;
const cloudUrl = process.env.POS_CLOUD_URL;

const channelFile = serializeChannelFile({
  channel,
  ...(sentryDsn ? { sentryDsn } : {}),
  ...(cloudUrl ? { cloudUrl } : {}),
});

/** @type {import('electron-builder').Configuration} */
export default {
  appId,
  productName,
  directories: {
    output: `release/${channel}`,
  },
  files: ["out/**/*"],
  // electron-vite has bundled everything the app runs except better-sqlite3 and serialport, whose
  // bindings are Node-API ones that Electron loads as installed, so nothing is rebuilt.
  npmRebuild: false,
  forceCodeSigning: false,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    // electron-builder embeds this icon in the packaged exe; Windows shows it on the window,
    // taskbar, shortcuts and the NSIS installer/uninstaller, and the app never sets one at runtime.
    icon: "build/icon.ico",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  publish: null,
  // Unset, the package's own version stays; the installer's file name and app.getVersion() carry it.
  ...(version === undefined ? {} : { extraMetadata: { version } }),
  // app.asar's package.json is copied from disk untouched, so electron-builder's updater cache
  // folder (named after the in-memory package name) is renamed here to keep channels apart.
  beforePack: (context) => {
    context.packager.info.metadata.name = packageName;
  },
  // The channel lives next to app.asar rather than inside it, before the installer is built from
  // this folder.
  afterPack: async (context) => {
    const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
    await writeFile(join(resourcesDir, "channel.json"), channelFile);
  },
};
