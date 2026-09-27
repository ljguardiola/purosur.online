export function resolveBaseRef(env) {
  return env.CHANGE_BASE_REF || "origin/main";
}

export function resolveBaseSha({ ref, runGit }) {
  try {
    return runGit(["merge-base", "HEAD", ref]).toString("utf8").trim();
  } catch {
    return null;
  }
}
