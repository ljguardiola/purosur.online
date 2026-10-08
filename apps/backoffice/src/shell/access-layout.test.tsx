import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { LifeBuoy } from "lucide-react";
import { beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { AccessFooterLink, AccessLayout } from "./access-layout";

// The panel's 680px basis only holds when the row is wide enough for it, so tests pin a desktop
// viewport instead of the default phone-sized one.
beforeEach(async () => {
  await page.viewport(1440, 900);
});

test("sizes the brand panel at 680px on a 1440px-wide desktop", async () => {
  const screen = await render(
    <AccessLayout>
      <p>screen content</p>
    </AccessLayout>,
  );

  const panel = screen.getByText("Backoffice").element().parentElement as HTMLElement;
  expect(panel.getBoundingClientRect().width).toBeCloseTo(680, 0);
});

test("centers the logo horizontally in the panel and keeps the caption on its 32px padding", async () => {
  const screen = await render(
    <AccessLayout>
      <p>screen content</p>
    </AccessLayout>,
  );

  const panel = screen.getByText("Backoffice").element().parentElement as HTMLElement;
  const panelRect = panel.getBoundingClientRect();
  const captionRect = screen.getByText("Backoffice").element().getBoundingClientRect();
  const logo = screen.getByRole("img", { name: "Puro Sur" }).element();
  const logoRect = logo.getBoundingClientRect();

  expect(captionRect.left - panelRect.left).toBeCloseTo(32, 0);
  expect(panelRect.bottom - captionRect.bottom).toBeCloseTo(32, 0);
  expect(logoRect.left - panelRect.left).toBeCloseTo(panelRect.right - logoRect.right, 0);
  expect(logoRect.width).toBeCloseTo(460, 0);
  expect(getComputedStyle(logo).objectPosition).toBe("50% 50%");
});

test("shows the brand panel with the logo and the Backoffice caption, before the content", async () => {
  const screen = await render(
    <AccessLayout>
      <p>screen content</p>
    </AccessLayout>,
  );

  const logo = screen.getByRole("img", { name: "Puro Sur" });
  await expect.element(logo).toBeVisible();
  await expect.element(screen.getByText("Backoffice")).toBeVisible();

  const texts = Array.from(screen.container.querySelectorAll("img, p")).map((element) =>
    element.tagName === "IMG" ? "logo" : element.textContent,
  );
  expect(texts).toEqual(["logo", "Backoffice", "screen content"]);

  await expectNoAccessibilityViolations(screen.container);
});

test("renders the content inside a main landmark", async () => {
  const screen = await render(
    <AccessLayout>
      <p>screen content</p>
    </AccessLayout>,
  );

  const main = screen.getByRole("main");
  await expect.element(main.getByText("screen content")).toBeVisible();
});

test("AccessFooterLink navigates through the router and shows its icon and label", async () => {
  const screen = await render(
    <AccessFooterLink to="/account-recovery" icon={<LifeBuoy />} label="Perdí mis passkeys" />,
  );

  const link = screen.getByRole("link", { name: "Perdí mis passkeys" }).element();
  expect(link.getAttribute("href")).toBe("/account-recovery");
  await expectNoAccessibilityViolations(screen.container);
});
