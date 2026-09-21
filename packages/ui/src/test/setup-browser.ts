import { afterEach } from "vitest";
import { cdp } from "vitest/browser";
// Registers vitest-browser-react's expect/render type augmentations for the browser project.
import "vitest-browser-react";
// Compiles the design tokens so components under test render with real computed styles.
import "../styles/tokens.css";

// The one CDP call this setup and the tests that reset the pointer themselves need. `cdp()`'s own
// type is an intentionally empty placeholder shared across every browser provider (only the
// Playwright provider this project uses actually implements it, with a real `send` method), so
// this narrows to that single call instead of widening the type project-wide.
export interface DispatchableCdpSession {
  send(
    method: "Input.dispatchMouseEvent",
    params: { type: "mouseMoved"; x: number; y: number },
  ): Promise<unknown>;
}

// The real pointer a hover test leaves resting over a spot survives well past that test: nothing
// else moves it, so the very next component to render under that same spot — in this test, a
// later one in the same file, or even the first test of a completely different file reusing the
// same warm browser session — starts "hovered" with no hover call of its own, since React Aria's
// useHover reflects the browser's actual pointer position as soon as the element mounts.
//
// A Testing-Library-style `userEvent.hover(someParkingElement)` can't fix this in general: it
// requires a real, actionable target, and a modal test can leave the rest of the page `inert`
// (correctly — that's what a modal is supposed to do) for the rest of that test, which would make
// hovering any ordinary parking element hang. Dispatching the mouse move directly over CDP skips
// element targeting and actionability checks entirely, exactly like a real mouse moving over an
// empty desktop: it always succeeds, and the browser's own hit-testing correctly finds nothing at
// that position, clearing whatever was hovered before.
// Focus outlives a test the same way the pointer does, and worse: once a test's own DOM is
// unmounted, the element it left focused is gone but the browser keeps it as the sequential
// focus navigation starting point, so the next test's `userEvent.tab()` resumes from a hole in
// a document that no longer exists and reaches nothing at all. Blurring doesn't move that
// starting point — only focusing something still in the document does, so the root element takes
// it, and the next Tab starts from the top of the page like the first one in a fresh session.
afterEach(async () => {
  const session = cdp() as unknown as DispatchableCdpSession;
  try {
    await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
  } finally {
    // Runs even if the CDP call above rejected, so a broken Tab starting point never survives
    // into the next test regardless of whether the pointer reset itself succeeded; `finally`
    // still lets that rejection propagate afterward instead of hiding it.
    const root = document.documentElement;
    root.tabIndex = -1;
    root.focus();
    root.removeAttribute("tabindex");
  }
});
