import type { PinCodeRedemptionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PinCodeRedemptionForm } from "./pin-code-redemption-form";

const TYPED_CODE = "k7qm 2xpa 3dtr 4hwn";
const NEW_PIN = "482915";
const CODE_LABEL = "Código";
const PIN_LABEL = "PIN nuevo, de al menos 6 dígitos";
const REPEAT_LABEL = "Repetí el PIN nuevo";
const SAVE = "Guardar el PIN nuevo";
const PIN_RULE_MESSAGE = "El PIN tiene que tener al menos 6 dígitos, solo números.";

type Screen = Awaited<ReturnType<typeof render>>;

function answering(outcome: PinCodeRedemptionOutcome | Error) {
  const calls: { code: string; pin: string }[] = [];
  const redeem = async (code: string, pin: string) => {
    calls.push({ code, pin });
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  };
  return { redeem, calls };
}

function pending() {
  const calls: { code: string; pin: string }[] = [];
  let finish: (outcome: PinCodeRedemptionOutcome) => void = () => {};
  const redeem = (code: string, pin: string) => {
    calls.push({ code, pin });
    return new Promise<PinCodeRedemptionOutcome>((resolve) => {
      finish = resolve;
    });
  };
  return { redeem, calls, finish: (outcome: PinCodeRedemptionOutcome) => finish(outcome) };
}

function renderForm(
  redeem: ComponentProps<typeof PinCodeRedemptionForm>["redeem"],
  props: Partial<Omit<ComponentProps<typeof PinCodeRedemptionForm>, "redeem">> = {},
) {
  return render(
    <PinCodeRedemptionForm
      redeem={redeem}
      onRedeemed={() => {}}
      submitLabel={SAVE}
      newCodeAskedIn="backoffice"
      {...props}
    />,
  );
}

function code(screen: Screen) {
  return screen.getByRole("textbox", { name: CODE_LABEL });
}

async function fillAndSave(
  screen: Screen,
  {
    typedCode = TYPED_CODE,
    pin = NEW_PIN,
    repeat = pin,
  }: { typedCode?: string; pin?: string; repeat?: string } = {},
) {
  await userEvent.fill(code(screen), typedCode);
  await userEvent.fill(screen.getByLabelText(PIN_LABEL), pin);
  await userEvent.fill(screen.getByLabelText(REPEAT_LABEL), repeat);
  await userEvent.click(screen.getByRole("button", { name: SAVE }));
}

