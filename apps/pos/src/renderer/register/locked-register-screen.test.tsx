import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SignInUsers } from "../platform/core-client";
import type { SignedInPerson } from "../shell/signed-in-person";
import { render } from "../shell/test-support/render-with-router";
import { LockedRegisterScreen } from "./locked-register-screen";

const OPENER: SignedInPerson = { user_id: "u2", first_name: "Lucas", abilities: [] };
const ROSTER: SignInUser[] = [
  { id: "u3", first_name: "Marta" },
  { id: "u2", first_name: "Lucas" },
  { id: "u1", first_name: "Ada" },
];

function answering(outcome: SignInOutcome) {
  const attempts: { userId: string; pin: string }[] = [];
  const signIn = async (userId: string, pin: string) => {
    attempts.push({ userId, pin });
    return outcome;
  };
  return { signIn, attempts };
}

async function renderScreen(
  options: {
    signIn?: (userId: string, pin: string) => Promise<SignInOutcome>;
    loadUsers?: () => Promise<SignInUsers>;
    registerName?: string | null;
  } = {},
) {
  return render(
    <LockedRegisterScreen
      opener={OPENER}
      registerName={options.registerName === undefined ? "Caja 1" : options.registerName}
      signIn={options.signIn ?? answering({ kind: "unavailable" }).signIn}
      loadUsers={options.loadUsers ?? (async () => ({ users: ROSTER, last_active_user_id: "u1" }))}
      version="1.4.212"
    />,
  );
}

type Screen = Awaited<ReturnType<typeof render>>;

function userSelect(screen: Screen) {
  return screen.getByRole("button", { name: /USUARIO/ });
}

async function expectChosen(screen: Screen, firstName: string) {
  await expect.element(userSelect(screen).getByText(firstName, { exact: true })).toBeVisible();
}

function pathname(screen: Screen) {
  return screen.router.state.location.pathname;
}

