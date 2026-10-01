import type {
  FirstPinCodeRequestOutcome,
  PinCodeRedemptionOutcome,
  SignInLookupOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FirstSignInScreen } from "./first-sign-in-screen";

const SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", abilities: [] },
  cash_session: null,
};

async function renderScreen(
  outcome: SignInLookupOutcome,
  {
    requested = { kind: "sent" } as FirstPinCodeRequestOutcome,
    redeemed = { kind: "redeemed" } as PinCodeRedemptionOutcome,
  } = {},
) {
  const lookups: string[] = [];
  const attempts: { userId: string; pin: string }[] = [];
  const requests: string[] = [];
  const redemptions: { code: string; pin: string }[] = [];
  const screen = await render(
    <FirstSignInScreen
      lookup={async (email) => {
        lookups.push(email);
        return outcome;
      }}
      signIn={async (userId, pin) => {
        attempts.push({ userId, pin });
        return SIGNED_IN;
      }}
      requestCode={async (userId) => {
        requests.push(userId);
        return requested;
      }}
      redeem={async (code, pin) => {
        redemptions.push({ code, pin });
        return redeemed;
      }}
    />,
  );
  return { screen, lookups, attempts, requests, redemptions };
}

async function lookUp(screen: Awaited<ReturnType<typeof render>>) {
  await userEvent.type(screen.getByRole("textbox", { name: "Correo" }), "ada@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

it("starts by asking for the email", async () => {
  const { screen } = await renderScreen({ kind: "not_found" });

  await expect
    .element(screen.getByRole("heading", { name: "Ingresar por primera vez" }))
    .toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: "Correo" })).toBeVisible();
  await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

it("asks for the PIN of the person the email belongs to and signs them in with it", async () => {
  const { screen, lookups, attempts } = await renderScreen({
    kind: "has_pin",
    user: { id: "u1", first_name: "Ada" },
  });

  await lookUp(screen);
  await expect.element(screen.getByRole("heading", { name: "Ingresá tu PIN" })).toBeVisible();
  await userEvent.type(screen.getByLabelText("PIN"), "0042");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

  expect(lookups).toEqual(["ada@example.com"]);
  expect(attempts).toEqual([{ userId: "u1", pin: "0042" }]);
});

it("says the person has no PIN yet, without asking for one", async () => {
  const { screen } = await renderScreen({
    kind: "no_pin",
    user: { id: "u1", first_name: "Ada" },
  });

  await lookUp(screen);

  await expect.element(screen.getByRole("heading", { name: "No tenés PIN todavía" })).toBeVisible();
  await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("textbox", { name: "Correo" })).not.toBeInTheDocument();
});

it("offers to email a code to the person who has no PIN, and asks nothing before they accept", async () => {
  const { screen, requests } = await renderScreen({
    kind: "no_pin",
    user: { id: "u1", first_name: "Ada" },
  });

  await lookUp(screen);

  await expect
    .element(screen.getByRole("button", { name: "Mandarme un código por correo" }))
    .toBeVisible();
  expect(requests).toEqual([]);
});

it("takes the person who has no PIN from the emailed code to being signed in with the PIN they choose", async () => {
  const { screen, requests, redemptions, attempts } = await renderScreen({
    kind: "no_pin",
    user: { id: "u1", first_name: "Ada" },
  });

  await lookUp(screen);
  await userEvent.click(screen.getByRole("button", { name: "Mandarme un código por correo" }));
  await expect.element(screen.getByRole("heading", { name: "Elegí tu PIN" })).toBeVisible();
  await userEvent.fill(screen.getByRole("textbox", { name: "Código" }), "K7QM2XPA3DTR4HWN");
  await userEvent.fill(screen.getByLabelText("PIN nuevo, de al menos 6 dígitos"), "482915");
  await userEvent.fill(screen.getByLabelText("Repetí el PIN nuevo"), "482915");
  await userEvent.click(screen.getByRole("button", { name: "Guardar y entrar" }));

  await expect.poll(() => attempts).toEqual([{ userId: "u1", pin: "482915" }]);
  expect(requests).toEqual(["u1"]);
  expect(redemptions).toEqual([{ code: "K7QM2XPA3DTR4HWN", pin: "482915" }]);
});

it("stays on the no-PIN step when no code could be sent", async () => {
  const { screen } = await renderScreen(
    { kind: "no_pin", user: { id: "u1", first_name: "Ada" } },
    { requested: { kind: "unreachable" } },
  );

  await lookUp(screen);
  await userEvent.click(screen.getByRole("button", { name: "Mandarme un código por correo" }));

  await expect.element(screen.getByText("Sin conexión a internet")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Elegí tu PIN" }))
    .not.toBeInTheDocument();
});
