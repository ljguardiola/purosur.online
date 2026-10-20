import { globSync, readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

const GITHUB_DEFAULT_JOB_MINUTES = 360;
const MAX_LOOP_ROUNDS = 1000;
const MAX_CALL_DEPTH = 16;
const UNKNOWN = Symbol("unknown");
const ABSENT = Symbol("absent");
const LIST_ENDS = new Set(["then", "do", "done", "fi", "elif", "else", "esac", "}"]);
const INSTANT_BUILTINS = new Set(["echo", "printf", "cd", "pwd", "set", "shopt", "trap", "umask"]);
const DECLARATION_BUILTINS = new Set(["export", "local", "declare", "readonly", "typeset"]);
const DURATION_UNITS = { "": 1, s: 1, m: 60, h: 3600, d: 86400 };

class ShellSyntaxError extends Error {}

// Tokenizing

const WORD_ENDS = new Set([" ", "\t", "\n", ";", "&", "|", "(", ")", "<", ">"]);

function findClosingParen(source, index) {
  let depth = 0;
  for (let i = index; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") {
      i++;
    } else if (char === "'") {
      i = source.indexOf("'", i + 1);
      if (i === -1) break;
    } else if (char === '"') {
      i = findClosingDoubleQuote(source, i + 1);
      if (i === -1) break;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new ShellSyntaxError("a parenthesis is not closed");
}

function findClosingDoubleQuote(source, index) {
  for (let i = index; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === '"') return i;
  }
  return -1;
}

function findClosingBrace(source, index) {
  let depth = 0;
  for (let i = index; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") i++;
    else if (char === "'") i = source.indexOf("'", i + 1);
    else if (char === '"') i = findClosingDoubleQuote(source, i + 1);
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return i;
    if (i === -1) break;
  }
  throw new ShellSyntaxError("a brace is not closed");
}

function parameterPart(inner) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?$!-])([\s\S]*)$/.exec(inner);
  if (match === null) return { param: null };
  const [, name, rest] = match;
  if (rest === "") return { param: name };
  const fallback = /^(:?-)([\s\S]*)$/.exec(rest);
  if (fallback !== null) return { param: name, op: fallback[1], arg: fallback[2] };
  return { param: null };
}

function readDollar(source, index) {
  const next = source[index + 1];
  if (source.startsWith("$((", index)) {
    const end = findClosingParen(source, index + 1);
    return { part: { arith: source.slice(index + 3, end - 1) }, end: end + 1 };
  }
  if (next === "(") {
    const end = findClosingParen(source, index + 1);
    return { part: { cmdsub: source.slice(index + 2, end) }, end: end + 1 };
  }
  if (source.startsWith("${{", index)) {
    const end = source.indexOf("}}", index + 3);
    if (end === -1) throw new ShellSyntaxError(`a \${{ }} expression is not closed`);
    return { part: { gha: source.slice(index + 3, end) }, end: end + 2 };
  }
  if (next === "{") {
    const end = findClosingBrace(source, index + 1);
    return { part: parameterPart(source.slice(index + 2, end)), end: end + 1 };
  }
  if (next === "'") {
    let end = index + 2;
    while (end < source.length && source[end] !== "'") end += source[end] === "\\" ? 2 : 1;
    if (end >= source.length) throw new ShellSyntaxError("a quote is not closed");
    return { part: { sq: source.slice(index + 2, end) }, end: end + 1 };
  }
  const name = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(source.slice(index + 1));
  if (name === null) return { part: { lit: "$" }, end: index + 1 };
  return { part: { param: name[0] }, end: index + 1 + name[0].length };
}

function readBacktick(source, index) {
  let end = index + 1;
  while (end < source.length && source[end] !== "`") end += source[end] === "\\" ? 2 : 1;
  if (end >= source.length) throw new ShellSyntaxError("a backquote is not closed");
  return { part: { cmdsub: source.slice(index + 1, end) }, end: end + 1 };
}

function readDoubleQuoted(source, index) {
  const parts = [];
  let i = index;
  while (i < source.length && source[i] !== '"') {
    const char = source[i];
    if (char === "\\") {
      const escaped = source[i + 1];
      if (escaped === "\n") {
        i += 2;
      } else if ('$`"\\'.includes(escaped)) {
        parts.push({ lit: escaped });
        i += 2;
      } else {
        parts.push({ lit: "\\" });
        i++;
      }
    } else if (char === "$") {
      const read = readDollar(source, i);
      parts.push(read.part);
      i = read.end;
    } else if (char === "`") {
      const read = readBacktick(source, i);
      parts.push(read.part);
      i = read.end;
    } else {
      parts.push({ lit: char });
      i++;
    }
  }
  if (i >= source.length) throw new ShellSyntaxError("a quote is not closed");
  return { part: { dq: parts }, end: i + 1 };
}

function readWord(source, index) {
  const parts = [];
  let i = index;
  while (i < source.length && !WORD_ENDS.has(source[i])) {
    const char = source[i];
    let read;
    if (char === "\\") {
      if (source[i + 1] === "\n") {
        i += 2;
        continue;
      }
      read = { part: { sq: source[i + 1] ?? "" }, end: i + 2 };
    } else if (char === "'") {
      const end = source.indexOf("'", i + 1);
      if (end === -1) throw new ShellSyntaxError("a quote is not closed");
      read = { part: { sq: source.slice(i + 1, end) }, end: end + 1 };
    } else if (char === '"') {
      read = readDoubleQuoted(source, i + 1);
    } else if (char === "$") {
      read = readDollar(source, i);
    } else if (char === "`") {
      read = readBacktick(source, i);
    } else {
      read = { part: { lit: char }, end: i + 1 };
    }
    parts.push(read.part);
    i = read.end;
  }
  return { token: { kind: "word", parts: mergeLiterals(parts), start: index, end: i }, end: i };
}

function mergeLiterals(parts) {
  const merged = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (part.lit !== undefined && last?.lit !== undefined) last.lit += part.lit;
    else merged.push({ ...part });
  }
  return merged;
}

function literalText(token) {
  if (token?.kind !== "word") return null;
  if (token.parts.length === 1 && token.parts[0].lit !== undefined) return token.parts[0].lit;
  return null;
}

function unquotedText(token) {
  return token.parts.map((part) => part.lit ?? part.sq ?? "").join("");
}

