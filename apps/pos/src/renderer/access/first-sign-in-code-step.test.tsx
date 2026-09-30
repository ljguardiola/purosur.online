import type {
  FirstPinCodeRequestOutcome,
  PinCodeRedemptionOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FirstSignInCodeStep } from "./first-sign-in-code-step";

const ADA = { id: "u1", first_name: "Ada" };
const SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", permission_keys: [] },
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
  it("tells the person the code went to their email and how long it lasts, and asks for it with the new PIN", async () => {
    const { screen } = await renderStep();

    await expect.element(screen.getByText("Ada", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Elegí tu PIN" })).toBeVisible();
    await expect
      .element(screen.getByText("Te mandamos un código por correo. Vale 15 minutos."))
      .toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "Código" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: ANOTHER_CODE })).toBeVisible();
    expect(screen.getByRole("link", { name: "Volver" }).element().getAttribute("href")).toBe(
      "/sign-in",
    );
    await expectNoAccessibilityViolations(screen.container);
  });

  it("redeems the code and signs the person in with the PIN they chose", async () => {
    const { screen, redemptions, signIns } = await renderStep();

    await saveWithCode(screen);

    await expect.poll(() => signIns).toEqual([["u1", "482915"]]);
    expect(redemptions).toEqual([["K7QM2XPA3DTR4HWN", "482915"]]);
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
    expect(
      screen.getByRole("link", { name: "Volver al inicio" }).element().getAttribute("href"),
    ).toBe("/sign-in");
    await expect.element(screen.getByLabelText(PIN_LABEL)).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
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
      await expect
        .element(screen.getByText("Tu PIN nuevo quedó guardado. Entrá con él desde el inicio."))
        .toBeVisible();
      await expect.element(screen.getByRole("link", { name: "Volver al inicio" })).toBeVisible();
    },
  );

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
