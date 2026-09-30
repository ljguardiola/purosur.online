import { posix } from "node:path";

const IMPORTER_DEPENDENCY_KINDS = ["dependencies", "devDependencies", "optionalDependencies"];
const SNAPSHOT_DEPENDENCY_KINDS = ["dependencies", "optionalDependencies"];
const WORKSPACE_LINK = "link:";

function selectedImporters(lockfile, projects, filter) {
  const root = Object.keys(projects).find((path) => projects[path] === filter);
  if (root === undefined) throw new Error(`no workspace project is named ${filter}`);

  const selected = new Set();
  const pending = [root];
  while (pending.length > 0) {
    const path = pending.pop();
    if (selected.has(path)) continue;
    selected.add(path);
    for (const kind of IMPORTER_DEPENDENCY_KINDS) {
      for (const { version } of Object.values(lockfile.importers[path]?.[kind] ?? {})) {
        if (version.startsWith(WORKSPACE_LINK)) {
          pending.push(posix.join(path, version.slice(WORKSPACE_LINK.length)));
        }
      }
    }
  }
  return selected;
}

function registryDependenciesOf(importer) {
  return IMPORTER_DEPENDENCY_KINDS.flatMap((kind) =>
    Object.entries(importer?.[kind] ?? {})
      .filter(([, { version }]) => !version.startsWith(WORKSPACE_LINK))
      .map(([name, { version }]) => ({ name, version })),
  );
}

export function buildsRunByFilteredInstall({ lockfile, projects, allowBuilds, filter }) {
  const pending = [...selectedImporters(lockfile, projects, filter)].flatMap((path) =>
    registryDependenciesOf(lockfile.importers[path]),
  );
  const visited = new Set();
  const builds = new Set();
  while (pending.length > 0) {
    const { name, version } = pending.pop();
    const key = `${name}@${version}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (allowBuilds[name] === true) builds.add(name);
    const snapshot = lockfile.snapshots[key] ?? {};
    for (const kind of SNAPSHOT_DEPENDENCY_KINDS) {
      for (const [dependency, dependencyVersion] of Object.entries(snapshot[kind] ?? {})) {
        pending.push({ name: dependency, version: dependencyVersion });
      }
    }
  }
  return [...builds].sort();
}

export function filteredInstallsIn(dockerfile) {
  return [...dockerfile.matchAll(/pnpm install\b[^\n]*--filter (\S+)\.\.\./g)].map(
    ([, filter]) => filter,
  );
}
