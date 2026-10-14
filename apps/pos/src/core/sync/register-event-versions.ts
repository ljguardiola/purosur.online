import path from "node:path";
import ts from "typescript";

export interface BuiltEventVersions {
  versions: string[];
  unreadable: string[];
}

function propertyNamed(
  literal: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | ts.ShorthandPropertyAssignment | undefined {
  return literal.properties.find(
    (property): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name,
  );
}

function valueType(
  checker: ts.TypeChecker,
  property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment,
): ts.Type {
  if (ts.isPropertyAssignment(property)) {
    return checker.getTypeAtLocation(property.initializer);
  }
  const value = checker.getShorthandAssignmentValueSymbol(property);
  return value === undefined
    ? checker.getTypeAtLocation(property.name)
    : checker.getTypeOfSymbolAtLocation(value, property);
}

const MAY_HOLD_A_NUMBER =
  ts.TypeFlags.NumberLike | ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter;

function mayHoldNumber(type: ts.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) => (part.flags & MAY_HOLD_A_NUMBER) !== 0);
}

export function eventVersionsBuiltBy(program: ts.Program, sourceDir: string): BuiltEventVersions {
  const checker = program.getTypeChecker();
  const versions = new Set<string>();
  const unreadable: string[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const relativeName = path.relative(sourceDir, sourceFile.fileName);
    if (
      sourceFile.isDeclarationFile ||
      relativeName.startsWith("..") ||
      relativeName.split(path.sep).includes("node_modules")
    ) {
      continue;
    }
    const location = (node: ts.Node) =>
      `${relativeName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const version = propertyNamed(node, "schema_version");
        const versionType = version && valueType(checker, version);
        if (versionType && mayHoldNumber(versionType)) {
          const type = propertyNamed(node, "event_type");
          const typeType = type && valueType(checker, type);
          if (typeType?.isStringLiteral() && versionType.isNumberLiteral()) {
            versions.add(`${typeType.value} v${versionType.value}`);
          } else {
            unreadable.push(location(node));
          }
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === "schema_version"
      ) {
        unreadable.push(location(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return { versions: [...versions].sort(), unreadable };
}

export function registerCoreProgram(repoRoot: string): ts.Program {
  const registerDir = path.join(repoRoot, "apps", "pos");
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(registerDir, "tsconfig.json"),
    undefined,
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  if (!config) {
    throw new Error("apps/pos/tsconfig.json could not be read");
  }
  return ts.createProgram([path.join(registerDir, "src", "core", "index.ts")], config.options);
}

export function emittedEventVersions(repoRoot: string): string[] {
  const { versions, unreadable } = eventVersionsBuiltBy(registerCoreProgram(repoRoot), repoRoot);
  if (unreadable.length > 0) {
    throw new Error(
      ["Event versions that cannot be read from the source:", ...unreadable].join("\n"),
    );
  }
  return versions.map((version) => version.replace(" v", "@")).sort();
}

if (import.meta.main) {
  const repoRoot = process.argv[2];
  if (repoRoot === undefined) {
    throw new Error("usage: register-event-versions.ts <repository root>");
  }
  process.stdout.write(`${JSON.stringify(emittedEventVersions(path.resolve(repoRoot)))}\n`);
}
