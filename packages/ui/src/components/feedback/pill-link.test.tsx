import { Bell } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import { Pill } from "./pill";
import { PillLink, type PillLinkProps } from "./pill-link";

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
  "borderRadius",
  "columnGap",
] as const;

test("renders as a link to its address, named by its text, with its icon hidden from assistive technology", async () => {
  const screen = await render(
    <main>
      <PillLink tone="warning" icon={<Bell />} href="/alerts">
        3 alertas abiertas
      </PillLink>
    </main>,
  );

  const link = screen
    .getByRole("link", { name: "3 alertas abiertas" })
    .element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/alerts");
  expect(link.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(document.body);
});

test("draws like the plain pill of its tone", async () => {
  for (const tone of ["warning", "error"] as const) {
    const screen = await render(
      <>
        <Pill tone={tone} icon={<Bell />}>{`Pill ${tone}`}</Pill>
        <PillLink tone={tone} icon={<Bell />} href="/alerts">{`Enlace ${tone}`}</PillLink>
      </>,
    );
    const pill = screen.getByText(`Pill ${tone}`).element() as HTMLElement;
    const link = screen.getByRole("link", { name: `Enlace ${tone}` }).element() as HTMLElement;

    for (const property of drawnProperties) {
      expect(getComputedStyle(link)[property], `${tone} ${property}`).toBe(
        getComputedStyle(pill)[property],
      );
    }
  }
});

test("rings itself in its tone's soft color on hover", async () => {
  const screen = await render(
    <PillLink tone="warning" icon={<Bell />} href="/alerts">
      3 alertas abiertas
    </PillLink>,
  );
  const link = screen.getByRole("link").element() as HTMLElement;
  expect(getComputedStyle(link).boxShadow).not.toContain(tokenRgb("warning-soft"));

  await userEvent.hover(link);

  await expect
    .poll(() => getComputedStyle(link).boxShadow)
    .toContain(`${tokenRgb("warning-soft")} 0px 0px 0px 1px`);
});

test("shows the shared tight focus outline when reached by keyboard", async () => {
  const screen = await render(
    <PillLink tone="warning" icon={<Bell />} href="/alerts">
      3 alertas abiertas
    </PillLink>,
  );
  const link = screen.getByRole("link").element() as HTMLElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(link);
  await expect.poll(() => getComputedStyle(link).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(link).outlineOffset).toBe("2px");
  await expect.poll(() => getComputedStyle(link).outlineColor).toBe(tokenRgb("focus"));
});

test("forwards a click handler, so the app can drive its own router", async () => {
  let clicked = false;
  const screen = await render(
    <PillLink
      tone="warning"
      icon={<Bell />}
      href="/alerts"
      onClick={(event) => {
        event.preventDefault();
        clicked = true;
      }}
    >
      3 alertas abiertas
    </PillLink>,
  );

  (screen.getByRole("link").element() as HTMLAnchorElement).dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );

  expect(clicked).toBe(true);
});

test("takes no class of the caller's and no link without text", () => {
  expectTypeOf<PillLinkProps>().not.toHaveProperty("className");
  expectTypeOf<{
    tone: "warning";
    icon: Icon;
    href: string;
  }>().not.toExtend<PillLinkProps>();
});
