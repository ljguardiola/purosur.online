import type { PinCodeRedemptionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PinCodeRedemptionScreen } from "./pin-code-redemption-screen";

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

describe("PinCodeRedemptionScreen", () => {
  it("asks for the code from the backoffice and the new PIN twice, with the PINs hidden and numeric", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen redeem={answering({ kind: "redeemed" }).redeem} />,
    );

    await expect.element(screen.getByRole("heading", { name: "Cambiar el PIN" })).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Escribí el código que te dieron desde el backoffice. Hace falta internet.",
        ),
      )
      .toBeVisible();
    await expect.element(code(screen)).toBeVisible();
    for (const label of [PIN_LABEL, REPEAT_LABEL]) {
      const input = screen.getByLabelText(label).element();
      expect(input.getAttribute("type")).toBe("password");
      expect(input.getAttribute("inputmode")).toBe("numeric");
    }
    await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();
    await expect.element(screen.getByRole("link", { name: "Volver" })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends the code without its spaces, in uppercase, with the new PIN", async () => {
    const { redeem, calls } = answering({ kind: "redeemed" });
    const screen = await render(<PinCodeRedemptionScreen redeem={redeem} />);

    await fillAndSave(screen);

    expect(calls).toEqual([{ code: "K7QM2XPA3DTR4HWN", pin: NEW_PIN }]);
  });

  it("goes back to the sign-in screen with its link", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen redeem={answering({ kind: "redeemed" }).redeem} />,
    );

    expect(screen.getByRole("link", { name: "Volver" }).element().getAttribute("href")).toBe(
      "/sign-in",
    );
  });

  it("keeps the button disabled while the request is pending, so it is sent only once", async () => {
    const request = pending();
    const screen = await render(<PinCodeRedemptionScreen redeem={request.redeem} />);

    await fillAndSave(screen);

    await expect.element(screen.getByRole("button", { name: SAVE })).toBeDisabled();
    request.finish({ kind: "code_invalid" });
    await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();
    expect(request.calls).toHaveLength(1);
  });

  it.each([
    [
      "code_invalid",
      "El código no existe",
      "Revisá que esté bien escrito o pedí un código nuevo en el backoffice.",
    ],
    ["code_expired", "El código venció", "Pedí un código nuevo en el backoffice."],
    [
      "code_burned",
      "El código ya no sirve",
      "Ya se usó o se probó demasiadas veces. Pedí un código nuevo en el backoffice.",
    ],
  ] as const)(
    "shows why the code doesn't work on %s, marking the code field",
    async (kind, title, detail) => {
      const screen = await render(<PinCodeRedemptionScreen redeem={answering({ kind }).redeem} />);

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
    const screen = await render(
      <PinCodeRedemptionScreen redeem={answering({ kind: "pin_rejected" }).redeem} />,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText(PIN_RULE_MESSAGE)).toBeVisible();
    await expect.element(screen.getByLabelText(PIN_LABEL)).toHaveAttribute("aria-invalid", "true");
    await expect.element(code(screen)).not.toHaveAttribute("aria-invalid", "true");
  });

  it("says when to try again after too many attempts", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        redeem={answering({ kind: "rate_limited", retry_after_seconds: 541 }).redeem}
      />,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
    await expect
      .element(screen.getByText("Se puede volver a intentar en 10 minutos."))
      .toBeVisible();
  });

  it("says there is no connection when the cloud can't be reached", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen redeem={answering({ kind: "unreachable" }).redeem} />,
    );

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
    const screen = await render(<PinCodeRedemptionScreen redeem={answering(outcome).redeem} />);

    await fillAndSave(screen);

    await expect.element(screen.getByText("No se pudo guardar el PIN nuevo")).toBeVisible();
    await expect
      .element(
        screen.getByText("Puro Sur no responde en este momento. Probá de nuevo en unos minutos."),
      )
      .toBeVisible();
  });

  it("replaces the form with the success message and a way back to the start once redeemed", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen redeem={answering({ kind: "redeemed" }).redeem} />,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText("PIN nuevo guardado")).toBeVisible();
    await expect.element(screen.getByText("Ya podés entrar con tu PIN nuevo.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    await expect.element(screen.getByLabelText(PIN_LABEL)).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText(REPEAT_LABEL)).not.toBeInTheDocument();
    await expect.element(code(screen)).not.toBeInTheDocument();

    await expectNoAccessibilityViolations(screen.container);
  });

  it.each([
    ["empty", ""],
    ["too short", "K7QM 2XPA 3DTR"],
    ["made of characters no code has", "K7QM 2XPA 3DTR 4HW1"],
  ])("asks to check a code that is %s without sending anything", async (_case, typedCode) => {
    const { redeem, calls } = answering({ kind: "redeemed" });
    const screen = await render(<PinCodeRedemptionScreen redeem={redeem} />);

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
    const screen = await render(<PinCodeRedemptionScreen redeem={redeem} />);

    await fillAndSave(screen, { pin, repeat: pin });

    await expect.element(screen.getByText(PIN_RULE_MESSAGE)).toBeVisible();
    expect(calls).toEqual([]);
  });

  it("says the two PINs don't match without sending anything", async () => {
    const { redeem, calls } = answering({ kind: "redeemed" });
    const screen = await render(<PinCodeRedemptionScreen redeem={redeem} />);

    await fillAndSave(screen, { repeat: "482916" });

    await expect.element(screen.getByText("Los dos PIN no coinciden.")).toBeVisible();
    await expect
      .element(screen.getByLabelText(REPEAT_LABEL))
      .toHaveAttribute("aria-invalid", "true");
    expect(calls).toEqual([]);
  });

  it("clears the outcome of the last attempt when it is sent again", async () => {
    const outcomes: PinCodeRedemptionOutcome[] = [
      { kind: "unreachable" },
      { kind: "code_expired" },
    ];
    const screen = await render(
      <PinCodeRedemptionScreen redeem={async () => outcomes.shift() ?? { kind: "redeemed" }} />,
    );

    await fillAndSave(screen);
    await expect.element(screen.getByText("Sin conexión a internet")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    await expect.element(screen.getByText("El código venció")).toBeVisible();
    await expect.element(screen.getByText("Sin conexión a internet")).not.toBeInTheDocument();
  });
});
