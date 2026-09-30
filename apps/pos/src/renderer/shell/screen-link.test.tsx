import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { KeyRound } from "lucide-react";
import { expect, it } from "vitest";
import { ScreenLink } from "./screen-link";
import { render } from "./test-support/render-with-router";

it("links to its screen through the router, showing its icon and label", async () => {
  const screen = await render(
    <ScreenLink to="/pin-code-redemption" icon={<KeyRound />} label="Tengo un código" />,
  );

  const link = screen.getByRole("link", { name: "Tengo un código" });
  expect(link.element().getAttribute("href")).toBe("/pin-code-redemption");
  expect(link.element().querySelector("svg")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});
