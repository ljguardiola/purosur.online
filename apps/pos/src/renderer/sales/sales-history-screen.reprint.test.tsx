import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { authorizeInModal } from "../shell/test-support/authorization-modal-steps";
import {
  DETAIL,
  detailPanel,
  legendOf,
  renderScreen,
  searchField,
  table,
} from "./test-support/sales-history-screen";

const REASON = "Motivo de la reimpresión";
const REPRINT = "Reimprimir duplicado";

function showing(detail: SaleDetail) {
  return { saleHistoryDetail: async () => ({ kind: "found" as const, detail }) };
}

function reprintPanel(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return screen.getByRole("complementary", { name: "Reimprimir" });
}

describe("SalesHistoryScreen reprinting a sale's receipt", () => {
  it("opens the reprint panel on F5 with the sale's amount, time and comprobante and the reason field focused", async () => {
    const { screen } = await renderScreen();
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();

    await userEvent.keyboard("{F5}");

    const panel = reprintPanel(screen);
    await expect.element(panel.getByText("SALE COMO DUPLICADO")).toBeVisible();
    await expect.element(panel.getByText("$ 50.700,00").first()).toBeVisible();
    await expect.element(panel.getByText("Factura C · 00003-00001248")).toBeVisible();
    await expect.element(panel.getByRole("textbox", { name: REASON })).toHaveFocus();
  });

  it("opens it from the panel's button too", async () => {
    const { screen } = await renderScreen();

    await userEvent.click(
      detailPanel(screen).getByRole("button", { name: "Reimprimir", exact: true }),
    );

    await expect.element(reprintPanel(screen)).toBeVisible();
  });

  it("keeps the footer keys behind the panel", async () => {
    const { screen } = await renderScreen();
    await expect.poll(() => legendOf(screen)).toContain("F5Reimprimir");

    await userEvent.keyboard("{F5}");

    await expect.element(reprintPanel(screen)).toBeVisible();
    expect(legendOf(screen)).toEqual(["↑↓Ventas", "F2Buscar", "F5Reimprimir", "SuprAnular"]);
  });

  it("shows no lock when the person may reprint, and a lock when the core says another person must authorize", async () => {
    const free = await renderScreen();
    await expect.element(detailPanel(free.screen).getByText("VENTA · 11:42")).toBeVisible();
    await userEvent.keyboard("{F5}");
    await expect.element(reprintPanel(free.screen)).toBeVisible();
    await expect
      .element(reprintPanel(free.screen).getByText("Pide autorización"))
      .not.toBeInTheDocument();
  });

  it("shows the lock when the core says another person must authorize", async () => {
    const { screen } = await renderScreen(
      showing({ ...DETAIL, reprint_authorization_required: true }),
    );
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();

    await userEvent.keyboard("{F5}");

    await expect.element(reprintPanel(screen).getByText("Pide autorización")).toBeInTheDocument();
  });

  it("closes the panel with Esc without asking the core, and stays on the screen", async () => {
    const { screen, reprintSaleReceipt } = await renderScreen();
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
    await userEvent.keyboard("{F5}");

    await userEvent.keyboard("{Escape}");

    await expect.element(reprintPanel(screen)).not.toBeInTheDocument();
    await expect.element(table(screen)).toBeVisible();
    expect(reprintSaleReceipt).not.toHaveBeenCalled();
  });

  it("sends the reason, closes the panel, says the receipt comes out as a duplicate and reads the sales again", async () => {
    const { screen, reprintSaleReceipt, salesHistory } = await renderScreen();
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
    await userEvent.keyboard("{F5}");
    await userEvent.fill(
      reprintPanel(screen).getByRole("textbox", { name: REASON }),
      "Ticket ilegible",
    );

    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByText("El ticket sale en cuanto la impresora esté lista"))
      .toBeVisible();
    await expect.element(screen.getByText("Sale como duplicado.")).toBeVisible();
    await expect.element(reprintPanel(screen)).not.toBeInTheDocument();
    expect(reprintSaleReceipt).toHaveBeenCalledExactlyOnceWith(
      "sale-1",
      "Ticket ilegible",
      undefined,
    );
    await expect.poll(() => salesHistory.mock.calls.length).toBe(2);
    expect(legendOf(screen)).toContain("F5Reimprimir");
  });

  it("asks another person's PIN when the core says the person may not reprint", async () => {
    const { screen, reprintSaleReceipt } = await renderScreen({
      ...showing({ ...DETAIL, reprint_authorization_required: true }),
    });
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
    await userEvent.keyboard("{F5}");
    await userEvent.fill(reprintPanel(screen).getByRole("textbox", { name: REASON }), "Otra copia");

    await userEvent.click(reprintPanel(screen).getByRole("button", { name: REPRINT }));
    await authorizeInModal({ as: "Grace", pin: "1234" });

    await vi.waitFor(() =>
      expect(reprintSaleReceipt).toHaveBeenCalledExactlyOnceWith("sale-1", "Otra copia", {
        user_id: "u2",
        pin: "1234",
      }),
    );
  });

  it("closes the panel when the core cannot find the sale", async () => {
    const { screen } = await renderScreen({
      reprintSaleReceipt: async () => ({ kind: "not_found" }),
    });
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
    await userEvent.keyboard("{F5}");
    await userEvent.fill(reprintPanel(screen).getByRole("textbox", { name: REASON }), "Otra copia");

    await userEvent.keyboard("{Enter}");

    await expect.element(reprintPanel(screen)).not.toBeInTheDocument();
  });

  it("tells the route the session is no longer valid when the reprint finds nobody signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      reprintSaleReceipt: async () => ({ kind: "not_signed_in" }),
    });
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
    await userEvent.keyboard("{F5}");
    await userEvent.fill(reprintPanel(screen).getByRole("textbox", { name: REASON }), "Otra copia");

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  it("does not open the panel while the search field is not needed: F5 works while searching", async () => {
    const { screen } = await renderScreen();
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();
    await userEvent.keyboard("{F2}");
    await userEvent.type(searchField(screen), "1248");

    await userEvent.keyboard("{F5}");

    await expect.element(reprintPanel(screen)).toBeVisible();
  });

  it("reprints the factura of a voided sale from F6 as a duplicate of the sale's receipt", async () => {
    const { screen, reprintSaleReceipt } = await renderScreen(
      showing({
        ...DETAIL,
        state: "voided",
        voidability: { kind: "not_voidable", refusal: "not_completed" },
        credit_notes: [],
      }),
    );
    await expect
      .element(detailPanel(screen).getByRole("button", { name: "Reimprimir factura" }))
      .toBeVisible();

    await userEvent.keyboard("{F6}");
    await userEvent.fill(reprintPanel(screen).getByRole("textbox", { name: REASON }), "Otra copia");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(reprintSaleReceipt).toHaveBeenCalledExactlyOnceWith("sale-1", "Otra copia", undefined),
    );
  });
});

describe("SalesHistoryScreen reprinting the factura of a sale that was deferred", () => {
  const INVOICED = {
    ...DETAIL,
    deferred_invoice_next_copy: { kind: "duplicate", order_number: 1 },
  } as const;

  it("reprints the factura, not the sale's receipt, from F6", async () => {
    const { screen, reprintDeferredSaleInvoice, reprintSaleReceipt } = await renderScreen(
      showing(INVOICED),
    );
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();

    await userEvent.keyboard("{F6}");
    await expect.element(reprintPanel(screen).getByText("SALE COMO DUPLICADO")).toBeVisible();
    await userEvent.fill(
      reprintPanel(screen).getByRole("textbox", { name: REASON }),
      "El cliente la perdió",
    );
    await userEvent.keyboard("{Enter}");

    await expect
      .element(
        screen.getByText("La reimpresión de la factura sale en cuanto la impresora esté lista"),
      )
      .toBeVisible();
    expect(reprintDeferredSaleInvoice).toHaveBeenCalledExactlyOnceWith(
      "sale-1",
      "El cliente la perdió",
      undefined,
    );
    expect(reprintSaleReceipt).not.toHaveBeenCalled();
  });
});
