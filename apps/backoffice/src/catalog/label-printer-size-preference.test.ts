import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readLabelPrinterSize, writeLabelPrinterSize } from "./label-printer-size-preference";

function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const FIRST_TIME = { widthMm: 50, heightMm: 30 };

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: fakeStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reads 50 x 30 mm when no size was saved", () => {
  expect(readLabelPrinterSize()).toEqual(FIRST_TIME);
});

test("reads back the size that was saved", () => {
  writeLabelPrinterSize({ widthMm: 40, heightMm: 25 });

  expect(readLabelPrinterSize()).toEqual({ widthMm: 40, heightMm: 25 });
});

test.each([
  ["text that is not JSON", "not json"],
  ["a size outside the printer's ranges", JSON.stringify({ widthMm: 80, heightMm: 30 })],
  ["a size with fractions", JSON.stringify({ widthMm: 40.5, heightMm: 30 })],
  ["a value that is not a size", JSON.stringify([40, 25])],
])("reads 50 x 30 mm when the saved value is %s", (_name, saved) => {
  vi.stubGlobal("window", {
    localStorage: Object.assign(fakeStorage(), { getItem: () => saved }),
  });

  expect(readLabelPrinterSize()).toEqual(FIRST_TIME);
});

test("reads 50 x 30 mm and ignores a write when storage access throws", () => {
  const failing = () => {
    throw new Error("storage blocked");
  };
  vi.stubGlobal("window", {
    localStorage: { getItem: failing, setItem: failing },
  });

  expect(() => writeLabelPrinterSize({ widthMm: 40, heightMm: 25 })).not.toThrow();
  expect(readLabelPrinterSize()).toEqual(FIRST_TIME);
});
