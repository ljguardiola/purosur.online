const GLOB_IMPORT = /import\.meta\.glob\b/;

// Vitest keeps a module that calls import.meta.glob out of its persistent module cache only when
// the call is written exactly `import.meta.glob(`, so a typed call such as
// `import.meta.glob<string>(` would keep the files it matched on an earlier run.
export function globAwareModuleCache() {
  return {
    name: "purosur:glob-aware-module-cache",
    configureVitest({ defineCacheKeyGenerator }) {
      defineCacheKeyGenerator(({ sourceCode }) =>
        GLOB_IMPORT.test(sourceCode) ? false : undefined,
      );
    },
  };
}
