import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseEsArNumber } from "../../messages/parsers";
import { applyDecimalEdit, type DecimalEdit, reformatDecimalText } from "./decimal-typing";

function typeInto(text: string, caret: number, data: string, maxDecimals = 2) {
  return applyDecimalEdit(
    { text, selectionStart: caret, selectionEnd: caret },
    { kind: "insert", data },
    maxDecimals,
  );
}

function typeSequence(keys: string, maxDecimals = 2): string {
  let text = "";
  for (const key of keys) {
    text = typeInto(text, text.length, key, maxDecimals).text;
  }
  return text;
}

function edit(text: string, selectionStart: number, selectionEnd: number, change: DecimalEdit) {
  return applyDecimalEdit({ text, selectionStart, selectionEnd }, change, 2);
}

function significantLeftOf(text: string, caret: number): number {
  return text.slice(0, caret).replaceAll(".", "").length;
}

describe("typing digits", () => {
  it("groups the thousands of the whole part as digits are typed", () => {
    expect(typeSequence("1234567")).toBe("1.234.567");
    expect(typeSequence("123")).toBe("123");
    expect(typeSequence("1234")).toBe("1.234");
  });

  it("keeps the caret after the typed digit when a separator appears", () => {
    expect(typeInto("123", 3, "4")).toEqual({ text: "1.234", caret: 5 });
  });

  it("keeps the caret after the typed digit when inserting in the middle", () => {
    expect(typeInto("1.234", 2, "9")).toEqual({ text: "19.234", caret: 2 });
  });

  it("ignores a digit beyond the field's decimals", () => {
    expect(typeInto("10,50", 5, "7")).toEqual({ text: "10,50", caret: 5 });
    expect(typeSequence("12,3456", 3)).toBe("12,345");
  });

  it("lets a digit go into the whole part while the fraction is full", () => {
    expect(typeInto("10,50", 1, "7")).toEqual({ text: "170,50", caret: 2 });
  });

  it("ignores letters, signs and spaces", () => {
    expect(typeInto("12", 2, "a")).toEqual({ text: "12", caret: 2 });
    expect(typeInto("12", 2, "-")).toEqual({ text: "12", caret: 2 });
    expect(typeInto("12", 2, " ")).toEqual({ text: "12", caret: 2 });
  });

  it("filters every character of a multi-character insertion", () => {
    expect(typeInto("", 0, "1a2.5")).toEqual({ text: "12,5", caret: 4 });
  });

  it("replaces the selection with the typed digit", () => {
    expect(edit("1.234.567", 2, 5, { kind: "insert", data: "9" })).toEqual({
      text: "19.567",
      caret: 2,
    });
  });

  it("keeps the text when the typed character is ignored over a selection", () => {
    expect(edit("10,50", 0, 2, { kind: "insert", data: "a" })).toEqual({ text: "10,50", caret: 2 });
  });
});

describe("leading zeros", () => {
  it("replaces a lone zero with the next digit typed", () => {
    expect(typeSequence("05")).toBe("5");
    expect(typeSequence("0075")).toBe("75");
  });

  it("keeps a single zero", () => {
    expect(typeSequence("000")).toBe("0");
  });

  it("keeps the zero before a decimal comma", () => {
    expect(typeSequence("0,5")).toBe("0,5");
    expect(typeSequence("00,5")).toBe("0,5");
  });

  it("keeps the caret after a typed digit that replaced a leading zero", () => {
    expect(typeInto("0", 1, "5")).toEqual({ text: "5", caret: 1 });
  });
});

