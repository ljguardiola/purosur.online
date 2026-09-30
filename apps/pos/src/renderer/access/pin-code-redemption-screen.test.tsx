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
      <PinCodeRedemptionScreen redeem={answering({ kind: "redeemed" })} />,
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
        redeem={async (typedCode, pin) => {
          calls.push([typedCode, pin]);
          return { kind: "redeemed" };
        }}
      />,
    );

    await fillAndSave(screen);

    expect(calls).toEqual([["K7QM2XPA3DTR4HWN", "482915"]]);
  });

  it("tells the person to ask for a new code in the backoffice when the code doesn't work", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen redeem={answering({ kind: "code_expired" })} />,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText("Pedí un código nuevo en el backoffice.")).toBeVisible();
  });

  it("replaces the form with the success message and a way back to the start once redeemed", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen redeem={answering({ kind: "redeemed" })} />,
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
