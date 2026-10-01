import type {
  CancelSaleOutcome,
  ChangeLineQuantityOutcome,
  OpenSale,
  RemoveSaleLineOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import type { SaleScreenProps } from "./sale-screen";
import {
  ALFAJOR,
  deferred,
  renderScreen,
  SALE_OF_YERBA,
  SALE_OF_YERBA_AND_ALFAJOR,
  YERBA,
} from "./test-support/sale-screen";

const SALE_OF_THREE_YERBAS: OpenSale = {
  id: "sale-1",
  lines: [{ ...YERBA, quantity: 3, line_total: 714_000 }],
  total: 714_000,
};
const SALE_OF_ONE_YERBA: OpenSale = {
  id: "sale-1",
  lines: [{ ...YERBA, quantity: 1, line_total: 238_000 }],
  total: 238_000,
};
const SALE_OF_ALFAJOR: OpenSale = { id: "sale-1", lines: [ALFAJOR], total: 150_000 };
const EMPTY_SALE: OpenSale = { id: "sale-1", lines: [], total: 0 };

const RAISE_YERBA = "Subir la cantidad de Yerba mate 1 kg";
const LOWER_YERBA = "Bajar la cantidad de Yerba mate 1 kg";
const REMOVE_YERBA = "Quitar Yerba mate 1 kg";

describe("SaleScreen editing the lines", () => {
  it("raises a quantity by one and shows the sale the core answers with", async () => {
    const changeLineQuantity = vi.fn(
      async (): Promise<ChangeLineQuantityOutcome> => ({
        kind: "changed",
        sale: SALE_OF_THREE_YERBAS,
      }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      changeLineQuantity,
    });

    await screen.getByRole("button", { name: RAISE_YERBA }).click();

    await expect.element(screen.getByText("3", { exact: true })).toBeVisible();
    expect(changeLineQuantity).toHaveBeenCalledExactlyOnceWith("line-1", 3, 2);
  });

  it("lowers a quantity by one", async () => {
    const changeLineQuantity = vi.fn(
      async (): Promise<ChangeLineQuantityOutcome> => ({
        kind: "changed",
        sale: SALE_OF_ONE_YERBA,
      }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      changeLineQuantity,
    });

    await screen.getByRole("button", { name: LOWER_YERBA }).click();

    await expect.element(screen.getByText("1", { exact: true })).toBeVisible();
    expect(changeLineQuantity).toHaveBeenCalledExactlyOnceWith("line-1", 1, 2);
  });

  it("does not offer to lower a quantity of one", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_ALFAJOR,
    });

    await expect
      .element(screen.getByRole("button", { name: "Bajar la cantidad de Alfajor triple" }))
      .toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: "Subir la cantidad de Alfajor triple" }))
      .toBeEnabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("removes a line at once and shows the sale without it", async () => {
    const removeSaleLine = vi.fn(
      async (): Promise<RemoveSaleLineOutcome> => ({ kind: "removed", sale: SALE_OF_ALFAJOR }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
      removeSaleLine,
    });

    await screen.getByRole("button", { name: REMOVE_YERBA }).click();

    await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Alfajor triple")).toBeVisible();
    expect(removeSaleLine).toHaveBeenCalledExactlyOnceWith("line-1");
  });

  it("gives the scan field the focus back after a change", async () => {
    const { screen, field } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      changeLineQuantity: async () => ({ kind: "changed", sale: SALE_OF_THREE_YERBAS }),
    });

    await screen.getByRole("button", { name: RAISE_YERBA }).click();

    await expect.element(screen.getByText("3", { exact: true })).toBeVisible();
    await expect.element(field).toHaveFocus();
  });

  it("sends one change while the previous one is still answering", async () => {
    const answer = deferred<ChangeLineQuantityOutcome>();
    const changeLineQuantity = vi.fn(() => answer.promise);
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      changeLineQuantity,
    });
    const raise = screen.getByRole("button", { name: RAISE_YERBA });

    await raise.click();

    await expect.element(raise).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: REMOVE_YERBA })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeDisabled();
    answer.resolve({ kind: "changed", sale: SALE_OF_THREE_YERBAS });
    await expect.element(raise).toBeEnabled();
    expect(changeLineQuantity).toHaveBeenCalledOnce();
  });

  it.each([
    ["not_signed_in", { kind: "not_signed_in" }],
    ["no_open_session", { kind: "no_open_session" }],
  ] satisfies [string, ChangeLineQuantityOutcome][])(
    "asks the session to be checked when a change answers %s",
    async (_kind, outcome) => {
      const onSessionInvalid = vi.fn();
      const { screen } = await renderScreen({
        currentSale: async () => SALE_OF_YERBA,
        changeLineQuantity: async () => outcome,
        onSessionInvalid,
      });

      await screen.getByRole("button", { name: RAISE_YERBA }).click();

      await expect.poll(() => onSessionInvalid).toHaveBeenCalledOnce();
    },
  );

  it("explains the missing permission when a removal is not permitted", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      removeSaleLine: async () => ({ kind: "not_permitted" }),
    });

    await screen.getByRole("button", { name: REMOVE_YERBA }).click();

    await expect.element(screen.getByText("No tenés el permiso de vender y cobrar")).toBeVisible();
  });

  it("reads the sale again, with no notice, when the line changed since the screen showed it", async () => {
    const currentSale = vi
      .fn<SaleScreenProps["currentSale"]>()
      .mockResolvedValueOnce(SALE_OF_YERBA)
      .mockResolvedValueOnce(SALE_OF_THREE_YERBAS);
    const { screen } = await renderScreen({
      currentSale,
      changeLineQuantity: async () => ({ kind: "stale_quantity" }),
    });

    await screen.getByRole("button", { name: LOWER_YERBA }).click();

    await expect.element(screen.getByText("3", { exact: true })).toBeVisible();
    expect(currentSale).toHaveBeenCalledTimes(2);
    await expect
      .element(screen.getByText("No se pudo cambiar la cantidad"))
      .not.toBeInTheDocument();
  });

  it.each([
    ["a line that is gone", { kind: "unknown_line" }],
    ["a sale that is gone", { kind: "no_open_sale" }],
  ] satisfies [string, RemoveSaleLineOutcome][])(
    "reads the sale again after a removal of %s",
    async (_what, outcome) => {
      const currentSale = vi
        .fn<SaleScreenProps["currentSale"]>()
        .mockResolvedValueOnce(SALE_OF_YERBA_AND_ALFAJOR)
        .mockResolvedValueOnce(SALE_OF_ALFAJOR);
      const { screen } = await renderScreen({ currentSale, removeSaleLine: async () => outcome });

      await screen.getByRole("button", { name: REMOVE_YERBA }).click();

      await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
      expect(currentSale).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    [
      "answers unavailable",
      async (): Promise<ChangeLineQuantityOutcome> => ({ kind: "unavailable" }),
    ],
    [
      "fails",
      async (): Promise<ChangeLineQuantityOutcome> => {
        throw new Error("down");
      },
    ],
  ])("tells the quantity could not be changed when the core %s", async (_how, change) => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      changeLineQuantity: change,
    });

    await screen.getByRole("button", { name: RAISE_YERBA }).click();

    await expect.element(screen.getByText("No se pudo cambiar la cantidad")).toBeVisible();
    await expect.element(screen.getByText("Probá de nuevo.")).toBeVisible();
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
  });

  it("tells the line could not be removed when the core is unavailable", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      removeSaleLine: async () => ({ kind: "unavailable" }),
    });

    await screen.getByRole("button", { name: REMOVE_YERBA }).click();

    await expect.element(screen.getByText("No se pudo quitar la línea")).toBeVisible();
  });
});