describe("the decimal comma", () => {
  it("takes a typed dot as the decimal comma", () => {
    expect(typeSequence("1234.50")).toBe("1.234,50");
  });

  it("takes a typed comma as the decimal comma", () => {
    expect(typeSequence("1234,50")).toBe("1.234,50");
  });

  it("starts with a zero when the comma is typed first", () => {
    expect(typeInto("", 0, ",")).toEqual({ text: "0,", caret: 2 });
    expect(typeInto("", 0, ".")).toEqual({ text: "0,", caret: 2 });
  });

  it("ignores a dot or a comma once there is a comma", () => {
    expect(typeInto("10,50", 5, ".")).toEqual({ text: "10,50", caret: 5 });
    expect(typeInto("10,50", 5, ",")).toEqual({ text: "10,50", caret: 5 });
    expect(typeInto("10,50", 1, ",")).toEqual({ text: "10,50", caret: 1 });
  });

  it("takes the comma when the selection covers the existing one", () => {
    expect(edit("10,50", 2, 4, { kind: "insert", data: "." })).toEqual({
      text: "10,0",
      caret: 3,
    });
  });

  it("accepts no comma in a field without decimals", () => {
    expect(typeInto("12", 2, ".", 0)).toEqual({ text: "12", caret: 2 });
    expect(typeInto("12", 2, ",", 0)).toEqual({ text: "12", caret: 2 });
  });

  it("ignores a comma that would push more digits than the decimals into the fraction", () => {
    expect(typeInto("1.234", 1, ",")).toEqual({ text: "1.234", caret: 1 });
    expect(typeInto("1.234", 3, ",")).toEqual({ text: "12,34", caret: 3 });
  });

  it("takes a dot as the comma of a weight", () => {
    expect(typeSequence("12.5", 3)).toBe("12,5");
  });
});

describe("deleting", () => {
  it("regroups the thousands after deleting the last digit", () => {
    expect(edit("1.234", 5, 5, { kind: "delete-backward" })).toEqual({ text: "123", caret: 3 });
  });

  it("deletes the digit before a grouping dot when the caret is right after it", () => {
    expect(edit("1.234", 2, 2, { kind: "delete-backward" })).toEqual({ text: "234", caret: 0 });
  });

  it("deletes the digit after a grouping dot when the caret is right before it", () => {
    expect(edit("1.234", 1, 1, { kind: "delete-forward" })).toEqual({ text: "134", caret: 1 });
  });

  it("deletes the digit after the caret going forward", () => {
    expect(edit("12.345", 0, 0, { kind: "delete-forward" })).toEqual({ text: "2.345", caret: 0 });
  });

  it("does nothing deleting backward at the start", () => {
    expect(edit("1.234", 0, 0, { kind: "delete-backward" })).toEqual({ text: "1.234", caret: 0 });
  });

  it("does nothing deleting forward at the end", () => {
    expect(edit("1.234", 5, 5, { kind: "delete-forward" })).toEqual({ text: "1.234", caret: 5 });
  });

  it("deletes a selected range and regroups", () => {
    expect(edit("1.234.567", 1, 6, { kind: "delete-backward" })).toEqual({
      text: "1.567",
      caret: 1,
    });
    expect(edit("1.234.567", 1, 6, { kind: "delete-forward" })).toEqual({
      text: "1.567",
      caret: 1,
    });
  });

  it("deletes the decimal comma", () => {
    expect(edit("1.234,5", 6, 6, { kind: "delete-backward" })).toEqual({
      text: "12.345",
      caret: 5,
    });
  });

  it("empties the field deleting its only digit", () => {
    expect(edit("7", 1, 1, { kind: "delete-backward" })).toEqual({ text: "", caret: 0 });
  });

  it("restores the zero before the comma when the whole part is deleted", () => {
    expect(edit("5,5", 1, 1, { kind: "delete-backward" })).toEqual({ text: "0,5", caret: 0 });
  });
});

describe("pasting", () => {
  function paste(text: string, caret: number, data: string, maxDecimals = 2) {
    return applyDecimalEdit(
      { text, selectionStart: caret, selectionEnd: caret },
      { kind: "insert-paste", data },
      maxDecimals,
    );
  }

  it("reads the pasted text as Argentine text", () => {
    expect(paste("", 0, "1.234,50")).toEqual({ text: "1.234,50", caret: 8 });
    expect(paste("", 0, "1234,5")).toEqual({ text: "1.234,5", caret: 7 });
    expect(paste("", 0, " 1234 ")).toEqual({ text: "1.234", caret: 5 });
  });

  it("replaces the selection with the pasted value", () => {
    expect(
      applyDecimalEdit(
        { text: "99", selectionStart: 0, selectionEnd: 2 },
        { kind: "insert-paste", data: "1.000" },
        2,
      ),
    ).toEqual({ text: "1.000", caret: 5 });
  });

  it("inserts a pasted value that is not Argentine text unchanged", () => {
    expect(paste("", 0, "12.5")).toEqual({ text: "12.5", caret: 4 });
    expect(paste("1", 1, "abc")).toEqual({ text: "1abc", caret: 4 });
    expect(paste("", 0, "1,234", 2)).toEqual({ text: "1,234", caret: 5 });
  });
});

