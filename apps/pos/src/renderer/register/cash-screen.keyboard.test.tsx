import type { SessionOpenSale } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CLOSED, OPEN_SALE, renderScreen } from "./test-support/cash-screen";

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

  it("opens the close panel on F12, with the focus on Contado", async () => {
    const screen = await renderScreen();
    await expect.element(screen.getByText("Flete", { exact: true })).toBeVisible();

    await userEvent.keyboard("{F12}");

    await expect
      .element(screen.getByRole("heading", { name: "Cerrar caja", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();
    expect(screen.router.state.location.pathname).not.toBe("/cash-count");
  });

  it("shows no Tab legend under the table while the close panel is open", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("{F12}");
    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();

    const legend = Array.from(screen.container.querySelectorAll("main ul li")).map(
      (item) => item.textContent,
    );
    expect(legend).not.toContain("TabCampo");
  });

  it("opens the close panel when Cerrar caja is pressed", async () => {
    const screen = await renderScreen();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();
  });

  it("dims the table, disables the other keys while the close panel is open and returns with Esc", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("{F12}");
    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();

    await expect
      .element(screen.getByRole("img", { name: "Movimientos bloqueados" }))
      .toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await expect
      .element(screen.getByRole("heading", { name: "Cerrar caja", exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Gasto", exact: true })).toBeVisible();
  });

  it("closes the cash session with Enter once the cash is counted", async () => {
    const closeCashSession = vi.fn(async () => CLOSED);
    const screen = await renderScreen({ closeCashSession });
    await userEvent.keyboard("{F12}");
    await userEvent.keyboard("46000,00");

    await expect.element(screen.getByText("FALTA", { exact: true })).toBeVisible();
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(closeCashSession).toHaveBeenCalledExactlyOnceWith(4_600_000));
  });

  it("shows the open sale above the table with Cerrar caja disabled while the close panel is open", async () => {
    const screen = await renderScreen({ loadSessionOpenSale: async () => OPEN_SALE });
    await expect.element(screen.getByText("Flete", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("Hay una venta abierta de $ 25.192,50"))
      .not.toBeInTheDocument();

    await userEvent.keyboard("{F12}");

    await expect.element(screen.getByText("Hay una venta abierta de $ 25.192,50")).toBeVisible();
    await expect.element(screen.getByText("Terminala antes de cerrar la caja.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeDisabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows no banner and keeps Cerrar caja enabled when there is no open sale", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("{F12}");

    await expect.element(screen.getByRole("textbox", { name: "Contado" })).toHaveFocus();
    await expect.element(screen.getByText(/Hay una venta abierta/)).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Cerrar caja" })).toBeEnabled();
  });

  it.each([
    ["the key V", () => userEvent.keyboard("v")],
    ["the Ir a la venta button", null],
  ] as const)("goes to the open sale with %s", async (_name, press) => {
    const screen = await renderScreen({ loadSessionOpenSale: async () => OPEN_SALE });
    await userEvent.keyboard("{F12}");
    await expect.element(screen.getByText("Hay una venta abierta de $ 25.192,50")).toBeVisible();

    if (press === null) {
      await userEvent.click(screen.getByRole("button", { name: "Ir a la venta" }));
    } else {
      await press();
    }

    expect(screen.router.state.location.pathname).toBe("/session");
  });

  it("does not take V as a key while there is no open sale", async () => {
    const screen = await renderScreen();
    await userEvent.keyboard("{F12}");

    await userEvent.keyboard("v");

    expect(screen.router.state.location.pathname).not.toBe("/session");
  });

  it("shows the banner when the close answers that there is an open sale", async () => {
    let sale: SessionOpenSale | null = null;
    const screen = await renderScreen({
      loadSessionOpenSale: async () => sale,
      closeCashSession: async () => {
        sale = OPEN_SALE;
        return { kind: "open_sale", total: OPEN_SALE.total };
      },
    });
    await userEvent.keyboard("{F12}");
    await userEvent.keyboard("46000,00");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText("Hay una venta abierta de $ 25.192,50")).toBeVisible();
  });

  it("shows a failure to read the open sale with a retry, and keeps closing disabled while it loads", async () => {
    const screen = await renderScreen({ loadSessionOpenSale: async () => "unavailable" });

    await userEvent.keyboard("{F12}");

    await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
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
    await expect
      .element(screen.getByRole("heading", { name: "Cerrar caja", exact: true }))
      .not.toBeInTheDocument();
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

  it("opens the panel on its key even while the balance cannot be read", async () => {
    const screen = await renderScreen({ loadCashBalance: async () => "unavailable" });

    await userEvent.keyboard("1");

    await expect.element(screen.getByRole("heading", { name: "Ingreso" })).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveFocus();
  });
});
