import type { PreviewReturnOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseReturnLine,
  openReturn,
  previewOf,
  renderScreen,
} from "./test-support/return-screen";
import { SALE } from "./test-support/sale-for-return";

describe("ReturnScreen choosing what the customer returns", () => {
  it("names the invoice and when it was bought, with how long each reason can still be returned", async () => {
    const { screen } = await renderScreen();

    await openReturn(screen);

    await expect
      .element(screen.getByText("DEVOLUCIÓN · FACTURA C PV 00003 N° 00001192"))
      .toBeVisible();
    await expect.element(screen.getByText("Compra del 12/09/2026")).toBeVisible();
    await expect.element(screen.getByText("Arrepentimiento hasta 27/09/2026")).toBeVisible();
    await expect.element(screen.getByText("Defecto hasta 12/03/2027")).toBeVisible();
  });

  it("says a reason's window is over", async () => {
    const { screen } = await renderScreen({
      findSaleForReturn: async () => ({
        kind: "found",
        sale: {
          ...SALE,
          windows: {
            ...SALE.windows,
            change_of_mind: { last_allowed_day: "2026-09-12", open: false },
          },
        },
      }),
    });

    await openReturn(screen);

    await expect.element(screen.getByText("Arrepentimiento vencido")).toBeVisible();
  });

  it("starts with nothing to refund and nothing to complete", async () => {
    const { screen, previewReturn } = await renderScreen();

    await openReturn(screen);

    await expect.element(screen.getByText("A REINTEGRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByText("Líneas a devolver")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
    expect(previewReturn).not.toHaveBeenCalled();
  });

  it("shows how it is paid back: the cash payment, and the payments that are not refunded from the register with their reason", async () => {
    const { screen } = await renderScreen();

    await openReturn(screen);

    await expect.element(screen.getByText("SE DEVUELVE POR EL MEDIO DEL PAGO")).toBeVisible();
    await expect.element(screen.getByText("Efectivo")).toBeVisible();
    await expect.element(screen.getByText("Pagó $ 15.000,00")).toBeVisible();
    await expect.element(screen.getByText("Transferencia")).toBeVisible();
    const transfer = screen.getByRole("textbox", { name: "Reintegro por Transferencia" });
    await expect.element(transfer).toHaveAttribute("readonly");
    await expect
      .element(transfer)
      .toHaveAccessibleDescription("Este medio todavía no se reintegra desde la caja");
    await userEvent.hover(transfer);
    await expect
      .element(screen.getByRole("tooltip"))
      .toHaveTextContent("Este medio todavía no se reintegra desde la caja");
  });

  it("shows the refund loading while the core works it out", async () => {
    const { screen } = await renderScreen({ previewReturn: () => new Promise(() => {}) });
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await vi.waitFor(() =>
      expect(
        screen.getByText("A REINTEGRAR").element().closest('[aria-busy="true"]'),
      ).not.toBeNull(),
    );
    await expect.element(screen.getByText("$ 0,00")).not.toBeInTheDocument();
  });

  it("shows no refund when the core could not work it out", async () => {
    const { screen } = await renderScreen({
      previewReturn: async () => ({ kind: "unavailable" }),
    });
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await expect
      .element(screen.getByText("No se pudo calcular el reintegro").first())
      .toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).not.toBeInTheDocument();
  });

  it("says the cashier may not return when the core says so", async () => {
    const { screen } = await renderScreen({
      previewReturn: async () => ({ kind: "lacks_permission" }),
    });
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await expect
      .element(screen.getByText("No tenés permiso para hacer devoluciones.").first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("asks the core about a line as soon as it is checked, with nothing chosen yet", async () => {
    const { screen, previewReturn } = await renderScreen();
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await vi.waitFor(() =>
      expect(previewReturn).toHaveBeenLastCalledWith("sale-1", [
        { sale_line_id: "line-pasta", quantity: 3, reason: null, disposition: null },
      ]),
    );
    await expect
      .element(screen.getByText("Elegí el motivo de Pasta de maní 380 g.").first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("asks what happens with the merchandise once the reason is chosen", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await chooseReturnLine(screen, "Nibs de cacao", { reason: "Defecto" });

    await expect
      .element(screen.getByText("Elegí qué pasa con la mercadería de Nibs de cacao.").first())
      .toBeVisible();
  });

  it("shows what to refund, and lets the cashier complete, once every checked line is decided", async () => {
    const { screen, previewReturn } = await renderScreen();
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Arrepentimiento",
      disposition: "A la venta",
    });

    await vi.waitFor(() =>
      expect(previewReturn).toHaveBeenLastCalledWith("sale-1", [
        {
          sale_line_id: "line-pasta",
          quantity: 3,
          reason: "change_of_mind",
          disposition: "restock",
        },
      ]),
    );
    await expect.element(screen.getByText("$ 9.700,00", { exact: true }).first()).toBeVisible();
    await expect
      .element(screen.getByRole("textbox", { name: "Reintegro por Efectivo" }))
      .toHaveValue("9.700,00");
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeEnabled();
  });

  it("counts the lines to return", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");
    await chooseReturnLine(screen, "Nibs de cacao");

    await expect.element(screen.getByText("Líneas a devolver")).toBeVisible();
    expect(screen.getByText("Líneas a devolver").element().parentElement?.textContent).toBe(
      "Líneas a devolver2",
    );
  });

  it("stops asking about a line that is unchecked", async () => {
    const { screen, previewReturn } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");
    await vi.waitFor(() => expect(previewReturn).toHaveBeenCalled());

    await screen.getByRole("checkbox", { name: /Pasta de maní 380 g/ }).click({ force: true });

    await expect
      .element(screen.getByText("Elegí el motivo de Pasta de maní 380 g.").first())
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("shows the quantity the core says can still be returned when the cashier asks for more", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Defecto",
      disposition: "Descarte",
    });

    await userEvent.fill(
      screen.getByRole("textbox", { name: "Cantidad de Pasta de maní 380 g" }),
      "4",
    );

    await expect
      .element(screen.getByText("Pasta de maní 380 g: se pueden devolver hasta 3 u.").first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("returns a promotion's line whole, and asks the core for all of it", async () => {
    const { screen, previewReturn } = await renderScreen();
    await openReturn(screen);

    await chooseReturnLine(screen, "Miel pura de abeja 1 kg");

    await expect
      .element(screen.getByRole("textbox", { name: "Cantidad de Miel pura de abeja 1 kg" }))
      .toHaveValue("2");
    await vi.waitFor(() =>
      expect(previewReturn).toHaveBeenLastCalledWith("sale-1", [
        { sale_line_id: "line-honey", quantity: 2, reason: null, disposition: null },
      ]),
    );
  });

  it("shows the last day of a window the core says is over for the line", async () => {
    const outsideWindow = (lines: Parameters<typeof previewOf>[0]): PreviewReturnOutcome => {
      const previewed = previewOf(lines);
      return previewed.kind !== "previewed"
        ? previewed
        : {
            ...previewed,
            lines: previewed.lines.map((line) => ({
              ...line,
              refusal: {
                kind: "outside_window",
                reason: "change_of_mind",
                last_allowed_day: "2026-09-12",
              },
              refund_amount: null,
            })),
          };
    };
    const { screen } = await renderScreen({
      previewReturn: async (_id, lines) => outsideWindow(lines),
    });
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Arrepentimiento",
      disposition: "A la venta",
    });

    await expect
      .element(
        screen
          .getByText("Venció el plazo por arrepentimiento: se podía hasta el 12/09/2026.")
          .first(),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("says the refund could not be worked out, and works it out again on request", async () => {
    const previewReturn = vi
      .fn<
        (saleId: string, lines: Parameters<typeof previewOf>[0]) => Promise<PreviewReturnOutcome>
      >()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockImplementation(async (_saleId, lines) => previewOf(lines));
    const { screen } = await renderScreen({ previewReturn });
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await expect
      .element(screen.getByText("No se pudo calcular el reintegro").first())
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await expect
      .element(screen.getByText("Elegí el motivo de Pasta de maní 380 g.").first())
      .toBeVisible();
    expect(previewReturn).toHaveBeenCalledTimes(2);
  });

  it("tells the app the session ended when the core says nobody is signed in", async () => {
    const { screen, onSessionInvalid } = await renderScreen({
      previewReturn: async () => ({ kind: "not_signed_in" }),
    });
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalled());
  });

  it("says the sale can no longer be returned when the core says so", async () => {
    const { screen } = await renderScreen({
      previewReturn: async () => ({ kind: "sale_not_returnable" }),
    });
    await openReturn(screen);

    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await expect
      .element(screen.getByText("Esa venta ya no se puede devolver.").first())
      .toBeVisible();
  });

  it("leaves without completing, asking nothing more of the core", async () => {
    const previewReturn = vi.fn(async (_saleId: string, lines: Parameters<typeof previewOf>[0]) =>
      previewOf(lines),
    );
    const { screen, completeReturn, findSaleForReturn } = await renderScreen({ previewReturn });
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g", {
      reason: "Defecto",
      disposition: "Descarte",
    });
    await vi.waitFor(() => expect(previewReturn).toHaveBeenCalled());
    const previews = previewReturn.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Salir sin completar" }));

    await expect
      .element(screen.getByRole("heading", { name: "Escaneá el ticket del cliente" }))
      .toBeVisible();
    expect(previewReturn).toHaveBeenCalledTimes(previews);
    expect(completeReturn).not.toHaveBeenCalled();
    expect(findSaleForReturn).toHaveBeenCalledOnce();
  });

  it("forgets what was chosen when the return starts again", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");
    await userEvent.click(screen.getByRole("button", { name: "Salir sin completar" }));

    await openReturn(screen);

    await expect
      .element(screen.getByRole("checkbox", { name: /Pasta de maní 380 g/ }))
      .not.toBeChecked();
    await expect
      .element(screen.getByRole("button", { name: "Completar devolución" }))
      .toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { screen } = await renderScreen();
    await openReturn(screen);
    await chooseReturnLine(screen, "Pasta de maní 380 g");

    await expectNoAccessibilityViolations(document.body);
  });
});
