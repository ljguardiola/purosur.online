import type { Authorization, SignInUser } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { SignedInPerson } from "./signed-in-person";
import {
  authorizationDialog,
  authorizeInModal,
  chooseAuthorizer,
  typeAuthorizationPin,
} from "./test-support/authorization-modal-steps";
import type { GuardedCashInOutcome } from "./test-support/guarded-cash-in-form";
import { GuardedCashInForm } from "./test-support/guarded-cash-in-form";
import { render } from "./test-support/render-with-router";

const TOMAS: SignedInPerson = {
  user_id: "u1",
  first_name: "Tomás",
  abilities: ["open_cash_session"],
};
const AUTHORIZERS: SignInUser[] = [
  { id: "u3", first_name: "Sofía" },
  { id: "u2", first_name: "Grace" },
];

afterEach(() => {
  vi.useRealTimers();
});

const NO_WAIT: GuardedCashInOutcome = {
  kind: "wrong_pin",
  retry_after_seconds: 0,
  attempts_left: 7,
};

function recording(outcome: GuardedCashInOutcome | (() => GuardedCashInOutcome)) {
  const submissions: (Authorization | undefined)[] = [];
  const submit = async (authorization: Authorization | undefined) => {
    submissions.push(authorization);
    return typeof outcome === "function" ? outcome() : outcome;
  };
  return { submit, submissions };
}

function loading(users: SignInUser[] = AUTHORIZERS) {
  const requested: string[] = [];
  const loadAuthorizers = async (permission: string) => {
    requested.push(permission);
    return users;
  };
  return { loadAuthorizers, requested };
}

async function renderForm(options: {
  required?: boolean;
  loadAuthorizers?: (permission: string) => Promise<SignInUser[]>;
  submit?: ReturnType<typeof recording>["submit"];
}) {
  return render(
    <GuardedCashInForm
      person={TOMAS}
      required={options.required ?? true}
      loadAuthorizers={options.loadAuthorizers ?? loading().loadAuthorizers}
      submit={options.submit ?? recording({ kind: "performed", authorized_by: null }).submit}
    />,
  );
}

async function openModal(options: Parameters<typeof renderForm>[0] = {}) {
  const screen = await renderForm(options);
  await userEvent.click(screen.getByRole("button", { name: "Cargar" }));
  await expect.element(authorizationDialog()).toBeVisible();
  return screen;
}

function waitingNotice(seconds: number): string {
  const wait = seconds === 1 ? "1 segundo" : `${seconds} segundos`;
  return `Esperá ${wait} para volver a intentar. Quedan 6 intentos antes de que el usuario se bloquee.`;
}

