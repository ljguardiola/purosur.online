import { vi } from "vitest";

// The *Async variant of advanceTimersByTime also flushes the microtasks a check's own await needs.
export async function usingFakeTimers(steps: () => Promise<void>): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  try {
    await steps();
  } finally {
    // Not runAllTimers(): a still-running setInterval would keep rescheduling itself forever.
    vi.clearAllTimers();
    vi.useRealTimers();
  }
}

function findVisibilityStateDescriptor(): PropertyDescriptor | undefined {
  for (
    let target: object | null = document;
    target !== null;
    target = Object.getPrototypeOf(target)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(target, "visibilityState");
    if (descriptor) {
      return descriptor;
    }
  }
  return undefined;
}

export function setVisibilityState(value: DocumentVisibilityState): () => void {
  const original = findVisibilityStateDescriptor();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  return () => {
    if (original) {
      Object.defineProperty(document, "visibilityState", original);
    }
  };
}
