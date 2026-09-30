import type { SignInOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FirstSignInPinStep } from "./first-sign-in-pin-step";

const ADA = { id: "u1", first_name: "Ada" };

afterEach(() => {
  vi.useRealTimers();
});

function answering(outcome: SignInOutcome | Error) {
  const attempts: { userId: string; pin: string }[] = [];
  const signIn = async (userId: string, pin: string) => {
    attempts.push({ userId, pin });
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  };
  return { signIn, attempts };
}

async function renderStep(signIn: (userId: string, pin: string) => Promise<SignInOutcome>) {
  return render(<FirstSignInPinStep person={ADA} signIn={signIn} />);
}

type Screen = Awaited<ReturnType<typeof renderStep>>;

async function enter(screen: Screen, pin: string) {
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: /^Entrar/ }));
}

describe("FirstSignInPinStep", () => {
  it("names the person and asks for their PIN, focusing the field", async () => {
    const screen = await renderStep(answering({ kind: "unavailable" }).signIn);

    await expect.element(screen.getByText("Ada", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Ingresá tu PIN" })).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toBeEnabled();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    const back = screen.getByRole("link", { name: "Volver" });
    expect(back.element().getAttribute("href")).toBe("/sign-in");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends the person and the PIN as typed", async () => {
    const { signIn, attempts } = answering({
      kind: "signed_in",
      person: { user_id: "u1", first_name: "Ada", permission_keys: [] },
    });
    const screen = await renderStep(signIn);

    await enter(screen, "0042");

    expect(attempts).toEqual([{ userId: "u1", pin: "0042" }]);
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
  });

  it("says the PIN is wrong, clears it and asks for it again", async () => {
    const screen = await renderStep(
      answering({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 }).signIn,
    );

    await enter(screen, "1234");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Revisá el PIN y volvé a escribirlo. Quedan 7 intentos antes de que el usuario se bloquee.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
    await expect
      .element(screen.getByLabelText("PIN"))
      .toHaveAccessibleDescription(/PIN incorrecto/);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("holds the button while it counts the wait down", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const screen = await renderStep(
      answering({ kind: "wrong_pin", retry_after_seconds: 2, attempts_left: 6 }).signIn,
    );

    await enter(screen, "1234");

    await expect.element(screen.getByRole("button", { name: "Entrar en 2 s" })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(2000);
    await userEvent.type(screen.getByLabelText("PIN"), "1");
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("says the person has no permission in the register", async () => {
    const screen = await renderStep(answering({ kind: "no_register_permission" }).signIn);

    await enter(screen, "1234");

    await expect.element(screen.getByText("Sin permisos en la caja")).toBeVisible();
  });

  it.each<{ how: string; request: ReturnType<typeof answering> }>([
    { how: "the core cannot", request: answering({ kind: "unavailable" }) },
    { how: "the request itself fails", request: answering(new Error("the core went away")) },
  ])("says the PIN could not be checked, keeping it, when $how", async ({ request }) => {
    const screen = await renderStep(request.signIn);

    await enter(screen, "1234");

    await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("1234");
  });

  it("replaces the PIN with the lockout, naming the person, and goes back to the sign-in", async () => {
    const screen = await renderStep(answering({ kind: "locked", consecutive_failures: 8 }).signIn);

    await enter(screen, "1234");

    const heading = screen.getByRole("heading", { name: "Ada está bloqueado" });
    await expect.element(heading).toBeVisible();
    await expect.element(heading).toHaveFocus();
    await expect
      .element(screen.getByText("Se equivocó 8 veces seguidas con el PIN."))
      .toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Volver al inicio" }));

    await vi.waitFor(() => expect(screen.router.state.location.pathname).toBe("/sign-in"));
  });
});
