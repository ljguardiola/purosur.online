import { parseEsArNumber } from "../../messages/parsers";

export type DecimalTypingState = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

export type DecimalEdit =
  | { kind: "insert"; data: string }
  | { kind: "insert-paste"; data: string }
  | { kind: "delete-backward" }
  | { kind: "delete-forward" };

export type DecimalTypingResult = { text: string; caret: number };

type Digits = { digits: string; caret: number };

const DIGIT = /^\d$/;

// Digits and the first comma only, so the thousands dots of the shown text drop out; the caret
// counts what it kept on its left.
function significantCharacters(text: string, caret: number, maxDecimals: number): Digits {
  let digits = "";
  let keptBeforeCaret = 0;
  let commaSeen = false;
  let fractionLength = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    let kept = false;
    if (DIGIT.test(character)) {
      if (!commaSeen || fractionLength < maxDecimals) {
        kept = true;
        fractionLength += commaSeen ? 1 : 0;
      }
    } else if (character === "," && maxDecimals > 0 && !commaSeen) {
      kept = true;
      commaSeen = true;
    }
    if (kept) {
      digits += character;
      keptBeforeCaret += index < caret ? 1 : 0;
    }
  }
  return { digits, caret: keptBeforeCaret };
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function shownText({ digits, caret }: Digits): DecimalTypingResult {
  const commaIndex = digits.indexOf(",");
  const rawWhole = commaIndex === -1 ? digits : digits.slice(0, commaIndex);
  const fraction = commaIndex === -1 ? "" : digits.slice(commaIndex);
  if (digits === "") {
    return { text: "", caret: 0 };
  }
  const trimmedWhole = rawWhole === "" ? "" : rawWhole.replace(/^0+(?=\d)/, "");
  const whole = trimmedWhole === "" ? "0" : trimmedWhole;
  const removedBeforeCaret = Math.min(rawWhole.length - trimmedWhole.length, caret);
  const addedZero = rawWhole === "" && caret > 0 ? 1 : 0;
  const significantBeforeCaret = caret - removedBeforeCaret + addedZero;
  const text = groupThousands(whole) + fraction;

  let seen = 0;
  let position = 0;
  while (seen < significantBeforeCaret) {
    seen += text.charAt(position) === "." ? 0 : 1;
    position++;
  }
  return { text, caret: position };
}

function insertCharacters(
  current: Digits,
  start: number,
  end: number,
  data: string,
  maxDecimals: number,
): Digits | undefined {
  let digits = current.digits.slice(0, start) + current.digits.slice(end);
  let caret = start;
  let inserted = false;
  for (const character of data) {
    const commaIndex = digits.indexOf(",");
    let accepted: string | undefined;
    if (DIGIT.test(character)) {
      const fractionFull =
        commaIndex !== -1 && caret > commaIndex && digits.length - commaIndex - 1 >= maxDecimals;
      accepted = fractionFull ? undefined : character;
    } else if (character === "." || character === ",") {
      const fractionTooLong = digits.length - caret > maxDecimals;
      accepted = maxDecimals === 0 || commaIndex !== -1 || fractionTooLong ? undefined : ",";
    }
    if (accepted !== undefined) {
      digits = digits.slice(0, caret) + accepted + digits.slice(caret);
      caret++;
      inserted = true;
    }
  }
  return inserted ? { digits, caret } : undefined;
}

function deleteRange(current: Digits, start: number, end: number): Digits {
  return { digits: current.digits.slice(0, start) + current.digits.slice(end), caret: start };
}

function pastedCharacters(data: string, maxDecimals: number): string | undefined {
  const parsed = parseEsArNumber(data, maxDecimals);
  if (parsed === undefined) {
    return undefined;
  }
  return parsed.fraction === "" ? parsed.whole : `${parsed.whole},${parsed.fraction}`;
}

export function applyDecimalEdit(
  state: DecimalTypingState,
  edit: DecimalEdit,
  maxDecimals: number,
): DecimalTypingResult {
  const unchanged = { text: state.text, caret: state.selectionEnd };
  const start = significantCharacters(state.text, state.selectionStart, maxDecimals);
  const end = significantCharacters(state.text, state.selectionEnd, maxDecimals);
  const current = { digits: start.digits, caret: end.caret };

  if (edit.kind === "delete-backward" || edit.kind === "delete-forward") {
    if (start.caret !== end.caret) {
      return shownText(deleteRange(current, start.caret, end.caret));
    }
    const target = edit.kind === "delete-backward" ? start.caret - 1 : start.caret;
    if (target < 0 || target >= current.digits.length) {
      return unchanged;
    }
    return shownText(deleteRange(current, target, target + 1));
  }

  if (edit.kind === "insert-paste") {
    const normalized = pastedCharacters(edit.data, maxDecimals);
    if (normalized === undefined) {
      const text = state.text.slice(0, state.selectionStart) + edit.data;
      return {
        text: text + state.text.slice(state.selectionEnd),
        caret: text.length,
      };
    }
    const pasted = insertCharacters(current, start.caret, end.caret, normalized, maxDecimals);
    return pasted === undefined ? unchanged : shownText(pasted);
  }

  const typed = insertCharacters(current, start.caret, end.caret, edit.data, maxDecimals);
  return typed === undefined ? unchanged : shownText(typed);
}

export function reformatDecimalText(
  text: string,
  caret: number,
  maxDecimals: number,
): DecimalTypingResult {
  return shownText(significantCharacters(text, caret, maxDecimals));
}