describe("SaleScreen cancelling the sale", () => {
  it("has nothing to cancel while there is no sale", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeDisabled();
  });

  it("can cancel a sale that has no lines left", async () => {
    const { screen } = await renderScreen({ currentSale: async () => EMPTY_SALE });

    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();
  });

  it("asks for confirmation with what would be discarded", async () => {
    const cancelSale = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR,
      cancelSale,
    });

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByText("Venta en curso · Sin pagos")).toBeVisible();
    await expect.element(dialog.getByText("Líneas en el carrito")).toBeVisible();
    await expect.element(dialog.getByText("2", { exact: true })).toBeVisible();
    await expect.element(dialog.getByText("Total", { exact: true })).toBeVisible();
    await expect
      .element(
        dialog.getByText(
          "Se vacía el carrito y no se cobra nada. La mercadería no sale del stock.",
        ),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(document.body);
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("goes on with the sale when asked to", async () => {
    const cancelSale = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      cancelSale,
    });
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Seguir con la venta" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    expect(cancelSale).not.toHaveBeenCalled();
  });

  it("empties the sale and gives the scan field the focus once cancelled", async () => {
    const cancelSale = vi.fn(async (): Promise<CancelSaleOutcome> => ({ kind: "cancelled" }));
    const { screen, field } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      cancelSale,
    });
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByText("La venta está vacía")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(field).toHaveFocus();
    expect(cancelSale).toHaveBeenCalledOnce();
  });

  it("tells the sale could not be cancelled when the core is unavailable", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      cancelSale: async () => ({ kind: "unavailable" }),
    });
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByText("No se pudo cancelar la venta")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
  });

  it("does not take the focus from the dialog while it is open", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    const keep = screen.getByRole("button", { name: "Seguir con la venta" });
    await keep.element().focus();

    await expect.element(keep).toHaveFocus();
  });
});
