import type { Icon } from "@purosur/ui";
import { ButtonLink } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { KeyRound } from "lucide-react";
import type { ReactElement } from "react";
import { expect, expectTypeOf, it } from "vitest";
import type { ScreenLinkProps } from "./screen-link";
import { ScreenLink } from "./screen-link";
import { expectDrawnLike, hoveredBackground } from "./test-support/drawn-like";
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

it("draws as the design system's text link, hover fill included", async () => {
  const screen = await render(
    <>
      <ScreenLink to="/pin-code-redemption" icon={<KeyRound />} label="Tengo un código" />
      <ButtonLink variant="text" icon={<KeyRound />} href="/sign-in">
        Referencia
      </ButtonLink>
    </>,
  );
  const link = screen.getByRole("link", { name: "Tengo un código" }).element();
  const reference = screen.getByRole("link", { name: "Referencia" }).element();

  expectDrawnLike(
    link,
    reference,
    [
      "height",
      "paddingTop",
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "fontSize",
      "fontWeight",
      "color",
      "backgroundColor",
      "borderRadius",
      "columnGap",
    ],
    "link",
  );
  expectDrawnLike(
    link.querySelector("svg") as SVGSVGElement,
    reference.querySelector("svg") as SVGSVGElement,
    ["width", "height"],
    "icon",
  );
  const referenceHovered = await hoveredBackground(reference);
  expect(await hoveredBackground(link)).toBe(referenceHovered);
});

it("takes the design system's icon and refuses an element it cannot size", () => {
  expectTypeOf<Icon>().toExtend<ScreenLinkProps["icon"]>();
  expectTypeOf<ReactElement<{ size: number }>>().not.toExtend<ScreenLinkProps["icon"]>();
});
