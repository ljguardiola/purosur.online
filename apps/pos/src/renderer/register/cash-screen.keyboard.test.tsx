import type { CashMovementPreview } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { authorizationDialog } from "../shell/test-support/authorization-modal-steps";
import { renderScreen } from "./test-support/cash-screen";

const KEYS = [
  ["1", "Ingreso"],
  ["2", "Gasto"],
  ["3", "Retiro"],
] as const;

describe("CashScreen recording movements from the keyboard", () => {
  it.each(KEYS)(
    "opens the %s panel on the key %s, with the focus on Importe",
    async (key, title) => {
      const screen = await renderScreen();
      await expect.element(screen.getByText("Flete", { exact: true })).toBeVisible();

      await userEvent.keyboard(key);

      await expect.element(screen.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveFocus();
      await expect
        .element(screen.getByRole("button", { name: `Registrar ${title.toLowerCase()}` }))
        .toBeVisible();
    },
  );

  it.each(KEYS)("opens the %s panel when its button is pressed", async (_key, title) => {
    const screen = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: title, exact: true }));

    await expect.element(screen.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveFocus();
  });

  it("goes to the cash count on F12", async () => {
    const screen = await renderScreen();
    await expect.element(screen.getByText("Flete", { exact: true })).toBeVisible();

    await userEvent.keyboard("{F12}");

    expect(screen.router.state.location.pathname).toBe("/cash-count");
  });

  it("shows the expected cash in the panel, the table dimmed and Tab Campo under it, with no letter keycap at the fields", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("2");

    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 46.200,00", { exact: true })).toBeVisible();
    const legend = Array.from(screen.container.querySelectorAll("main ul li")).map(
      (item) => item.textContent,
    );
    expect(legend).toEqual(["TabCampo"]);
    const keys = Array.from(screen.container.querySelectorAll("aside kbd")).map(
      (key) => key.textContent,
    );
    expect(keys).toEqual(["Esc", "Enter"]);
    await expect
      .element(screen.getByRole("img", { name: "Movimientos bloqueados" }))
      .toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("moves between Importe and Motivo with Tab and back with Shift+Tab", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("3");

    await userEvent.keyboard("{Tab}");
    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveFocus();
  });

  it("closes the panel with Esc, bringing back the expected cash's breakdown and the keys", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("2");
    await expect.element(screen.getByRole("heading", { name: "Gasto" })).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("heading", { name: "Gasto" })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Ventas en efectivo")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Gasto", exact: true })).toBeVisible();
  });

  it("does not take 1, 2 or 3 as keys of the screen while they are typed into Importe, nor F12", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("2");

    await userEvent.keyboard("123");
    await userEvent.keyboard("{F12}");

    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveValue("123");
    await expect.element(screen.getByRole("heading", { name: "Gasto" })).toBeVisible();
    expect(screen.router.state.location.pathname).not.toBe("/cash-count");
  });

  it("records the movement with Enter, closes the panel and keeps the screen's keys working", async () => {
    const recordCashMovement = vi.fn(async () => ({
      kind: "recorded" as const,
      authorized_by: null,
    }));
    const screen = await renderScreen({ recordCashMovement });
    await userEvent.keyboard("2");
    await userEvent.keyboard("500");
    await userEvent.keyboard("{Tab}Flete{Enter}");

    await expect.element(screen.getByRole("heading", { name: "Gasto" })).not.toBeInTheDocument();
    expect(recordCashMovement).toHaveBeenCalledOnce();
    await userEvent.keyboard("1");
    await expect.element(screen.getByRole("heading", { name: "Ingreso" })).toBeVisible();
  });

  it.each([
    ["Gasto", "2", "Registrar gasto"],
    ["Retiro", "3", "Retirar efectivo a la caja fuerte"],
  ] as const)(
    "asks for an authorization over the %s panel when the person lacks the permission",
    async (title, key, subtitle) => {
      const kind = key === "2" ? "CASH_OUT" : "WITHDRAWAL";
      const screen = await renderScreen({
        lacking: [kind],
        authorizers: [{ id: "u3", first_name: "Sofía" }],
      });
      await userEvent.keyboard(key);
      await userEvent.keyboard("500");
      await userEvent.keyboard("{Tab}Caja fuerte{Enter}");

      await expect
        .element(authorizationDialog().getByText(subtitle, { exact: true }))
        .toBeVisible();
      await expect.element(screen.getByRole("heading", { name: title })).toBeVisible();
    },
  );

  it("shows the cash left the core answers for the typed amount, and the refusal in its place when it exceeds the cash", async () => {
    const answers: Record<number, CashMovementPreview> = {
      1850000: { kind: "remaining", cash: 12_570_000 },
      15000000: { kind: "exceeds_expected_cash", expected: 14_420_000 },
    };
    const loadCashMovementPreview = vi.fn(async ({ amount }: { amount: number }) => {
      return answers[amount] ?? null;
    });
    const screen = await renderScreen({ loadCashMovementPreview });
    await userEvent.keyboard("2");

    await userEvent.keyboard("18500");
    await expect.element(screen.getByText("QUEDA", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 125.700,00", { exact: true })).toBeVisible();
    await userEvent.clear(screen.getByRole("textbox", { name: "Importe" }));
    await userEvent.keyboard("150000");

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No hay tanto efectivo en la caja: se esperan $ 144.200,00.");
    await expect.element(screen.getByText("QUEDA", { exact: true })).not.toBeInTheDocument();
    expect(loadCashMovementPreview).toHaveBeenCalledWith({ kind: "CASH_OUT", amount: 1_850_000 });
  });

  it("opens the panel on its key even while the balance cannot be read", async () => {
    const screen = await renderScreen({ loadCashBalance: async () => "unavailable" });

    await userEvent.keyboard("1");

    await expect.element(screen.getByRole("heading", { name: "Ingreso" })).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveFocus();
  });
});
