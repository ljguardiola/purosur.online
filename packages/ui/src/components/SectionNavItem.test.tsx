import { Flag } from "lucide-react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenRgb } from "../test/token-colors";
import { SectionNavItem } from "./SectionNavItem";

test("renders as a link naming its own label, with the icon hidden from assistive technology", async () => {
  const screen = await render(
    <SectionNavItem
      label="Primeros pasos"
      icon={<Flag />}
      active={false}
      href="/help/getting_started"
    />,
  );

  const link = screen.getByRole("link", { name: "Primeros pasos" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/help/getting_started");
  expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("marks the active item with aria-current, an azul-fondo fill and a bold 16px azul-fuerte label", async () => {
  const screen = await render(
    <SectionNavItem label="Primeros pasos" icon={<Flag />} active href="/help/getting_started" />,
  );

  const link = screen.getByRole("link", { name: "Primeros pasos" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(getComputedStyle(link).backgroundColor).toBe(tokenRgb("brand-blue-message-bg"));

  const label = screen.getByText("Primeros pasos").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("brand-blue-strong"));
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(16);

  const icon = link.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(icon).stroke).toBe(tokenRgb("brand-blue-strong"));

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves an inactive item with no aria-current, a negro 14px label and an ink-secondary icon", async () => {
  const screen = await render(
    <SectionNavItem
      label="Primeros pasos"
      icon={<Flag />}
      active={false}
      href="/help/getting_started"
    />,
  );

  const link = screen.getByRole("link", { name: "Primeros pasos" }).element() as HTMLAnchorElement;
  expect(link.hasAttribute("aria-current")).toBe(false);
  expect(getComputedStyle(link).backgroundColor).toBe("rgba(0, 0, 0, 0)");

  const label = screen.getByText("Primeros pasos").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("ink"));
  expect(getComputedStyle(label).fontWeight).toBe("400");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(14);

  const icon = link.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(icon).stroke).toBe(tokenRgb("ink-secondary"));

  await expectNoAccessibilityViolations(screen.container);
});

test("turns bone on hover while inactive", async () => {
  const screen = await render(
    <SectionNavItem
      label="Primeros pasos"
      icon={<Flag />}
      active={false}
      href="/help/getting_started"
    />,
  );
  const link = screen.getByRole("link", { name: "Primeros pasos" }).element() as HTMLAnchorElement;

  await userEvent.hover(link);

  await expect.poll(() => getComputedStyle(link).backgroundColor).toBe(tokenRgb("surface-bone"));

  await expectNoAccessibilityViolations(screen.container);
});
