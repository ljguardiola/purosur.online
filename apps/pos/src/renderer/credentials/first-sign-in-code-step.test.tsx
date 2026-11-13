import type {
  FirstPinCodeRequestOutcome,
  PinCodeRedemptionOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FirstSignInCodeStep } from "./first-sign-in-code-step";

const ADA = { id: "u1", first_name: "Ada" };
const SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", abilities: [] },
  cash_session: null,
};
const PIN_LABEL = "PIN nuevo, de al menos 6 dígitos";
const REPEAT_LABEL = "Repetí el PIN nuevo";
const SAVE = "Guardar y entrar";
const ANOTHER_CODE = "Pedir otro código";

async function renderStep({
  redeemed = { kind: "redeemed" } as PinCodeRedemptionOutcome,
  signInOutcome = SIGNED_IN as SignInOutcome | Error,
  requestOutcomes = [] as FirstPinCodeRequestOutcome[],
} = {}) {
  const redemptions: [string, string][] = [];
  const signIns: [string, string][] = [];
  const requests: string[] = [];
  const screen = await render(
    <FirstSignInCodeStep
      person={ADA}
      loadPinPolicy={async () => ({ min_digits: 6 })}
      checkRedemption={async () => []}
      redeem={async (code, pin) => {
        redemptions.push([code, pin]);
        return redeemed;
      }}
      signIn={async (userId, pin) => {
        signIns.push([userId, pin]);
        if (signInOutcome instanceof Error) {
          throw signInOutcome;
        }
        return signInOutcome;
      }}
      requestCode={async (userId) => {
        requests.push(userId);
        return requestOutcomes.shift() ?? { kind: "sent" };
      }}
    />,
  );
  return { screen, redemptions, signIns, requests };
}

type Screen = Awaited<ReturnType<typeof renderStep>>["screen"];

async function saveWithCode(screen: Screen) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Código" }), "k7qm 2xpa 3dtr 4hwn");
  await userEvent.fill(screen.getByLabelText(PIN_LABEL), "482915");
  await userEvent.fill(screen.getByLabelText(REPEAT_LABEL), "482915");
  await userEvent.click(screen.getByRole("button", { name: SAVE }));
}

describe("FirstSignInCodeStep", () => {
  it("asks for the code and the new PIN, with no description and the keys that leave, save or ask again", async () => {
    const { screen } = await renderStep();

    await expect.element(screen.getByText("Ada", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Elegí tu PIN" })).toBeVisible();
    await expect
      .element(screen.getByText("Te mandamos un código por correo. Vale 15 minutos."))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("textbox", { name: "Código" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: ANOTHER_CODE })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("F2", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("0-9", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("link", { name: "Volver" })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes back to the sign-in with Escape", async () => {
    const { screen } = await renderStep();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
  });

  it("asks for another code with F2", async () => {
    const { screen, requests } = await renderStep();

    await userEvent.keyboard("{F2}");

    await expect.element(screen.getByText("Te mandamos un código nuevo")).toBeVisible();
    expect(requests).toEqual(["u1"]);
  });

  it("redeems the code and signs the person in with the PIN they chose", async () => {
    const { screen, redemptions, signIns } = await renderStep();

    await saveWithCode(screen);

    await expect.poll(() => signIns).toEqual([["u1", "482915"]]);
    expect(redemptions).toEqual([["k7qm 2xpa 3dtr 4hwn", "482915"]]);
  });

  it("does not sign in when the code is refused, and says so telling to ask for a new one here", async () => {
    const { screen, signIns } = await renderStep({ redeemed: { kind: "code_expired" } });

    await saveWithCode(screen);

    await expect.element(screen.getByText("El código venció")).toBeVisible();
    await expect.element(screen.getByText("Pedí un código nuevo.")).toBeVisible();
    expect(signIns).toEqual([]);
  });

  it("says the PIN was saved and offers the start when the person has no permission on the register", async () => {
    const { screen } = await renderStep({ signInOutcome: { kind: "no_register_permission" } });

    await saveWithCode(screen);

    await expect.element(screen.getByRole("heading", { name: "PIN nuevo guardado" })).toBeVisible();
    await expect.element(screen.getByText("Sin permisos en la caja")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText(PIN_LABEL)).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
  });

  it.each([
    ["signing in is unavailable", { kind: "unavailable" } as const],
    ["signing in fails", new Error("the core connection was replaced")],
  ])(
    "says the PIN was saved and to sign in from the start when %s",
    async (_case, signInOutcome) => {
      const { screen } = await renderStep({ signInOutcome });

      await saveWithCode(screen);

      await expect
        .element(screen.getByRole("heading", { name: "PIN nuevo guardado" }))
        .toBeVisible();
      await expect.element(screen.getByText("No se pudo entrar")).toBeVisible();
      expect(
        getComputedStyle(
          screen.getByText("No se pudo entrar").element().parentElement
            ?.parentElement as HTMLElement,
        ).backgroundColor,
      ).toBe(tokenRgb("warning-subtle"));
      await expect
        .element(screen.getByText("Tu PIN nuevo quedó guardado. Entrá con él desde el inicio."))
        .toBeVisible();
      await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    },
  );

  it("says the new PIN was saved and only the opener can enter when the cash session was opened by another person", async () => {
    const { screen, signIns } = await renderStep({
      redeemed: { kind: "cash_session_opened_by_another" },
    });

    await saveWithCode(screen);

    await expect.element(screen.getByText("Ada", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "PIN nuevo guardado" })).toBeVisible();
    await expect
      .element(screen.getByText("La caja está abierta: solo puede entrar quien la abrió."))
      .toBeVisible();
    expect(
      getComputedStyle(
        screen.getByText("La caja está abierta: solo puede entrar quien la abrió.").element()
          .parentElement?.parentElement as HTMLElement,
      ).backgroundColor,
    ).toBe(tokenRgb("success-subtle"));
    await expect.element(screen.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText(PIN_LABEL)).not.toBeInTheDocument();
    expect(signIns).toEqual([]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("asks for another code for the person and says the previous one no longer works", async () => {
    const { screen, requests } = await renderStep();

    await userEvent.click(screen.getByRole("button", { name: ANOTHER_CODE }));

    await expect.element(screen.getByText("Te mandamos un código nuevo")).toBeVisible();
    await expect.element(screen.getByText("El anterior ya no sirve.")).toBeVisible();
    expect(requests).toEqual(["u1"]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says why no other code was sent, without the confirmation of an earlier one", async () => {
    const { screen } = await renderStep({
      requestOutcomes: [{ kind: "sent" }, { kind: "rate_limited", retry_after_seconds: 541 }],
    });

    await userEvent.click(screen.getByRole("button", { name: ANOTHER_CODE }));
    await expect.element(screen.getByText("Te mandamos un código nuevo")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: ANOTHER_CODE }));

    await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
    await expect
      .element(screen.getByText("Se puede volver a intentar en 10 minutos."))
      .toBeVisible();
    await expect.element(screen.getByText("Te mandamos un código nuevo")).not.toBeInTheDocument();
  });
});
