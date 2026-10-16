import type { CorrectRegisterClockOutcome, ReadClockGuardOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import { render } from "../shell/test-support/render-with-router";
import { ClockGuardOffer } from "./clock-guard-offer";

type Read = Extract<ReadClockGuardOutcome, { kind: "read" }>;

const BLOCKED: Read = {
  kind: "read",
  reading: "2026-09-15T09:10:00.000-03:00",
  blocks: [
    {
      point_of_sale: 3,
      document_type: "factura_c",
      latest_reading: "2026-09-16T11:31:00.000-03:00",
      tax_authority_last_authorized_issued_on: null,
    },
  ],
  may_correct: true,
  correction: "available",
};

const CORRECTED: CorrectRegisterClockOutcome = {
  kind: "corrected",
  lowerings: [
    {
      point_of_sale: 3,
      document_type: "factura_c",
      previous_reading: "2026-09-16T11:31:00.000Z",
      corrected_reading: "2026-09-15T09:10:00.000Z",
    },
  ],
};

async function renderOffer(
  reads: ReadClockGuardOutcome[] | (() => Promise<ReadClockGuardOutcome>),
  correct: () => Promise<CorrectRegisterClockOutcome> = async () => CORRECTED,
) {
  await page.viewport(1280, 900);
  const readClockGuard = vi.fn(
    typeof reads === "function"
      ? reads
      : async () => reads.shift() ?? ({ kind: "unavailable" } as const),
  );
  const correctRegisterClock = vi.fn(correct);
  const onSessionInvalid = vi.fn();
  const screen = await render(
    <ClockGuardOffer
      registerName="Caja 1"
      cashSessionOpen={false}
      readClockGuard={readClockGuard}
      correctRegisterClock={correctRegisterClock}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return { screen, readClockGuard, correctRegisterClock, onSessionInvalid };
}

describe("ClockGuardOffer", () => {
  it("tells that invoices are not issued while the clock lags, that selling goes on, and offers to correct the clock", async () => {
    const { screen } = await renderOffer([BLOCKED]);

    await expect.element(screen.getByText("El reloj de la caja atrasa")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Mientras tanto no se emiten facturas. Se puede vender igual: la factura sale cuando se corrige.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Corregir el reloj" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("informs without the action to a person who may not correct the clock", async () => {
    const { screen } = await renderOffer([{ ...BLOCKED, may_correct: false }]);

    await expect.element(screen.getByText("El reloj de la caja atrasa")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Corregir el reloj" }))
      .not.toBeInTheDocument();
  });

  it("informs without the action when the register holds nothing a correction can lower", async () => {
    const { screen } = await renderOffer([
      {
        ...BLOCKED,
        blocks: [
          {
            point_of_sale: 3,
            document_type: "factura_c",
            latest_reading: null,
            tax_authority_last_authorized_issued_on: "2026-09-16",
          },
        ],
        correction: "not_behind",
      },
    ]);

    await expect.element(screen.getByText("El reloj de la caja atrasa")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Corregir el reloj" }))
      .not.toBeInTheDocument();
  });

  it("offers the action when the period's correction was already made, to tell it in the correction", async () => {
    const { screen } = await renderOffer([
      { ...BLOCKED, correction: "already_corrected_in_period" },
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Corregir el reloj" }));

    await expect
      .element(
        screen
          .getByText("Ya se confirmó la hora desde que se cerró la última sesión de caja")
          .first(),
      )
      .toBeVisible();
  });

  it("shows nothing while the clock guard blocks nothing", async () => {
    const { screen, readClockGuard } = await renderOffer([{ ...BLOCKED, blocks: [] }]);

    await vi.waitFor(() => expect(readClockGuard).toHaveBeenCalled());
    await expect.element(screen.getByText("El reloj de la caja atrasa")).not.toBeInTheDocument();
  });

  it("shows nothing while the core has not answered", async () => {
    const pending = deferred<ReadClockGuardOutcome>();
    const { screen } = await renderOffer(() => pending.promise);

    await expect.element(screen.getByText("El reloj de la caja atrasa")).not.toBeInTheDocument();
  });

  it("shows nothing when the core cannot answer", async () => {
    const { screen, readClockGuard } = await renderOffer([{ kind: "unavailable" }]);

    await vi.waitFor(() => expect(readClockGuard).toHaveBeenCalled());
    await expect.element(screen.getByText("El reloj de la caja atrasa")).not.toBeInTheDocument();
  });

  it("opens the correction with the register, the point of sale and the readings", async () => {
    const { screen } = await renderOffer([BLOCKED]);

    await userEvent.click(screen.getByRole("button", { name: "Corregir el reloj" }));

    const dialog = screen.getByRole("dialog", { name: "No se pueden emitir comprobantes" });
    await expect.element(dialog.getByText("Caja 1 · Punto de venta 00003")).toBeVisible();
    await expect.element(dialog.getByText("15/09/2026 · 09:10")).toBeVisible();
    await expect
      .element(
        dialog
          .getByText("Se puede confirmar una sola vez hasta la próxima apertura de caja")
          .first(),
      )
      .toBeVisible();
  });

  it("closes the correction and reads the clock guard again once the clock is confirmed, telling it", async () => {
    const { screen, readClockGuard, correctRegisterClock } = await renderOffer([
      BLOCKED,
      { ...BLOCKED, blocks: [] },
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Corregir el reloj" }));

    await userEvent.click(screen.getByRole("button", { name: "La hora de la caja es correcta" }));

    expect(correctRegisterClock).toHaveBeenCalledOnce();
    await expect.element(screen.getByText("La hora de la caja quedó confirmada")).toBeVisible();
    await expect.element(screen.getByText("Las facturas se emiten de nuevo.")).toBeVisible();
    await expect
      .element(screen.getByRole("dialog", { name: "No se pueden emitir comprobantes" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("El reloj de la caja atrasa")).not.toBeInTheDocument();
    expect(readClockGuard).toHaveBeenCalledTimes(2);
  });

  it("shows no confirmation notification when the clock guard still blocks after the clock is confirmed", async () => {
    const { screen, readClockGuard } = await renderOffer([
      BLOCKED,
      {
        ...BLOCKED,
        blocks: [
          {
            point_of_sale: 3,
            document_type: "factura_c",
            latest_reading: null,
            tax_authority_last_authorized_issued_on: "2026-09-16",
          },
        ],
        correction: "not_behind",
      },
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Corregir el reloj" }));

    await userEvent.click(screen.getByRole("button", { name: "La hora de la caja es correcta" }));

    await expect
      .element(screen.getByRole("dialog", { name: "No se pueden emitir comprobantes" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Corregir el reloj" }))
      .not.toBeInTheDocument();
    expect(readClockGuard).toHaveBeenCalledTimes(2);
    await expect.element(screen.getByText("El reloj de la caja atrasa")).toBeVisible();
    expect(screen.getByText("La hora de la caja quedó confirmada").query()).toBeNull();
  });

  it("keeps the correction open with the refusal and reads the clock guard again when the clock is no longer behind", async () => {
    const { screen, readClockGuard } = await renderOffer(
      [BLOCKED, { ...BLOCKED, blocks: [] }],
      async () => ({ kind: "not_behind" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Corregir el reloj" }));

    await userEvent.click(screen.getByRole("button", { name: "La hora de la caja es correcta" }));

    const dialog = screen.getByRole("dialog", { name: "No se pueden emitir comprobantes" });
    await expect
      .element(dialog.getByText("La hora de la caja ya no está atrasada").first())
      .toBeVisible();
    await vi.waitFor(() => expect(readClockGuard).toHaveBeenCalledTimes(2));
  });

  it("tells the screen the session is no longer valid", async () => {
    const { screen, onSessionInvalid } = await renderOffer([BLOCKED], async () => ({
      kind: "not_signed_in",
    }));
    await userEvent.click(screen.getByRole("button", { name: "Corregir el reloj" }));

    await userEvent.click(screen.getByRole("button", { name: "La hora de la caja es correcta" }));

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });
});