describe("an action guarded by another person's PIN", () => {
  describe("when no authorization is required", () => {
    it("shows no authorization and sends none", async () => {
      const { loadAuthorizers, requested } = loading();
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      const screen = await renderForm({ required: false, loadAuthorizers, submit });

      await userEvent.click(screen.getByRole("button", { name: "Cargar" }));

      await expect.element(screen.getByText("Cargado por el operador")).toBeVisible();
      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      expect(submissions).toEqual([undefined]);
      expect(requested).toEqual([]);
    });
  });

  describe("when an authorization is required", () => {
    it("shows nothing about it until the action is confirmed, and then asks in a modal", async () => {
      const { loadAuthorizers, requested } = loading();
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      const screen = await renderForm({ loadAuthorizers, submit });
      await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
      await expect
        .element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO"))
        .not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Cargar" }));

      await expect.element(authorizationDialog()).toBeVisible();
      expect(submissions).toEqual([]);
      expect(requested).toEqual(["record_cash_in"]);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("draws the shield header with Esc, the action's subtitle, both labelled fields and the button", async () => {
      await openModal();
      const dialog = authorizationDialog();

      await expect.element(dialog.getByRole("heading", { name: "Autorizar" })).toBeVisible();
      await expect.element(dialog.getByText("Esc", { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("Registrar ingreso", { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("USUARIO", { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("↑", { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("↓", { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("PIN", { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("0-9", { exact: true })).toBeVisible();
      const button = dialog.getByRole("button", { name: /^Autorizar/ });
      await expect.element(button).toBeVisible();
      await expect.element(button.getByText("Enter", { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("Persona que autoriza")).not.toBeInTheDocument();
    });

    it("chooses the first authorizer by first name and focuses the PIN", async () => {
      await openModal();
      const dialog = authorizationDialog();

      await expect
        .element(dialog.getByRole("button", { name: /USUARIO/ }))
        .toHaveTextContent("Grace");
      await expect.element(dialog.getByLabelText("PIN")).toHaveFocus();
    });

    it("changes the chosen person with the up and down arrows and stops at the ends", async () => {
      await openModal();
      const person = authorizationDialog().getByRole("button", { name: /USUARIO/ });

      await userEvent.keyboard("{ArrowDown}");
      await expect.element(person).toHaveTextContent("Sofía");
      await userEvent.keyboard("{ArrowDown}");
      await expect.element(person).toHaveTextContent("Sofía");
      await userEvent.keyboard("{ArrowUp}");
      await expect.element(person).toHaveTextContent("Grace");
      await userEvent.keyboard("{ArrowUp}");
      await expect.element(person).toHaveTextContent("Grace");
    });

    it("offers every authorizer by first name in the select", async () => {
      await openModal();

      await userEvent.click(authorizationDialog().getByRole("button", { name: /USUARIO/ }));

      await expect
        .element(authorizationDialog().getByRole("option", { name: "Grace" }))
        .toBeVisible();
      await expect
        .element(authorizationDialog().getByRole("option", { name: "Sofía" }))
        .toBeVisible();
    });

    it("types the digits into the PIN", async () => {
      await openModal();

      await userEvent.keyboard("1234");

      await expect.element(authorizationDialog().getByLabelText("PIN")).toHaveValue("1234");
    });

    it("cannot authorize until a PIN is typed", async () => {
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      await openModal({ submit });
      const button = authorizationDialog().getByRole("button", { name: /^Autorizar/ });

      await expect.element(button).toBeDisabled();
      await userEvent.keyboard("{Enter}");
      expect(submissions).toEqual([]);
      await userEvent.keyboard("1");
      await expect.element(button).toBeEnabled();
    });

    it("sends the chosen person and the PIN on Enter, closes, and shows who authorized", async () => {
      const { submit, submissions } = recording({
        kind: "performed",
        authorized_by: { user_id: "u2", first_name: "Grace" },
      });
      const screen = await openModal({ submit });

      await authorizeInModal({ pin: "1234" });

      await expect.element(screen.getByText("Cargado con autorización de Grace")).toBeVisible();
      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      expect(submissions).toEqual([{ user_id: "u2", pin: "1234" }]);
    });

    it("sends the person chosen with the arrows", async () => {
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      await openModal({ submit });

      await userEvent.keyboard("{ArrowDown}");
      await authorizeInModal({ pin: "1234" });

      await vi.waitFor(() => expect(submissions).toEqual([{ user_id: "u3", pin: "1234" }]));
    });

    it("sends the person picked from the select", async () => {
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      await openModal({ submit });

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      await vi.waitFor(() => expect(submissions).toEqual([{ user_id: "u3", pin: "1234" }]));
    });

    it("authorizes when the button is clicked", async () => {
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      await openModal({ submit });
      await typeAuthorizationPin("1234");

      await userEvent.click(authorizationDialog().getByRole("button", { name: /^Autorizar/ }));

      await vi.waitFor(() => expect(submissions).toEqual([{ user_id: "u2", pin: "1234" }]));
    });

    it("closes on Esc without performing the action", async () => {
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      const screen = await openModal({ submit });
      await userEvent.keyboard("1234");

      await userEvent.keyboard("{Escape}");

      await expect.element(authorizationDialog()).not.toBeInTheDocument();
      await expect.element(screen.getByText("Cargado por el operador")).not.toBeInTheDocument();
      expect(submissions).toEqual([]);
    });

    it("starts again without the typed PIN when it is opened a second time", async () => {
      const screen = await openModal();
      await userEvent.keyboard("1234");
      await userEvent.keyboard("{Escape}");

      await userEvent.click(screen.getByRole("button", { name: "Cargar" }));

      await expect.element(authorizationDialog().getByLabelText("PIN")).toHaveValue("");
    });

    it("lets no key of the screen behind act while it is open, and gives them back when it closes", async () => {
      const screen = await openModal();

      await userEvent.keyboard("{F9}");
      await expect.element(screen.getByText("Atajo de la pantalla usado")).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await userEvent.keyboard("{F9}");
      await expect.element(screen.getByText("Atajo de la pantalla usado")).toBeVisible();
    });

    it("asks for the PIN again before the next action, since it authorized only one", async () => {
      const { submit, submissions } = recording({
        kind: "performed",
        authorized_by: { user_id: "u2", first_name: "Grace" },
      });
      const screen = await openModal({ submit });
      await authorizeInModal({ pin: "1234" });
      await expect.element(screen.getByText("Cargado con autorización de Grace")).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Cargar" }));
      await expect.element(authorizationDialog().getByLabelText("PIN")).toHaveValue("");
      await authorizeInModal({ pin: "5678" });

      await vi.waitFor(() =>
        expect(submissions).toEqual([
          { user_id: "u2", pin: "1234" },
          { user_id: "u2", pin: "5678" },
        ]),
      );
    });

    it("clears the PIN and focuses it again after a wrong PIN, inside the modal", async () => {
      const screen = await openModal({ submit: recording(NO_WAIT).submit });

      await authorizeInModal({ pin: "9999" });

      const dialog = authorizationDialog();
      await expect.element(dialog.getByText("PIN incorrecto")).toBeVisible();
      await expect
        .element(
          dialog.getByText(
            "Revisá el PIN y volvé a escribirlo. Quedan 7 intentos antes de que el usuario se bloquee.",
            { exact: true },
          ),
        )
        .toBeVisible();
      await expect.element(dialog.getByLabelText("PIN")).toHaveValue("");
      await expect.element(dialog.getByLabelText("PIN")).toHaveFocus();
      await expect.element(dialog.getByLabelText("PIN")).toBeInvalid();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says one attempt is left in the singular", async () => {
      await openModal({
        submit: recording({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 1 }).submit,
      });

      await authorizeInModal({ pin: "9999" });

      await expect
        .element(
          authorizationDialog().getByText(
            "Revisá el PIN y volvé a escribirlo. Queda 1 intento antes de que el usuario se bloquee.",
            { exact: true },
          ),
        )
        .toBeVisible();
    });

    it("holds the PIN and counts the wait down, then offers the attempts again", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      await openModal({
        submit: recording({ kind: "wrong_pin", retry_after_seconds: 2, attempts_left: 6 }).submit,
      });

      await authorizeInModal({ pin: "9999" });

      const dialog = authorizationDialog();
      await expect.element(dialog.getByText("PIN incorrecto")).toBeVisible();
      await expect.element(dialog.getByText(waitingNotice(2), { exact: true })).toBeVisible();
      await expect.element(dialog.getByLabelText("PIN")).toBeDisabled();
      await expect.element(dialog.getByRole("button", { name: /^Autorizar/ })).toBeDisabled();

      await vi.advanceTimersByTimeAsync(1000);
      await expect.element(dialog.getByText(waitingNotice(1), { exact: true })).toBeVisible();

      await vi.advanceTimersByTimeAsync(1000);
      await expect.element(dialog.getByLabelText("PIN")).toBeEnabled();
      await expect.element(dialog.getByLabelText("PIN")).toHaveFocus();
    });

    it("tells the person still has to wait, then drops the notice when the wait is over", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const screen = await openModal({
        submit: recording({ kind: "rate_limited", retry_after_seconds: 1, attempts_left: 5 })
          .submit,
      });

      await authorizeInModal({ pin: "1234" });

      const dialog = authorizationDialog();
      await expect.element(dialog.getByText("Todavía no se puede volver a intentar")).toBeVisible();
      await expect.element(dialog.getByLabelText("PIN")).toBeDisabled();
      await expectNoAccessibilityViolations(screen.container);

      await vi.advanceTimersByTimeAsync(1000);
      await expect
        .element(dialog.getByText("Todavía no se puede volver a intentar"))
        .not.toBeInTheDocument();
      await expect.element(dialog.getByLabelText("PIN")).toBeEnabled();
    });

    it("drops the wait and the notice when another person is chosen", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      await openModal({
        submit: recording({ kind: "wrong_pin", retry_after_seconds: 20, attempts_left: 4 }).submit,
      });
      await authorizeInModal({ pin: "9999" });
      await expect.element(authorizationDialog().getByLabelText("PIN")).toBeDisabled();

      await chooseAuthorizer("Sofía");

      await expect.element(authorizationDialog().getByLabelText("PIN")).toBeEnabled();
      await expect
        .element(authorizationDialog().getByText("PIN incorrecto"))
        .not.toBeInTheDocument();
    });

    it("says the chosen person is locked, without offering their PIN", async () => {
      const screen = await openModal({
        submit: recording({ kind: "locked", consecutive_failures: 8 }).submit,
      });

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      const dialog = authorizationDialog();
      await expect.element(dialog.getByText("Sofía está bloqueado")).toBeVisible();
      await expect
        .element(
          dialog.getByText(
            "Se equivocó 8 veces seguidas con el PIN. Elegí a otra persona con permiso.",
          ),
        )
        .toBeVisible();
      await expect.element(dialog.getByLabelText("PIN")).toBeDisabled();
      await expect.element(dialog.getByRole("button", { name: /^Autorizar/ })).toBeDisabled();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("lets someone else authorize after a person turned out locked", async () => {
      const { submit, submissions } = recording(() =>
        submissions.length === 1
          ? { kind: "locked", consecutive_failures: 8 }
          : { kind: "performed", authorized_by: { user_id: "u2", first_name: "Grace" } },
      );
      const screen = await openModal({ submit });
      await authorizeInModal({ as: "Sofía", pin: "1234" });
      await expect.element(authorizationDialog().getByText("Sofía está bloqueado")).toBeVisible();

      await chooseAuthorizer("Grace");
      await authorizeInModal({ pin: "5678" });

      await expect.element(screen.getByText("Cargado con autorización de Grace")).toBeVisible();
      expect(submissions).toEqual([
        { user_id: "u3", pin: "1234" },
        { user_id: "u2", pin: "5678" },
      ]);
    });

    it("says the chosen person cannot authorize it when they lack the permission", async () => {
      const screen = await openModal({ submit: recording({ kind: "lacks_permission" }).submit });

      await authorizeInModal({ as: "Sofía", pin: "1234" });

      const dialog = authorizationDialog();
      await expect.element(dialog.getByText("Sofía no puede autorizar esto")).toBeVisible();
      await expect.element(dialog.getByText("Elegí a otra persona con permiso.")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("reads the authorizers again when the chosen person lacks the permission", async () => {
      const answers = [AUTHORIZERS, [{ id: "u2", first_name: "Grace" }]];
      let loads = 0;
      const loadAuthorizers = async () => {
        loads += 1;
        return answers[Math.min(loads, answers.length) - 1] ?? [];
      };
      await openModal({ loadAuthorizers, submit: recording({ kind: "lacks_permission" }).submit });

      await authorizeInModal({ as: "Sofía", pin: "1234" });
      await expect.poll(() => loads).toBe(2);
      const dialog = authorizationDialog();
      await expect.element(dialog.getByText("Sofía no puede autorizar esto")).toBeVisible();
      await userEvent.click(dialog.getByRole("button", { name: /USUARIO/ }));

      await expect.element(dialog.getByRole("option", { name: "Grace" })).toBeVisible();
      await expect.element(dialog.getByRole("option", { name: "Sofía" })).not.toBeInTheDocument();
    });

    it("says the PIN could not be checked when the register cannot verify it", async () => {
      await openModal({ submit: recording({ kind: "unavailable" }).submit });

      await authorizeInModal({ pin: "1234" });

      await expect
        .element(authorizationDialog().getByText("No se pudo verificar el PIN"))
        .toBeVisible();
      await expect
        .element(authorizationDialog().getByText("Volvé a intentarlo en unos segundos."))
        .toBeVisible();
    });

    it("drops the refusal as soon as the PIN is typed again", async () => {
      await openModal({ submit: recording(NO_WAIT).submit });
      await authorizeInModal({ pin: "9999" });

      await typeAuthorizationPin("1");

      await expect
        .element(authorizationDialog().getByText("PIN incorrecto"))
        .not.toBeInTheDocument();
    });

    it("clears the PIN when another person is chosen", async () => {
      await openModal();
      await typeAuthorizationPin("1234");

      await chooseAuthorizer("Sofía");

      await expect.element(authorizationDialog().getByLabelText("PIN")).toHaveValue("");
    });
  });

  describe("while the authorizers are read", () => {
    it("shows inside the modal that they are loading", async () => {
      const screen = await openModal({
        loadAuthorizers: () => new Promise<SignInUser[]>(() => {}),
      });

      await expect.element(authorizationDialog().getByText("Cargando…")).toBeInTheDocument();
      await expect.element(authorizationDialog().getByLabelText("PIN")).not.toBeInTheDocument();
      await expect
        .element(authorizationDialog().getByRole("button", { name: /^Autorizar/ }))
        .toBeDisabled();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says nobody can authorize when no one holds the permission", async () => {
      const screen = await openModal({ loadAuthorizers: loading([]).loadAuthorizers });

      await expect
        .element(
          authorizationDialog().getByText(
            "Nadie en esta caja tiene permiso para cargar movimientos de efectivo.",
          ),
        )
        .toBeVisible();
      await expect.element(authorizationDialog().getByLabelText("PIN")).not.toBeInTheDocument();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("offers to try again when they could not be read, and shows them once they can", async () => {
      let attempts = 0;
      const loadAuthorizers = async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("the core could not read them");
        }
        return AUTHORIZERS;
      };
      const screen = await openModal({ loadAuthorizers });
      const dialog = authorizationDialog();
      await expect
        .element(dialog.getByText("No se pudieron cargar las personas con permiso"))
        .toBeVisible();
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

      await expect.element(dialog.getByLabelText("PIN")).toBeVisible();
      expect(attempts).toBe(2);
    });
  });
});