function skipBlanks(source, index) {
  let i = index;
  while (source[i] === " " || source[i] === "\t" || source.startsWith("\\\n", i)) {
    i += source[i] === "\\" ? 2 : 1;
  }
  return i;
}

function readHeredocBodies(source, index, heredocs) {
  let i = index;
  for (const { delimiter, stripTabs } of heredocs) {
    while (i < source.length) {
      const lineEnd = source.indexOf("\n", i) === -1 ? source.length : source.indexOf("\n", i);
      const line = source.slice(i, lineEnd);
      i = lineEnd + 1;
      if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
    }
  }
  heredocs.length = 0;
  return i;
}

function readDoubleBracket(source, index) {
  const words = [];
  let i = index;
  for (;;) {
    i = skipBlanks(source, i);
    if (i >= source.length) throw new ShellSyntaxError("a [[ is not closed");
    const operator = ["&&", "||", "\n", "(", ")", "!", "<", ">", "&", "|"].find((op) =>
      source.startsWith(op, i),
    );
    if (operator === "\n") {
      i++;
    } else if (operator !== undefined) {
      words.push({ kind: "word", parts: [{ lit: operator }], start: i, end: i + operator.length });
      i += operator.length;
    } else {
      const read = readWord(source, i);
      i = read.end;
      if (literalText(read.token) === "]]") return { words, end: i };
      words.push(read.token);
    }
  }
}

function tokenize(source) {
  const tokens = [];
  const heredocs = [];
  const op = (value, start, end) => tokens.push({ kind: "op", value, start, end });
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === " " || char === "\t") {
      i++;
    } else if (source.startsWith("\\\n", i)) {
      i += 2;
    } else if (char === "#") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (char === "\n") {
      op("\n", i, i + 1);
      i = readHeredocBodies(source, i + 1, heredocs);
    } else if (char === ";") {
      const value = [";;&", ";;", ";&"].find((candidate) => source.startsWith(candidate, i));
      op(value === undefined ? ";" : ";;", i, i + (value?.length ?? 1));
      i += value?.length ?? 1;
    } else if (char === "&" && source[i + 1] === "&") {
      op("&&", i, i + 2);
      i += 2;
    } else if (char === "|" && source[i + 1] === "|") {
      op("||", i, i + 2);
      i += 2;
    } else if (char === "|") {
      op("|", i, i + 1);
      i += source[i + 1] === "&" ? 2 : 1;
    } else if (char === "&" && source[i + 1] !== ">") {
      op("&", i, i + 1);
      i++;
    } else if (char === "(" && source[i + 1] === "(") {
      const end = findClosingParen(source, i);
      tokens.push({ kind: "arith", expr: source.slice(i + 2, end - 1), start: i, end: end + 1 });
      i = end + 1;
    } else if ((char === "<" || char === ">") && source[i + 1] === "(") {
      const end = findClosingParen(source, i + 1);
      const part = { cmdsub: source.slice(i + 2, end) };
      tokens.push({ kind: "word", parts: [part], start: i, end: end + 1 });
      i = end + 1;
    } else if (char === "(" || char === ")") {
      op(char, i, i + 1);
      i++;
    } else if (char === "<" || char === ">" || char === "&") {
      const last = tokens.at(-1);
      if (last?.kind === "word" && last.end === i && /^\d+$/.test(literalText(last) ?? "")) {
        tokens.pop();
      }
      const redirection = [
        "<<<",
        "<<-",
        "<<",
        "&>>",
        "&>",
        ">>",
        ">&",
        "<&",
        ">|",
        "<>",
        "<",
        ">",
      ].find((candidate) => source.startsWith(candidate, i));
      i = skipBlanks(source, i + redirection.length);
      const target = readWord(source, i);
      if (target.token.parts.length === 0) {
        throw new ShellSyntaxError(`\`${redirection}\` has no target`);
      }
      if (redirection === "<<" || redirection === "<<-") {
        heredocs.push({ delimiter: unquotedText(target.token), stripTabs: redirection === "<<-" });
      }
      i = target.end;
    } else {
      const read = readWord(source, i);
      if (literalText(read.token) === "[[") {
        const bracket = readDoubleBracket(source, read.end);
        tokens.push({ kind: "dbracket", words: bracket.words, start: i, end: bracket.end });
        i = bracket.end;
      } else {
        tokens.push(read.token);
        i = read.end;
      }
    }
  }
  tokens.push({ kind: "eof", start: source.length, end: source.length });
  return tokens;
}

// Parsing

function describeToken(token) {
  if (token.kind === "eof") return "the end of the script";
  if (token.kind === "op") return token.value === "\n" ? "a new line" : `\`${token.value}\``;
  return `\`${literalText(token) ?? "a word"}\``;
}

