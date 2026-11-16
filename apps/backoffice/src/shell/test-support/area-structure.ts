import { expect } from "vitest";
import type { render } from "vitest-browser-react";
import { shownEyebrow } from "./eyebrow";

type Screen = Awaited<ReturnType<typeof render>>;

export async function expectOneNavigationLevel(
  screen: Screen,
  area: string,
  tabs: readonly string[],
) {
  await expect
    .element(screen.getByRole("heading", { level: 1, name: area, exact: true }))
    .toBeVisible();
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
  expect(screen.getByRole("navigation", { name: area, exact: true }).query()).toBeNull();
  expect(shownEyebrow()).toBeNull();
  const tabList = screen.getByRole("tablist", { name: `Secciones de ${area}`, exact: true });
  await expect.element(tabList).toBeVisible();
  expect(tabList.getByRole("tab").elements()).toHaveLength(tabs.length);
  for (const [index, name] of tabs.entries()) {
    await expect.element(tabList.getByRole("tab").nth(index)).toHaveAccessibleName(name);
  }
}