describe("LockedRegisterScreen", () => {
  it("shows the register locked in the opener's name, with the opener chosen and the keys of the form", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("heading", { name: "Caja 1 · Lucas" })).toBeVisible();
    await expectChosen(screen, "Lucas");
    await expect.element(screen.getByText("↑", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("↓", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("0-9", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Desbloquear" })).toBeDisabled();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names the card after the opener alone when the register has no name", async () => {
    const screen = await renderScreen({ registerName: null });

    await expect.element(screen.getByRole("heading", { name: "Lucas" })).toBeVisible();
  });

  it("shows the full logo and the version, with no rail and no Esc", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("img", { name: /Puro Sur/ })).toBeVisible();
    await expect.element(screen.getByText("Versión 1.4.212")).toBeVisible();
    await expect
      .element(screen.getByRole("navigation", { name: "Menú de la caja" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("Esc", { exact: true })).not.toBeInTheDocument();
  });

  it("lists the people of sign-in alphabetically", async () => {
    const screen = await renderScreen();

    await userEvent.click(userSelect(screen));

    const options = screen.getByRole("option").elements();
    expect(options.map((option) => option.textContent)).toEqual(["Ada", "Lucas", "Marta"]);
  });

  it("lists the opener alone when the people of sign-in cannot be read", async () => {
    const screen = await renderScreen({
      loadUsers: () => Promise.reject(new Error("the core could not read them")),
    });

    await userEvent.click(userSelect(screen));

    await expect.element(screen.getByRole("option", { name: "Lucas" })).toBeVisible();
    expect(screen.getByRole("option").elements()).toHaveLength(1);
  });

  it("adds the opener to the list when sign-in does not list them", async () => {
    const screen = await renderScreen({
      loadUsers: async () => ({
        users: [{ id: "u1", first_name: "Ada" }],
        last_active_user_id: null,
      }),
    });

    await userEvent.click(userSelect(screen));

    const options = screen.getByRole("option").elements();
    expect(options.map((option) => option.textContent)).toEqual(["Ada", "Lucas"]);
  });

  it("changes the person with the down and up arrows and keeps the opener's choice before anyone's", async () => {
    const screen = await renderScreen();
    await expectChosen(screen, "Lucas");

    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Marta");
    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Marta");
    await userEvent.keyboard("{ArrowUp}");
    await expectChosen(screen, "Lucas");
  });

  it("focuses the PIN", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
  });

  it("unlocks with the opener and the PIN as typed", async () => {
    const { signIn, attempts } = answering({
      kind: "signed_in",
      person: OPENER,
      cash_session: null,
    });
    const screen = await renderScreen({ signIn });
    await expectChosen(screen, "Lucas");

    await userEvent.type(screen.getByLabelText("PIN"), "0042{Enter}");

    await expect.poll(() => attempts).toEqual([{ userId: "u2", pin: "0042" }]);
  });

  it("tries the person chosen with the arrows, and the core's refusal says the register is open", async () => {
    const { signIn, attempts } = answering({ kind: "cash_session_opened_by_another" });
    const screen = await renderScreen({ signIn });
    await expectChosen(screen, "Lucas");
    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Marta");

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    await expect.poll(() => attempts).toEqual([{ userId: "u3", pin: "1234" }]);
    await expect.element(screen.getByText("La caja está abierta")).toBeVisible();
    await expect.element(screen.getByText("Solo puede ingresar quien la abrió.")).toBeVisible();
  });

  it("says when the PIN is wrong, with the attempts left, and disables Desbloquear", async () => {
    const screen = await renderScreen({
      signIn: answering({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 }).signIn,
    });

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Revisá el PIN y volvé a escribirlo. Quedan 7 intentos antes de que el usuario se bloquee.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Desbloquear" })).toBeDisabled();
  });

  it("says when the person has no permission on the register", async () => {
    const screen = await renderScreen({
      signIn: answering({ kind: "no_register_permission" }).signIn,
    });

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    await expect.element(screen.getByText("Sin permisos en la caja")).toBeVisible();
  });

  it("offers to close with another person and to change the PIN with a code, each with its key", async () => {
    const screen = await renderScreen();

    await expect
      .element(screen.getByRole("link", { name: "Cerrar con otro usuario" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Cambiar PIN con código" }))
      .toBeVisible();
    await expect.element(screen.getByText("F12", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("F3", { exact: true })).toBeVisible();
  });

  it("goes to the close by another person with the link", async () => {
    const screen = await renderScreen();

    await userEvent.click(screen.getByRole("link", { name: "Cerrar con otro usuario" }));

    await vi.waitFor(() => expect(pathname(screen)).toBe("/locked-close"));
  });

  it("goes to the close by another person with F12", async () => {
    const screen = await renderScreen();
    await expectChosen(screen, "Lucas");

    await userEvent.keyboard("{F12}");

    await vi.waitFor(() => expect(pathname(screen)).toBe("/locked-close"));
  });

  it("goes to the code redemption with the link", async () => {
    const screen = await renderScreen();

    await userEvent.click(screen.getByRole("link", { name: "Cambiar PIN con código" }));

    await vi.waitFor(() => expect(pathname(screen)).toBe("/pin-code-redemption"));
  });

  it("goes to the code redemption with F3", async () => {
    const screen = await renderScreen();
    await expectChosen(screen, "Lucas");

    await userEvent.keyboard("{F3}");

    await vi.waitFor(() => expect(pathname(screen)).toBe("/pin-code-redemption"));
  });

  it("says the person is locked out after too many wrong PINs, offering a code and the close by another person", async () => {
    const screen = await renderScreen({
      signIn: answering({ kind: "locked", consecutive_failures: 8 }).signIn,
    });

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    await expect
      .element(screen.getByRole("heading", { name: "Lucas está bloqueado" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("Se equivocó 8 veces seguidas con el PIN."))
      .toBeVisible();
    await expect.element(screen.getByText("Se vuelve a entrar con un código")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Tengo un código" })).toBeVisible();
    await expect.element(screen.getByText("F3", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Cerrar con otro usuario" }))
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Volver" })).not.toBeInTheDocument();
    await expect.element(screen.getByText("Esc", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
  });
});
