import { afterEach } from "vitest";
import { cdp } from "vitest/browser";
// Registers vitest-browser-react's expect/render type augmentations for the browser project.
import "vitest-browser-react";
// Compiles the design tokens so components under test render with real computed styles.
import "../styles/tokens.css";

// The one CDP call this file needs. `cdp()`'s own type is an intentionally empty placeholder
// shared across every browser provider (only the Playwright provider this project uses actually
// implements it, with a real `send` method), so this narrows to that single call instead of
// widening the type project-wide.
interface DispatchableCdpSession {
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
afterEach(async () => {
  const session = cdp() as unknown as DispatchableCdpSession;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
});
