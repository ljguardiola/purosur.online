import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SignInScreen } from "./sign-in-screen";

const USERS: SignInUser[] = [
  { id: "u2", first_name: "Bruno" },
  { id: "u1", first_name: "Ada" },
];

const SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { first_name: "Ada", permission_keys: [] },
};

type Screen = Awaited<ReturnType<typeof render>>;

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

function pending() {
  const attempts: { userId: string; pin: string }[] = [];
  let finish: (outcome: SignInOutcome) => void = () => {};
  const signIn = (userId: string, pin: string) => {
    attempts.push({ userId, pin });
    return new Promise<SignInOutcome>((resolve) => {
      finish = resolve;
    });
  };
  return { signIn, attempts, finish: (outcome: SignInOutcome) => finish(outcome) };
}

async function renderScreen(signIn = answering(SIGNED_IN).signIn, users = USERS) {
  return render(<SignInScreen loadUsers={async () => users} signIn={signIn} />);
}

async function choose(screen: Screen, firstName: string) {
  await userEvent.click(screen.getByRole("radio", { name: firstName }), { force: true });
}

async function enter(screen: Screen, firstName: string, pin: string) {
  await choose(screen, firstName);
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("SignInScreen", () => {
  it("asks who opens the register, offering every user by first name", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByText("Sin sesión abierta")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("radiogroup", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows no status about the register, which has no name to show", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("keeps the PIN and the button disabled until somebody is chosen", async () => {
    const screen = await renderScreen();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeVisible();

    await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
  });

  it("focuses the PIN once somebody is chosen", async () => {
    const screen = await renderScreen();

    await choose(screen, "Ada");

    await expect.element(screen.getByLabelText("PIN")).toBeEnabled();
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
  });

  it("keeps the button disabled until a digit is typed", async () => {
    const screen = await renderScreen();
    await choose(screen, "Ada");
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("PIN"), "1");

    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("clears the PIN when another user is chosen", async () => {
    const screen = await renderScreen();
    await choose(screen, "Ada");
    await userEvent.type(screen.getByLabelText("PIN"), "1234");

    await choose(screen, "Bruno");

    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
  });

  it("sends the chosen user and the PIN as typed", async () => {
    const { signIn, attempts } = answering(SIGNED_IN);
    const screen = await renderScreen(signIn);

    await enter(screen, "Bruno", "0042");

    expect(attempts).toEqual([{ userId: "u2", pin: "0042" }]);
  });

  it("sends the PIN when Enter is pressed in the field", async () => {
    const { signIn, attempts } = answering(SIGNED_IN);
    const screen = await renderScreen(signIn);
    await choose(screen, "Ada");

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    expect(attempts).toEqual([{ userId: "u1", pin: "1234" }]);
  });

  it("does not send anything when Enter is pressed before a digit is typed", async () => {
    const { signIn, attempts } = answering(SIGNED_IN);
    const screen = await renderScreen(signIn);
    await choose(screen, "Ada");

    await userEvent.keyboard("{Enter}");

    expect(attempts).toEqual([]);
  });

  it("keeps the button disabled while the PIN is being checked, so it is sent only once", async () => {
    const request = pending();
    const screen = await renderScreen(request.signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    request.finish({ kind: "wrong_pin" });
    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    expect(request.attempts).toHaveLength(1);
  });

  it("keeps the chosen user and the PIN from changing while the PIN is being checked", async () => {
    const request = pending();
    const screen = await renderScreen(request.signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeDisabled();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeDisabled();
    await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
    request.finish({ kind: "unavailable" });
    await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeChecked();
    await expect.element(screen.getByRole("radio", { name: "Bruno" })).toBeEnabled();
    await expect.element(screen.getByLabelText("PIN")).toBeEnabled();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("1234");
  });

  it("says the PIN is wrong, clears it and asks for it again", async () => {
    const screen = await renderScreen(answering({ kind: "wrong_pin" }).signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    await expect.element(screen.getByText("Revisá el PIN y volvé a escribirlo.")).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
    await expect.element(screen.getByLabelText("PIN")).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(screen.getByLabelText("PIN"))
      .toHaveAccessibleDescription(/PIN incorrecto/);
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says the user has no permission in the register, clearing the PIN", async () => {
    const screen = await renderScreen(answering({ kind: "no_register_permission" }).signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByText("Sin permisos en la caja")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Tu usuario no tiene ningún permiso para usar la caja. Pedile a quien administra los usuarios que te asigne uno.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says the PIN could not be checked, keeping what was typed, when the core cannot", async () => {
    const screen = await renderScreen(answering({ kind: "unavailable" }).signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
    await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("1234");
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says the PIN could not be checked when the request itself fails", async () => {
    const screen = await renderScreen(answering(new Error("the core went away")).signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("drops the message once another digit is typed", async () => {
    const screen = await renderScreen(answering({ kind: "wrong_pin" }).signIn);
    await enter(screen, "Ada", "1234");
    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();

    await userEvent.type(screen.getByLabelText("PIN"), "5");

    await expect.element(screen.getByText("PIN incorrecto")).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("PIN")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("drops the message once another user is chosen", async () => {
    const screen = await renderScreen(answering({ kind: "no_register_permission" }).signIn);
    await enter(screen, "Ada", "1234");
    await expect.element(screen.getByText("Sin permisos en la caja")).toBeVisible();

    await choose(screen, "Bruno");

    await expect.element(screen.getByText("Sin permisos en la caja")).not.toBeInTheDocument();
  });

  it("clears the PIN once the user is signed in", async () => {
    const screen = await renderScreen(answering(SIGNED_IN).signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
  });

  it("shows the users are loading before they arrive", async () => {
    const screen = await render(
      <SignInScreen
        loadUsers={() => new Promise<SignInUser[]>(() => {})}
        signIn={answering(SIGNED_IN).signIn}
      />,
    );

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByRole("radiogroup")).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says nobody has a PIN when no user can sign in", async () => {
    const screen = await renderScreen(answering(SIGNED_IN).signIn, []);

    await expect.element(screen.getByText("No hay usuarios con PIN en esta caja")).toBeVisible();
    await expect
      .element(screen.getByText("Cuando alguien elija su PIN con un código, va a aparecer acá."))
      .toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers to try again when the users could not be read, and shows them once they can", async () => {
    let attempts = 0;
    const loadUsers = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("the core could not read them");
      }
      return USERS;
    };
    const screen = await render(
      <SignInScreen loadUsers={loadUsers} signIn={answering(SIGNED_IN).signIn} />,
    );
    await expect.element(screen.getByText("No se pudieron cargar los usuarios")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeVisible();
    expect(attempts).toBe(2);
  });
});