describe("PinCodeRedemptionForm", () => {
  it("asks for the code and the new PIN twice, with the PINs hidden and numeric", async () => {
    const screen = await renderForm(answering({ kind: "redeemed" }).redeem);

    await expect.element(code(screen)).toBeVisible();
    for (const label of [PIN_LABEL, REPEAT_LABEL]) {
      const input = screen.getByLabelText(label).element();
      expect(input.getAttribute("type")).toBe("password");
      expect(input.getAttribute("inputmode")).toBe("numeric");
    }
    await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("labels the submit button with what the screen names it", async () => {
    const screen = await renderForm(answering({ kind: "redeemed" }).redeem, {
      submitLabel: "Guardar y entrar",
    });

    await expect.element(screen.getByRole("button", { name: "Guardar y entrar" })).toBeVisible();
  });

  it("shows what the screen puts after the button", async () => {
    const screen = await renderForm(answering({ kind: "redeemed" }).redeem, {
      children: <p>Debajo del botón</p>,
    });

    await expect.element(screen.getByText("Debajo del botón")).toBeVisible();
  });

  it("sends the code without its spaces, in uppercase, with the new PIN", async () => {
    const { redeem, calls } = answering({ kind: "redeemed" });
    const screen = await renderForm(redeem);

    await fillAndSave(screen);

    expect(calls).toEqual([{ code: "K7QM2XPA3DTR4HWN", pin: NEW_PIN }]);
  });

  it("hands the new PIN over once the code is redeemed, and clears the fields", async () => {
    const handed: string[] = [];
    const screen = await renderForm(answering({ kind: "redeemed" }).redeem, {
      onRedeemed: (pin) => {
        handed.push(pin);
      },
    });

    await fillAndSave(screen);

    expect(handed).toEqual([NEW_PIN]);
    await expect.element(screen.getByLabelText(PIN_LABEL)).toHaveValue("");
    await expect.element(screen.getByLabelText(REPEAT_LABEL)).toHaveValue("");
  });

  it("keeps the button disabled while the request is pending, so it is sent only once", async () => {
    const request = pending();
    const screen = await renderForm(request.redeem);

    await fillAndSave(screen);

    await expect.element(screen.getByRole("button", { name: SAVE })).toBeDisabled();
    request.finish({ kind: "code_invalid" });
    await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();
    expect(request.calls).toHaveLength(1);
  });

  it("keeps the button disabled until what the screen does after redeeming finishes", async () => {
    let finish: () => void = () => {};
    const screen = await renderForm(answering({ kind: "redeemed" }).redeem, {
      onRedeemed: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });

    await fillAndSave(screen);

    await expect.element(screen.getByRole("button", { name: SAVE })).toBeDisabled();
    finish();
    await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();
  });

  it.each([
    [
      "backoffice",
      "code_invalid",
      "El código no existe",
      "Revisá que esté bien escrito o pedí un código nuevo en el backoffice.",
    ],
    ["backoffice", "code_expired", "El código venció", "Pedí un código nuevo en el backoffice."],
    [
      "backoffice",
      "code_burned",
      "El código ya no sirve",
      "Ya se usó o se probó demasiadas veces. Pedí un código nuevo en el backoffice.",
    ],
    [
      "register",
      "code_invalid",
      "El código no existe",
      "Revisá que esté bien escrito o pedí un código nuevo.",
    ],
    ["register", "code_expired", "El código venció", "Pedí un código nuevo."],
    [
      "register",
      "code_burned",
      "El código ya no sirve",
      "Ya se usó o se probó demasiadas veces. Pedí un código nuevo.",
    ],
  ] as const)(
    "with the code asked in the %s, shows why the code doesn't work on %s, marking the code field",
    async (askedIn, kind, title, detail) => {
      const screen = await renderForm(answering({ kind }).redeem, { newCodeAskedIn: askedIn });

      await fillAndSave(screen);

      await expect.element(screen.getByText(title)).toBeVisible();
      await expect.element(screen.getByText(detail)).toBeVisible();
      await expect.element(code(screen)).toHaveAttribute("aria-invalid", "true");
      await expect
        .element(screen.getByLabelText(PIN_LABEL))
        .not.toHaveAttribute("aria-invalid", "true");
      await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();

      await expectNoAccessibilityViolations(screen.container);
    },
  );

  it("marks the PIN field with the PIN rule when the cloud rejects the PIN", async () => {
    const screen = await renderForm(answering({ kind: "pin_rejected" }).redeem);

    await fillAndSave(screen);

    await expect.element(screen.getByText(PIN_RULE_MESSAGE)).toBeVisible();
    await expect.element(screen.getByLabelText(PIN_LABEL)).toHaveAttribute("aria-invalid", "true");
    await expect.element(code(screen)).not.toHaveAttribute("aria-invalid", "true");
  });

  it("says when to try again after too many attempts", async () => {
    const screen = await renderForm(
      answering({ kind: "rate_limited", retry_after_seconds: 541 }).redeem,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
    await expect
      .element(screen.getByText("Se puede volver a intentar en 10 minutos."))
      .toBeVisible();
  });

  it("says there is no connection when the cloud can't be reached", async () => {
    const screen = await renderForm(answering({ kind: "unreachable" }).redeem);

    await fillAndSave(screen);

    await expect.element(screen.getByText("Sin conexión a internet")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "El código se comprueba en línea. Cuando vuelva la conexión se puede guardar el PIN nuevo.",
        ),
      )
      .toBeVisible();
  });

  it.each([
    ["the cloud is unavailable", { kind: "unavailable" } as const],
    ["the core can't answer", new Error("the core connection was replaced")],
  ])("says the PIN couldn't be saved when %s", async (_case, outcome) => {
    const screen = await renderForm(answering(outcome).redeem);

    await fillAndSave(screen);

    await expect.element(screen.getByText("No se pudo guardar el PIN nuevo")).toBeVisible();
    await expect
      .element(
        screen.getByText("Puro Sur no responde en este momento. Probá de nuevo en unos minutos."),
      )
      .toBeVisible();
  });

  it.each([
    ["empty", ""],
    ["too short", "K7QM 2XPA 3DTR"],
    ["made of characters no code has", "K7QM 2XPA 3DTR 4HW1"],
  ])("asks to check a code that is %s without sending anything", async (_case, typedCode) => {
    const { redeem, calls } = answering({ kind: "redeemed" });
    const screen = await renderForm(redeem);

    await fillAndSave(screen, { typedCode });

    await expect
      .element(screen.getByText("Revisá el código: son 16 letras y números."))
      .toBeVisible();
    expect(calls).toEqual([]);
  });

  it.each([
    ["too short", "48291"],
    ["not only digits", "48291a"],
    ["empty", ""],
  ])("shows the PIN rule for a PIN that is %s without sending anything", async (_case, pin) => {
    const { redeem, calls } = answering({ kind: "redeemed" });
    const screen = await renderForm(redeem);

    await fillAndSave(screen, { pin, repeat: pin });

    await expect.element(screen.getByText(PIN_RULE_MESSAGE)).toBeVisible();
    expect(calls).toEqual([]);
  });

  it("says the two PINs don't match without sending anything", async () => {
    const { redeem, calls } = answering({ kind: "redeemed" });
    const screen = await renderForm(redeem);

    await fillAndSave(screen, { repeat: "482916" });

    await expect.element(screen.getByText("Los dos PIN no coinciden.")).toBeVisible();
    await expect
      .element(screen.getByLabelText(REPEAT_LABEL))
      .toHaveAttribute("aria-invalid", "true");
    expect(calls).toEqual([]);
  });

  it("keeps the code message while the code is still wrong, and drops it once it is whole", async () => {
    const screen = await renderForm(answering({ kind: "redeemed" }).redeem);
    await fillAndSave(screen, { typedCode: "K7QM 2XPA" });
    const message = screen.getByText("Revisá el código: son 16 letras y números.");
    await expect.element(message).toBeVisible();

    await userEvent.type(code(screen), " 3DTR");
    await expect.element(message).toBeVisible();

    await userEvent.type(code(screen), " 4HWN");
    await expect.element(message).not.toBeInTheDocument();
  });

  it("keeps the mismatch message until the repeat matches the PIN", async () => {
    const screen = await renderForm(answering({ kind: "redeemed" }).redeem);
    await fillAndSave(screen, { repeat: "482916" });
    const message = screen.getByText("Los dos PIN no coinciden.");
    await expect.element(message).toBeVisible();

    await userEvent.fill(screen.getByLabelText(REPEAT_LABEL), "48291");
    await expect.element(message).toBeVisible();

    await userEvent.fill(screen.getByLabelText(REPEAT_LABEL), NEW_PIN);
    await expect.element(message).not.toBeInTheDocument();
  });

  it("clears the outcome of the last attempt when it is sent again", async () => {
    const outcomes: PinCodeRedemptionOutcome[] = [
      { kind: "unreachable" },
      { kind: "code_expired" },
    ];
    const screen = await renderForm(async () => outcomes.shift() ?? { kind: "redeemed" });

    await fillAndSave(screen);
    await expect.element(screen.getByText("Sin conexión a internet")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    await expect.element(screen.getByText("El código venció")).toBeVisible();
    await expect.element(screen.getByText("Sin conexión a internet")).not.toBeInTheDocument();
  });
});
