import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { History } from "lucide-react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ActionEntry } from "./action-entries";
import { NoSessionScreen } from "./no-session-screen";

const PERSON = { first_name: "Ada", permission_keys: ["view_sales_history", "void_sale"] };

const HISTORY: ActionEntry = {
  label: "Historial",
  icon: History,
  permission: "view_sales_history",
  opens: vi.fn(),
};
const REPRINT: ActionEntry = {
  label: "Reimprimir",
  icon: History,
  permission: "reprint_receipt",
  opens: vi.fn(),
};

async function renderScreen(entries: readonly ActionEntry[] = [], signOut = vi.fn()) {
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const screen = await render(
    <NoSessionScreen person={PERSON} entries={entries} signOut={signOut} />,
  );
  return { screen, signOut };
}

describe("NoSessionScreen", () => {
  it("asks what to do, with no session open", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Sin sesión abierta")).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "¿Qué querés hacer?" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows only the first name of the person who is in", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("Ada")).toBeVisible();
    expect(screen.container.textContent).not.toContain("void_sale");
  });

  it("offers only Inicio and Salir when no entry exists", async () => {
    const { screen } = await renderScreen();

    const buttons = Array.from(screen.container.querySelectorAll("button")).map(
      (button) => button.textContent,
    );

    expect(buttons).toEqual(["Inicio", "Salir"]);
  });

  it("offers the entries the person's permissions unlock, and no others", async () => {
    const { screen } = await renderScreen([HISTORY, REPRINT]);

    await expect.element(screen.getByRole("button", { name: "Historial" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Reimprimir" }))
      .not.toBeInTheDocument();
  });

  it("asks for confirmation before leaving, without signing out yet", async () => {
    const { screen, signOut } = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await expect.element(screen.getByRole("dialog", { name: "¿Salir de la caja?" })).toBeVisible();
    expect(signOut).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(document.body);
  });

  it("signs out once leaving is confirmed", async () => {
    const { screen, signOut } = await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(
      screen
        .getByRole("dialog", { name: "¿Salir de la caja?" })
        .getByRole("button", { name: "Salir" }),
    );

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("stays on the screen when leaving is cancelled", async () => {
    const { screen, signOut } = await renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
});
