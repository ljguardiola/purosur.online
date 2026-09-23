import { compareHashes, hashAsarFile, validatePathCount } from "./app-code-hash.mjs";

async function main() {
  const paths = process.argv.slice(2);

  const countCheck = validatePathCount(paths);
  if (!countCheck.ok) {
    console.error(`::error::${countCheck.reason}`);
    process.exitCode = 1;
    return;
  }

  const entries = [];
  for (const filePath of paths) {
    const result = await hashAsarFile(filePath);
    if (!result.ok) {
      console.error(`::error::${result.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${filePath}  ${result.hash}`);
    entries.push({ path: filePath, hash: result.hash });
  }

  const comparison = compareHashes(entries);
  if (!comparison.ok) {
    console.error(`::error::${comparison.reason}`);
    process.exitCode = 1;
    return;
  }

  console.log(`same-app-code: all ${entries.length} app.asar files match`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
