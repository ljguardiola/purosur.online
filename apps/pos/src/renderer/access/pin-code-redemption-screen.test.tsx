import type { PinCodeRedemptionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PinCodeRedemptionScreen } from "./pin-code-redemption-screen";

const PIN_LABEL = "PIN nuevo, de al menos 6 dígitos";
const REPEAT_LABEL = "Repetí el PIN nuevo";
const SAVE = "Guardar el PIN nuevo";

type Screen = Awaited<ReturnType<typeof render>>;

function answering(outcome: PinCodeRedemptionOutcome) {
  return async () => outcome;
}

function code(screen: Screen) {
  return screen.getByRole("textbox", { name: "Código" });
}

async function fillAndSave(screen: Screen) {
  await userEvent.fill(code(screen), "k7qm 2xpa 3dtr 4hwn");
  await userEvent.fill(screen.getByLabelText(PIN_LABEL), "482915");
  await userEvent.fill(screen.getByLabelText(REPEAT_LABEL), "482915");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));
}

describe("PinCodeRedemptionScreen", () => {
  it("asks for the code from the backoffice and the new PIN, with a link back to the start", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        redeem={answering({ kind: "redeemed" })}
      />,
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
    await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Volver" }).element().getAttribute("href")).toBe(
      "/sign-in",
    );

    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends the code and the new PIN typed", async () => {
    const calls: [string, string][] = [];
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        redeem={async (typedCode, pin) => {
          calls.push([typedCode, pin]);
          return { kind: "redeemed" };
        }}
      />,
    );

    await fillAndSave(screen);

    expect(calls).toEqual([["k7qm 2xpa 3dtr 4hwn", "482915"]]);
  });

  it("tells the person to ask for a new code in the backoffice when the code doesn't work", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        redeem={answering({ kind: "code_expired" })}
      />,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText("Pedí un código nuevo en el backoffice.")).toBeVisible();
  });

  it("says the new PIN was saved but only the opener can enter while a session is open", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        redeem={answering({ kind: "cash_session_opened_by_another" })}
      />,
    );
    await fillAndSave(screen);

    await expect.element(screen.getByText("La caja está abierta")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "El PIN nuevo quedó guardado, pero solo puede entrar quien abrió la caja.",
        ),
      )
      .toBeVisible();
  });

  it("empties the form once the code is spent for someone else, so it cannot be sent again", async () => {
    const calls: string[] = [];
    const redeem = async (typedCode: string): Promise<PinCodeRedemptionOutcome> => {
      calls.push(typedCode);
      return { kind: "cash_session_opened_by_another" };
    };
    const screen = await render(
      <PinCodeRedemptionScreen loadPinPolicy={async () => ({ min_digits: 6 })} redeem={redeem} />,
    );
    await fillAndSave(screen);
    await expect.element(screen.getByText("La caja está abierta")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    await expect.element(code(screen)).toHaveValue("");
    await expect.element(screen.getByLabelText(PIN_LABEL)).toHaveValue("");
    await expect.element(screen.getByLabelText(REPEAT_LABEL)).toHaveValue("");
    expect(calls).toHaveLength(1);
  });

  it("replaces the form with the success message and a way back to the start once redeemed", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        redeem={answering({ kind: "redeemed" })}
      />,
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
});
