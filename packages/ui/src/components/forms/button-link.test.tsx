import { ArrowLeft } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { Button } from "./button";
import { ButtonLink, type ButtonLinkProps } from "./button-link";

const drawnProperties = [
  "display",
  "alignItems",
  "height",
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "borderRadius",
  "borderTopWidth",
  "columnGap",
  "cursor",
] as const;

test("renders as a link to its address, named by its label, with its icon hidden from assistive technology", async () => {
  const screen = await render(
    <ButtonLink variant="text" href="/sign-in" icon={<ArrowLeft />}>
      Volver
    </ButtonLink>,
  );

  const link = screen.getByRole("link", { name: "Volver" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/sign-in");
  expect(link.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("draws like the plain text button, its icon included, at both drawn sizes", async () => {
  for (const size of ["small", "large"] as const) {
    const screen = await render(
      <>
        <Button variant="text" size={size} icon={<ArrowLeft />}>{`Botón ${size}`}</Button>
        <ButtonLink variant="text" size={size} href="/sign-in" icon={<ArrowLeft />}>
          {`Enlace ${size}`}
        </ButtonLink>
      </>,
    );
    const button = screen.getByRole("button", { name: `Botón ${size}` }).element() as HTMLElement;
    const link = screen.getByRole("link", { name: `Enlace ${size}` }).element() as HTMLElement;

    for (const property of drawnProperties) {
      expect(getComputedStyle(link)[property], `${size} ${property}`).toBe(
        getComputedStyle(button)[property],
      );
    }
    const buttonIcon = (button.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
    const linkIcon = (link.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
    expect(linkIcon.width, `${size} icon`).toBe(buttonIcon.width);
    expect(getComputedStyle(link.querySelector("svg") as SVGSVGElement).stroke).toBe(
      tokenRgb("text-accent"),
    );
  }
});

test("draws its label alone when it is given no icon", async () => {
  const screen = await render(
    <ButtonLink variant="text" href="/sign-in">
      Volver
    </ButtonLink>,
  );

  const link = screen.getByRole("link", { name: "Volver" }).element() as HTMLElement;
  expect(link.querySelector("svg")).toBeNull();
});

test("turns its background bone on hover, like the text button", async () => {
  const screen = await render(
    <ButtonLink variant="text" href="/sign-in">
      Volver
    </ButtonLink>,
  );
  const link = screen.getByRole("link", { name: "Volver" }).element() as HTMLElement;

  await userEvent.hover(link);

  await expect.poll(() => getComputedStyle(link).backgroundColor).toBe(tokenRgb("surface-subtle"));
});

test("shows the shared focus outline when reached by keyboard", async () => {
  const screen = await render(
    <ButtonLink variant="text" href="/sign-in">
      Volver
    </ButtonLink>,
  );
  const link = screen.getByRole("link", { name: "Volver" }).element() as HTMLElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(link);
  await expect.poll(() => getComputedStyle(link).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(link).outlineOffset).toBe("3px");
  await expect.poll(() => getComputedStyle(link).outlineColor).toBe(tokenRgb("focus"));
});

test("forwards a click handler, a style and the current page, so the app can drive its own router", async () => {
  let clicked = false;
  const screen = await render(
    <ButtonLink
      variant="text"
      href="/sign-in"
      aria-current="page"
      style={{ opacity: 0.5 }}
      onClick={(event) => {
        event.preventDefault();
        clicked = true;
      }}
    >
      Volver
    </ButtonLink>,
  );
  const link = screen.getByRole("link", { name: "Volver" }).element() as HTMLAnchorElement;

  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

  expect(clicked).toBe(true);
  expect(link.style.opacity).toBe("0.5");
  expect(link.getAttribute("aria-current")).toBe("page");
});

test("takes the text variant at its drawn sizes and no class of the caller's", () => {
  expectTypeOf<{
    variant: "text";
    href: string;
    children: string;
    size: "large";
  }>().toExtend<ButtonLinkProps>();
  expectTypeOf<{
    variant: "text";
    href: string;
    children: string;
    size: "medium";
  }>().not.toExtend<ButtonLinkProps>();
  expectTypeOf<{
    variant: "text";
    href: string;
    children: string;
    className: string;
  }>().not.toExtend<ButtonLinkProps>();
});

test("does not accept a link without text, since it would have no accessible name", () => {
  expectTypeOf<{ variant: "text"; href: string }>().not.toExtend<ButtonLinkProps>();
});
