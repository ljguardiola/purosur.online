import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SignInScreen } from "./sign-in-screen";

const USERS: SignInUser[] = [
  { id: "u2", first_name: "Bruno" },
  { id: "u1", first_name: "Ada" },
];

type Screen = Awaited<ReturnType<typeof render>>;

afterEach(() => {
  vi.useRealTimers();
});

async function renderScreen(outcome: SignInOutcome) {
  return render(
    <SignInScreen loadUsers={async () => USERS} signIn={async () => outcome} registerName={null} />,
  );
}

async function enter(screen: Screen, firstName: string, pin: string) {
  await userEvent.click(screen.getByRole("radio", { name: firstName }), { force: true });
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: /^Entrar/ }));
}

const WAITING_NOTICE_ENDING = "Quedan 6 intentos antes de que el usuario se bloquee.";

describe("SignInScreen after a wrong PIN", () => {
  it("says how many attempts are left when there is no wait", async () => {
    const screen = await renderScreen({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 6,
    });

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    await expect
      .element(
        screen.getByText(`Revisá el PIN y volvé a escribirlo. ${WAITING_NOTICE_ENDING}`, {
          exact: true,
        }),
      )
      .toBeVisible();
  });

  it("says one attempt is left in the singular", async () => {
    const screen = await renderScreen({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 1,
    });

    await enter(screen, "Ada", "1234");

    await expect
      .element(
        screen.getByText(
          "Revisá el PIN y volvé a escribirlo. Queda 1 intento antes de que el usuario se bloquee.",
          { exact: true },
        ),
      )
      .toBeVisible();
  });

  it("holds the button and counts the wait down, then offers the attempts again", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const screen = await renderScreen({
      kind: "wrong_pin",
      retry_after_seconds: 2,
      attempts_left: 6,
    });

    await enter(screen, "Ada", "1234");

    await expect
      .element(
        screen.getByText(`Esperá 2 segundos para volver a intentar. ${WAITING_NOTICE_ENDING}`, {
          exact: true,
        }),
      )
      .toBeVisible();
    await userEvent.type(screen.getByLabelText("PIN"), "1");
    await expect.element(screen.getByRole("button", { name: "Entrar en 2 s" })).toBeDisabled();
    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();

    await vi.advanceTimersByTimeAsync(1000);
    await expect
      .element(
        screen.getByText(`Esperá 1 segundo para volver a intentar. ${WAITING_NOTICE_ENDING}`, {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Entrar en 1 s" })).toBeDisabled();

    await vi.advanceTimersByTimeAsync(1000);
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
    await expect
      .element(
        screen.getByText(`Revisá el PIN y volvé a escribirlo. ${WAITING_NOTICE_ENDING}`, {
          exact: true,
        }),
      )
      .toBeVisible();

    await userEvent.type(screen.getByLabelText("PIN"), "2");
    await expect.element(screen.getByText("PIN incorrecto")).not.toBeInTheDocument();
  });

  it("keeps the button disabled after the wait until a digit is typed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const screen = await renderScreen({
      kind: "wrong_pin",
      retry_after_seconds: 1,
      attempts_left: 6,
    });
    await enter(screen, "Ada", "1234");

    await vi.advanceTimersByTimeAsync(1000);

    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
  });

  it("drops the wait and the notice when another user is chosen", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const screen = await renderScreen({
      kind: "wrong_pin",
      retry_after_seconds: 20,
      attempts_left: 6,
    });
    await enter(screen, "Ada", "1234");
    await expect.element(screen.getByRole("button", { name: "Entrar en 20 s" })).toBeVisible();

    await userEvent.click(screen.getByRole("radio", { name: "Bruno" }), { force: true });

    await expect.element(screen.getByText("PIN incorrecto")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  it("stays accessible while waiting", async () => {
    const screen = await renderScreen({
      kind: "wrong_pin",
      retry_after_seconds: 20,
      attempts_left: 6,
    });

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByRole("button", { name: "Entrar en 20 s" })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });
});

describe("SignInScreen when an attempt comes during a wait", () => {
  it("says it is too early to try again, counting the wait down", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const screen = await renderScreen({
      kind: "rate_limited",
      retry_after_seconds: 2,
      attempts_left: 6,
    });

    await enter(screen, "Ada", "1234");

    await expect.element(screen.getByText("Todavía no se puede volver a intentar")).toBeVisible();
    await expect
      .element(
        screen.getByText(`Esperá 2 segundos para volver a intentar. ${WAITING_NOTICE_ENDING}`, {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Entrar en 2 s" })).toBeDisabled();

    await vi.advanceTimersByTimeAsync(2000);

    await expect
      .element(screen.getByText("Todavía no se puede volver a intentar"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
  });
});

describe("SignInScreen when the user is locked", () => {
  it("replaces the list and the PIN with the lockout, naming the user", async () => {
    const screen = await renderScreen({ kind: "locked", consecutive_failures: 8 });

    await enter(screen, "Ada", "1234");

    const heading = screen.getByRole("heading", { name: "Ada está bloqueado" });
    await expect.element(heading).toBeVisible();
    await expect.element(heading).toHaveFocus();
    await expect
      .element(screen.getByText("Se equivocó 8 veces seguidas con el PIN."))
      .toBeVisible();
    await expect.element(screen.getByText("Se vuelve a entrar con un código")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Alguien con permiso lo genera desde el backoffice. Con el código se elige un PIN nuevo en esta caja, con internet.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("radiogroup")).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "¿Quién abre la caja?" }))
      .not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("goes to the code redemption from the primary action", async () => {
    const screen = await renderScreen({ kind: "locked", consecutive_failures: 8 });
    await enter(screen, "Ada", "1234");

    await userEvent.click(screen.getByRole("button", { name: "Tengo un código" }));

    await vi.waitFor(() => expect(window.location.pathname).toBe("/pin-code-redemption"));
  });

  it("goes back to the list of users with nobody chosen, no PIN and no notice", async () => {
    const screen = await renderScreen({ kind: "locked", consecutive_failures: 8 });
    await enter(screen, "Ada", "1234");

    await userEvent.click(screen.getByRole("button", { name: "Volver a la lista de usuarios" }));

    const heading = screen.getByRole("heading", { name: "¿Quién abre la caja?" });
    await expect.element(heading).toBeVisible();
    await expect.element(heading).toHaveFocus();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).not.toBeChecked();
    await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
    await expect
      .element(screen.getByText("Se vuelve a entrar con un código"))
      .not.toBeInTheDocument();
  });
});
