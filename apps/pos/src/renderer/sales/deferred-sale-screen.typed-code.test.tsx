import type { FindDeferredSaleOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import {
  FOUND_ISSUED,
  FOUND_PENDING,
  QR_TEXT,
  renderScreen,
} from "./test-support/deferred-sale-screen";

const CODE_FIELD = { name: /Código de consulta/ } as const;
const INVALID_CODE = "El código tiene 8 letras y números, como 7KQ4-M2P9.";

async function typeCode(rendered: Awaited<ReturnType<typeof renderScreen>>, code: string) {
  await userEvent.fill(rendered.screen.getByRole("textbox", CODE_FIELD), code);
}

describe("DeferredSaleScreen finding a sale by its typed code", () => {
  it("shows the field with its F2 key", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByText("SI EL LECTOR NO LEE EL QR")).toBeVisible();
    await expect.element(screen.getByText("F2")).toBeVisible();
  });

  it("looks the sale up by the code as typed when Buscar venta is pressed, and shows it as a scan does", async () => {
    const rendered = await renderScreen({ findDeferredSale: async () => FOUND_ISSUED });
    await typeCode(rendered, "7kq4-m2p9");

    await userEvent.click(rendered.screen.getByRole("button", { name: "Buscar venta" }));

    await vi.waitFor(() =>
      expect(rendered.findDeferredSale).toHaveBeenCalledExactlyOnceWith({
        kind: "typed",
        code: "7kq4-m2p9",
      }),
    );
    await expect.element(rendered.screen.getByText("Almendras peladas")).toBeVisible();
    await expect
      .element(rendered.screen.getByRole("button", { name: "Imprimir factura" }))
      .toBeVisible();
  });

  it("refuses a code that is not a short code, saying how it is made, without asking the core", async () => {
    const rendered = await renderScreen();
    await typeCode(rendered, "7KQ4");

    await userEvent.click(rendered.screen.getByRole("button", { name: "Buscar venta" }));

    await expect.element(rendered.screen.getByText(INVALID_CODE)).toBeVisible();
    expect(rendered.findDeferredSale).not.toHaveBeenCalled();
  });

  it("looks the same code up again when it is submitted twice", async () => {
    const rendered = await renderScreen({ findDeferredSale: async () => FOUND_ISSUED });
    await typeCode(rendered, "7KQ4M2P9");
    const search = rendered.screen.getByRole("button", { name: "Buscar venta" });

    await userEvent.click(search);
    await expect.element(rendered.screen.getByText("Almendras peladas")).toBeVisible();
    await userEvent.click(search);

    await vi.waitFor(() => expect(rendered.findDeferredSale).toHaveBeenCalledTimes(2));
  });

  it("ignores a submit while a lookup is in flight", async () => {
    const answer = deferred<FindDeferredSaleOutcome>();
    const rendered = await renderScreen({ findDeferredSale: vi.fn(() => answer.promise) });
    await typeCode(rendered, "7KQ4M2P9");

    await userEvent.click(rendered.screen.getByRole("button", { name: "Buscar venta" }));
    await userEvent.keyboard("{Enter}");

    expect(rendered.findDeferredSale).toHaveBeenCalledTimes(1);
    answer.resolve({ kind: "not_found" });
  });

  it("submits the form on Enter in the field without printing the invoice of the sale shown", async () => {
    const rendered = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => FOUND_PENDING,
    });
    await expect.element(rendered.screen.getByText("Almendras peladas")).toBeVisible();
    await typeCode(rendered, "7KQ4M2P9");

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(rendered.findDeferredSale).toHaveBeenLastCalledWith({
        kind: "typed",
        code: "7KQ4M2P9",
      }),
    );
    expect(rendered.printDeferredSaleInvoice).not.toHaveBeenCalled();
  });

  it("does not print the invoice on Enter in the field when the code is refused", async () => {
    const rendered = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => FOUND_PENDING,
    });
    await expect.element(rendered.screen.getByText("Almendras peladas")).toBeVisible();
    await typeCode(rendered, "7KQ4");

    await userEvent.keyboard("{Enter}");

    await expect.element(rendered.screen.getByText(INVALID_CODE)).toBeVisible();
    expect(rendered.printDeferredSaleInvoice).not.toHaveBeenCalled();
  });

  it("prints with Enter once focus is out of the field", async () => {
    const rendered = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => FOUND_PENDING,
    });
    await expect.element(rendered.screen.getByText("Almendras peladas")).toBeVisible();
    await userEvent.click(rendered.screen.getByRole("textbox", CODE_FIELD));
    await userEvent.click(document.body);

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(rendered.printDeferredSaleInvoice).toHaveBeenCalledTimes(1));
  });

  it("focuses the field with F2", async () => {
    const { screen } = await renderScreen();

    await userEvent.keyboard("{F2}");

    await expect.element(screen.getByRole("textbox", CODE_FIELD)).toHaveFocus();
  });

  it("does not retry a failed lookup when R is typed in the field", async () => {
    const findDeferredSale = vi.fn().mockRejectedValue(new Error("core down"));
    const rendered = await renderScreen({ reading: QR_TEXT, findDeferredSale });
    await expect.element(rendered.screen.getByText("No se pudo buscar la venta")).toBeVisible();

    await userEvent.click(rendered.screen.getByRole("textbox", CODE_FIELD));
    await userEvent.keyboard("R");

    await expect.element(rendered.screen.getByRole("textbox", CODE_FIELD)).toHaveValue("R");
    expect(findDeferredSale).toHaveBeenCalledTimes(1);
  });

  it("still opens the sale of a QR read while the field has focus", async () => {
    const rendered = await renderScreen({ findDeferredSale: async () => FOUND_ISSUED });
    await userEvent.click(rendered.screen.getByRole("textbox", CODE_FIELD));
    await userEvent.keyboard("7KQ4");

    rendered.readBarcode(QR_TEXT);

    await vi.waitFor(() =>
      expect(rendered.findDeferredSale).toHaveBeenCalledExactlyOnceWith({
        kind: "scanned",
        text: QR_TEXT,
      }),
    );
    await expect.element(rendered.screen.getByText("Almendras peladas")).toBeVisible();
  });

  it("disables the field and the search while the invoice is printed", async () => {
    const printing = deferred<never>();
    const rendered = await renderScreen({
      reading: QR_TEXT,
      findDeferredSale: async () => FOUND_PENDING,
      printDeferredSaleInvoice: vi.fn(() => printing.promise),
    });
    await userEvent.click(await rendered.screen.getByRole("button", { name: "Imprimir factura" }));

    await expect.element(rendered.screen.getByRole("textbox", CODE_FIELD)).toBeDisabled();
    await expect
      .element(rendered.screen.getByRole("button", { name: "Buscar venta" }))
      .toBeDisabled();
  });
});
