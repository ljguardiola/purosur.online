import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const registerRoot = join(repoRoot, "apps/pos");

export function withoutPackageOutput(root) {
  return {
    name: "purosur:without-package-output",
    enforce: "pre",
    load(id) {
      const path = relative(root, id).split(sep).join("/");
      if (/^packages\/[^/]+\/dist\//.test(path)) {
        throw new Error(
          `${path} is a workspace package's compiled output, which a clean checkout does not have; the register must build from the package's source`,
        );
      }
      return undefined;
    },
  };
}

async function buildRegister() {
  const electronVite = createRequire(join(registerRoot, "package.json")).resolve("electron-vite");
  const { build } = await import(pathToFileURL(electronVite).href);
  const outDir = await mkdtemp(join(tmpdir(), "register clean build "));
  try {
    process.chdir(registerRoot);
    await build({
      configFile: join(registerRoot, "electron.vite.config.ts"),
      logLevel: "error",
      build: { outDir },
      plugins: [withoutPackageOutput(repoRoot)],
    });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    await buildRegister();
  } catch (error) {
    console.error(`register-clean-build: ${error.message}`);
    process.exit(1);
  }
}
