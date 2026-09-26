import { afterEach } from "vitest";
import { cdp } from "vitest/browser";
// Registers vitest-browser-react's expect/render type augmentations for the browser project.
import "vitest-browser-react";
// Compiles the design tokens so components under test render with real computed styles.
import "../styles/tokens.css";

// cdp()'s own type is an intentionally empty placeholder shared across every browser provider;
// only the Playwright provider this project uses actually implements a `send` method.
export interface DispatchableCdpSession {
  send(
    method: "Input.dispatchMouseEvent",
    params: { type: "mouseMoved"; x: number; y: number },
  ): Promise<unknown>;
}

// A previous test's real pointer position and focus both survive past its own unmount: React
// Aria's useHover reflects the live pointer, so the next render under the same spot starts
// already hovered, and the browser keeps a removed element as the tab-navigation starting point,
// breaking the next userEvent.tab(). userEvent.hover(parkingElement) can't fix the first in
// general, since a modal test can leave the rest of the page inert with no actionable target left;
// dispatching the mouse move directly over CDP clears it without needing one. Blurring doesn't
// reset the tab-navigation point — only focusing an element still in the document does.
afterEach(async () => {
  const session = cdp() as unknown as DispatchableCdpSession;
  try {
    await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
  } finally {
    // Runs, and resets tab navigation, even if the pointer reset above rejected; finally still
    // lets that rejection propagate.
    const root = document.documentElement;
    root.tabIndex = -1;
    root.focus();
    root.removeAttribute("tabindex");
  }
});