class Parser {
  constructor(source) {
    this.source = source;
    this.tokens = tokenize(source);
    this.position = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.position + offset];
  }

  next() {
    return this.tokens[this.position++];
  }

  isOp(value, offset = 0) {
    const token = this.peek(offset);
    return token.kind === "op" && token.value === value;
  }

  isWord(text) {
    return literalText(this.peek()) === text;
  }

  skipNewlines() {
    while (this.isOp("\n")) this.next();
  }

  skipSeparators() {
    while (this.isOp("\n") || this.isOp(";") || this.isOp("&")) this.next();
  }

  expectWord(text) {
    const token = this.next();
    if (literalText(token) !== text) {
      throw new ShellSyntaxError(`expected \`${text}\`, found ${describeToken(token)}`);
    }
    return token;
  }

  expectOp(value) {
    const token = this.next();
    if (token.kind !== "op" || token.value !== value) {
      throw new ShellSyntaxError(`expected \`${value}\`, found ${describeToken(token)}`);
    }
    return token;
  }

  text(start, end) {
    return this.source.slice(start, end).replace(/\s+/g, " ").trim();
  }

  parseScript() {
    const script = this.parseList();
    if (this.peek().kind !== "eof") {
      throw new ShellSyntaxError(`unexpected ${describeToken(this.peek())}`);
    }
    return script;
  }

  parseList() {
    const items = [];
    for (;;) {
      this.skipSeparators();
      const token = this.peek();
      if (token.kind === "eof" || this.isOp(")") || this.isOp(";;")) break;
      if (LIST_ENDS.has(literalText(token))) break;
      items.push(this.parseAndOr());
    }
    return { type: "list", items };
  }

  parseAndOr() {
    const first = this.parsePipeline();
    const rest = [];
    while (this.isOp("&&") || this.isOp("||")) {
      const op = this.next().value;
      this.skipNewlines();
      rest.push({ op, pipeline: this.parsePipeline() });
    }
    return { type: "andor", first, rest };
  }

  parsePipeline() {
    const negated = this.isWord("!");
    if (negated) this.next();
    const commands = [this.parseCommand()];
    while (this.isOp("|")) {
      this.next();
      this.skipNewlines();
      commands.push(this.parseCommand());
    }
    return { type: "pipeline", negated, commands };
  }

  parseCommand() {
    const token = this.peek();
    if (token.kind === "arith") {
      this.next();
      return { type: "arith", expr: token.expr };
    }
    if (token.kind === "dbracket") {
      this.next();
      return { type: "test", words: token.words };
    }
    if (this.isOp("(")) {
      this.next();
      const body = this.parseList();
      this.expectOp(")");
      return { type: "group", subshell: true, body };
    }
    if (token.kind !== "word") throw new ShellSyntaxError(`unexpected ${describeToken(token)}`);
    switch (literalText(token)) {
      case "if":
        return this.parseIf();
      case "for":
        return this.parseFor();
      case "while":
      case "until":
        return this.parseWhile();
      case "case":
        return this.parseCase();
      case "{": {
        this.next();
        const body = this.parseList();
        this.expectWord("}");
        return { type: "group", subshell: false, body };
      }
      case "function": {
        this.next();
        const name = literalText(this.next());
        if (this.isOp("(") && this.isOp(")", 1)) this.position += 2;
        this.skipNewlines();
        return { type: "funcdef", name, body: this.parseCommand() };
      }
    }
    if (LIST_ENDS.has(literalText(token))) {
      throw new ShellSyntaxError(`unexpected ${describeToken(token)}`);
    }
    if (this.isOp("(", 1) && this.isOp(")", 2)) {
      const name = literalText(this.next());
      this.position += 2;
      this.skipNewlines();
      return { type: "funcdef", name, body: this.parseCommand() };
    }
    return this.parseSimple();
  }

  parseSimple() {
    const words = [];
    while (this.peek().kind === "word") {
      const word = this.next();
      const assignsArray = /^[A-Za-z_][A-Za-z0-9_]*\+?=$/.test(literalText(word) ?? "");
      if (assignsArray && this.isOp("(") && this.peek().start === word.end) {
        this.next();
        while (!this.isOp(")")) {
          if (this.peek().kind === "eof") throw new ShellSyntaxError("an array is not closed");
          this.next();
        }
        this.next();
        words.push({ ...word, parts: [...word.parts, { gha: "" }] });
      } else {
        words.push(word);
      }
    }
    const start = words[0].start;
    const end = words.at(-1).end;
    return { type: "simple", words, text: this.text(start, end) };
  }

  parseIf() {
    this.expectWord("if");
    const clauses = [];
    let cond = this.parseList();
    this.expectWord("then");
    clauses.push({ cond, body: this.parseList() });
    while (this.isWord("elif")) {
      this.next();
      cond = this.parseList();
      this.expectWord("then");
      clauses.push({ cond, body: this.parseList() });
    }
    let elseBody = null;
    if (this.isWord("else")) {
      this.next();
      elseBody = this.parseList();
    }
    this.expectWord("fi");
    return { type: "if", clauses, elseBody };
  }

  parseLoopBody(start) {
    this.skipSeparators();
    const opener = this.peek();
    if (literalText(opener) === "{") {
      return { body: this.parseCommand(), header: this.text(start, opener.start) };
    }
    const doToken = this.expectWord("do");
    const body = this.parseList();
    this.expectWord("done");
    return { body, header: this.text(start, doToken.end) };
  }

  parseFor() {
    const start = this.expectWord("for").start;
    const token = this.next();
    if (token.kind === "arith") {
      const [init = "", cond = "", update = ""] = token.expr.split(";");
      return { type: "cfor", init, cond, update, ...this.parseLoopBody(start) };
    }
    const name = literalText(token);
    if (name === null) throw new ShellSyntaxError(`expected a loop variable after \`for\``);
    this.skipNewlines();
    let words = null;
    if (this.isWord("in")) {
      this.next();
      words = [];
      while (this.peek().kind === "word") words.push(this.next());
    }
    return { type: "for", name, words, ...this.parseLoopBody(start) };
  }

  parseWhile() {
    const keyword = this.next();
    const cond = this.parseList();
    return {
      type: "while",
      until: literalText(keyword) === "until",
      cond,
      ...this.parseLoopBody(keyword.start),
    };
  }

  parseCase() {
    this.expectWord("case");
    const word = this.next();
    this.skipNewlines();
    this.expectWord("in");
    const items = [];
    for (;;) {
      this.skipNewlines();
      if (this.isWord("esac")) {
        this.next();
        return { type: "case", word, items };
      }
      if (this.isOp("(")) this.next();
      const patterns = [this.next()];
      while (this.isOp("|")) {
        this.next();
        patterns.push(this.next());
      }
      this.expectOp(")");
      items.push({ patterns, body: this.parseList() });
      if (this.isOp(";;")) this.next();
    }
  }
}

function parseShell(source) {
  return new Parser(source).parseScript();
}

// Arithmetic

