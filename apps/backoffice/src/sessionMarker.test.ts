import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { clearSignedInMarker, markSignedIn, wasSignedIn } from "./sessionMarker";

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

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: fakeStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("wasSignedIn is false until markSignedIn runs, then true, then false again after clearSignedInMarker", () => {
  expect(wasSignedIn()).toBe(false);

  markSignedIn();
  expect(wasSignedIn()).toBe(true);

  clearSignedInMarker();
  expect(wasSignedIn()).toBe(false);
});

test("every function stays silent and wasSignedIn reads false when storage access throws", () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {
        throw new Error("storage disabled");
      },
    },
  });

  expect(() => markSignedIn()).not.toThrow();
  expect(() => clearSignedInMarker()).not.toThrow();
  expect(wasSignedIn()).toBe(false);
});
