import type {
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, CashMovementKind } from "@purosur/domain";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CashMovementInput } from "../platform/core-client";
import { render } from "../shell/test-support/render-with-router";
import { RecordCashMovementModal } from "./record-cash-movement-modal";

const ADA: SignedInPerson = { user_id: "u1", first_name: "Ada", abilities: [] };
const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];
const RECORDED: RecordCashMovementOutcome = { kind: "recorded", authorized_by: null };
const PERMISSION_OF_KIND: Record<CashMovementKind, AuthorizablePermissionKey> = {
  CASH_IN: "record_cash_in",
  CASH_OUT: "record_cash_expense",
  WITHDRAWAL: "withdraw_cash",
};

function kindsLacking(lacking: CashMovementKind[]): RecordableCashMovementKinds {
  const needed = (kind: CashMovementKind) => ({
    permission: PERMISSION_OF_KIND[kind],
    authorization_required: lacking.includes(kind),
  });
  return {
    CASH_IN: needed("CASH_IN"),
    CASH_OUT: needed("CASH_OUT"),
    WITHDRAWAL: needed("WITHDRAWAL"),
  };
}

type Props = {
  open?: boolean;
  lacking?: CashMovementKind[];
  loadKinds?: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  registerName?: string | null;
  expectedCash?: number;
  outcome?: RecordCashMovementOutcome | Promise<RecordCashMovementOutcome>;
  recordCashMovement?: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
};

async function renderModal(props: Props = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const recordCashMovement = vi.fn(
    props.recordCashMovement ?? (async () => await (props.outcome ?? RECORDED)),
  );
  const requested: string[] = [];
  const loadKinds = vi.fn(props.loadKinds ?? (async () => kindsLacking(props.lacking ?? [])));
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return AUTHORIZERS;
  };
  const onClose = vi.fn();
  const onRecorded = vi.fn();
  const screen = await render(
    <RecordCashMovementModal
      open={props.open ?? true}
      person={ADA}
      registerName={props.registerName === undefined ? "Caja 1" : props.registerName}
      openedAt="2026-09-30T15:05:00.000Z"
      {...(props.expectedCash === undefined ? {} : { expectedCash: props.expectedCash })}
      loadKinds={loadKinds}
      loadAuthorizers={loadAuthorizers}
      recordCashMovement={recordCashMovement}
      onClose={onClose}
      onRecorded={onRecorded}
    />,
  );
  return { screen, recordCashMovement, requested, loadKinds, onClose, onRecorded };
}

type Screen = Awaited<ReturnType<typeof renderModal>>["screen"];

async function choose(screen: Screen, kind: "Ingreso" | "Gasto" | "Retiro") {
  await userEvent.click(screen.getByText(kind, { exact: true }));
}

async function fill(screen: Screen, amount: string, reason: string) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), amount);
  await userEvent.fill(screen.getByRole("textbox", { name: "Motivo" }), reason);
}

async function authorizeAs(screen: Screen, firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
}

