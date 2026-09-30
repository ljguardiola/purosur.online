import type { SignInOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { SignedInPerson } from "../access/signed-in-person";
import { LockedRegisterScreen } from "./locked-register-screen";
import { render } from "./test-support/render-with-router";

const OPENER: SignedInPerson = { user_id: "u1", first_name: "Ada", permission_keys: [] };
const OPENED_AT = "2026-09-30T12:02:00.000Z";

function answering(outcome: SignInOutcome) {
  const attempts: { userId: string; pin: string }[] = [];
  const signIn = async (userId: string, pin: string) => {
    attempts.push({ userId, pin });
    return outcome;
  };
  return { signIn, attempts };
}

async function renderScreen(signIn = answering({ kind: "unavailable" }).signIn) {
  return render(
    <LockedRegisterScreen
      opener={OPENER}
      registerName="Caja 1"
      openedAt={OPENED_AT}
      signIn={signIn}
    />,
  );
}

type Screen = Awaited<ReturnType<typeof render>>;

async function retake(screen: Screen, pin: string) {
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: /^Retomar/ }));
}

describe("LockedRegisterScreen", () => {
  it("shows the register locked in the opener's name, with only the opener to resume it", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Caja bloqueada" })).toBeVisible();
    await expect.element(screen.getByText("Caja 1 · Sesión abierta 09:02")).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeChecked();
    expect(screen.getByRole("radio").elements()).toHaveLength(1);
    await expect.element(screen.getByRole("button", { name: "Retomar" })).toBeDisabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers the opener a code to change the PIN, and no other way in", async () => {
    const screen = await renderScreen();

    await expect
      .element(screen.getByRole("link", { name: "Tengo un código para cambiar el PIN" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Ingresar por primera vez" }))
      .not.toBeInTheDocument();
  });

  it("focuses the PIN", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
  });

  it("resumes with the opener and the PIN as typed", async () => {
    const { signIn, attempts } = answering({
      kind: "signed_in",
      person: OPENER,
    });
    const screen = await renderScreen(signIn);

    await retake(screen, "0042");

    expect(attempts).toEqual([{ userId: "u1", pin: "0042" }]);
  });

  it("says when the PIN is wrong", async () => {
    const screen = await renderScreen(
      answering({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 6 }).signIn,
    );

    await retake(screen, "1234");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
  });

  it("says when the opener has no permission on the register", async () => {
    const screen = await renderScreen(answering({ kind: "no_register_permission" }).signIn);

    await retake(screen, "1234");

    await expect.element(screen.getByText("Sin permisos en la caja")).toBeVisible();
  });

  it("says the opener is locked out after too many wrong PINs, offering a code instead of another try", async () => {
    const screen = await renderScreen(
      answering({ kind: "locked", consecutive_failures: 8 }).signIn,
    );

    await retake(screen, "1234");

    await expect.element(screen.getByRole("heading", { name: "Ada está bloqueado" })).toBeVisible();
    await expect
      .element(screen.getByText("Se equivocó 8 veces seguidas con el PIN."))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Tengo un código" })).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
  });
});
