import { LifeBuoy } from "lucide-react";
import { beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";

// Pins a desktop viewport instead of the default phone-sized one, the same way Modal.test.tsx and
// DateField.test.tsx do: the panel's 680px basis only holds when the row is wide enough for it.
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

test("places the logo and the Backoffice caption on the panel's 32px padding", async () => {
  const screen = await render(
    <AccessLayout>
      <p>screen content</p>
    </AccessLayout>,
  );

  const panel = screen.getByText("Backoffice").element().parentElement as HTMLElement;
  const panelRect = panel.getBoundingClientRect();
  const captionRect = screen.getByText("Backoffice").element().getBoundingClientRect();
  const logoRect = screen.getByRole("img", { name: "Puro Sur" }).element().getBoundingClientRect();

  // Both sit at the panel's 32px padding: the 460x180 logo box on the left edge, vertically
  // centered, and the caption in the bottom-left corner.
  expect(captionRect.left - panelRect.left).toBeCloseTo(32, 0);
  expect(panelRect.bottom - captionRect.bottom).toBeCloseTo(32, 0);
  expect(logoRect.left - panelRect.left).toBeCloseTo(32, 0);
  expect(logoRect.width).toBeCloseTo(460, 0);
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
