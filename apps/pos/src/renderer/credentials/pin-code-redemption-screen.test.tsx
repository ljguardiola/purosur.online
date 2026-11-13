import type { PinCodeRedemptionOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
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

async function checkingLikeTheCore(typedCode: string): Promise<"reset_code"[]> {
  return typedCode === "" ? ["reset_code"] : [];
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
  it("asks only for the code and the new PIN, with its keys and no description or link", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={answering({ kind: "redeemed" })}
        version="1.4.212"
      />,
    );

    await expect.element(screen.getByRole("heading", { name: "Cambiar el PIN" })).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Escribí el código que te dieron desde el backoffice. Hace falta internet.",
        ),
      )
      .not.toBeInTheDocument();
    await expect.element(code(screen)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: SAVE })).toBeEnabled();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Volver" })).not.toBeInTheDocument();
    await expect.element(screen.getByText("0-9", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Versión 1.4.212")).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the Tab key as Campo in the brand panel while the fields are shown", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={answering({ kind: "redeemed" })}
        version="1.4.212"
      />,
    );

    await expect.element(screen.getByText("Tab", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("listitem")).toBeVisible();
  });

  it("goes back to the sign-in with Escape", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={answering({ kind: "redeemed" })}
        version={null}
      />,
    );

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
  });

  it("sends the code and the new PIN typed", async () => {
    const calls: [string, string][] = [];
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={async (typedCode, pin) => {
          calls.push([typedCode, pin]);
          return { kind: "redeemed" };
        }}
        version={null}
      />,
    );

    await fillAndSave(screen);

    expect(calls).toEqual([["k7qm 2xpa 3dtr 4hwn", "482915"]]);
  });

  it("tells the person to ask for a new code in the backoffice when the code doesn't work", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={answering({ kind: "code_expired" })}
        version={null}
      />,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText("Pedí un código nuevo en el backoffice.")).toBeVisible();
  });

  it("says the new PIN was saved and only the opener can enter while a session is open, keeping the way back", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={answering({ kind: "cash_session_opened_by_another" })}
        version="1.4.212"
      />,
    );
    await fillAndSave(screen);

    await expect.element(screen.getByRole("heading", { name: "Cambiar el PIN" })).toBeVisible();
    await expect.element(screen.getByText("PIN nuevo guardado")).toBeVisible();
    const detail = screen.getByText("La caja está abierta: solo puede entrar quien la abrió.");
    await expect.element(detail).toBeVisible();
    expect(
      getComputedStyle(detail.element().parentElement?.parentElement as HTMLElement)
        .backgroundColor,
    ).toBe(tokenRgb("success-subtle"));
    await expect
      .element(screen.getByText("La caja está abierta", { exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Tab", { exact: true })).not.toBeInTheDocument();
    await expect.element(code(screen)).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
  });

  it("replaces the form with the success message and a way back to the start once redeemed", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={answering({ kind: "redeemed" })}
        version={null}
      />,
    );

    await fillAndSave(screen);

    await expect.element(screen.getByText("PIN nuevo guardado")).toBeVisible();
    await expect.element(screen.getByText("Ya podés entrar con tu PIN nuevo.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Tab", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText(PIN_LABEL)).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText(REPEAT_LABEL)).not.toBeInTheDocument();
    await expect.element(code(screen)).not.toBeInTheDocument();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("keeps the title and goes back to the sign-in with Enter once the new PIN is saved", async () => {
    const screen = await render(
      <PinCodeRedemptionScreen
        loadPinPolicy={async () => ({ min_digits: 6 })}
        checkRedemption={checkingLikeTheCore}
        redeem={answering({ kind: "redeemed" })}
        version={null}
      />,
    );
    await fillAndSave(screen);
    await expect.element(screen.getByRole("heading", { name: "Cambiar el PIN" })).toBeVisible();

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
  });
});
