import ts from "typescript";

const MAIN_FILES = "apps/pos/src/main/**";

export function mainAllowedContractsNames(biomeConfig) {
  const override = biomeConfig.overrides.find((entry) => entry.includes.includes(MAIN_FILES));
  return override.linter.rules.style.noRestrictedImports.options.paths["@purosur/contracts"]
    .allowImportNames;
}

export function contractsValueExports(entryPath, names) {
  const program = ts.createProgram([entryPath], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const entry = checker.getSymbolAtLocation(program.getSourceFile(entryPath));
  const exports = new Map(
    checker.getExportsOfModule(entry).map((symbol) => [symbol.getName(), symbol]),
  );
  const resolved = (symbol) =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  return {
    values: names.filter((name) => {
      const symbol = exports.get(name);
      return symbol !== undefined && (resolved(symbol).flags & ts.SymbolFlags.Value) !== 0;
    }),
    missing: names.filter((name) => !exports.has(name)),
  };
}
