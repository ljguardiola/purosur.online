// The production and homologation builds are chosen at build time via POS_CHANNEL (see
// package.json's package:production/package:homologation scripts). They differ in appId and
// productName so NSIS installs each one to its own directory, Start Menu shortcut and uninstall
// registry key, and so Electron's per-app userData folder (derived from productName) never
// collides between the two — letting both be installed side by side on the same machine.
const channel = process.env.POS_CHANNEL === "homologation" ? "homologation" : "production";

const channelConfig = {
  production: {
    appId: "online.purosur.pos",
    productName: "Puro Sur",
    updateFeedUrl: process.env.POS_UPDATE_FEED_URL_PRODUCTION,
  },
  homologation: {
    appId: "online.purosur.pos.homologation",
    productName: "Puro Sur Homologación",
    updateFeedUrl: process.env.POS_UPDATE_FEED_URL_HOMOLOGATION,
  },
};

const { appId, productName, updateFeedUrl } = channelConfig[channel];

/** @type {import('electron-builder').Configuration} */
export default {
  appId,
  productName,
  directories: {
    output: `release/${channel}`,
  },
  files: ["out/**/*"],
  // The installer's own files are already built by electron-vite; nothing here has native
  // bindings to rebuild yet (see CONTRIBUTING's Windows-only build note in the CI task).
  npmRebuild: false,
  forceCodeSigning: false,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  // Only the feed URL lives here; checking for and applying an update is issue #84.
  publish: updateFeedUrl ? [{ provider: "generic", url: updateFeedUrl, channel }] : null,
};
