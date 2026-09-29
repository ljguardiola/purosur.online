import { Flag } from "lucide-react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { tokenRgb } from "../../test/token-colors";
import { SectionNavItem } from "./section-nav-item";

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
});

test("marks the active item with aria-current, an azul-fondo fill and a bold 16px azul-fuerte label", async () => {
  const screen = await render(
    <SectionNavItem label="Primeros pasos" icon={<Flag />} active href="/help/getting_started" />,
  );

  const link = screen.getByRole("link", { name: "Primeros pasos" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(getComputedStyle(link).backgroundColor).toBe(tokenRgb("action-subtle"));

  const label = screen.getByText("Primeros pasos").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-accent"));
  expect(getComputedStyle(label).fontWeight).toBe("700");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(16);

  const icon = link.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(icon).stroke).toBe(tokenRgb("text-accent"));
});

test("leaves an inactive item with no aria-current, a negro 14px label and a subtle-text icon", async () => {
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
  expect(getComputedStyle(label).color).toBe(tokenRgb("text"));
  expect(getComputedStyle(label).fontWeight).toBe("400");
  expect(Math.round(Number.parseFloat(getComputedStyle(label).fontSize))).toBe(14);

  const icon = link.querySelector("svg") as SVGSVGElement;
  expect(getComputedStyle(icon).stroke).toBe(tokenRgb("text-subtle"));
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

  await expect.poll(() => getComputedStyle(link).backgroundColor).toBe(tokenRgb("surface-subtle"));
});

test("forwards a style to the link, so a router can apply its own inline styles", async () => {
  const screen = await render(
    <SectionNavItem
      label="Primeros pasos"
      icon={<Flag />}
      active={false}
      href="/help/getting_started"
      style={{ opacity: 0.5 }}
    />,
  );

  const link = screen.getByRole("link", { name: "Primeros pasos" }).element() as HTMLAnchorElement;
  expect(link.style.opacity).toBe("0.5");
});
