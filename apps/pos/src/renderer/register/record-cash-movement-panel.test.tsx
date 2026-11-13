import type {
  CashMovementPreview,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, CashMovementKind } from "@purosur/domain";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CashMovementInput } from "../platform/core-client";
import type { SignedInPerson } from "../shell/signed-in-person";
import {
  authorizationDialog,
  authorizeInModal,
} from "../shell/test-support/authorization-modal-steps";
import { render } from "../shell/test-support/render-with-router";
import { RecordCashMovementPanel } from "./record-cash-movement-panel";

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
  kind?: CashMovementKind;
  lacking?: CashMovementKind[];
  loadKinds?: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  expectedCash?: number;
  outcome?: RecordCashMovementOutcome | Promise<RecordCashMovementOutcome>;
  recordCashMovement?: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
  readPreview?: (movement: {
    kind: CashMovementKind;
    amount: number;
  }) => Promise<CashMovementPreview | null | "unavailable">;
};

const KIND_NAMES = { CASH_IN: "Ingreso", CASH_OUT: "Gasto", WITHDRAWAL: "Retiro" } as const;

async function renderPanel(props: Props = {}) {
  await page.viewport(1366, 768);
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
  const readPreview = vi.fn(props.readPreview ?? (async () => null));
  const onClose = vi.fn();
  const onRecorded = vi.fn();
  const screen = await render(
    <RecordCashMovementPanel
      kind={props.kind ?? "CASH_IN"}
      sessionId="s1"
      person={ADA}
      {...(props.expectedCash === undefined ? {} : { expectedCash: props.expectedCash })}
      loadKinds={loadKinds}
      loadAuthorizers={loadAuthorizers}
      recordCashMovement={recordCashMovement}
      readPreview={readPreview}
      onClose={onClose}
      onRecorded={onRecorded}
    />,
  );
  return { screen, recordCashMovement, requested, loadKinds, readPreview, onClose, onRecorded };
}

type Screen = Awaited<ReturnType<typeof renderPanel>>["screen"];

async function fill(screen: Screen, amount: string, reason: string, keys = false) {
  if (keys) {
    await userEvent.clear(screen.getByRole("textbox", { name: "Importe" }));
    await userEvent.keyboard(amount);
  } else {
    await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), amount);
  }
  await userEvent.fill(screen.getByRole("textbox", { name: "Motivo" }), reason);
}

function noticeIconOf(alert: Element): SVGElement | null {
  let frame: Element | null = alert;
  while (frame !== null && frame.querySelector("svg") === null) {
    frame = frame.parentElement;
  }
  return frame?.querySelector("svg") ?? null;
}

