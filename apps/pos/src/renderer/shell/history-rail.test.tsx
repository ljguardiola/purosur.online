import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { HistoryRail } from "./history-rail";
import type { SignedInPerson } from "./signed-in-person";
import { render } from "./test-support/render-with-router";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["view_sales_history"],
};

async function renderRail(sessionOpen: boolean) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const lock = vi.fn();
  const screen = await render(
    <HistoryRail person={PERSON} registerName="Caja 1" sessionOpen={sessionOpen} lock={lock} />,
  );
  return { screen, lock };
}

describe("HistoryRail", () => {
  it("offers Venta, Historial as current and Caja while a session is open", async () => {
    const { screen } = await renderRail(true);

    await expect
      .element(screen.getByRole("link", { name: "Historial" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("link", { name: "Venta" })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Caja" })).toBeVisible();
  });

  it("offers Inicio and Historial as current, and no cash entry, when no session is open", async () => {
    const { screen } = await renderRail(false);

    const home = screen.getByRole("link", { name: "Inicio" });
    expect(home.element().getAttribute("href")).toBe("/");
    await expect
      .element(screen.getByRole("link", { name: "Historial" }))
      .toHaveAttribute("aria-current", "page");
    await expect.element(screen.getByRole("link", { name: "Caja" })).not.toBeInTheDocument();
  });

  it("asks to confirm before signing out when no session is open", async () => {
    const { screen, lock } = await renderRail(false);

    await userEvent.click(screen.getByRole("navigation").getByRole("button", { name: "Salir" }));
    await expect.element(screen.getByRole("dialog", { name: "¿Salir de la caja?" })).toBeVisible();
    expect(lock).not.toHaveBeenCalled();
    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    expect(lock).toHaveBeenCalledOnce();
  });

  it("asks to close the register or leave it locked before leaving while a session is open", async () => {
    const { screen } = await renderRail(true);

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await expect
      .element(screen.getByRole("dialog", { name: "¿Cerrar la caja o dejarla bloqueada?" }))
      .toBeVisible();
  });
});
