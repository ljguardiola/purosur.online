import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import {
  DETAIL,
  detailPanel,
  FISCAL_ROW,
  legendOf,
  pageOf,
  renderScreen,
  searchField,
  table,
} from "./test-support/sales-history-screen";

function voidPanel(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  return screen.getByRole("complementary", { name: "Anular venta" });
}

async function openVoidPanel(options: Parameters<typeof renderScreen>[0] = {}) {
  const rendered = await renderScreen(options);
  await expect.element(detailPanel(rendered.screen).getByText("VENTA · 11:42")).toBeVisible();
  await userEvent.keyboard("{Delete}");
  await expect.element(voidPanel(rendered.screen)).toBeVisible();
  return rendered;
}

describe("SalesHistoryScreen voiding a sale", () => {
  it("opens the void panel on Supr, with what is given back and the credit note, replacing the detail", async () => {
    const { screen } = await openVoidPanel();

    const panel = voidPanel(screen);
    await expect.element(panel.getByText("A DEVOLVER AHORA")).toBeVisible();
    await expect.element(panel.getByText("Efectivo · en el acto")).toBeVisible();
    await expect.element(panel.getByText("Se emite e imprime")).toBeVisible();
    await expect.element(panel.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect
      .element(panel.getByRole("button", { name: "Anular venta" }).getByText("Enter"))
      .toBeVisible();
  });

  it("makes the list inactive and dims the search and the session choice while it is open", async () => {
    const { screen, saleHistoryDetail } = await openVoidPanel();

    await expect
      .element(table(screen).getByRole("row", { name: /10:20/ }))
      .toHaveAttribute("aria-disabled", "true");
    await expect.element(searchField(screen)).toBeDisabled();
    await expect.element(screen.getByRole("radio", { name: "Todas" })).toBeDisabled();
    await userEvent.keyboard("{ArrowDown}");
    expect(saleHistoryDetail).not.toHaveBeenCalledWith("sale-2");
    expect(legendOf(screen)).toEqual([]);
  });

  it("shows the lock only when the core says another person must authorize", async () => {
    const free = await openVoidPanel();
    await expect
      .element(voidPanel(free.screen).getByText("Pide autorización"))
      .not.toBeInTheDocument();
  });

  it("shows the lock when the core says another person must authorize", async () => {
    const { screen } = await openVoidPanel({
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: { ...DETAIL, void_authorization_required: true },
      }),
    });

    await expect.element(voidPanel(screen).getByText("Pide autorización")).toBeInTheDocument();
  });

  it("closes the panel with Esc without asking the core", async () => {
    const { screen, voidSale } = await openVoidPanel();

    await userEvent.keyboard("{Escape}");

    await expect.element(voidPanel(screen)).not.toBeInTheDocument();
    await expect
      .element(table(screen).getByRole("row", { name: /10:20/ }))
      .not.toHaveAttribute("aria-disabled");
    expect(voidSale).not.toHaveBeenCalled();
  });

  it("does not open for a sale the core says cannot be voided", async () => {
    const { screen } = await renderScreen({
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: { ...DETAIL, voidability: { kind: "not_voidable", refusal: "session_closed" } },
      }),
    });
    await expect.element(detailPanel(screen).getByText("VENTA · 11:42")).toBeVisible();

    await userEvent.keyboard("{Delete}");

    await expect.element(voidPanel(screen)).not.toBeInTheDocument();
  });

  it("voids on Enter, says the sale was voided and reads the sales again", async () => {
    let done = false;
    const { screen, voidSale, saleHistoryDetail, salesHistory } = await openVoidPanel({
      voidSale: async () => {
        done = true;
        return { kind: "voided", refunds: [], authorized_by: null, credit_note: null };
      },
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: done
          ? {
              ...DETAIL,
              state: "voided",
              voidability: { kind: "not_voidable", refusal: "not_completed" },
            }
          : DETAIL,
      }),
      salesHistory: async () => pageOf([{ ...FISCAL_ROW, state: done ? "voided" : "completed" }]),
    });

    await userEvent.keyboard("{Enter}");

    expect(voidSale).toHaveBeenCalledExactlyOnceWith("sale-1", false, undefined);
    await expect.element(screen.getByText("Venta anulada", { exact: true })).toBeVisible();
    await expect.element(voidPanel(screen)).not.toBeInTheDocument();
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBe(2);
    await expect.poll(() => salesHistory.mock.calls.length).toBe(2);
    await expect.element(table(screen).getByText("Anulada")).toBeVisible();
    expect(legendOf(screen)).not.toContain("SuprAnular");
  });

  it("asks for another person's PIN when the core says the person may not void", async () => {
    const { screen, voidSale } = await openVoidPanel({
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: { ...DETAIL, void_authorization_required: true },
      }),
    });

    await userEvent.keyboard("{Enter}");
    await expect
      .element(authorizationDialog().getByText("Anular venta", { exact: true }))
      .toBeVisible();
    await authorizeInModal({ as: "Grace", pin: "1234" });

    await vi.waitFor(() =>
      expect(voidSale).toHaveBeenCalledExactlyOnceWith("sale-1", false, {
        user_id: "u2",
        pin: "1234",
      }),
    );
    await expect.element(screen.getByText("Venta anulada", { exact: true })).toBeVisible();
  });

  it("keeps the panel open with voiding locked, and reads the sale again, when the core refuses to void it", async () => {
    const { screen, saleHistoryDetail } = await openVoidPanel({
      voidSale: async () => ({ kind: "session_closed" }),
    });

    await userEvent.keyboard("{Enter}");

    await expect
      .element(voidPanel(screen).getByRole("button", { name: "Anular venta" }))
      .toHaveAttribute("aria-disabled", "true");
    await expect.poll(() => saleHistoryDetail.mock.calls.length).toBe(2);
  });

  it("gives the list back when the core refuses to void and the sale it reads again can no longer be voided", async () => {
    let refused = false;
    const { screen, saleHistoryDetail } = await openVoidPanel({
      voidSale: async () => {
        refused = true;
        return { kind: "session_closed" };
      },
      saleHistoryDetail: async () => ({
        kind: "found",
        detail: refused
          ? { ...DETAIL, voidability: { kind: "not_voidable", refusal: "session_closed" } }
          : DETAIL,
      }),
    });

    await userEvent.keyboard("{Enter}");

    await expect.element(voidPanel(screen)).not.toBeInTheDocument();
    await expect.poll(() => legendOf(screen)).toEqual(["↑↓Ventas", "F2Buscar", "F5Reimprimir"]);
    await expect.element(searchField(screen)).toBeEnabled();
    await expect
      .element(table(screen).getByRole("row", { name: /10:20/ }))
      .not.toHaveAttribute("aria-disabled");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => saleHistoryDetail.mock.calls.at(-1)).toEqual(["sale-2"]);
  });

  it("closes the panel when the core cannot find the sale", async () => {
    const { screen } = await openVoidPanel({ voidSale: async () => ({ kind: "not_found" }) });

    await userEvent.keyboard("{Enter}");

    await expect.element(voidPanel(screen)).not.toBeInTheDocument();
  });

  it("tells the route the session is no longer valid when voiding finds nobody signed in", async () => {
    const { onSessionInvalid } = await openVoidPanel({
      voidSale: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });
});