describe("reformatDecimalText", () => {
  it("regroups text that changed natively", () => {
    expect(reformatDecimalText("1234", 4, 2)).toEqual({ text: "1.234", caret: 5 });
    expect(reformatDecimalText("1.2345", 6, 2)).toEqual({ text: "12.345", caret: 6 });
  });

  it("drops what is not a digit or the first comma", () => {
    expect(reformatDecimalText("1a2,3,4", 7, 2)).toEqual({ text: "12,3", caret: 4 });
  });

  it("cuts the fraction to the field's decimals", () => {
    expect(reformatDecimalText("1,2345", 6, 2)).toEqual({ text: "1,23", caret: 4 });
  });

  it("drops the comma in a field without decimals", () => {
    expect(reformatDecimalText("12,5", 4, 0)).toEqual({ text: "125", caret: 3 });
  });

  it("keeps the caret after the same significant characters", () => {
    expect(reformatDecimalText("12a34", 3, 2)).toEqual({ text: "1.234", caret: 3 });
  });

  it("leaves an empty text empty", () => {
    expect(reformatDecimalText("", 0, 2)).toEqual({ text: "", caret: 0 });
  });
});

describe("properties", () => {
  const maxDecimalsArbitrary = fc.constantFrom(0, 2, 3);
  const keyArbitrary = fc.constantFrom(..."0123456789.,-a ".split(""));

  it("always leaves a text the field's parser reads, or an empty one", () => {
    fc.assert(
      fc.property(
        fc.array(keyArbitrary, { maxLength: 30 }),
        maxDecimalsArbitrary,
        (keys, maxDecimals) => {
          const text = typeSequence(keys.join(""), maxDecimals);
          return text === "" || parseEsArNumber(text, maxDecimals) !== undefined;
        },
      ),
    );
  });

  it("always leaves a text the field's parser reads after any deletion", () => {
    fc.assert(
      fc.property(
        fc.array(keyArbitrary, { maxLength: 20 }),
        maxDecimalsArbitrary,
        fc.nat(30),
        fc.nat(30),
        fc.constantFrom<DecimalEdit>({ kind: "delete-backward" }, { kind: "delete-forward" }),
        (keys, maxDecimals, a, b, change) => {
          const typed = typeSequence(keys.join(""), maxDecimals);
          const start = Math.min(a, b, typed.length);
          const end = Math.min(Math.max(a, b), typed.length);
          const { text } = applyDecimalEdit(
            { text: typed, selectionStart: start, selectionEnd: end },
            change,
            maxDecimals,
          );
          return text === "" || parseEsArNumber(text, maxDecimals) !== undefined;
        },
      ),
    );
  });

  it("keeps the significant characters left of the caret and adds the typed digit", () => {
    fc.assert(
      fc.property(
        fc.array(keyArbitrary, { maxLength: 20 }),
        fc.nat(30),
        fc.constantFrom("1", "2", "9"),
        (keys, position, digit) => {
          const typed = typeSequence(keys.join(""), 2);
          const caret = Math.min(position, typed.length);
          const result = typeInto(typed, caret, digit);
          if (result.text === typed) {
            return true;
          }
          return (
            significantLeftOf(result.text, result.caret) === significantLeftOf(typed, caret) + 1
          );
        },
      ),
    );
  });

  it("puts the caret after the same significant characters when reformatting", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{0,12}$/), fc.nat(15), (digits, position) => {
        const caret = Math.min(position, digits.length);
        const result = reformatDecimalText(digits, caret, 2);
        const stripped = digits.slice(0, caret).replace(/^0+(?=\d)/, "");
        return significantLeftOf(result.text, result.caret) === stripped.length;
      }),
    );
  });
});
