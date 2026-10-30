import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { backupTickets } from "../shell/test-support/contingency-backup-tickets";
import { ContingencyBackupTicketsNoticeCard } from "./contingency-backup-tickets-notice-card";

type Tickets = Parameters<typeof backupTickets>[0];

async function renderCard(tickets: Tickets, onDiscard = vi.fn()) {
  const screen = await render(
    <ContingencyBackupTicketsNoticeCard tickets={backupTickets(tickets)} onDiscard={onDiscard} />,
  );
  return { screen, onDiscard };
}

function borderColors(container: Element): string[] {
  return [...container.querySelectorAll<HTMLElement>("div")]
    .filter((element) => getComputedStyle(element).borderLeftWidth === "4px")
    .map((element) => getComputedStyle(element).borderLeftColor);
}

describe("ContingencyBackupTicketsNoticeCard", () => {
  it("shows nothing when no ticket needs attention", async () => {
    const { screen } = await renderCard({ kept: 3 });

    expect(borderColors(screen.container)).toEqual([]);
  });

  describe("tickets that did not come out of the printer", () => {
    it("counts those waiting to print and those waiting for the customer's document, in the plural", async () => {
      const { screen } = await renderCard({ to_print: 2, awaiting_customer_document: 1 });

      await expect.element(screen.getByText("Tickets de respaldo sin imprimir")).toBeVisible();
      await expect
        .element(
          screen.getByText(
            "3 tickets de respaldo de contingencia todavía no salieron de la impresora.",
          ),
        )
        .toBeVisible();
      await expect
        .element(screen.getByText("Salen solos después del documento del cliente."))
        .toBeVisible();
      expect(borderColors(screen.container)).toEqual([tokenRgb("warning-soft")]);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("speaks in the singular for one ticket", async () => {
      const { screen } = await renderCard({ to_print: 1 });

      await expect
        .element(
          screen.getByText(
            "1 ticket de respaldo de contingencia todavía no salió de la impresora.",
          ),
        )
        .toBeVisible();
    });

    it.each([
      [
        "paper_out",
        "Poné un rollo nuevo y cerrá la tapa. Salen solos cuando la impresora tenga papel.",
      ],
      ["cover_open", "Cerrá la tapa de la impresora. Salen solos cuando se cierre."],
      [
        "not_responding",
        "Revisá que esté encendida y con el cable conectado. Salen solos cuando vuelva a responder.",
      ],
      [
        "printer_not_configured",
        "Cargá la dirección de la impresora en Impresora. Salen solos después.",
      ],
      ["failed", "Salen solos en el próximo intento."],
    ] as const)("says what to do when the printer reports %s", async (printer, whatToDo) => {
      const { screen } = await renderCard({ to_print: 1, printer });

      await expect.element(screen.getByText(whatToDo)).toBeVisible();
      await expect
        .element(screen.getByText("Salen solos después del documento del cliente."))
        .not.toBeInTheDocument();
    });
  });

  describe("tickets with no backup key", () => {
    it("tells the administrator to be told, in the error tone", async () => {
      const { screen } = await renderCard({ missing_key: 2 });

      await expect
        .element(screen.getByText("No se pudo armar el ticket de respaldo"))
        .toBeVisible();
      await expect
        .element(screen.getByText("La caja no tiene su clave de respaldo para 2 operaciones."))
        .toBeVisible();
      await expect
        .element(
          screen.getByText(
            "Avisá al administrador: se resuelve cuando la caja vuelva a conectarse con la nube.",
          ),
        )
        .toBeVisible();
      expect(borderColors(screen.container)).toEqual([tokenRgb("error-soft")]);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("speaks in the singular for one operation", async () => {
      const { screen } = await renderCard({ missing_key: 1 });

      await expect
        .element(screen.getByText("La caja no tiene su clave de respaldo para 1 operación."))
        .toBeVisible();
    });
  });

  describe("tickets that may be discarded", () => {
    it("says the stored tickets are no longer needed, in the success tone, and discards them when closed", async () => {
      const { screen, onDiscard } = await renderCard({ discardable: 3, may_discard: true });

      await expect
        .element(screen.getByText("Ya podés descartar los tickets de respaldo"))
        .toBeVisible();
      await expect
        .element(
          screen.getByText(
            "Esta caja sincronizó con la nube todo lo de la contingencia: los 3 tickets guardados en la caja del local ya no hacen falta.",
          ),
        )
        .toBeVisible();
      await expect.element(screen.getByText("Tiralos y cerrá este aviso.")).toBeVisible();
      expect(borderColors(screen.container)).toEqual([tokenRgb("success-soft")]);
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

      expect(onDiscard).toHaveBeenCalledOnce();
    });

    it("speaks in the singular for one ticket", async () => {
      const { screen } = await renderCard({ discardable: 1, may_discard: true });

      await expect
        .element(
          screen.getByText(
            "Esta caja sincronizó con la nube todo lo de la contingencia: el ticket guardado en la caja del local ya no hace falta.",
          ),
        )
        .toBeVisible();
    });

    it("offers no close to a person the core would not let discard them", async () => {
      const { screen } = await renderCard({
        discardable: 3,
        may_discard: true,
        discard_permitted: false,
      });

      await expect
        .element(screen.getByText("Ya podés descartar los tickets de respaldo"))
        .toBeVisible();
      await expect
        .element(screen.getByText("Tiralos. Este aviso lo cierra quien venda en esta caja."))
        .toBeVisible();
      expect(screen.getByRole("button", { name: "Cerrar" }).elements()).toHaveLength(0);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows no discard notice while the core does not allow it", async () => {
      const { screen } = await renderCard({ discardable: 3, may_discard: false });

      expect(borderColors(screen.container)).toEqual([]);
    });
  });

  it("shows every notice that applies, with only the discard notice closable", async () => {
    const { screen } = await renderCard({
      to_print: 1,
      missing_key: 1,
      discardable: 1,
      may_discard: true,
    });

    expect(borderColors(screen.container)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Cerrar" }).elements()).toHaveLength(1);
  });

  it("writes the ticket and operation counts with the thousands separator", async () => {
    const { screen } = await renderCard({
      to_print: 1500,
      awaiting_customer_document: 498,
      missing_key: 1998,
      discardable: 1998,
      may_discard: true,
    });

    await expect
      .element(
        screen.getByText(
          "1.998 tickets de respaldo de contingencia todavía no salieron de la impresora.",
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByText("La caja no tiene su clave de respaldo para 1.998 operaciones."))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Esta caja sincronizó con la nube todo lo de la contingencia: los 1.998 tickets guardados en la caja del local ya no hacen falta.",
        ),
      )
      .toBeVisible();
  });
});
