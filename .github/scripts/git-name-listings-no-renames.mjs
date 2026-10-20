import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";

const SCRIPTS_FOLDER = ".github/scripts";
const LISTING_SUBCOMMANDS = new Set(["diff", "log", "show"]);
const NAME_LISTINGS = new Set(["--name-only", "--name-status"]);
const NO_RENAMES = "--no-renames";
const END_OF_OPTIONS = "--";
const GLOBAL_OPTIONS_WITH_VALUE = new Set(["-C", "-c"]);
const UNKNOWN = "\0";

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
}

function descendants(node) {
  const nodes = [];
  const visit = (child) => {
    nodes.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return nodes;
}

function withoutParentheses(node) {
  return ts.isParenthesizedExpression(node) ? withoutParentheses(node.expression) : node;
}

function enclosing(node) {
  let parent = node.parent;
  while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
  return parent;
}

function constantInitializers(nodes) {
  const initializers = new Map();
  for (const node of nodes) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      initializers.set(node.name.text, node.initializer);
    }
  }
  return initializers;
}

function isConcatCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "concat"
  );
}

function isStringConcatenation(node) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function isStringExpression(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    isStringConcatenation(node)
  );
}

function isConsumedIntoArray(node) {
  const parent = enclosing(node);
  if (parent === undefined) return false;
  if (ts.isSpreadElement(parent)) return ts.isArrayLiteralExpression(enclosing(parent));
  if (ts.isPropertyAccessExpression(parent) && withoutParentheses(parent.expression) === node) {
    return isConcatCall(enclosing(parent)) && enclosing(parent).expression === parent;
  }
  return isConcatCall(parent) && parent.arguments.some((arg) => withoutParentheses(arg) === node);
}

function isConsumedIntoString(node) {
  const parent = enclosing(node);
  return parent !== undefined && (isStringConcatenation(parent) || ts.isTemplateSpan(parent));
}

function isReference(identifier) {
  const parent = identifier.parent;
  if (ts.isVariableDeclaration(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false;
  return true;
}

function referencesByName(nodes) {
  const references = new Map();
  for (const node of nodes) {
    if (!ts.isIdentifier(node) || !isReference(node)) continue;
    references.set(node.text, [...(references.get(node.text) ?? []), node]);
  }
  return references;
}

function createResolver(constants) {
  const constantOf = (node, seen) => {
    if (!ts.isIdentifier(node) || seen.has(node.text)) return undefined;
    return constants.get(node.text);
  };

  const resolveString = (expression, seen = new Set()) => {
    const node = withoutParentheses(expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      return node.templateSpans.reduce(
        (text, span) =>
          `${text}${resolveString(span.expression, seen) ?? UNKNOWN}${span.literal.text}`,
        node.head.text,
      );
    }
    if (isStringConcatenation(node)) {
      const left = resolveString(node.left, seen);
      const right = resolveString(node.right, seen);
      if (left === undefined && right === undefined) return undefined;
      return `${left ?? UNKNOWN}${right ?? UNKNOWN}`;
    }
    const constant = constantOf(node, seen);
    return constant === undefined
      ? undefined
      : resolveString(constant, new Set([...seen, node.text]));
  };

  const resolveArray = (expression, seen = new Set()) => {
    const node = withoutParentheses(expression);
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.flatMap((element) =>
        ts.isSpreadElement(element)
          ? (resolveArray(element.expression, seen) ?? [UNKNOWN])
          : [resolveString(element, seen) ?? UNKNOWN],
      );
    }
    if (isConcatCall(node)) {
      const receiver = resolveArray(node.expression.expression, seen);
      if (receiver === undefined) return undefined;
      return [
        ...receiver,
        ...node.arguments.flatMap(
          (arg) => resolveArray(arg, seen) ?? [resolveString(arg, seen) ?? UNKNOWN],
        ),
      ];
    }
    const constant = constantOf(node, seen);
    return constant === undefined
      ? undefined
      : resolveArray(constant, new Set([...seen, node.text]));
  };

  return { resolveArray, resolveString };
}

function commandArguments(command) {
  const words = command.trim().split(/\s+/);
  if (words[0] !== "git") return undefined;
  return words.slice(1).map((word) => word.replace(/^(["'])(.*)\1$/, "$2"));
}

function optionsOf(args) {
  const end = args.indexOf(END_OF_OPTIONS);
  return end === -1 ? args : args.slice(0, end);
}

function subcommandOf(options) {
  for (let index = 0; index < options.length; index++) {
    const arg = options[index];
    if (GLOBAL_OPTIONS_WITH_VALUE.has(arg)) index++;
    else if (!arg.includes(UNKNOWN) && !arg.startsWith("-")) return arg;
  }
  return undefined;
}

function listsNamesWithRenames(args) {
  const options = optionsOf(args);
  return (
    LISTING_SUBCOMMANDS.has(subcommandOf(options)) &&
    options.some((option) => NAME_LISTINGS.has(option)) &&
    !options.includes(NO_RENAMES)
  );
}

function isConstantConsumedOnlyBy(node, references, isConsumed) {
  const declaration = enclosing(node);
  if (
    declaration === undefined ||
    !ts.isVariableDeclaration(declaration) ||
    !ts.isIdentifier(declaration.name)
  ) {
    return false;
  }
  const uses = references.get(declaration.name.text) ?? [];
  return uses.length > 0 && uses.every(isConsumed);
}

function invokedArguments(node, references, { resolveArray, resolveString }) {
  if (ts.isArrayLiteralExpression(node) || isConcatCall(node)) {
    if (isConsumedIntoArray(node)) return undefined;
    if (isConstantConsumedOnlyBy(node, references, isConsumedIntoArray)) return undefined;
    return resolveArray(node);
  }
  if (isStringExpression(node)) {
    if (isConsumedIntoString(node)) return undefined;
    if (isConstantConsumedOnlyBy(node, references, isConsumedIntoString)) return undefined;
    const command = resolveString(node);
    return command === undefined ? undefined : commandArguments(command);
  }
  return undefined;
}

export function findNameListingsWithRenames(source, fileName) {
  const sourceFile = parse(source, fileName);
  const nodes = descendants(sourceFile);
  const resolver = createResolver(constantInitializers(nodes));
  const references = referencesByName(nodes);
  const lineStarts = sourceFile.getLineStarts();

  return nodes
    .filter((node) => {
      const args = invokedArguments(node, references, resolver);
      return args !== undefined && listsNamesWithRenames(args);
    })
    .map((node) => {
      const index = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const text = source.slice(lineStarts[index], lineStarts[index + 1] ?? source.length);
      return { line: index + 1, text: text.trim() };
    });
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) =>
    findNameListingsWithRenames(readFile(path), path).map((match) => ({ path, ...match })),
  );
}

export function describeViolation({ path, line, text }) {
  return `${path}:${line}: ${text} lists changed names with git's rename detection; add ${NO_RENAMES}`;
}

function defaultListScripts(cwd) {
  return readdirSync(join(cwd, SCRIPTS_FOLDER));
}

export function findScannedFiles(cwd = process.cwd(), listScripts = defaultListScripts) {
  return listScripts(cwd)
    .filter((name) => !name.includes("/") && name.endsWith(".mjs") && !name.endsWith(".test.mjs"))
    .map((name) => posix.join(SCRIPTS_FOLDER, name))
    .sort();
}
