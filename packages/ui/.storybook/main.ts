import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions } from "vite";
import { withoutPackageOutput } from "../../../.github/scripts/without-package-output.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y", "storybook-addon-pseudo-states"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  async viteFinal(viteConfig) {
    viteConfig.resolve = {
      ...viteConfig.resolve,
      conditions: ["@purosur/source", ...defaultClientConditions],
    };
    viteConfig.plugins = [
      withoutPackageOutput(REPO_ROOT),
      ...(viteConfig.plugins ?? []),
      react(),
      tailwindcss(),
    ];
    return viteConfig;
  },
};

export default config;