function tokenizeArithmetic(expr) {
  const tokens = [];
  const pattern =
    /\s*(0[xX][0-9a-fA-F]+|\d+|\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$?[A-Za-z_][A-Za-z0-9_]*|\$[0-9#]|\*\*=?|<<=?|>>=?|\+\+|--|&&|\|\||[=!<>]=|[-+*/%&|^]=|[-+*/%<>=!~?:,()&|^])/y;
  let index = 0;
  while (index < expr.length) {
    if (/^\s*$/.test(expr.slice(index))) break;
    pattern.lastIndex = index;
    const match = pattern.exec(expr);
    if (match === null) return null;
    tokens.push(match[1]);
    index = pattern.lastIndex;
  }
  return tokens;
}

function parseArithmetic(expr) {
  const tokens = tokenizeArithmetic(expr);
  if (tokens === null) return null;
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const BINARY_LEVELS = [
    ["||"],
    ["&&"],
    ["|"],
    ["^"],
    ["&"],
    ["==", "!="],
    ["<", "<=", ">", ">="],
    ["<<", ">>"],
    ["+", "-"],
    ["*", "/", "%"],
  ];
  const isName = (token) => /^\$?\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(token ?? "");
  const nameOf = (token) => token.replace(/^\$\{?|\}$/g, "");

  function comma() {
    let node = assignment();
    while (peek() === ",") {
      take();
      node = { comma: [node, assignment()] };
    }
    return node;
  }
  function assignment() {
    if (isName(peek()) && /^(=|[-+*/%&|^]=|\*\*=|<<=|>>=)$/.test(tokens[position + 1] ?? "")) {
      const name = nameOf(take());
      const op = take();
      return { assign: name, op, value: assignment() };
    }
    return ternary();
  }
  function ternary() {
    const cond = binary(0);
    if (peek() !== "?") return cond;
    take();
    const then = assignment();
    if (take() !== ":") throw new SyntaxError("expected :");
    return { ternary: [cond, then, assignment()] };
  }
  function binary(level) {
    if (level === BINARY_LEVELS.length) return power();
    let node = binary(level + 1);
    while (BINARY_LEVELS[level].includes(peek())) {
      node = { binary: take(), left: node, right: binary(level + 1) };
    }
    return node;
  }
  function power() {
    const base = unary();
    if (peek() !== "**") return base;
    take();
    return { binary: "**", left: base, right: power() };
  }
  function unary() {
    const token = peek();
    if (token === "++" || token === "--") {
      take();
      return { pre: token, name: nameOf(take()) };
    }
    if (["-", "+", "!", "~"].includes(token)) {
      take();
      return { unary: token, arg: unary() };
    }
    return postfix();
  }
  function postfix() {
    const node = primary();
    if (node.name !== undefined && (peek() === "++" || peek() === "--")) {
      return { post: take(), name: node.name };
    }
    return node;
  }
  function primary() {
    const token = take();
    if (token === "(") {
      const node = comma();
      if (take() !== ")") throw new SyntaxError("expected )");
      return node;
    }
    if (token === undefined) throw new SyntaxError("unexpected end");
    if (/^(0[xX][0-9a-fA-F]+|\d+)$/.test(token)) return { number: Number(token) };
    if (/^\$[0-9#]$/.test(token)) return { positional: token.slice(1) };
    if (isName(token)) return { name: nameOf(token) };
    throw new SyntaxError(`unexpected ${token}`);
  }

  try {
    if (tokens.length === 0) return { number: 0 };
    const node = comma();
    return position === tokens.length ? node : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function applyBinary(op, left, right) {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? null : Math.trunc(left / right);
    case "%":
      return right === 0 ? null : left % right;
    case "**":
      return left ** right;
    case "<<":
      return left << right;
    case ">>":
      return left >> right;
    case "&":
      return left & right;
    case "|":
      return left | right;
    case "^":
      return left ^ right;
    case "<":
      return Number(left < right);
    case "<=":
      return Number(left <= right);
    case ">":
      return Number(left > right);
    case ">=":
      return Number(left >= right);
    case "==":
      return Number(left === right);
    case "!=":
      return Number(left !== right);
  }
  return null;
}

function arithmeticValueOf(value, state, depth = 0) {
  if (value === UNKNOWN || value === ABSENT || depth > 8) return null;
  const text = value.trim();
  if (text === "") return 0;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    return arithmeticValueOf(state.lookup(text), state, depth + 1);
  }
  return null;
}

function evaluateArithmeticNode(node, state) {
  if (node.number !== undefined) return node.number;
  if (node.positional !== undefined) {
    return arithmeticValueOf(state.lookupParameter(node.positional), state);
  }
  if (node.comma !== undefined) {
    evaluateArithmeticNode(node.comma[0], state);
    return evaluateArithmeticNode(node.comma[1], state);
  }
  if (node.assign !== undefined) {
    let value = evaluateArithmeticNode(node.value, state);
    if (node.op !== "=" && value !== null) {
      const current = arithmeticValueOf(state.lookup(node.assign), state);
      value = current === null ? null : applyBinary(node.op.slice(0, -1), current, value);
    }
    state.assign(node.assign, value === null ? UNKNOWN : String(value));
    return value;
  }
  if (node.pre !== undefined || node.post !== undefined) {
    const current = arithmeticValueOf(state.lookup(node.name), state);
    const updated = current === null ? null : current + ((node.pre ?? node.post) === "++" ? 1 : -1);
    state.assign(node.name, updated === null ? UNKNOWN : String(updated));
    return node.pre !== undefined ? updated : current;
  }
  if (node.name !== undefined) return arithmeticValueOf(state.lookup(node.name), state);
  if (node.unary !== undefined) {
    const value = evaluateArithmeticNode(node.arg, state);
    if (value === null) return null;
    return { "-": -value, "+": value, "!": Number(value === 0), "~": ~value }[node.unary];
  }
  if (node.ternary !== undefined) {
    const cond = evaluateArithmeticNode(node.ternary[0], state);
    if (cond === null) return null;
    return evaluateArithmeticNode(node.ternary[cond !== 0 ? 1 : 2], state);
  }
  const left = evaluateArithmeticNode(node.left, state);
  if (node.binary === "&&" || node.binary === "||") {
    if (left !== null && (node.binary === "&&" ? left === 0 : left !== 0)) {
      return Number(node.binary === "||");
    }
    const right = evaluateArithmeticNode(node.right, state);
    if (right === null) return null;
    if (left === null)
      return (node.binary === "&&" ? right === 0 : right !== 0)
        ? Number(node.binary === "||")
        : null;
    return Number(right !== 0);
  }
  const right = evaluateArithmeticNode(node.right, state);
  return left === null || right === null ? null : applyBinary(node.binary, left, right);
}

function evaluateArithmetic(expr, state) {
  const node = parseArithmetic(expr);
  return node === null ? null : evaluateArithmeticNode(node, state);
}

function statusOfArithmetic(value) {
  if (value === null) return null;
  return value !== 0 ? 0 : 1;
}

// Running

class ShellState {
  constructor(env) {
    this.env = env;
    this.positional = [];
    this.functions = new Map();
    this.elapsed = 0;
    this.unbounded = new Map();
    this.loopDepth = 0;
    this.callDepth = 0;
  }

  clone() {
    const copy = new ShellState(new Map(this.env));
    copy.positional = [...this.positional];
    copy.functions = new Map(this.functions);
    copy.elapsed = this.elapsed;
    copy.unbounded = new Map(this.unbounded);
    copy.loopDepth = this.loopDepth;
    copy.callDepth = this.callDepth;
    return copy;
  }

  adopt(other) {
    Object.assign(this, other);
  }

  addCost(costOf) {
    this.elapsed = costOf.elapsed;
    this.unbounded = costOf.unbounded;
  }

  lookup(name) {
    return this.env.has(name) ? this.env.get(name) : ABSENT;
  }

  lookupParameter(name) {
    if (/^\d+$/.test(name))
      return name === "0" ? UNKNOWN : (this.positional[Number(name) - 1] ?? "");
    if (name === "#") return String(this.positional.length);
    if (name === "@" || name === "*") {
      return this.positional.includes(UNKNOWN) ? UNKNOWN : this.positional.join(" ");
    }
    if ("?$!-".includes(name)) return UNKNOWN;
    return this.lookup(name);
  }

  assign(name, value) {
    this.env.set(name, value);
  }

  spend(seconds) {
    if (this.loopDepth > 0) this.elapsed += seconds;
  }

  leaveUnbounded(text) {
    if (this.loopDepth > 0) this.unbounded.set(text, (this.unbounded.get(text) ?? 0) + 1);
  }
}

const DONE = { status: 0, signal: null };

function literalDefault(arg) {
  const unquoted = /^"([^"$`\\]*)"$|^'([^']*)'$/.exec(arg);
  if (unquoted !== null) return unquoted[1] ?? unquoted[2];
  return /[$`"'\\]/.test(arg) ? UNKNOWN : arg;
}

function expandParameter(part, state) {
  if (part.param === null) return UNKNOWN;
  const value = state.lookupParameter(part.param);
  if (part.op === undefined) return value === ABSENT ? UNKNOWN : value;
  if (value === UNKNOWN) return UNKNOWN;
  const missing = value === ABSENT || (part.op === ":-" && value === "");
  return missing ? literalDefault(part.arg) : value;
}

const SEQ = /^\s*seq\s+(-?\d+)(?:\s+(-?\d+))?(?:\s+(-?\d+))?\s*$/;

function sequence(first, step, last) {
  const values = [];
  if (step === 0) return values;
  for (let value = first; step > 0 ? value <= last : value >= last; value += step) {
    values.push(String(value));
    if (values.length > MAX_LOOP_ROUNDS) break;
  }
  return values;
}

function runCommandSubstitution(part, state) {
  const seq = SEQ.exec(part.cmdsub);
  if (seq !== null) {
    const numbers = seq
      .slice(1)
      .filter((value) => value !== undefined)
      .map(Number);
    const [first, step, last] =
      numbers.length === 1
        ? [1, 1, numbers[0]]
        : numbers.length === 2
          ? [numbers[0], 1, numbers[1]]
          : numbers;
    return sequence(first, step, last).join("\n");
  }
  part.script ??= parseShell(part.cmdsub);
  const subshell = state.clone();
  run(part.script, subshell);
  state.addCost(subshell);
  return UNKNOWN;
}

function expandPart(part, state) {
  if (part.lit !== undefined) return part.lit;
  if (part.sq !== undefined) return part.sq;
  if (part.dq !== undefined) return expandQuoted(part.dq, state);
  if (part.param !== undefined) return expandParameter(part, state);
  if (part.arith !== undefined) {
    const value = evaluateArithmetic(part.arith, state);
    return value === null ? UNKNOWN : String(value);
  }
  if (part.cmdsub !== undefined) return runCommandSubstitution(part, state);
  return UNKNOWN;
}

function expandQuoted(parts, state) {
  let text = "";
  let unknown = false;
  for (const part of parts) {
    const value = expandPart(part, state);
    if (value === UNKNOWN) unknown = true;
    else text += value;
  }
  return unknown ? UNKNOWN : text;
}

function expandToString(word, state) {
  return expandQuoted(word.parts, state);
}

function braceExpansion(word) {
  const text = literalText(word);
  if (text === null) return null;
  const range = /^\{(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?\}$/.exec(text);
  if (range !== null) {
    const [first, last] = [Number(range[1]), Number(range[2])];
    const step = Math.abs(Number(range[3] ?? 1)) * (first <= last ? 1 : -1);
    return sequence(first, step, last);
  }
  const list = /^\{([^{}]*,[^{}]*)\}$/.exec(text);
  return list === null ? null : list[1].split(",");
}

function expandWord(word, state) {
  const braced = braceExpansion(word);
  if (braced !== null) return braced;

  const fields = [];
  let current = "";
  let started = false;
  let unknown = false;
  const finishField = () => {
    if (started) fields.push(unknown ? UNKNOWN : current);
    current = "";
    started = false;
    unknown = false;
  };
  for (const part of word.parts) {
    if (part.dq?.length === 1 && part.dq[0].param === "@") {
      finishField();
      fields.push(...state.positional);
      continue;
    }
    if (part.lit !== undefined || part.sq !== undefined || part.dq !== undefined) {
      const value = expandPart(part, state);
      if (value === UNKNOWN) unknown = true;
      else current += value;
      started = true;
      continue;
    }
    if (part.param === "@" || part.param === "*") {
      if (state.positional.includes(UNKNOWN)) return UNKNOWN;
    }
    const value = expandPart(part, state);
    if (value === UNKNOWN) {
      if (part.arith === undefined) return UNKNOWN;
      unknown = true;
      started = true;
      continue;
    }
    const pieces = value.split(/[ \t\n]+/);
    pieces.forEach((piece, index) => {
      if (index > 0) finishField();
      if (piece !== "") {
        current += piece;
        started = true;
      }
    });
  }
  finishField();
  return fields;
}

function expandWords(words, state) {
  const fields = [];
  for (const word of words) {
    const expanded = expandWord(word, state);
    if (expanded === UNKNOWN) return UNKNOWN;
    fields.push(...expanded);
  }
  return fields;
}

function parseDuration(value) {
  if (value === UNKNOWN || value === undefined) return null;
  const match = /^(\d+(?:\.\d*)?|\.\d+)([smhd]?)$/.exec(value);
  return match === null ? null : Number(match[1]) * DURATION_UNITS[match[2]];
}

function timeoutBound(args) {
  let killAfter = 0;
  let index = 0;
  while (index < args.length) {
    const arg = args[index];
    if (arg === UNKNOWN) return null;
    const killOption = /^(?:-k|--kill-after=?)(.*)$/.exec(arg);
    if (killOption !== null) {
      const value = killOption[1] === "" ? args[++index] : killOption[1];
      killAfter = parseDuration(value);
      if (killAfter === null) return null;
    } else if (arg === "-s" || arg === "--signal") {
      index++;
    } else if (!/^(--signal=.*|-s.+|--preserve-status|--foreground|-v|--verbose|--)$/.test(arg)) {
      break;
    }
    index++;
  }
  const duration = parseDuration(args[index]);
  if (duration === null || duration === 0 || index + 1 >= args.length) return null;
  return duration + killAfter;
}

function evaluateTest(args) {
  let position = 0;
  const peek = () => args[position];
  const or = (left, right) =>
    left === true || right === true ? true : left === false && right === false ? false : null;
  const and = (left, right) =>
    left === false || right === false ? false : left === true && right === true ? true : null;
  const integer = (value) => (/^-?\d+$/.test(value) ? Number(value) : null);
  const COMPARISONS = {
    "-eq": (a, b) => a === b,
    "-ne": (a, b) => a !== b,
    "-lt": (a, b) => a < b,
    "-le": (a, b) => a <= b,
    "-gt": (a, b) => a > b,
    "-ge": (a, b) => a >= b,
  };

  function disjunction() {
    let value = conjunction();
    while (peek() === "-o" || peek() === "||") {
      position++;
      value = or(value, conjunction());
    }
    return value;
  }
  function conjunction() {
    let value = negation();
    while (peek() === "-a" || peek() === "&&") {
      position++;
      value = and(value, negation());
    }
    return value;
  }
  function negation() {
    if (peek() === "!") {
      position++;
      const value = negation();
      return value === null ? null : !value;
    }
    return primary();
  }
  function primary() {
    if (peek() === "(") {
      position++;
      const value = disjunction();
      position++;
      return value;
    }
    const operator = args[position + 1];
    if (
      operator !== undefined &&
      (operator in COMPARISONS || ["=", "==", "!="].includes(operator))
    ) {
      const [left, , right] = args.slice(position, position + 3);
      position += 3;
      if (left === UNKNOWN || right === UNKNOWN || right === undefined) return null;
      if (operator in COMPARISONS) {
        const [a, b] = [integer(left), integer(right)];
        return a === null || b === null ? null : COMPARISONS[operator](a, b);
      }
      return operator === "!=" ? left !== right : left === right;
    }
    const token = args[position++];
    if (token === "-z" || token === "-n") {
      const operand = args[position++];
      if (operand === UNKNOWN || operand === undefined) return null;
      return token === "-z" ? operand === "" : operand !== "";
    }
    if (typeof token === "string" && /^-[a-zA-Z]$/.test(token) && args[position] !== undefined) {
      position++;
      return null;
    }
    return token === UNKNOWN || token === undefined ? null : token !== "";
  }

  const value = disjunction();
  if (value === null || position < args.length) return null;
  return value ? 0 : 1;
}

function alternatives(state, branches) {
  const outcomes = branches.map((branch) => {
    const copy = state.clone();
    return { copy, result: branch(copy) };
  });
  const continuing = outcomes.filter((outcome) => outcome.result.signal === null);
  const pool = continuing.length > 0 ? continuing : outcomes;
  const chosen = pool.reduce((worst, outcome) =>
    outcome.copy.elapsed > worst.copy.elapsed ? outcome : worst,
  );
  for (const outcome of outcomes) {
    for (const [text, count] of outcome.copy.unbounded) {
      chosen.copy.unbounded.set(text, Math.max(count, chosen.copy.unbounded.get(text) ?? 0));
    }
  }
  state.adopt(chosen.copy);
  const statuses = new Set(outcomes.map((outcome) => outcome.result.status));
  return {
    status: statuses.size === 1 ? chosen.result.status : null,
    signal: chosen.result.signal,
  };
}

function callFunction(body, args, state) {
  if (state.callDepth >= MAX_CALL_DEPTH) return { status: null, signal: null };
  const saved = state.positional;
  state.positional = args;
  state.callDepth++;
  const result = run(body, state);
  state.callDepth--;
  state.positional = saved;
  if (result.signal?.kind === "return") return { status: result.status, signal: null };
  return result;
}

function exitStatusOf(arg) {
  if (arg === undefined) return null;
  return arg === "0" ? 0 : /^\d+$/.test(arg ?? "") ? 1 : null;
}

function runCommand(name, args, node, state) {
  if (state.functions.has(name)) return callFunction(state.functions.get(name), args, state);
  switch (name) {
    case "sleep": {
      const durations = args.map(parseDuration);
      if (durations.length === 0 || durations.includes(null)) state.leaveUnbounded(node.text);
      state.spend(durations.reduce((total, seconds) => total + (seconds ?? 0), 0));
      return DONE;
    }
    case "timeout": {
      const bound = timeoutBound(args);
      if (bound === null) state.leaveUnbounded(node.text);
      else state.spend(bound);
      return { status: null, signal: null };
    }
    case "true":
    case ":":
      return DONE;
    case "false":
      return { status: 1, signal: null };
    case "exit":
      return { status: exitStatusOf(args[0]), signal: { kind: "exit" } };
    case "return":
      return { status: exitStatusOf(args[0]), signal: { kind: "return" } };
    case "break":
    case "continue": {
      const levels = /^\d+$/.test(args[0] ?? "") ? Number(args[0]) : 1;
      return { status: 0, signal: { kind: name, levels } };
    }
    case "[":
      return { status: args.at(-1) === "]" ? evaluateTest(args.slice(0, -1)) : null, signal: null };
    case "test":
      return { status: evaluateTest(args), signal: null };
    case "let": {
      let value = null;
      for (const arg of args) value = arg === UNKNOWN ? null : evaluateArithmetic(arg, state);
      return { status: statusOfArithmetic(value), signal: null };
    }
    case "unset":
      for (const arg of args) if (typeof arg === "string") state.env.delete(arg);
      return DONE;
    case "shift":
      state.positional = state.positional.slice(Number(args[0] ?? 1) || 1);
      return DONE;
    case "read":
      return { status: null, signal: null };
  }
  if (DECLARATION_BUILTINS.has(name)) {
    for (const arg of args) {
      const assignment =
        typeof arg === "string" ? /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(arg) : null;
      if (assignment !== null) state.assign(assignment[1], assignment[2]);
    }
    return DONE;
  }
  if (INSTANT_BUILTINS.has(name)) return DONE;
  state.leaveUnbounded(node.text);
  return { status: null, signal: null };
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/;

function runSimple(node, state) {
  let index = 0;
  const assignments = [];
  while (index < node.words.length) {
    const first = node.words[index].parts[0];
    const match = first?.lit === undefined ? null : ASSIGNMENT.exec(first.lit);
    if (match === null) break;
    assignments.push({ match, word: node.words[index] });
    index++;
  }
  if (index === node.words.length) {
    for (const { match, word } of assignments) {
      const [whole, name, append] = match;
      const rest = {
        parts: [{ lit: word.parts[0].lit.slice(whole.length) }, ...word.parts.slice(1)],
      };
      let value = expandToString(rest, state);
      if (append === "+") {
        const current = state.lookup(name);
        value =
          value === UNKNOWN || current === UNKNOWN
            ? UNKNOWN
            : `${current === ABSENT ? "" : current}${value}`;
      }
      state.assign(name, value);
    }
    return DONE;
  }
  const fields = expandWords(node.words.slice(index), state);
  if (fields === UNKNOWN || fields.length === 0 || fields[0] === UNKNOWN) {
    if (fields === UNKNOWN || fields[0] === UNKNOWN) state.leaveUnbounded(node.text);
    return { status: null, signal: null };
  }
  const [name, ...args] = fields;
  return runCommand(name, args, node, state);
}

function runIf(node, index, state) {
  if (index === node.clauses.length)
    return node.elseBody === null ? DONE : run(node.elseBody, state);
  const clause = node.clauses[index];
  const cond = run(clause.cond, state);
  if (cond.signal !== null) return cond;
  if (cond.status === 0) return run(clause.body, state);
  if (cond.status === 1) return runIf(node, index + 1, state);
  return alternatives(state, [
    (copy) => run(clause.body, copy),
    (copy) => runIf(node, index + 1, copy),
  ]);
}

function runLoopBody(body, state) {
  const result = run(body, state);
  const signal = result.signal;
  if (signal === null) return { stop: false };
  if (signal.kind === "break" || signal.kind === "continue") {
    const outer = signal.levels > 1 ? { ...signal, levels: signal.levels - 1 } : null;
    return {
      stop: signal.kind === "break" || outer !== null,
      result: { status: 0, signal: outer },
    };
  }
  return { stop: true, result };
}

function uncountable(node, state, before) {
  state.adopt(before);
  state.leaveUnbounded(node.header);
  return DONE;
}

function runFor(node, state) {
  const values = node.words === null ? state.positional : expandWords(node.words, state);
  if (values === UNKNOWN) return uncountable(node, state, state.clone());
  state.loopDepth++;
  try {
    for (const value of values) {
      state.assign(node.name, value);
      const { stop, result } = runLoopBody(node.body, state);
      if (stop) return result;
    }
    return DONE;
  } finally {
    state.loopDepth--;
  }
}

function runRounds(node, state) {
  const before = state.clone();
  state.loopDepth++;
  try {
    if (node.type === "cfor") evaluateArithmetic(node.init, state);
    for (let round = 0; round < MAX_LOOP_ROUNDS; round++) {
      let status;
      if (node.type === "cfor") {
        status =
          node.cond.trim() === "" ? 0 : statusOfArithmetic(evaluateArithmetic(node.cond, state));
      } else {
        const cond = run(node.cond, state);
        if (cond.signal !== null) return cond;
        status = cond.status;
      }
      if (node.until ? status === 0 : status === 1) return DONE;
      const { stop, result } = runLoopBody(node.body, state);
      if (stop) return result;
      if (node.type === "cfor") evaluateArithmetic(node.update, state);
    }
  } finally {
    state.loopDepth--;
  }
  return uncountable(node, state, before);
}

function globToRegExp(pattern) {
  const source = pattern
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${source}$`, "s");
}

function runCase(node, state) {
  const value = expandToString(node.word, state);
  const branches = [];
  let matched = false;
  for (const item of node.items) {
    const patterns = item.patterns.map((pattern) => expandToString(pattern, state));
    const matches = patterns.map((pattern) =>
      value === UNKNOWN || pattern === UNKNOWN ? null : globToRegExp(pattern).test(value),
    );
    if (matches.includes(true)) {
      branches.push((copy) => run(item.body, copy));
      matched = true;
      break;
    }
    if (matches.includes(null)) branches.push((copy) => run(item.body, copy));
  }
  if (!matched) branches.push(() => DONE);
  return branches.length === 1 ? branches[0](state) : alternatives(state, branches);
}

function negate(status) {
  return status === null ? null : status === 0 ? 1 : 0;
}

function run(node, state) {
  switch (node.type) {
    case "list": {
      let result = DONE;
      for (const item of node.items) {
        result = run(item, state);
        if (result.signal !== null) return result;
      }
      return result;
    }
    case "andor": {
      let result = run(node.first, state);
      for (const { op, pipeline } of node.rest) {
        if (result.signal !== null) return result;
        const runsNext = result.status === null ? null : (op === "&&") === (result.status === 0);
        if (runsNext === true) result = run(pipeline, state);
        else if (runsNext === null) {
          const skipped = result;
          result = alternatives(state, [(copy) => run(pipeline, copy), () => skipped]);
        }
      }
      return result;
    }
    case "pipeline": {
      let result = DONE;
      for (const command of node.commands) result = run(command, state);
      const signal = node.commands.length === 1 ? result.signal : null;
      return { status: node.negated ? negate(result.status) : result.status, signal };
    }
    case "simple":
      return runSimple(node, state);
    case "arith":
      return { status: statusOfArithmetic(evaluateArithmetic(node.expr, state)), signal: null };
    case "test": {
      const args = node.words.map((word) => expandToString(word, state));
      return { status: evaluateTest(args), signal: null };
    }
    case "group": {
      if (!node.subshell) return run(node.body, state);
      const subshell = state.clone();
      const result = run(node.body, subshell);
      state.addCost(subshell);
      return { status: result.status, signal: null };
    }
    case "funcdef":
      state.functions.set(node.name, node.body);
      return DONE;
    case "if":
      return runIf(node, 0, state);
    case "for":
      return runFor(node, state);
    case "cfor":
    case "while":
      return runRounds(node, state);
    case "case":
      return runCase(node, state);
  }
  throw new Error(`unknown shell node ${node.type}`);
}

function measureRetryLoops(source, env = new Map()) {
  const state = new ShellState(new Map(env));
  run(parseShell(source), state);
  return { seconds: state.elapsed, unbounded: [...state.unbounded] };
}

// Workflows

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function child(doc, node, key) {
  const resolved = resolveNode(doc, node);
  return isMap(resolved) ? resolveNode(doc, resolved.get(key, true)) : undefined;
}

function scalarValue(doc, node, key) {
  const value = child(doc, node, key);
  return isScalar(value) ? value.value : undefined;
}

function runsInBash(doc, workflow, job, step) {
  const shell = [
    scalarValue(doc, step, "shell"),
    scalarValue(doc, child(doc, child(doc, job, "defaults"), "run"), "shell"),
    scalarValue(doc, child(doc, child(doc, workflow, "defaults"), "run"), "shell"),
  ].find((value) => value !== undefined);
  if (shell !== undefined) return /^(bash|sh)(\s|$)/.test(String(shell).trim());
  const runsOn = child(doc, job, "runs-on");
  return !/windows/i.test(JSON.stringify(runsOn?.toJSON?.() ?? runsOn?.value ?? ""));
}

function literalEnv(doc, owners) {
  const env = new Map();
  for (const owner of owners) {
    const envNode = child(doc, owner, "env");
    if (!isMap(envNode)) continue;
    for (const pair of envNode.items) {
      const value = resolveNode(doc, pair.value);
      const literal =
        isScalar(value) && value.value !== null && !String(value.value).includes("${{")
          ? String(value.value)
          : UNKNOWN;
      env.set(String(resolveNode(doc, pair.key)?.value), literal);
    }
  }
  return env;
}

function timeoutInForce(doc, job, step) {
  const minutesOf = (owner) => {
    const value = child(doc, owner, "timeout-minutes");
    return isScalar(value) && typeof value.value === "number" && value.value > 0
      ? value.value
      : null;
  };
  const limits = [];
  const stepMinutes = minutesOf(step);
  if (stepMinutes !== null) limits.push({ minutes: stepMinutes, owner: "step's timeout-minutes" });
  if (child(doc, job, "timeout-minutes") === undefined) {
    limits.push({ minutes: GITHUB_DEFAULT_JOB_MINUTES, owner: "job's default time limit" });
  } else if (minutesOf(job) !== null) {
    limits.push({ minutes: minutesOf(job), owner: "job's timeout-minutes" });
  }
  return limits.reduce(
    (shortest, limit) => (shortest === null || limit.minutes < shortest.minutes ? limit : shortest),
    null,
  );
}

function stepLabel(doc, step, run) {
  const label = scalarValue(doc, step, "name") ?? scalarValue(doc, step, "id");
  return String(
    label ??
      run
        .split("\n")
        .find((line) => line.trim() !== "")
        .trim(),
  );
}

function describeUnbounded(unbounded) {
  if (unbounded.length === 0) return "";
  const parts = unbounded.map(
    ([text, count]) => `\`${text}\` (${count} ${count === 1 ? "run" : "runs"})`,
  );
  return `; not counted, having no time bound: ${parts.join(", ")}`;
}

function stepViolations(doc, workflow, jobPair, stepItem) {
  const job = resolveNode(doc, jobPair.value);
  const step = resolveNode(doc, stepItem);
  const run = scalarValue(doc, step, "run");
  if (typeof run !== "string" || !runsInBash(doc, workflow, job, step)) return [];
  const subject = `step "${stepLabel(doc, step, run)}" of job ${resolveNode(doc, jobPair.key).value}`;

  let measured;
  try {
    measured = measureRetryLoops(run, literalEnv(doc, [workflow, job, step]));
  } catch (error) {
    if (!(error instanceof ShellSyntaxError)) throw error;
    return [`${subject} does not parse as a shell script: ${error.message}`];
  }
  const limit = timeoutInForce(doc, job, step);
  if (limit === null || measured.seconds <= limit.minutes * 60) return [];
  return [
    `${subject} can take ${measured.seconds} seconds in its retry loops, more than the ` +
      `${limit.minutes} minutes its ${limit.owner} allows${describeUnbounded(measured.unbounded)}`,
  ];
}

export function checkFiles(paths, readFile = (path) => readFileSync(path, "utf8")) {
  return paths.flatMap((path) => {
    const lineCounter = new LineCounter();
    const doc = parseDocument(readFile(path), { lineCounter });
    if (doc.errors.length > 0) {
      const [error] = doc.errors;
      return [
        { path, line: error.linePos[0].line, message: `does not parse as YAML: ${error.message}` },
      ];
    }

    const workflow = doc.contents;
    const jobsNode = child(doc, workflow, "jobs");
    if (!isMap(jobsNode)) return [];

    return jobsNode.items.flatMap((jobPair) => {
      const stepsNode = child(doc, jobPair.value, "steps");
      if (!isSeq(stepsNode)) return [];
      return stepsNode.items.flatMap((stepItem) =>
        stepViolations(doc, workflow, jobPair, stepItem).map((message) => ({
          path,
          line: lineCounter.linePos(resolveNode(doc, stepItem).range[0]).line,
          message,
        })),
      );
    });
  });
}

export function findWorkflowFiles(cwd = process.cwd()) {
  return globSync(".github/workflows/*.{yml,yaml}", { cwd }).sort();
}

export function describeViolation({ path, line, message }) {
  return `${path}:${line}: ${message}`;
}
