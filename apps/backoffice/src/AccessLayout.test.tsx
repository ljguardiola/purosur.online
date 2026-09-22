import { LifeBuoy } from "lucide-react";
import { beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";

// design.pen draws the brand panel at 680px in its 1440px frame (Backoffice / Acceso): every
// layout assertion below runs at that exact viewport, the same way Modal.test.tsx and
// DateField.test.tsx pin a desktop viewport instead of the default phone-sized one.
beforeEach(async () => {
  await page.viewport(1440, 900);
});

test("sizes the brand panel at the design's 680px, at the design's own viewport", async () => {
  const screen = await render(
    <AccessLayout>
      <p>screen content</p>
    </AccessLayout>,
  );

  const panel = screen.getByText("Backoffice").element().parentElement as HTMLElement;
  expect(panel.getBoundingClientRect().width).toBeCloseTo(680, 0);
});

test("places the Backoffice caption bottom-left in the panel, with the logo centered", async () => {
  const screen = await render(
    <AccessLayout>
      <p>screen content</p>
    </AccessLayout>,
  );

  const panel = screen.getByText("Backoffice").element().parentElement as HTMLElement;
  const panelRect = panel.getBoundingClientRect();
  const captionRect = screen.getByText("Backoffice").element().getBoundingClientRect();
  const logoRect = screen.getByRole("img", { name: "Puro Sur" }).element().getBoundingClientRect();

  // The panel's own p-8 (32px) padding is the design's ≈32px offset from the left and bottom
  // edges: the caption needs no extra margin, only to stop being centered like the logo above it.
  expect(captionRect.left - panelRect.left).toBeCloseTo(32, 0);
  expect(panelRect.bottom - captionRect.bottom).toBeCloseTo(32, 0);

  const panelCenterX = panelRect.left + panelRect.width / 2;
  const logoCenterX = logoRect.left + logoRect.width / 2;
  expect(logoCenterX).toBeCloseTo(panelCenterX, 0);
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

test("AccessHeader renders the eyebrow, heading and optional description", async () => {
  const screen = await render(
    <AccessHeader eyebrow="Puro Sur" heading="Ingresar" description="Some description" />,
  );

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Puro Sur")).toBeVisible();
  await expect.element(screen.getByText("Some description")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("AccessHeader renders with no eyebrow and no description", async () => {
  const screen = await render(<AccessHeader heading="Registrá una passkey nueva" />);

  await expect
    .element(screen.getByRole("heading", { name: "Registrá una passkey nueva", level: 1 }))
    .toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("AccessFooterLink navigates through the router and shows its icon and label", async () => {
  const screen = await render(
    <AccessFooterLink to="/recuperar" icon={<LifeBuoy />} label="Perdí mis passkeys" />,
  );

  const link = screen.getByRole("link", { name: "Perdí mis passkeys" }).element();
  expect(link.getAttribute("href")).toBe("/recuperar");
  await expectNoAccessibilityViolations(screen.container);
});
