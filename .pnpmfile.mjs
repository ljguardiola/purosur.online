// pnpm links an optional peer to any satisfying version already in the workspace, so without this
// the cloud's drizzle-orm would resolve the register's better-sqlite3 and the cloud's install would
// try to compile it.
const REGISTER_ONLY_PEERS = {
  "drizzle-orm": ["better-sqlite3", "@types/better-sqlite3"],
};

function readPackage(pkg) {
  for (const peer of REGISTER_ONLY_PEERS[pkg.name] ?? []) {
    delete pkg.peerDependencies?.[peer];
    delete pkg.peerDependenciesMeta?.[peer];
  }
  return pkg;
}

export const hooks = { readPackage };
