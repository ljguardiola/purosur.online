import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SignInUsers } from "../platform/core-client";
import { render } from "../shell/test-support/render-with-router";
import { sessionsKey } from "./sessions-queries";
import { SignInScreen } from "./sign-in-screen";
import { userSelect } from "./test-support/sign-in-screen";

const roster = (users: SignInUser[]): SignInUsers => ({ users, last_active_user_id: null });

const USERS: SignInUser[] = [
  { id: "u2", first_name: "Bruno" },
  { id: "u1", first_name: "Ada" },
];

const SIGNED_IN: SignInOutcome = {
  kind: "signed_in",
  person: { user_id: "u1", first_name: "Ada", abilities: [] },
  cash_session: null,
};

type Screen = Awaited<ReturnType<typeof render>>;

function renderWithVersion(version: string | null) {
  return render(
    <SignInScreen
      loadUsers={async () => roster(USERS)}
      signIn={async () => SIGNED_IN}
      version={version}
    />,
  );
}

describe("SignInScreen version", () => {
  it("reads the version of the running register before any PIN", async () => {
    const screen = await renderWithVersion("1.0.1539");

    await expect.element(screen.getByText("Versión 1.0.1539")).toBeVisible();
  });

  it("shows no version when the register has none", async () => {
    const screen = await renderWithVersion(null);

    await expect.element(screen.getByText("¿Quién abre la caja?")).toBeVisible();
    await expect.element(screen.getByText(/Versión/)).not.toBeInTheDocument();
  });
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
  return render(
    <SignInScreen
      loadUsers={async () => roster(users)}
      signIn={signIn}
      version={null}
    />,
  );
}

async function choose(screen: Screen, firstName: string) {
  await userEvent.click(screen.getByRole("button", { name: /USUARIO/ }));
  await userEvent.click(page.getByRole("option", { name: firstName }));
}

async function enter(screen: Screen, firstName: string, pin: string) {
  await choose(screen, firstName);
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("SignInScreen", () => {
  it("keeps the chosen person and the typed PIN when a later read of the users fails", async () => {
    const loadUsers = vi
      .fn<() => Promise<SignInUsers>>()
      .mockResolvedValueOnce(roster(USERS))
      .mockRejectedValue(new Error("the core connection was replaced"));
    const screen = await render(
      <SignInScreen
        loadUsers={loadUsers}
        signIn={answering(SIGNED_IN).signIn}
        version={null}
      />,
    );
    await choose(screen, "Bruno");
    await userEvent.type(screen.getByLabelText("PIN"), "12");

    void screen.queryClient.invalidateQueries({ queryKey: sessionsKey });
    await expect
      .poll(
        () =>
          screen.queryClient.getQueryCache().findAll({ queryKey: sessionsKey })[0]?.state.status,
      )
      .toBe("error");

    await expect.element(userSelect(screen)).toHaveTextContent("Bruno");
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("12");
    await expect
      .element(screen.getByText("No se pudieron cargar los usuarios"))
      .not.toBeInTheDocument();
  });

  it("opens on the sign-in card with the person and the PIN, with no header", async () => {
    const screen = await renderScreen();

    await expect.element(userSelect(screen)).toBeVisible();
    await expect.element(screen.getByText("USUARIO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("PIN", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("0-9")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /^Entrar/ })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Sin sesión abierta")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("heading")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers every user by first name, in alphabetical order", async () => {
    const screen = await renderScreen();

    await userEvent.click(userSelect(screen));

    const names = page.getByRole("option").elements().map((option) => option.textContent);
    expect(names).toEqual(["Ada", "Bruno"]);
  });

  it("shows no status about the register, which has no name to show", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("focuses the PIN when the screen opens", async () => {
    const screen = await renderScreen();

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
    request.finish({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    expect(request.attempts).toHaveLength(1);
  });

  it("keeps the chosen user and the PIN from changing while the PIN is being checked", async () => {
    const request = pending();
    const screen = await renderScreen(request.signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(userSelect(screen)).toBeDisabled();
    await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
    request.finish({ kind: "unavailable" });
    await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
    await expect.element(userSelect(screen)).toBeEnabled();
    await expect.element(userSelect(screen)).toHaveTextContent("Ada");
    await expect.element(screen.getByLabelText("PIN")).toBeEnabled();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("1234");
  });

  it("says the PIN is wrong, clears it and asks for it again", async () => {
    const screen = await renderScreen(
      answering({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 }).signIn,
    );

    await enter(screen, "Ada", "1234");

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
    await expect.element(screen.getByLabelText("PIN")).not.toHaveAttribute("aria-invalid", "true");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says only the person who opened the cash session can sign in, clearing the PIN", async () => {
    const screen = await renderScreen(answering({ kind: "cash_session_opened_by_another" }).signIn);

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByText("La caja está abierta")).toBeVisible();
    await expect.element(screen.getByText("Solo puede ingresar quien la abrió.")).toBeVisible();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    await expect.element(screen.getByLabelText("PIN")).not.toHaveAttribute("aria-invalid", "true");
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
    const screen = await renderScreen(
      answering({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 }).signIn,
    );
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
        loadUsers={() => new Promise<SignInUsers>(() => {})}
        signIn={answering(SIGNED_IN).signIn}
        version={null}
      />,
    );

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(userSelect(screen)).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "¿Quién abre la caja?" }))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("says nobody has signed in on this register yet when the list is empty", async () => {
    const screen = await renderScreen(answering(SIGNED_IN).signIn, []);

    await expect.element(screen.getByText("Todavía nadie ingresó en esta caja.")).toBeVisible();
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
      return roster(USERS);
    };
    const screen = await render(
      <SignInScreen
        loadUsers={loadUsers}
        signIn={answering(SIGNED_IN).signIn}
        version={null}
      />,
    );
    await expect.element(screen.getByText("No se pudieron cargar los usuarios")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(userSelect(screen)).toBeVisible();
    expect(attempts).toBe(2);
  });

  it.each<{ state: string; loadUsers: () => Promise<SignInUsers> }>([
    { state: "loading", loadUsers: () => new Promise<SignInUsers>(() => {}) },
    {
      state: "failed to load",
      loadUsers: async () => {
        throw new Error("the core could not read them");
      },
    },
    { state: "empty", loadUsers: async () => roster([]) },
    { state: "loaded", loadUsers: async () => roster(USERS) },
  ])("offers changing the PIN with a code while the users are $state", async ({ loadUsers }) => {
    const screen = await render(
      <SignInScreen
        loadUsers={loadUsers}
        signIn={answering(SIGNED_IN).signIn}
        version={null}
      />,
    );

    const link = screen.getByRole("link", { name: "Cambiar PIN con código" });
    await expect.element(link).toBeVisible();
    expect(link.element().getAttribute("href")).toBe("/pin-code-redemption");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers changing the PIN with a code after the button that signs in", async () => {
    const screen = await renderScreen();

    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeVisible();
    const button = screen.getByRole("button", { name: "Entrar" }).element();
    const link = screen
      .getByRole("link", { name: "Cambiar PIN con código" })
      .element();
    expect(button.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each<{ state: string; loadUsers: () => Promise<SignInUsers> }>([
    { state: "loading", loadUsers: () => new Promise<SignInUsers>(() => {}) },
    {
      state: "failed to load",
      loadUsers: async () => {
        throw new Error("the core could not read them");
      },
    },
    { state: "empty", loadUsers: async () => roster([]) },
    { state: "loaded", loadUsers: async () => roster(USERS) },
  ])("offers signing in for the first time while the users are $state", async ({ loadUsers }) => {
    const screen = await render(
      <SignInScreen
        loadUsers={loadUsers}
        signIn={answering(SIGNED_IN).signIn}
        version={null}
      />,
    );

    const link = screen.getByRole("link", { name: "Primer ingreso" });
    await expect.element(link).toBeVisible();
    expect(link.element().getAttribute("href")).toBe("/first-sign-in");
    await expectNoAccessibilityViolations(screen.container);
  });
});
