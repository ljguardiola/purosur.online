import type { SignInLookupOutcome, SignInOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FirstSignInScreen } from "./first-sign-in-screen";

const SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { first_name: "Ada", permission_keys: [] },
};

async function renderScreen(outcome: SignInLookupOutcome) {
  const lookups: string[] = [];
  const attempts: { userId: string; pin: string }[] = [];
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
    />,
  );
  return { screen, lookups, attempts };
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
