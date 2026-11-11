import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { ScanProblem } from "./scan-problem-message";
import { ScanProblemMessage } from "./scan-problem-message";

describe("ScanProblemMessage", () => {
  it.each<{ problem: ScanProblem; title: string; help: string }>([
    {
      problem: { kind: "scan_failed" },
      title: "No se pudo agregar el producto",
      help: "Probá escanearlo de nuevo.",
    },
    {
      problem: { kind: "add_failed" },
      title: "No se pudo agregar el producto",
      help: "Probá elegirlo de nuevo.",
    },
    {
      problem: { kind: "search_failed" },
      title: "No se pudo buscar el producto",
      help: "Probá escribirlo de nuevo.",
    },
    {
      problem: { kind: "weight_change_failed" },
      title: "No se pudo cambiar el peso",
      help: "Probá de nuevo.",
    },
    {
      problem: { kind: "empty_failed" },
      title: "No se pudo vaciar el carrito",
      help: "Probá de nuevo.",
    },
    {
      problem: { kind: "cancel_failed" },
      title: "No se pudo cancelar la venta",
      help: "Probá de nuevo.",
    },
  ])(
    "tells what failed and how to try again when $problem.kind",
    async ({ problem, title, help }) => {
      const screen = await render(<ScanProblemMessage problem={problem} />);

      const region = screen.getByRole("status");
      await expect.element(region.getByText(title, { exact: true })).toBeVisible();
      await expect.element(region.getByText(help, { exact: true })).toBeVisible();
    },
  );

  it.each<{ problem: ScanProblem; title: string; help: string }>([
    {
      problem: { kind: "has_approved_payment" },
      title: "No se puede vaciar el carrito",
      help: "Ya tiene un pago aprobado.",
    },
    {
      problem: { kind: "mercado_pago_charge_in_progress", action: "empty" },
      title: "Hay un cobro con Mercado Pago en curso",
      help: "Esperá a que termine para vaciar el carrito.",
    },
    {
      problem: { kind: "mercado_pago_charge_in_progress", action: "cancel" },
      title: "Hay un cobro con Mercado Pago en curso",
      help: "Esperá a que termine para cancelar la venta.",
    },
  ])(
    "tells why the cart cannot be emptied or the sale cancelled: $title, $help",
    async ({ problem, title, help }) => {
      const screen = await render(<ScanProblemMessage problem={problem} />);

      const region = screen.getByRole("status");
      await expect.element(region.getByText(title, { exact: true })).toBeVisible();
      await expect.element(region.getByText(help, { exact: true })).toBeVisible();
    },
  );

  it("tells that a product no longer sold by the kilogram has to be added again", async () => {
    const screen = await render(
      <ScanProblemMessage
        problem={{ kind: "not_sold_by_weight", product_name: "Queso cremoso" }}
      />,
    );

    const region = screen.getByRole("status");
    await expect
      .element(region.getByText("Queso cremoso ya no se vende por kilo", { exact: true }))
      .toBeVisible();
    await expect
      .element(region.getByText("Escanealo o buscalo de nuevo para agregarlo.", { exact: true }))
      .toBeVisible();
  });

  it("tells that no product has the code as a notice in the flow of the page, not floating over it", async () => {
    const screen = await render(
      <div>
        <ScanProblemMessage problem={{ kind: "unknown_code" }} />
        <p>Below</p>
      </div>,
    );

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(
        "No hay ningún producto con ese código Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
      );
    await expect
      .element(screen.getByText("No hay ningún producto con ese código", { exact: true }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
          { exact: true },
        ),
      )
      .toBeVisible();
    const noticeBox = screen
      .getByText("No hay ningún producto con ese código")
      .element()
      .closest("div")
      ?.getBoundingClientRect();
    const below = screen.getByText("Below").element().getBoundingClientRect();
    expect(noticeBox?.bottom).toBeLessThanOrEqual(below.top);
  });

  it("keeps the status region mounted while it tells of an unknown code, so the next problem is announced", async () => {
    const screen = await render(<ScanProblemMessage problem={undefined} />);
    const region = screen.getByRole("status").element();

    await screen.rerender(<ScanProblemMessage problem={{ kind: "unknown_code" }} />);

    expect(region.isConnected).toBe(true);

    await screen.rerender(<ScanProblemMessage problem={{ kind: "remove_failed" }} />);

    const message = screen.getByRole("status").filter({ hasText: "No se pudo quitar la línea" });
    await expect.element(message).toBeInTheDocument();
    expect(message.element()).toBe(region);
  });
});