describe("RecordCashMovementPanel", () => {
  it.each(["CASH_IN", "CASH_OUT", "WITHDRAWAL"] as const)(
    "is headed with the name of the %s and closes with Esc, offering no way to change the kind",
    async (kind) => {
      const { screen, onClose } = await renderPanel({ kind });

      await expect
        .element(screen.getByRole("heading", { name: KIND_NAMES[kind], exact: true }))
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
      await expect.element(screen.getByRole("radio")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Tipo de movimiento")).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledOnce();
      await expectNoAccessibilityViolations(screen.container);
    },
  );

  it("closes without recording on the close button, and has no Cancelar button", async () => {
    const { screen, onClose, recordCashMovement } = await renderPanel();

    await expect.element(screen.getByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(recordCashMovement).not.toHaveBeenCalled();
  });

  it("shows the expected cash as the first figure under the eyebrow EFECTIVO ESPERADO", async () => {
    const { screen } = await renderPanel({ expectedCash: 14_420_000 });

    await expect.element(screen.getByText("EFECTIVO ESPERADO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 144.200,00", { exact: true })).toBeVisible();
  });

  it("shows no figure while the expected cash is unknown", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("EFECTIVO ESPERADO")).not.toBeInTheDocument();
  });

  it("starts with the focus on Importe, a decimal field, followed by Motivo", async () => {
    const { screen } = await renderPanel();

    const amount = screen.getByRole("textbox", { name: "Importe" });
    await expect.element(amount).toHaveFocus();
    await expect.element(amount).toHaveAttribute("inputmode", "decimal");
    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).toBeVisible();
  });

  it("moves between Importe and Motivo with Tab and Shift+Tab", async () => {
    const { screen } = await renderPanel();

    await userEvent.keyboard("{Tab}");
    await expect.element(screen.getByRole("textbox", { name: "Motivo" })).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveFocus();
  });

  it("shows only the Esc and Enter keys, with no letter keycap at Importe or Motivo", async () => {
    const { screen } = await renderPanel({ expectedCash: 14_420_000 });
    await expect.element(screen.getByRole("button", { name: "Registrar ingreso" })).toBeVisible();

    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["Esc", "Enter"]);
  });

  it.each([
    ["CASH_IN", "Registrar ingreso"],
    ["CASH_OUT", "Registrar gasto"],
    ["WITHDRAWAL", "Registrar retiro"],
  ] as const)("names the action of a %s", async (kind, action) => {
    const { screen } = await renderPanel({ kind });

    await expect.element(screen.getByRole("button", { name: action })).toBeVisible();
  });

  it("records the typed amount and the reason as typed with Enter, then reports it", async () => {
    const { screen, recordCashMovement, onRecorded } = await renderPanel({ kind: "CASH_OUT" });
    await fill(screen, "5000,50", "  Flete  ");

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => onRecorded.mock.calls.length).toBe(1);
    expect(recordCashMovement).toHaveBeenCalledExactlyOnceWith({
      kind: "CASH_OUT",
      amount: 500_050,
      reason: "  Flete  ",
      authorization: undefined,
    });
  });

  it("records from Enter pressed in Importe and from the submit button", async () => {
    const { screen, recordCashMovement } = await renderPanel({ kind: "CASH_OUT" });
    await fill(screen, "100", "Flete");
    await userEvent.click(screen.getByRole("textbox", { name: "Importe" }));

    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));

    await expect.poll(() => recordCashMovement.mock.calls.length).toBe(2);
  });

  it.each([
    ["", "Ingresá el importe.", false],
    ["5,", "Ingresá un importe válido, por ejemplo 5.000,00.", true],
  ])("refuses the amount %j before recording anything", async (typed, message, keys) => {
    const { screen, recordCashMovement } = await renderPanel();
    await fill(screen, typed, "Cambio", keys);

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByText(message)).toBeVisible();
    expect(recordCashMovement).not.toHaveBeenCalled();
  });

  it("sends an amount of zero to the core and shows its refusal on the field", async () => {
    const { screen, recordCashMovement } = await renderPanel({
      outcome: { kind: "invalid_amount" },
    });
    await fill(screen, "0", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(recordCashMovement).toHaveBeenCalledOnce();
  });

  it("leaves judging a blank reason to the core", async () => {
    const { screen, recordCashMovement } = await renderPanel({
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
    const { screen, onRecorded } = await renderPanel({ outcome });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByText(message)).toBeVisible();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("clears a field's message as it is typed into again", async () => {
    const { screen } = await renderPanel();
    await fill(screen, "", "Cambio");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
    await expect.element(screen.getByText("Ingresá el importe.")).toBeVisible();

    await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), "1");

    await expect.element(screen.getByText("Ingresá el importe.")).not.toBeInTheDocument();
  });

  it("keeps the amount's message while its edited value is still invalid and clears it once it is valid", async () => {
    const { screen } = await renderPanel();
    await fill(screen, "5,", "Cambio", true);
    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
    const amount = screen.getByRole("textbox", { name: "Importe" });
    const invalidAmount = screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00.");
    await expect.element(invalidAmount).toBeVisible();

    await userEvent.clear(amount);
    await userEvent.keyboard("6,");
    await expect.element(invalidAmount).toBeVisible();

    await userEvent.fill(amount, "100");
    await expect.element(invalidAmount).not.toBeInTheDocument();
  });

  it("groups thousands and takes a typed dot as the decimal comma", async () => {
    const { screen } = await renderPanel();
    const field = screen.getByRole("textbox", { name: "Importe" });
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });

  describe("the cash left", () => {
    it("is hidden while Importe is empty or invalid, and nothing is asked of the core", async () => {
      const { screen, readPreview } = await renderPanel({
        kind: "CASH_OUT",
        readPreview: async () => ({ kind: "remaining", cash: 12_570_000 }),
      });

      await expect.element(screen.getByRole("textbox", { name: "Importe" })).toHaveFocus();
      await userEvent.keyboard(",");
      await expect.element(screen.getByText("QUEDA", { exact: true })).not.toBeInTheDocument();
      expect(readPreview).not.toHaveBeenCalled();
    });

    it("shows what the core says is left once Importe is a valid amount, asking it for the kind and amount", async () => {
      const { screen, readPreview } = await renderPanel({
        kind: "CASH_OUT",
        readPreview: async () => ({ kind: "remaining", cash: 12_570_000 }),
      });

      await userEvent.keyboard("18500");

      await expect.element(screen.getByText("QUEDA", { exact: true })).toBeVisible();
      await expect.element(screen.getByText("$ 125.700,00", { exact: true })).toBeVisible();
      expect(readPreview).toHaveBeenLastCalledWith({ kind: "CASH_OUT", amount: 1_850_000 });
    });

    it("is drawn as a neutral grey card, not the green one", async () => {
      const { screen } = await renderPanel({
        readPreview: async () => ({ kind: "remaining", cash: 12_570_000 }),
      });

      await userEvent.keyboard("100");

      await expect.element(screen.getByText("QUEDA", { exact: true })).toBeVisible();
      const card = screen.getByText("QUEDA", { exact: true }).element().closest("[class*=rounded]");
      expect(card?.className).toContain("bg-surface-subtle");
      expect(card?.className).not.toContain("bg-success-subtle");
    });

    it("is hidden again when Importe is emptied", async () => {
      const { screen } = await renderPanel({
        readPreview: async () => ({ kind: "remaining", cash: 12_570_000 }),
      });
      await userEvent.keyboard("100");
      await expect.element(screen.getByText("QUEDA", { exact: true })).toBeVisible();

      await userEvent.clear(screen.getByRole("textbox", { name: "Importe" }));

      await expect.element(screen.getByText("QUEDA", { exact: true })).not.toBeInTheDocument();
    });

    it.each([
      ["the core says the amount is not valid", async () => ({ kind: "invalid_amount" as const })],
      ["no session is open", async () => null],
      ["the core cannot answer", async () => "unavailable" as const],
      ["the read fails", () => Promise.reject(new Error("the connection was replaced"))],
    ])("is not shown when %s", async (_case, readPreview) => {
      const { screen } = await renderPanel({ readPreview });

      await userEvent.keyboard("100");

      await expect.element(screen.getByText("QUEDA", { exact: true })).not.toBeInTheDocument();
    });
  });

  describe("when there is not that much cash", () => {
    const EXCEEDS_MESSAGE = "No hay tanto efectivo en la caja: se esperan $ 144.200,00.";

    it("shows the refusal in red in the place of the cash left when the core says the amount exceeds it", async () => {
      const { screen } = await renderPanel({
        kind: "CASH_OUT",
        readPreview: async () => ({ kind: "exceeds_expected_cash", expected: 14_420_000 }),
      });

      await userEvent.keyboard("150000");

      await expect.element(screen.getByRole("alert")).toHaveTextContent(EXCEEDS_MESSAGE);
      await expect.element(screen.getByText("QUEDA", { exact: true })).not.toBeInTheDocument();
    });

    it("marks the refusal with a red cross", async () => {
      const { screen } = await renderPanel({
        kind: "CASH_OUT",
        readPreview: async () => ({ kind: "exceeds_expected_cash", expected: 14_420_000 }),
      });

      await userEvent.keyboard("150000");

      await expect.element(screen.getByRole("alert")).toBeVisible();
      const icon = noticeIconOf(screen.getByRole("alert").element());
      expect(icon?.getAttribute("class")).toContain("lucide-circle-x");
    });

    it("tells how much cash is expected when the core refuses recording the amount as more than that", async () => {
      const { screen, onRecorded } = await renderPanel({
        kind: "WITHDRAWAL",
        outcome: { kind: "exceeds_expected_cash", expected: 14_420_000 },
      });
      await fill(screen, "150000", "Caja fuerte");

      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await expect.element(screen.getByRole("alert")).toHaveTextContent(EXCEEDS_MESSAGE);
      expect(onRecorded).not.toHaveBeenCalled();
    });

    it("drops the refusal once the amount is corrected, leaving the cash left to the core", async () => {
      const { screen } = await renderPanel({
        kind: "WITHDRAWAL",
        outcome: { kind: "exceeds_expected_cash", expected: 14_420_000 },
        readPreview: async ({ amount }) =>
          amount > 14_420_000
            ? { kind: "remaining", cash: 0 }
            : { kind: "remaining", cash: 14_420_000 - amount },
      });
      await fill(screen, "150000", "Caja fuerte");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
      await expect.element(screen.getByRole("alert")).toHaveTextContent(EXCEEDS_MESSAGE);

      await userEvent.fill(screen.getByRole("textbox", { name: "Importe" }), "40000");

      await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
      await expect.element(screen.getByText("$ 104.200,00", { exact: true })).toBeVisible();
    });
  });

  it("says when there is no open session to record into", async () => {
    const { screen, onRecorded } = await renderPanel({ outcome: { kind: "no_open_session" } });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByRole("alert")).toHaveTextContent("No hay una caja abierta.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("says the movement was not recorded when the core reports it unavailable", async () => {
    const { screen, onRecorded } = await renderPanel({ outcome: { kind: "unavailable" } });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect
      .poll(() => screen.getByRole("alert").query()?.textContent)
      .toBe("No se pudo registrar el movimiento. Probá de nuevo.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("says the signed-in person no longer holds the kind's permission", async () => {
    const { screen, onRecorded } = await renderPanel({
      kind: "CASH_OUT",
      outcome: { kind: "lacks_permission" },
    });
    await fill(screen, "100", "Flete");

    await userEvent.click(screen.getByRole("button", { name: "Registrar gasto" }));

    await expect
      .poll(() => screen.getByRole("alert").query()?.textContent)
      .toBe("Ya no tenés permiso para registrar gastos.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("says the movement was not recorded when the core no longer finds anyone signed in", async () => {
    const { screen, onRecorded } = await renderPanel({ outcome: { kind: "not_signed_in" } });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect
      .poll(() => screen.getByRole("alert").query()?.textContent)
      .toBe("No se pudo registrar el movimiento. Probá de nuevo.");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("marks a failure to record with a red cross", async () => {
    const { screen } = await renderPanel({ outcome: { kind: "not_signed_in" } });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByRole("alert")).toBeVisible();
    const icon = noticeIconOf(screen.getByRole("alert").element());
    expect(icon?.getAttribute("class")).toContain("lucide-circle-x");
  });

  it("says when the core could not be reached, and allows trying again", async () => {
    const { screen, recordCashMovement, onRecorded } = await renderPanel({
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

  it("holds every control, and Esc, while the movement is being recorded", async () => {
    let finish: (outcome: RecordCashMovementOutcome) => void = () => undefined;
    const pending = new Promise<RecordCashMovementOutcome>((resolve) => {
      finish = resolve;
    });
    const { screen, recordCashMovement, onClose } = await renderPanel({ outcome: pending });
    await fill(screen, "100", "Cambio");

    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    await expect.element(screen.getByRole("button", { name: "Registrar ingreso" })).toBeDisabled();
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(recordCashMovement).toHaveBeenCalledOnce();
    finish(RECORDED);
  });

  it("asks no authorizer when the core says none is needed", async () => {
    const { screen, requested } = await renderPanel({ kind: "WITHDRAWAL", lacking: [] });

    await expect.element(screen.getByRole("button", { name: "Registrar retiro" })).toBeVisible();
    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    expect(requested).toEqual([]);
  });

  it("asks for an authorizer in the modal, not in the panel, when the core says one is needed", async () => {
    const { screen, requested } = await renderPanel({
      kind: "WITHDRAWAL",
      lacking: ["WITHDRAWAL"],
    });

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
    await expect.element(authorizationDialog()).not.toBeInTheDocument();
    await fill(screen, "100", "Fin de turno");
    await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await expect.element(authorizationDialog()).toBeVisible();
    expect(requested).toEqual(["withdraw_cash"]);
  });

  it("asks the core which movements can be recorded, once, when it opens", async () => {
    const { screen, loadKinds } = await renderPanel();

    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toBeVisible();
    expect(loadKinds).toHaveBeenCalledOnce();
  });

  it("offers no field until the core answers, and lets the cashier close it with Esc", async () => {
    let answer: (kinds: RecordableCashMovementKinds) => void = () => {};
    const { screen, onClose } = await renderPanel({
      loadKinds: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });

    await expect.element(screen.getByRole("heading", { name: "Ingreso" })).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    answer(kindsLacking([]));
    await expect.element(screen.getByRole("textbox", { name: "Importe" })).toBeVisible();
  });

  it.each([
    ["is unavailable", async () => "unavailable" as const],
    ["fails", () => Promise.reject(new Error("the core connection was replaced"))],
  ])(
    "says what can be recorded could not be loaded when the core %s, and asks again on retry",
    async (_case, failing) => {
      const answers = [failing, async () => kindsLacking([])];
      const { screen, loadKinds } = await renderPanel({
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
      await expect
        .element(screen.getByRole("textbox", { name: "Importe" }))
        .not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await expect.element(screen.getByRole("textbox", { name: "Importe" })).toBeVisible();
      expect(loadKinds).toHaveBeenCalledTimes(2);
    },
  );

  describe("when the signed-in person lacks the kind's permission", () => {
    it.each([
      ["CASH_OUT", "Registrar gasto", "Registrar gasto"],
      ["WITHDRAWAL", "Registrar retiro", "Retirar efectivo a la caja fuerte"],
      ["CASH_IN", "Registrar ingreso", "Registrar ingreso"],
    ] as const)(
      "asks in the modal with the subtitle of a %s movement",
      async (kind, button, subtitle) => {
        const { screen, recordCashMovement } = await renderPanel({ kind, lacking: [kind] });
        await fill(screen, "100", "Fin de turno");

        await userEvent.click(screen.getByRole("button", { name: button }));

        await expect
          .element(authorizationDialog().getByText(subtitle, { exact: true }))
          .toBeVisible();
        expect(recordCashMovement).not.toHaveBeenCalled();
      },
    );

    it("shows the form's own refusal and asks for no authorization while the form is not valid", async () => {
      const { screen, recordCashMovement } = await renderPanel({
        kind: "WITHDRAWAL",
        lacking: ["WITHDRAWAL"],
      });
      await fill(screen, "", "Fin de turno");

      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await expect.element(screen.getByText("Ingresá el importe.")).toBeVisible();
      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      expect(recordCashMovement).not.toHaveBeenCalled();
    });

    it("asks for someone with that permission only for the kind that needs it", async () => {
      const { screen, requested } = await renderPanel({
        kind: "CASH_OUT",
        lacking: ["WITHDRAWAL"],
      });
      await expect.element(screen.getByRole("button", { name: "Registrar gasto" })).toBeEnabled();
      expect(requested).toEqual([]);

      await screen.unmount();
      const withdrawal = await renderPanel({ kind: "WITHDRAWAL", lacking: ["WITHDRAWAL"] });

      await expect.poll(() => withdrawal.requested).toEqual(["withdraw_cash"]);
    });

    it("asks for the authorizers of the permission the core names for the kind", async () => {
      const { requested } = await renderPanel({
        kind: "WITHDRAWAL",
        loadKinds: async () => ({
          ...kindsLacking([]),
          WITHDRAWAL: {
            permission: "close_anothers_register_session",
            authorization_required: true,
          },
        }),
      });

      await expect.poll(() => requested).toEqual(["close_anothers_register_session"]);
    });

    it("sends who authorizes and their PIN on Enter, then closes", async () => {
      const { screen, recordCashMovement, onRecorded } = await renderPanel({
        kind: "WITHDRAWAL",
        lacking: ["WITHDRAWAL"],
      });
      await fill(screen, "100", "Fin de turno");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledOnce());
      expect(recordCashMovement).toHaveBeenCalledExactlyOnceWith({
        kind: "WITHDRAWAL",
        amount: 10_000,
        reason: "Fin de turno",
        authorization: { user_id: "u3", pin: "1234" },
      });
    });

    it("takes the digits typed right after the authorization modal opens, without clicking its PIN field", async () => {
      const { screen, recordCashMovement } = await renderPanel({
        kind: "WITHDRAWAL",
        lacking: ["WITHDRAWAL"],
      });
      await fill(screen, "100", "Fin de turno");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
      await expect.element(authorizationDialog()).toBeVisible();

      await userEvent.keyboard("1234");

      await expect.element(authorizationDialog().getByLabelText("PIN")).toHaveValue("1234");
      expect(recordCashMovement).not.toHaveBeenCalled();
    });

    it("does not record the movement when the authorization modal is closed with Esc, nor closes the panel", async () => {
      const { screen, recordCashMovement, onClose } = await renderPanel({
        kind: "WITHDRAWAL",
        lacking: ["WITHDRAWAL"],
      });
      await fill(screen, "100", "Fin de turno");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
      await expect.element(authorizationDialog()).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      expect(recordCashMovement).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("shows the PIN refusal inside the authorization modal and stays open", async () => {
      const { screen, onRecorded } = await renderPanel({
        kind: "WITHDRAWAL",
        lacking: ["WITHDRAWAL"],
        outcome: { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 6 },
      });
      await fill(screen, "100", "Fin de turno");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect.element(authorizationDialog().getByText("PIN incorrecto")).toBeVisible();
      expect(onRecorded).not.toHaveBeenCalled();
    });

    it("says the movement was not recorded when the core is unavailable, not that the PIN failed", async () => {
      const { screen, onRecorded } = await renderPanel({
        kind: "WITHDRAWAL",
        lacking: ["WITHDRAWAL"],
        outcome: { kind: "unavailable" },
      });
      await fill(screen, "100", "Fin de turno");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect
        .poll(() => screen.getByRole("alert").query()?.textContent)
        .toBe("No se pudo registrar el movimiento. Probá de nuevo.");
      await expect.element(screen.getByText("No se pudo verificar el PIN")).not.toBeInTheDocument();
      expect(onRecorded).not.toHaveBeenCalled();
    });

    it("says inside the modal that the authorizer cannot authorize the movement", async () => {
      const { screen, onRecorded } = await renderPanel({
        kind: "WITHDRAWAL",
        lacking: ["WITHDRAWAL"],
        outcome: { kind: "lacks_permission" },
      });
      await fill(screen, "100", "Fin de turno");
      await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await expect
        .element(authorizationDialog().getByText("Sofía no puede autorizar esto", { exact: true }))
        .toBeVisible();
      await expect.element(screen.getByText(/Ya no tenés permiso/)).not.toBeInTheDocument();
      expect(onRecorded).not.toHaveBeenCalled();
    });
  });
});