describe("RecordCashMovementModal", () => {
  it("is not shown while closed", async () => {
    const { screen } = await renderModal({ open: false });

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the register and the Argentine time the session opened at", async () => {
    const { screen } = await renderModal();

    const dialog = screen.getByRole("dialog", { name: "Registrar un movimiento" });

    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog.getByText("Caja 1 · Sesión de las 12:05", { exact: true }))
      .toBeVisible();
    await expectNoAccessibilityViolations(document.body);
  });

  it("leaves the register out of the eyebrow while its name is unknown", async () => {
    const { screen } = await renderModal({ registerName: null });

    await expect.element(screen.getByText("Sesión de las 12:05", { exact: true })).toBeVisible();
  });

  it("offers the three kinds of movement, starting on Ingreso", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByRole("radio", { name: "Ingreso" })).toBeChecked();
    await expect.element(screen.getByText("Entra plata")).toBeVisible();
    await expect.element(screen.getByText("Se paga algo")).toBeVisible();
    await expect.element(screen.getByText("Sale a caja fuerte")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Registrar ingreso" })).toBeVisible();
  });

  it.each([
    ["Gasto", "Registrar gasto"],
    ["Retiro", "Registrar retiro"],
  ] as const)("names the action after the chosen %s", async (kind, action) => {
    const { screen } = await renderModal();

    await choose(screen, kind);

    await expect.element(screen.getByRole("button", { name: action })).toBeVisible();
  });

  it.each([
    ["Gasto", "Hay $ 12.500,00 en la caja antes de este gasto."],
    ["Retiro", "Hay $ 12.500,00 en la caja antes de este retiro."],
  ] as const)("says how much is in the drawer before a %s", async (kind, hint) => {
    const { screen } = await renderModal({ expectedCash: 1_250_000 });

    await choose(screen, kind);

    await expect.element(screen.getByText(hint)).toBeVisible();
  });

  it("says nothing about the drawer's cash for an Ingreso", async () => {
    const { screen } = await renderModal({ expectedCash: 1_250_000 });

    await expect.element(screen.getByText(/en la caja antes de/)).not.toBeInTheDocument();
  });

  it("says nothing about the drawer's cash while it is unknown", async () => {
    const { screen } = await renderModal();
    await choose(screen, "Gasto");

    await expect.element(screen.getByText(/en la caja antes de/)).not.toBeInTheDocument();
  });

  it("records the typed amount and the reason as typed, then reports it", async () => {
    const { screen, recordCashMovement, onRecorded } = await renderModal();
    await choose(screen, "Gasto");
    await fill(screen, "5.000,50", "  Flete  ");

    await userEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));

    expect(recordCashMovement).toHaveBeenCalledExactlyOnceWith({
      kind: "CASH_OUT",
      amount: 500_050,
      reason: "  Flete  ",
      authorization: undefined,
    });
    expect(onRecorded).toHaveBeenCalledOnce();
  });

  it.each([
    ["", "Ingresá el importe."],
    ["abc", "Ingresá un importe válido, por ejemplo 5.000,00."],
    ["0", "Ingresá un importe válido, por ejemplo 5.000,00."],
  ])("refuses the amount %j before recording anything", async (typed, message) => {
    const { screen, recordCashMovement } = await renderModal();
    await fill(screen, typed, "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByText(message)).toBeVisible();
    expect(recordCashMovement).not.toHaveBeenCalled();
  });

  it("leaves judging a blank reason to the core", async () => {
    const { screen, recordCashMovement } = await renderModal({
      outcome: { kind: "invalid_reason", max_length: 200 },
    });
    await fill(screen, "100", "   ");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect
      .element(screen.getByText("Escribí el motivo (hasta 200 caracteres)."))
      .toBeVisible();
    expect(recordCashMovement).toHaveBeenCalledExactlyOnceWith({
      kind: "CASH_IN",
      amount: 10_000,
      reason: "   ",
      authorization: undefined,
    });
  });

  it.each([
    [{ kind: "invalid_amount" }, "Ingresá un importe válido, por ejemplo 5.000,00."],
    [{ kind: "invalid_reason", max_length: 150 }, "Escribí el motivo (hasta 150 caracteres)."],
  ] as const)("shows the core's refusal %j beside its field", async (outcome, message) => {
    const { screen, onRecorded } = await renderModal({ outcome });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByText(message)).toBeVisible();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("tells how much cash is expected beside the amount when the core refuses it as more than that", async () => {
    const { screen, onRecorded } = await renderModal({
      outcome: { kind: "exceeds_expected_cash", expected: 4_200_000 },
    });
    await choose(screen, "Retiro");
    await fill(screen, "50.000", "Caja fuerte");

    await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

    await expect
      .element(screen.getByText("No hay tanto efectivo en la caja: se esperan $ 42.000,00."))
      .toBeVisible();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("tells the drawer's cash counted by the core's refusal once the amount is corrected", async () => {
    const { screen } = await renderModal({
      expectedCash: 1_250_000,
      outcome: { kind: "exceeds_expected_cash", expected: 4_200_000 },
    });
    await choose(screen, "Retiro");
    await fill(screen, "50.000", "Caja fuerte");

    await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await expect
      .element(screen.getByText("No hay tanto efectivo en la caja: se esperan $ 42.000,00."))
      .toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), "40.000");

    await expect
      .element(screen.getByText("Hay $ 42.000,00 en la caja antes de este retiro."))
      .toBeVisible();
    await expect
      .element(screen.getByText("Hay $ 12.500,00 en la caja antes de este retiro."))
      .not.toBeInTheDocument();
  });

  it("drops the expected cash refusal on switching to an Ingreso, which has no such limit", async () => {
    const { screen } = await renderModal({
      outcome: { kind: "exceeds_expected_cash", expected: 4_200_000 },
    });
    await choose(screen, "Retiro");
    await fill(screen, "50.000", "Caja fuerte");
    await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
    const refusal = screen.getByText("No hay tanto efectivo en la caja: se esperan $ 42.000,00.");
    await expect.element(refusal).toBeVisible();

    await choose(screen, "Ingreso");

    await expect.element(refusal).not.toBeInTheDocument();
  });

  it("clears a field's message as it is typed into again", async () => {
    const { screen } = await renderModal();
    await fill(screen, "", "Cambio");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
    await expect.element(screen.getByText("Ingresá el importe.")).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), "1");

    await expect.element(screen.getByText("Ingresá el importe.")).not.toBeInTheDocument();
  });

  it("keeps the amount's message while its edited value is still invalid and clears it once it is valid", async () => {
    const { screen } = await renderModal();
    await fill(screen, "abc", "Cambio");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
    const amount = screen.getByRole("textbox", { name: "Importe" });
    const invalidAmount = screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00.");
    await expect.element(invalidAmount).toBeVisible();

    await userEvent.fill(amount, "abd");
    await expect.element(invalidAmount).toBeVisible();

    await userEvent.fill(amount, "100");
    await expect.element(invalidAmount).not.toBeInTheDocument();
  });

  it("says when there is no open session to record into", async () => {
    const { screen, onRecorded } = await renderModal({ outcome: { kind: "no_open_session" } });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByRole("alert")).toHaveTextContent("No hay una caja abierta.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("says the movement was not recorded when the core reports it unavailable", async () => {
    const { screen, onRecorded } = await renderModal({ outcome: { kind: "unavailable" } });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect
      .poll(() => screen.getByRole("alert").query()?.textContent)
      .toBe("No se pudo registrar el movimiento. Probá de nuevo.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("says the signed-in person no longer holds the kind's permission", async () => {
    const { screen, onRecorded } = await renderModal({ outcome: { kind: "lacks_permission" } });
    await choose(screen, "Gasto");
    await fill(screen, "100", "Flete");

    await userEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));

    await expect
      .poll(() => screen.getByRole("alert").query()?.textContent)
      .toBe("Ya no tenés permiso para registrar gastos.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("says the movement was not recorded when the core no longer finds anyone signed in", async () => {
    const { screen, onRecorded } = await renderModal({ outcome: { kind: "not_signed_in" } });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect
      .poll(() => screen.getByRole("alert").query()?.textContent)
      .toBe("No se pudo registrar el movimiento. Probá de nuevo.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("says when the core could not be reached, and allows trying again", async () => {
    const { screen, recordCashMovement, onRecorded } = await renderModal({
      recordCashMovement: async () => {
        throw new Error("core down");
      },
    });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo registrar el movimiento. Probá de nuevo.");
    await expect.element(screen.getByRole("button", { name: "Registrar ingreso" })).toBeEnabled();
    expect(onRecorded).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
    expect(recordCashMovement).toHaveBeenCalledTimes(2);
  });

  it("holds every control while the movement is being recorded", async () => {
    let finish: (outcome: RecordCashMovementOutcome) => void = () => undefined;
    const pending = new Promise<RecordCashMovementOutcome>((resolve) => {
      finish = resolve;
    });
    const { screen, recordCashMovement } = await renderModal({ outcome: pending });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByRole("button", { name: "Registrar ingreso" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toBeDisabled();
    await choose(screen, "Gasto");
    await expect.element(screen.getByRole("radio", { name: "Ingreso" })).toBeChecked();
    expect(recordCashMovement).toHaveBeenCalledOnce();
    finish(RECORDED);
  });

  it("cannot be closed while the movement is being recorded", async () => {
    let finish: (outcome: RecordCashMovementOutcome) => void = () => undefined;
    const pending = new Promise<RecordCashMovementOutcome>((resolve) => {
      finish = resolve;
    });
    const { screen, onClose } = await renderModal({ outcome: pending });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByRole("button", { name: "Registrar ingreso" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Cerrar" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    finish(RECORDED);
  });

  it("closes without recording on Cancelar and on the close button", async () => {
    const { screen, onClose, recordCashMovement } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(recordCashMovement).not.toHaveBeenCalled();
  });

  it("asks no authorizer when the core says none is needed", async () => {
    const { screen, requested } = await renderModal({ lacking: [] });

    await choose(screen, "Retiro");

    await expect.element(screen.getByRole("button", { name: "Registrar retiro" })).toBeVisible();
    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    expect(requested).toEqual([]);
  });

  it("asks for an authorizer when the core says one is needed", async () => {
    const { screen, requested } = await renderModal({
      lacking: ["WITHDRAWAL"],
    });

    await choose(screen, "Retiro");

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Registrar retiro" })).toBeDisabled();
    expect(requested).toEqual(["withdraw_cash"]);
  });

  it("asks the core which movements can be recorded, once, when it opens", async () => {
    const { screen, loadKinds } = await renderModal();

    await expect.element(screen.getByRole("radio", { name: "Ingreso" })).toBeVisible();
    expect(loadKinds).toHaveBeenCalledOnce();
  });

  it("offers no movement to record until the core answers, and lets the cashier cancel", async () => {
    let answer: (kinds: RecordableCashMovementKinds) => void = () => {};
    const { screen, onClose } = await renderModal({
      loadKinds: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });

    await expect
      .element(screen.getByRole("dialog", { name: "Registrar un movimiento" }))
      .toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ingreso" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    answer(kindsLacking([]));
    await expect.element(screen.getByRole("radio", { name: "Ingreso" })).toBeVisible();
  });

  it.each([
    ["is unavailable", async () => "unavailable" as const],
    ["fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])(
    "says what can be recorded could not be loaded when the core %s, and asks again on retry",
    async (_case, failing) => {
      const answers = [failing, async () => kindsLacking([])];
      const { screen, loadKinds } = await renderModal({
        loadKinds: () => {
          const next = answers.shift();
          if (next === undefined) {
            throw new Error("no answer left");
          }
          return next();
        },
      });

      await expect
        .element(screen.getByText("No se pudieron cargar los movimientos que podés registrar"))
        .toBeVisible();
      await expect.element(screen.getByRole("radio", { name: "Ingreso" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await expect.element(screen.getByRole("radio", { name: "Ingreso" })).toBeVisible();
      expect(loadKinds).toHaveBeenCalledTimes(2);
    },
  );

  describe("when the signed-in person lacks the kind's permission", () => {
    it("asks for someone with that permission only for the kind that needs it", async () => {
      const { screen, requested } = await renderModal({
        lacking: ["WITHDRAWAL"],
      });
      await expect
        .element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO"))
        .not.toBeInTheDocument();

      await choose(screen, "Retiro");

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await expect
        .element(screen.getByText("Ada no tiene permiso para retirar efectivo a la caja fuerte."))
        .toBeVisible();
      expect(requested).toEqual(["withdraw_cash"]);
    });

    it("asks again for the new kind's permission after the kind changes", async () => {
      const { screen, requested } = await renderModal({
        lacking: ["CASH_OUT", "WITHDRAWAL"],
      });
      await choose(screen, "Gasto");
      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await authorizeAs(screen, "Sofía", "1234");

      await choose(screen, "Retiro");

      await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
      expect(requested).toEqual(["record_cash_expense", "withdraw_cash"]);
    });

    it("asks for the authorizers of the permission the core names for the kind", async () => {
      const { screen, requested } = await renderModal({
        loadKinds: async () => ({
          ...kindsLacking([]),
          WITHDRAWAL: {
            permission: "close_anothers_register_session",
            authorization_required: true,
          },
        }),
      });

      await choose(screen, "Retiro");

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      expect(requested).toEqual(["close_anothers_register_session"]);
    });

    it("keeps the button disabled until someone authorizes, then sends who and their PIN", async () => {
      const { screen, recordCashMovement } = await renderModal({
        lacking: ["WITHDRAWAL"],
      });
      await choose(screen, "Retiro");
      await fill(screen, "100", "Fin de turno");
      await expect.element(screen.getByRole("button", { name: "Registrar retiro" })).toBeDisabled();

      await authorizeAs(screen, "Sofía", "1234");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      expect(recordCashMovement).toHaveBeenCalledExactlyOnceWith({
        kind: "WITHDRAWAL",
        amount: 10_000,
        reason: "Fin de turno",
        authorization: { user_id: "u3", pin: "1234" },
      });
    });

    it("shows the PIN refusal and stays open", async () => {
      const { screen, onRecorded } = await renderModal({
        lacking: ["WITHDRAWAL"],
        outcome: { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 6 },
      });
      await choose(screen, "Retiro");
      await fill(screen, "100", "Fin de turno");
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      expect(onRecorded).not.toHaveBeenCalled();
    });

    it("says the movement was not recorded when the core is unavailable, not that the PIN failed", async () => {
      const { screen, onRecorded } = await renderModal({
        lacking: ["WITHDRAWAL"],
        outcome: { kind: "unavailable" },
      });
      await choose(screen, "Retiro");
      await fill(screen, "100", "Fin de turno");
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await expect
        .poll(() => screen.getByRole("alert").query()?.textContent)
        .toBe("No se pudo registrar el movimiento. Probá de nuevo.");
      await expect.element(screen.getByText("No se pudo verificar el PIN")).not.toBeInTheDocument();
      expect(onRecorded).not.toHaveBeenCalled();
    });

    it("says the authorizer cannot authorize the movement when the core refuses their permission", async () => {
      const { screen, onRecorded } = await renderModal({
        lacking: ["WITHDRAWAL"],
        outcome: { kind: "lacks_permission" },
      });
      await choose(screen, "Retiro");
      await fill(screen, "100", "Fin de turno");
      await authorizeAs(screen, "Sofía", "1234");

      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await expect
        .element(screen.getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
      await expect.element(screen.getByText(/Ya no tenés permiso/)).not.toBeInTheDocument();
      expect(onRecorded).not.toHaveBeenCalled();
    });
  });
});
