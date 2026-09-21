// The production and staging builds are chosen at build time via POS_CHANNEL (see package.json's
// package:production/package:staging scripts). They differ in appId and productName so NSIS
// installs each one to its own directory, Start Menu shortcut and uninstall registry key, and so
// Electron's per-app userData folder (derived from productName) never collides between the two —
// letting both be installed side by side on the same machine.
const channel = process.env.POS_CHANNEL === "staging" ? "staging" : "production";

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

/** @type {import('electron-builder').Configuration} */
export default {
  appId,
  productName,
  // Electron takes the app's name, and so its userData folder, from the packaged package.json
  // rather than from this configuration.
  extraMetadata: { name: packageName, productName },
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
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  // Only where each channel's updates are published; nothing checks the feed yet.
  publish: updateFeedUrl ? [{ provider: "generic", url: updateFeedUrl, channel }] : null,
};
