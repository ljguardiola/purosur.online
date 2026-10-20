import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_PATH = "apps/cloud/src/platform/db/schema.ts";
const MIGRATIONS_DIR = "apps/cloud/migrations";
const JOURNAL_PATH = `${MIGRATIONS_DIR}/meta/_journal.json`;
const ROLE = "cloud_app";
const APPEND_ONLY_MARK_RE = /\bAppend-only\b/;

const TABLE_RE = /\bpgTable\(\s*"([^"]+)"/g;
const NAME = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QUALIFIED_NAME = String.raw`(?:${NAME}\s*\.\s*)?${NAME}`;
const CREATE_TABLE_RE = new RegExp(
  String.raw`^create\s+(?:(?:global\s+|local\s+)?(?:temporary|temp|unlogged)\s+)?table\s+(?:if\s+not\s+exists\s+)?(${QUALIFIED_NAME})`,
  "i",
);
const DROP_TABLE_RE = /^drop\s+table\s+(?:if\s+exists\s+)?(.+?)(?:\s+(?:cascade|restrict))?$/i;
const RENAME_TABLE_RE = new RegExp(
  String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QUALIFIED_NAME})\s+rename\s+to\s+(${NAME})$`,
  "i",
);
const PRIVILEGE_STATEMENT_RE =
  /^(grant|revoke)\s+(grant\s+option\s+for\s+)?(.+?)\s+on\s+(.+?)\s+(?:to|from)\s+(.+?)(?:\s+(?:with\s+grant\s+option|granted\s+by\s+\S+|cascade|restrict))*$/i;
const ALL_TABLES_RE = /^all\s+tables\s+in\s+schema\s+/i;
const OTHER_OBJECT_RE =
  /^(?:schema|sequence|all\s+sequences|function|all\s+functions|procedure|all\s+procedures|routine|all\s+routines|database|domain|foreign|language|large\s+object|parameter|tablespace|type)\b/i;
const PRIVILEGE_RE = /^(all(?:\s+privileges)?|[a-z]+)\s*(\(.*\))?$/i;

const TRACKED = ["update", "delete", "truncate"];

function lineAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") line += 1;
  }
  return line;
}

function unquote(name) {
  const trimmed = name.trim();
  return trimmed.startsWith('"') ? trimmed.slice(1, -1) : trimmed.toLowerCase();
}

function tableNameOf(qualifiedName) {
  const parts = qualifiedName.match(new RegExp(NAME, "g"));
  return unquote(parts.at(-1));
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

function dollarTagAt(source, index) {
  return source.slice(index).match(/^\$(?:[A-Za-z_][\w]*)?\$/)?.[0];
}

function statementsOf(source) {
  const statements = [];
  let text = "";
  let start = -1;
  let index = 0;

  function keep(chunk, at) {
    if (start === -1 && chunk.trim() !== "") start = at + (chunk.length - chunk.trimStart().length);
    text += chunk;
  }

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "-" && next === "-") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      text += " ";
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      text += " ";
      continue;
    }
    if (char === "'" || char === '"') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === char && source[end + 1] === char) end += 2;
        else if (source[end] === char) break;
        else end += 1;
      }
      keep(source.slice(index, end + 1), index);
      index = end + 1;
      continue;
    }
    const tag = char === "$" ? dollarTagAt(source, index) : undefined;
    if (tag) {
      const end = source.indexOf(tag, index + tag.length);
      const stop = end === -1 ? source.length : end + tag.length;
      keep(source.slice(index, stop), index);
      index = stop;
      continue;
    }
    if (char === ";") {
      if (start !== -1) statements.push({ text: text.replace(/\s+/g, " ").trim(), offset: start });
      text = "";
      start = -1;
      index += 1;
      continue;
    }
    keep(char, index);
    index += 1;
  }
  if (start !== -1) statements.push({ text: text.replace(/\s+/g, " ").trim(), offset: start });
  return statements;
}

function privilegesOf(list) {
  const scopes = {};
  for (const entry of splitTopLevel(list)) {
    const match = entry.match(PRIVILEGE_RE);
    if (!match) continue;
    const name = match[1].toLowerCase().replace(/\s+privileges$/, "");
    const scope = match[2] === undefined ? "table" : "columns";
    const named = name === "all" ? (scope === "table" ? TRACKED : ["update"]) : [name];
    for (const privilege of named.filter((each) => TRACKED.includes(each))) {
      scopes[privilege] = scopes[privilege] === "table" ? "table" : scope;
    }
  }
  return scopes;
}

function heldByDefault() {
  return { update: true, delete: true, truncate: true, revokedAt: undefined };
}

function applyPrivilegeStatement(tables, match, location) {
  const [, verb, grantOptionOnly, list, target, grantees] = match;
  if (grantOptionOnly) return;
  if (
    !splitTopLevel(grantees).some((grantee) => unquote(grantee.replace(/^group\s+/i, "")) === ROLE)
  ) {
    return;
  }
  if (OTHER_OBJECT_RE.test(target)) return;
  const names = ALL_TABLES_RE.test(target)
    ? [...tables.keys()]
    : splitTopLevel(target.replace(/^table\s+/i, "")).map(tableNameOf);
  const scopes = privilegesOf(list);
  const granting = verb.toLowerCase() === "grant";
  const changed = TRACKED.filter((privilege) =>
    granting ? scopes[privilege] !== undefined : scopes[privilege] === "table",
  );

  for (const name of names) {
    const state = tables.get(name) ?? heldByDefault();
    tables.set(name, state);
    for (const privilege of changed) state[privilege] = granting;
    if (!granting && (changed.includes("update") || changed.includes("delete"))) {
      state.revokedAt = location;
    }
  }
}

function applyStatement(tables, text, location) {
  const created = text.match(CREATE_TABLE_RE);
  if (created) {
    tables.set(tableNameOf(created[1]), heldByDefault());
    return;
  }
  const dropped = text.match(DROP_TABLE_RE);
  if (dropped) {
    for (const name of splitTopLevel(dropped[1])) tables.delete(tableNameOf(name));
    return;
  }
  const renamed = text.match(RENAME_TABLE_RE);
  if (renamed) {
    const from = tableNameOf(renamed[1]);
    const state = tables.get(from) ?? heldByDefault();
    tables.delete(from);
    tables.set(unquote(renamed[2]), state);
    return;
  }
  const privilegeStatement = text.match(PRIVILEGE_STATEMENT_RE);
  if (privilegeStatement) applyPrivilegeStatement(tables, privilegeStatement, location);
}

function privilegesAfter(migrations) {
  const tables = new Map();
  for (const { path, source } of migrations) {
    for (const { text, offset } of statementsOf(source)) {
      applyStatement(tables, text, { path, line: lineAt(source, offset) });
    }
  }
  return tables;
}

function schemaTablesOf(source) {
  const lines = source.split("\n");
  return [...source.matchAll(TABLE_RE)].map((match) => {
    let line = lineAt(source, match.index) - 1;
    while (line > 0 && !/^export\s/.test(lines[line])) line -= 1;
    let commentLine = line - 1;
    const comment = [];
    while (commentLine >= 0 && lines[commentLine].trimStart().startsWith("//")) {
      comment.unshift(lines[commentLine]);
      commentLine -= 1;
    }
    return {
      name: match[1],
      line: line + 1,
      appendOnly: APPEND_ONLY_MARK_RE.test(comment.join("\n")),
    };
  });
}

export function findViolations({ schemaPath, schemaSource, migrations }) {
  const tables = privilegesAfter(migrations);
  const schemaTables = schemaTablesOf(schemaSource);
  const marked = new Set(
    schemaTables.filter((table) => table.appendOnly).map((table) => table.name),
  );

  const markedNotRevoked = schemaTables
    .filter((table) => table.appendOnly)
    .filter((table) => {
      const state = tables.get(table.name) ?? heldByDefault();
      return TRACKED.some((privilege) => state[privilege]);
    })
    .map((table) => ({
      path: schemaPath,
      line: table.line,
      table: table.name,
      rule: "marked-not-revoked",
    }));

  const revokedNotMarked = [...tables.entries()]
    .filter(([name, state]) => !state.update && !state.delete && !marked.has(name))
    .map(([name, state]) => ({
      path: state.revokedAt.path,
      line: state.revokedAt.line,
      table: name,
      rule: "revoked-not-marked",
    }));

  return [...markedNotRevoked, ...revokedNotMarked];
}

export function describeViolation({ path, line, table, rule }) {
  if (rule === "marked-not-revoked") {
    return (
      `${path}:${line}: table "${table}" is marked append-only, but the cloud migrations do not ` +
      `leave UPDATE, DELETE, TRUNCATE all revoked from ${ROLE}; revoke the three of them on it ` +
      `from ${ROLE} in a migration and grant none of them back`
    );
  }
  return (
    `${path}:${line}: table "${table}" has UPDATE and DELETE revoked from ${ROLE} and never ` +
    `granted back, but its definition in ${SCHEMA_PATH} carries no "Append-only" comment; ` +
    `add one right above it saying why its rows never change`
  );
}

export function readRepository(
  root = process.cwd(),
  readFile = (path) => readFileSync(path, "utf8"),
) {
  const journal = JSON.parse(readFile(join(root, JOURNAL_PATH)));
  return {
    schemaPath: SCHEMA_PATH,
    schemaSource: readFile(join(root, SCHEMA_PATH)),
    migrations: journal.entries.map(({ tag }) => {
      const path = `${MIGRATIONS_DIR}/${tag}.sql`;
      return { path, source: readFile(join(root, path)) };
    }),
  };
}
