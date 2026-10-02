import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { FirstSignInPanel } from "./first-sign-in-panel";

describe("FirstSignInPanel", () => {
  it("lets the step move focus to its title through the heading ref", async () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const screen = await render(
      <FirstSignInPanel eyebrow="Ada" title="Elegí tu PIN" headingRef={headingRef}>
        <p>Paso</p>
      </FirstSignInPanel>,
    );
    const title = screen.getByRole("heading", { name: "Elegí tu PIN" }).element();

    headingRef.current?.focus();

    expect(headingRef.current).toBe(title);
    expect(document.activeElement).toBe(title);
  });

  it("leaves the title out of focus when the step takes no ref to it", async () => {
    const screen = await render(
      <FirstSignInPanel eyebrow="Ada" title="No tenés PIN todavía">
        <p>Paso</p>
      </FirstSignInPanel>,
    );
    const title = screen
      .getByRole("heading", { name: "No tenés PIN todavía" })
      .element() as HTMLElement;

    title.focus();

    expect(title.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).not.toBe(title);
  });
});
