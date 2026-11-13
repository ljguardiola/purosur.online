import type { FindSaleForReturnOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import {
  alertText,
  legendOf,
  linesTable,
  lookUp,
  QR_TEXT,
  renderScreen,
  searchBox,
} from "./test-support/return-screen";

describe("ReturnScreen asking for the ticket", () => {
  it("shows the search focused with its placeholder and an empty lines table with its headers", async () => {
    const { screen } = await renderScreen();

    await expect.element(searchBox(screen)).toHaveFocus();
    for (const header of ["Producto", "Vendido", "A devolver", "Reintegro"]) {
      await expect
        .element(linesTable(screen).getByRole("columnheader", { name: header }))
        .toBeVisible();
    }
    await expect.element(screen.getByText("Sin ventas")).toBeVisible();
  });

  it("shows an empty return in the side panel, with Esc at its top right", async () => {
    const { screen } = await renderScreen();

    const panel = screen.getByRole("complementary", { name: "Devolución" });
    await expect.element(panel.getByText("DEVOLUCIÓN", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("$ 0,00")).toBeVisible();
    await expect.element(panel.getByText("Líneas a devolver")).toBeVisible();
    await expect.element(panel.getByText("Esc", { exact: true })).toBeVisible();
  });

  it("offers only Enter Buscar in the footer, and no Tab or F1", async () => {
    const { screen } = await renderScreen();

    expect(legendOf(screen)).toEqual(["EnterBuscar"]);
  });

  it("keeps Buscar disabled until something is typed, then enabled", async () => {
    const { screen } = await renderScreen();
    const search = screen.getByRole("button", { name: "Buscar" });

    await expect.element(search).toBeDisabled();
    await userEvent.fill(searchBox(screen), "0003-00001198");

    await expect.element(search).toBeEnabled();
  });

  it("offers the return in the register's menu, as the current screen", async () => {
    const { screen } = await renderScreen();

    await expect
      .element(screen.getByRole("link", { name: "Devolver" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("has no accessibility violations", async () => {
    await renderScreen();

    await expectNoAccessibilityViolations(document.body);
  });

  it("looks the sale up by the printed number typed in the search, with Enter", async () => {
    const { screen, findSaleForReturn } = await renderScreen();

    await lookUp(screen, "00003-00001192");

    expect(findSaleForReturn).toHaveBeenCalledExactlyOnceWith(
      { kind: "typed", point_of_sale: 3, number: 1192 },
      undefined,
    );
  });

  it("looks the sale up with the Buscar button", async () => {
    const { screen, findSaleForReturn } = await renderScreen();

    await userEvent.fill(searchBox(screen), "00003-00001192");
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(findSaleForReturn).toHaveBeenCalledOnce();
  });

  it("looks the sale up by the QR the reader scans", async () => {
    const { findSaleForReturn, readBarcode } = await renderScreen();

    readBarcode(QR_TEXT);

    await vi.waitFor(() =>
      expect(findSaleForReturn).toHaveBeenCalledExactlyOnceWith(
        { kind: "scanned", text: QR_TEXT },
        undefined,
      ),
    );
  });

  it("does not ask the core when the typed text is not a point of sale and a number", async () => {
    const { screen, findSaleForReturn } = await renderScreen();

    await lookUp(screen, "1192");

    await expect
      .element(alertText(screen, "Tipeá el número impreso del ticket, como 00003-00001192."))
      .toBeVisible();
    expect(findSaleForReturn).not.toHaveBeenCalled();
  });

  it("does not ask for the sale again while the first answer is awaited", async () => {
    const answer = deferred<FindSaleForReturnOutcome>();
    const { screen, findSaleForReturn, readBarcode } = await renderScreen({
      findSaleForReturn: vi.fn(() => answer.promise),
    });

    await lookUp(screen);
    readBarcode(QR_TEXT);

    expect(findSaleForReturn).toHaveBeenCalledOnce();
  });

  it("tells the app the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      findSaleForReturn: async () => ({ kind: "not_signed_in" }),
    });

    await lookUp(screen);

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });
});

describe("ReturnScreen refusing to find a sale", () => {
  it.each([
    [{ kind: "not_found" }, "No encontramos esa venta en esta sucursal."],
    [
      { kind: "needs_connection" },
      "Se necesita conexión a internet para buscar una venta de otra caja.",
    ],
    [{ kind: "voided" }, "Esa venta está anulada: no se puede devolver."],
    [{ kind: "lookup_failed" }, "No se pudo buscar la venta en las otras cajas. Probá de nuevo."],
    [{ kind: "unavailable" }, "No se pudo buscar la venta. Probá de nuevo."],
  ] as const)(
    "shows the refusal %j as a red banner under the empty table, keeping the search and Buscar",
    async (outcome, text) => {
      const { screen } = await renderScreen({ findSaleForReturn: async () => outcome });

      await lookUp(screen, "0003-00009999");

      await expect.element(alertText(screen, text)).toBeVisible();
      await expect.element(searchBox(screen)).toHaveValue("0003-00009999");
      await expect.element(searchBox(screen)).toHaveFocus();
      await expect.element(screen.getByRole("button", { name: "Buscar" })).toBeEnabled();
      await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
      expect(legendOf(screen)).toEqual(["EnterBuscar"]);
    },
  );

  it("says a scanned code that is not a ticket's QR is not one, without asking the core", async () => {
    const { screen, findSaleForReturn, readBarcode } = await renderScreen();

    readBarcode("7790001");

    await expect
      .element(
        alertText(
          screen,
          "Ese QR no es de un ticket. Escaneá el QR de la factura C o del documento de una venta diferida, o tipeá los números impresos.",
        ),
      )
      .toBeVisible();
    expect(findSaleForReturn).not.toHaveBeenCalled();
  });

  it("says it could not look the sale up when the core does not answer", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: async () => {
        throw new Error("core down");
      },
    });

    await lookUp(screen);

    await expect
      .element(alertText(screen, "No se pudo buscar la venta. Probá de nuevo."))
      .toBeVisible();
  });

  it("clears the refusal when the cashier types again", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: async () => ({ kind: "not_found" }),
    });
    await lookUp(screen, "0003-00009999");
    await expect
      .element(alertText(screen, "No encontramos esa venta en esta sucursal."))
      .toBeVisible();

    await userEvent.type(searchBox(screen), "1");

    await expect
      .element(alertText(screen, "No encontramos esa venta en esta sucursal."))
      .not.toBeInTheDocument();
  });
});
