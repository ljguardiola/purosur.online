import { Button } from "@purosur/ui";
import { ArrowLeft } from "lucide-react";
import { expect, it, vi } from "vitest";
import { expectDrawnLike, hoveredBackground } from "../shell/test-support/drawn-like";
import { render } from "../shell/test-support/render-with-router";
import { SignInLockout } from "./sign-in-lockout";

it("draws its back control as the design system's text button, hover fill included", async () => {
  const screen = await render(
    <>
      <SignInLockout consecutiveFailures={5} backLabel="Volver" onBack={vi.fn()} />
      <Button variant="text" icon={<ArrowLeft />}>
        Referencia
      </Button>
    </>,
  );
  const back = screen.getByRole("button", { name: "Volver" }).element();
  const reference = screen.getByRole("button", { name: "Referencia" }).element();

  expectDrawnLike(
    back,
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
    "back",
  );
  expectDrawnLike(
    back.querySelector("svg") as SVGSVGElement,
    reference.querySelector("svg") as SVGSVGElement,
    ["width", "height"],
    "icon",
  );
  const referenceHovered = await hoveredBackground(reference);
  expect(await hoveredBackground(back)).toBe(referenceHovered);
});
