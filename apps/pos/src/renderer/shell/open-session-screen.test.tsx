import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished } from "vitest";
import { page, userEvent } from "vitest/browser";
import { OpenSessionScreen } from "./open-session-screen";
import { render } from "./test-support/render-with-router";

const PERSON = { user_id: "u1", first_name: "Ada", permission_keys: ["sell_and_charge"] };
// 12:02 UTC is 09:02 in Argentina.
const OPENED_AT = "2026-09-30T12:02:00.000Z";

async function renderScreen(registerName: string | null = "Caja 1") {
  await page.viewport(1280, 720);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <OpenSessionScreen person={PERSON} registerName={registerName} openedAt={OPENED_AT} />,
  );
}

describe("OpenSessionScreen", () => {
  it("says that the sale is underway", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Venta en curso" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the register and when the session opened in the eyebrow", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
  });

  it("leaves the register's name out of the eyebrow while it isn't known", async () => {
    const screen = await renderScreen(null);

    await expect.element(screen.getByText("Sesión abierta 09:02", { exact: true })).toBeVisible();
  });

  it("offers Venta, Caja and the first name of the person who opened, and a way out", async () => {
    const screen = await renderScreen();

    const rail = screen.getByRole("navigation", { name: "Menú de la caja" }).element();

    const items = Array.from(rail.querySelectorAll("button, a")).map((item) => item.textContent);
    expect(items).toEqual(["Venta", "Caja", "Salir"]);
    await expect.element(screen.getByText("Ada")).toBeVisible();
    expect(screen.container.textContent).not.toContain("sell_and_charge");
  });

  it("marks Venta as the current screen", async () => {
    const screen = await renderScreen();

    await expect
      .element(screen.getByRole("button", { name: "Venta" }))
      .toHaveAttribute("aria-current", "page");
    await expect
      .element(screen.getByRole("link", { name: "Caja" }))
      .not.toHaveAttribute("aria-current");
  });

  it("goes to the cash screen when Caja is pressed", async () => {
    const screen = await renderScreen();

    await userEvent.click(screen.getByRole("link", { name: "Caja" }));

    expect(screen.router.state.location.pathname).toBe("/cash");
  });
});
