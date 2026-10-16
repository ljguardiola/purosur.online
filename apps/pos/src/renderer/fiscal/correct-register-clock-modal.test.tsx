import type { CorrectRegisterClockOutcome, ReadClockGuardOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { deferred } from "../platform/test-support/deferred";
import { CorrectRegisterClockModal } from "./correct-register-clock-modal";

type Guard = Extract<ReadClockGuardOutcome, { kind: "read" }>;

const GUARD: Guard = {
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

type Correct = () => Promise<CorrectRegisterClockOutcome>;

async function renderModal(
  options: { correct?: Correct; guard?: Guard; cashSessionOpen?: boolean } = {},
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const correct = vi.fn<Correct>(
    options.correct ??
      (async () => ({
        kind: "corrected",
        lowerings: [
          {
            point_of_sale: 3,
            document_type: "factura_c",
            previous_reading: "2026-09-16T11:31:00.000Z",
            corrected_reading: "2026-09-15T09:10:00.000Z",
          },
        ],
      })),
  );
  const handlers = {
    onCorrected: vi.fn(),
    onRefused: vi.fn(),
    onSessionInvalid: vi.fn(),
    onClose: vi.fn(),
  };
  const screen = await render(
    <CorrectRegisterClockModal
      registerName="Caja 1"
      cashSessionOpen={options.cashSessionOpen ?? true}
      guard={options.guard ?? GUARD}
      correctRegisterClock={correct}
      {...handlers}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "No se pueden emitir comprobantes" });
  return { screen, dialog, correct, ...handlers };
}

function confirmButton(dialog: Awaited<ReturnType<typeof renderModal>>["dialog"]) {
  return dialog.getByRole("button", { name: "La hora de la caja es correcta" });
}

describe("CorrectRegisterClockModal", () => {
  it("shows why the register does not issue, both readings, what to do and that it can be confirmed once per cash session", async () => {
    const { screen, dialog } = await renderModal();

    await expect.element(dialog.getByText("Caja 1 · Punto de venta 00003")).toBeVisible();
    await expect
      .element(
        dialog.getByText(
          "La hora de la caja quedó atrás de la del último comprobante emitido, así que la caja no emite hasta que la hora sea correcta.",
        ),
      )
      .toBeVisible();
    await expect.element(dialog.getByText("Hora de la caja")).toBeVisible();
    await expect.element(dialog.getByText("15/09/2026 · 09:10")).toBeVisible();
    await expect.element(dialog.getByText("Último comprobante")).toBeVisible();
    await expect.element(dialog.getByText("16/09/2026 · 11:31")).toBeVisible();
    await expect
      .element(dialog.getByText("Fijate en otro reloj confiable qué hora es."))
      .toBeVisible();
    await expect
      .element(
        dialog.getByText("Si la hora de la caja está mal, corregila en Windows y volvé a probar."),
      )
      .toBeVisible();
    await expect
      .element(dialog.getByText("Si la hora de la caja es la correcta, confirmalo acá abajo."))
      .toBeVisible();
    await expect
      .element(dialog.getByText("Se puede confirmar una sola vez por sesión de caja").first())
      .toBeVisible();
    await expect
      .element(dialog.getByText("Si la hora vuelve a atrasar, corregila en Windows."))
      .not.toBeInTheDocument();
    await expect.element(confirmButton(dialog)).toBeEnabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says it can be confirmed once until the next opening when no cash session is open", async () => {
    const { dialog } = await renderModal({ cashSessionOpen: false });

    await expect
      .element(
        dialog
          .getByText("Se puede confirmar una sola vez hasta la próxima apertura de caja")
          .first(),
      )
      .toBeVisible();
  });

  it("shows the day the tax authority last authorized when no document was issued by this register", async () => {
    const { dialog } = await renderModal({
      guard: {
        ...GUARD,
        blocks: [
          {
            point_of_sale: 3,
            document_type: "factura_c",
            latest_reading: null,
            tax_authority_last_authorized_issued_on: "2026-09-16",
          },
        ],
      },
    });

    await expect.element(dialog.getByText("16/09/2026", { exact: true })).toBeVisible();
  });

  it("tells it was already used in this cash session and keeps the confirmation disabled", async () => {
    const { dialog, correct } = await renderModal({
      guard: { ...GUARD, correction: "already_corrected_in_period" },
    });

    await expect
      .element(dialog.getByText("Ya se confirmó la hora en esta sesión de caja").first())
      .toBeVisible();
    await expect
      .element(dialog.getByText("Si la hora sigue mal, corregila en Windows."))
      .not.toBeInTheDocument();
    await expect.element(confirmButton(dialog)).toBeDisabled();
    expect(correct).not.toHaveBeenCalled();
  });

  it("does not tell the confirmation was already used when the register holds nothing it can lower", async () => {
    const { dialog } = await renderModal({ guard: { ...GUARD, correction: "not_behind" } });

    await expect
      .element(dialog.getByText("Se puede confirmar una sola vez por sesión de caja").first())
      .toBeVisible();
    await expect
      .element(dialog.getByText("Ya se confirmó la hora en esta sesión de caja"))
      .not.toBeInTheDocument();
  });

  it("does not say whom the confirmation is told to", async () => {
    const { dialog } = await renderModal();

    await expect
      .element(dialog.getByText("Se puede confirmar una sola vez por sesión de caja").first())
      .toBeVisible();
    await expect
      .element(dialog.getByText("Le avisa al Administrador quién lo confirmó."))
      .not.toBeInTheDocument();
  });

  it("tells it was already used since the last cash session closed when none is open", async () => {
    const { dialog } = await renderModal({
      cashSessionOpen: false,
      guard: { ...GUARD, correction: "already_corrected_in_period" },
    });

    await expect
      .element(
        dialog
          .getByText("Ya se confirmó la hora desde que se cerró la última sesión de caja")
          .first(),
      )
      .toBeVisible();
  });

  it("sends one request when the confirmation is pressed twice before the modal shows it is sending", async () => {
    const answer = deferred<CorrectRegisterClockOutcome>();
    const { dialog, correct, onCorrected } = await renderModal({ correct: () => answer.promise });
    const confirm = confirmButton(dialog).element() as HTMLElement;

    confirm.click();
    confirm.click();
    answer.resolve({
      kind: "corrected",
      lowerings: [
        {
          point_of_sale: 3,
          document_type: "factura_c",
          previous_reading: "2026-09-16T11:31:00.000Z",
          corrected_reading: "2026-09-15T09:10:00.000Z",
        },
      ],
    });

    await vi.waitFor(() => expect(onCorrected).toHaveBeenCalled());
    expect(correct).toHaveBeenCalledOnce();
  });

  it("tells the screen the clock was confirmed", async () => {
    const { dialog, onCorrected, onRefused } = await renderModal();

    await userEvent.click(confirmButton(dialog));

    expect(onCorrected).toHaveBeenCalledOnce();
    expect(onRefused).not.toHaveBeenCalled();
  });

  it("closes without asking the core when going back", async () => {
    const { dialog, correct, onClose } = await renderModal();

    await userEvent.click(dialog.getByRole("button", { name: "Volver" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(correct).not.toHaveBeenCalled();
  });

  it.each<[CorrectRegisterClockOutcome, string]>([
    [{ kind: "not_behind" }, "La hora de la caja ya no está atrasada"],
    [{ kind: "already_corrected_in_period" }, "Ya se confirmó la hora en esta sesión de caja"],
    [{ kind: "not_permitted" }, "No tenés permiso para confirmar la hora de la caja"],
  ])(
    "tells the person and the screen when the core answers %j, and does not offer to confirm again",
    async (outcome, message) => {
      const { dialog, onRefused, onCorrected } = await renderModal({
        correct: async () => outcome,
      });

      await userEvent.click(confirmButton(dialog));

      await expect.element(dialog.getByText(message).first()).toBeVisible();
      expect(onRefused).toHaveBeenCalledOnce();
      expect(onCorrected).not.toHaveBeenCalled();
      await expect.element(confirmButton(dialog)).toBeDisabled();
    },
  );

  it("tells the confirmation could not be made and lets the person try again", async () => {
    const answers: CorrectRegisterClockOutcome[] = [
      { kind: "unavailable" },
      {
        kind: "corrected",
        lowerings: [
          {
            point_of_sale: 3,
            document_type: "factura_c",
            previous_reading: "2026-09-16T11:31:00.000Z",
            corrected_reading: "2026-09-15T09:10:00.000Z",
          },
        ],
      },
    ];
    const { dialog, onCorrected } = await renderModal({
      correct: async () => answers.shift() ?? { kind: "unavailable" },
    });

    await userEvent.click(confirmButton(dialog));
    await expect
      .element(dialog.getByText("No se pudo confirmar la hora. Probá de nuevo.").first())
      .toBeVisible();
    await userEvent.click(confirmButton(dialog));

    await vi.waitFor(() => expect(onCorrected).toHaveBeenCalledOnce());
  });

  it("treats a failed request as the core being unavailable", async () => {
    const { dialog } = await renderModal({
      correct: async () => {
        throw new Error("port closed");
      },
    });

    await userEvent.click(confirmButton(dialog));

    await expect
      .element(dialog.getByText("No se pudo confirmar la hora. Probá de nuevo.").first())
      .toBeVisible();
  });

  it("tells the screen the session is no longer valid", async () => {
    const { dialog, onSessionInvalid } = await renderModal({
      correct: async () => ({ kind: "not_signed_in" }),
    });

    await userEvent.click(confirmButton(dialog));

    expect(onSessionInvalid).toHaveBeenCalledOnce();
  });
});
