import type { ScanProductOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SaleScreenProps } from "./sale-screen";
import {
  renderScreen,
  SALE_OF_YERBA,
  SALE_OF_YERBA_AND_ALFAJOR,
  scan,
} from "./test-support/sale-screen";

const NOT_ADDED_TITLE = "No se agregó el producto escaneado";
const FISCAL_QR_ADDRESS =
  "https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjEsImZlY2hhIjoiMjAyNi0xMC0xMSJ9";

describe("SaleScreen reading a barcode reader's codes", () => {
  it("adds the product of a code the reader reads, as a typed scan does", async () => {
    const scanProduct = vi.fn(
      async (): Promise<ScanProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_YERBA,
      }),
    );
    const { screen, field, readBarcode } = await renderScreen({ scanProduct });

    readBarcode("7790001");

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    expect(scanProduct.mock.calls).toEqual([["7790001"]]);
    await expect.element(field).toHaveValue("");
  });

  it("scans the same code each time the reader reads it", async () => {
    const scanProduct = vi
      .fn<SaleScreenProps["scanProduct"]>()
      .mockResolvedValueOnce({ kind: "added", removed_manual_discount: false, removed_sale_discount: false, sale: SALE_OF_YERBA })
      .mockResolvedValueOnce({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_YERBA_AND_ALFAJOR,
      });
    const { screen, readBarcode } = await renderScreen({ scanProduct });

    readBarcode("7790001");
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    readBarcode("7790001");

    await expect.element(screen.getByText("Alfajor triple")).toBeVisible();
    expect(scanProduct.mock.calls).toEqual([["7790001"], ["7790001"]]);
  });

  it("scans a fiscal QR address whole, without searching products by name", async () => {
    const scanProduct = vi.fn(
      async (): Promise<ScanProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_YERBA,
      }),
    );
    const searchProducts = vi.fn(async () => ({
      kind: "results" as const,
      products: [],
      more: false,
    }));
    const { screen, readBarcode } = await renderScreen({ scanProduct, searchProducts });

    readBarcode(FISCAL_QR_ADDRESS);

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    expect(scanProduct.mock.calls).toEqual([[FISCAL_QR_ADDRESS]]);
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it("shows the problem of a refused code as a typed scan does, with the code selected", async () => {
    const { screen, field, readBarcode } = await renderScreen();

    readBarcode("7790001");

    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();
    await expect.element(field).toHaveValue("7790001");
    const input = field.element() as HTMLInputElement;
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 7]);
  });

  it("clears the problem of an earlier scan when the reader reads the next code", async () => {
    const scanProduct = vi
      .fn<SaleScreenProps["scanProduct"]>()
      .mockResolvedValueOnce({ kind: "unknown_code" })
      .mockResolvedValueOnce({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_YERBA,
      });
    const { screen, readBarcode } = await renderScreen({ scanProduct });
    readBarcode("111");
    await expect.element(screen.getByText("No hay ningún producto con ese código")).toBeVisible();

    readBarcode("7790001");

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await expect
      .element(screen.getByText("No hay ningún producto con ese código"))
      .not.toBeInTheDocument();
  });

  it("still scans a code typed in the field", async () => {
    const scanProduct = vi.fn(
      async (): Promise<ScanProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: SALE_OF_YERBA,
      }),
    );
    const { screen, field } = await renderScreen({ scanProduct });

    await scan(field, "7790001");

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    expect(scanProduct.mock.calls).toEqual([["7790001"]]);
  });

  it.each(["approved_payment", "qr_charge_in_progress"] as const)(
    "does not scan the code and warns that the product was not added while the sale's lines are locked by %s",
    async (linesLock) => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({
          kind: "added",
          removed_manual_discount: false,
          removed_sale_discount: false,
          sale: SALE_OF_YERBA,
        }),
      );
      const { screen, readBarcode } = await renderScreen({
        scanProduct,
        currentSale: async () => ({ ...SALE_OF_YERBA, lines_lock: linesLock }),
      });
      await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

      readBarcode("7790001");

      await expect.element(screen.getByText(NOT_ADDED_TITLE)).toBeVisible();
      expect(scanProduct).not.toHaveBeenCalled();
    },
  );

  describe("while a window is open", () => {
    async function withCancelWindowOpen() {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({
          kind: "added",
          removed_manual_discount: false,
          removed_sale_discount: false,
          sale: SALE_OF_YERBA,
        }),
      );
      const rendered = await renderScreen({
        scanProduct,
        currentSale: async () => SALE_OF_YERBA,
      });
      await rendered.screen.getByRole("button", { name: "Cancelar venta" }).click();
      await expect
        .element(rendered.screen.getByRole("dialog", { name: "¿Cancelar la venta?" }))
        .toBeVisible();
      return { ...rendered, scanProduct };
    }

    it("does not scan the code and warns that the product was not added", async () => {
      const { screen, scanProduct, readBarcode } = await withCancelWindowOpen();

      readBarcode("7790001");

      await expect.element(screen.getByText(NOT_ADDED_TITLE)).toBeVisible();
      expect(scanProduct).not.toHaveBeenCalled();
    });

    it("scans the codes read once the window is closed", async () => {
      const { screen, scanProduct, readBarcode } = await withCancelWindowOpen();

      await screen.getByRole("button", { name: "Seguir con la venta" }).click();
      await expect
        .element(screen.getByRole("dialog", { name: "¿Cancelar la venta?" }))
        .not.toBeInTheDocument();
      readBarcode("7790001");

      await expect.poll(() => scanProduct.mock.calls).toEqual([["7790001"]]);
    });

    it("does not scan the code while the weight of a product is asked", async () => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({
          kind: "weight_needed",
          product_id: "p-queso",
          product_name: "Queso cremoso",
        }),
      );
      const { screen, field, readBarcode } = await renderScreen({ scanProduct });
      await scan(field, "7790009");
      await expect.element(screen.getByRole("dialog")).toBeVisible();

      readBarcode("7790001");

      await expect.element(screen.getByText(NOT_ADDED_TITLE)).toBeVisible();
      expect(scanProduct.mock.calls).toEqual([["7790009"]]);
    });

    it("does not scan the code while the window to leave the register is open", async () => {
      const scanProduct = vi.fn(
        async (): Promise<ScanProductOutcome> => ({
          kind: "added",
          removed_manual_discount: false,
          removed_sale_discount: false,
          sale: SALE_OF_YERBA,
        }),
      );
      const { screen, readBarcode } = await renderScreen({ scanProduct });
      await userEvent.click(screen.getByRole("navigation").getByRole("button", { name: "Salir" }));
      await expect
        .element(screen.getByRole("dialog", { name: "¿Cerrar la caja o dejarla bloqueada?" }))
        .toBeVisible();

      readBarcode("7790001");

      await expect.element(screen.getByText(NOT_ADDED_TITLE)).toBeVisible();
      expect(scanProduct).not.toHaveBeenCalled();
    });
  });
});
