import { LifeBuoy } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";

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
