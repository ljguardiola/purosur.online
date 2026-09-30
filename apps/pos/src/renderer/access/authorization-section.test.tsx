import type { Authorization, SignInUser } from "@purosur/contracts";
import { PERMISSION_KEYS } from "@purosur/domain";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SignedInPerson } from "./signed-in-person";
import type { GuardedCashInOutcome } from "./test-support/guarded-cash-in-form";
import { GuardedCashInForm } from "./test-support/guarded-cash-in-form";

const TOMAS_WITHOUT_PERMISSION: SignedInPerson = {
  first_name: "Tomás",
  permission_keys: ["sell_and_charge"],
};
const TOMAS_WITH_PERMISSION: SignedInPerson = {
  first_name: "Tomás",
  permission_keys: ["sell_and_charge", "record_cash_in"],
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

type Screen = Awaited<ReturnType<typeof render>>;

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
  person?: SignedInPerson;
  loadAuthorizers?: (permission: string) => Promise<SignInUser[]>;
  submit?: ReturnType<typeof recording>["submit"];
}) {
  return render(
    <GuardedCashInForm
      person={options.person ?? TOMAS_WITHOUT_PERMISSION}
      loadAuthorizers={options.loadAuthorizers ?? loading().loadAuthorizers}
      submit={options.submit ?? recording({ kind: "performed", authorized_by: null }).submit}
    />,
  );
}

async function pick(screen: Screen, firstName: string) {
  await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
  await userEvent.click(screen.getByRole("option", { name: firstName }));
}

async function authorizeAs(screen: Screen, firstName: string, pin: string) {
  await pick(screen, firstName);
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: "Cargar" }));
}

function waitingNotice(seconds: number): string {
  const wait = seconds === 1 ? "1 segundo" : `${seconds} segundos`;
  return `Esperá ${wait} para volver a intentar. Quedan 6 intentos antes de que el usuario se bloquee.`;
}

describe("an action guarded by another person's PIN", () => {
  describe("when the signed-in person holds the permission", () => {
    it("shows no authorization and sends none", async () => {
      const { loadAuthorizers, requested } = loading();
      const { submit, submissions } = recording({ kind: "performed", authorized_by: null });
      const screen = await renderForm({
        person: TOMAS_WITH_PERMISSION,
        loadAuthorizers,
        submit,
      });

      await expect
        .element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO"))
        .not.toBeInTheDocument();
      await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Cargar" }));

      await expect.element(screen.getByText("Cargado por el operador")).toBeVisible();
      expect(submissions).toEqual([undefined]);
      expect(requested).toEqual([]);
    });

    it("also holds it as an Administrator, who has every permission", async () => {
      const administrator: SignedInPerson = {
        first_name: "Tomás",
        permission_keys: [...PERMISSION_KEYS],
      };
      const screen = await renderForm({ person: administrator });

      await expect
        .element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO"))
        .not.toBeInTheDocument();
    });
  });

  describe("when the signed-in person lacks the permission", () => {
    it("asks for someone with the permission and says who lacks it", async () => {
      const { loadAuthorizers, requested } = loading();
      const screen = await renderForm({ loadAuthorizers });

      await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
      await expect
        .element(screen.getByText("Tomás no tiene permiso para cargar movimientos de efectivo."))
        .toBeVisible();
      await expect.element(screen.getByLabelText("PIN")).toBeVisible();
      expect(requested).toEqual(["record_cash_in"]);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("lays the picker and a 200 pixel PIN box in one 48 pixel row", async () => {
      const screen = await renderForm({});
      await expect.element(screen.getByLabelText("PIN")).toBeVisible();

      const picker = screen
        .getByRole("button", { name: /Persona que autoriza/ })
        .element()
        .getBoundingClientRect();
      const pinBox = screen.getByLabelText("PIN").element().parentElement?.getBoundingClientRect();

      expect(picker.height).toBe(48);
      expect(pinBox?.height).toBe(48);
      expect(pinBox?.width).toBe(200);
      expect(picker.width).toBeGreaterThan(200);
      expect(picker.right).toBeLessThanOrEqual(pinBox?.left ?? 0);
      expect(picker.top).toBe(pinBox?.top);
    });

    it("offers every authorizer by first name", async () => {
      const screen = await renderForm({});

      await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));

      await expect.element(screen.getByRole("option", { name: "Grace" })).toBeVisible();
      await expect.element(screen.getByRole("option", { name: "Sofía" })).toBeVisible();
    });

    it("cannot submit until someone is picked and a PIN is typed", async () => {
      const screen = await renderForm({});
      const submitButton = screen.getByRole("button", { name: "Cargar" });

      await expect.element(submitButton).toBeDisabled();
      await pick(screen, "Grace");
      await expect.element(submitButton).toBeDisabled();
      await userEvent.type(screen.getByLabelText("PIN"), "1234");
      await expect.element(submitButton).toBeEnabled();
    });

    it("sends the picked person and the PIN, and shows who authorized while the operator stays", async () => {
      const { submit, submissions } = recording({
        kind: "performed",
        authorized_by: { user_id: "u2", first_name: "Grace" },
      });
      const screen = await renderForm({ submit });

      await authorizeAs(screen, "Grace", "1234");

      await expect.element(screen.getByText("Cargado con autorización de Grace")).toBeVisible();
      await expect.element(screen.getByText("Operador: Tomás")).toBeVisible();
      expect(submissions).toEqual([{ user_id: "u2", pin: "1234" }]);
    });

    it("asks for the PIN again before the next action, since it authorized only one", async () => {
      const { submit, submissions } = recording({
        kind: "performed",
        authorized_by: { user_id: "u2", first_name: "Grace" },
      });
      const screen = await renderForm({ submit });
      await authorizeAs(screen, "Grace", "1234");
      await expect.element(screen.getByText("Cargado con autorización de Grace")).toBeVisible();

      await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
      await expect.element(screen.getByRole("button", { name: "Cargar" })).toBeDisabled();
      await userEvent.type(screen.getByLabelText("PIN"), "5678");
      await userEvent.click(screen.getByRole("button", { name: "Cargar" }));

      await expect.poll(() => submissions).toHaveLength(2);
      expect(submissions).toEqual([
        { user_id: "u2", pin: "1234" },
        { user_id: "u2", pin: "5678" },
      ]);
    });

    it("clears the PIN and focuses it again after a wrong PIN", async () => {
      const screen = await renderForm({ submit: recording(NO_WAIT).submit });

      await authorizeAs(screen, "Grace", "9999");

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      await expect
        .element(
          screen.getByText(
            "Revisá el PIN y volvé a escribirlo. Quedan 7 intentos antes de que el usuario se bloquee.",
            { exact: true },
          ),
        )
        .toBeVisible();
      await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
      await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
      await expect.element(screen.getByLabelText("PIN")).toBeInvalid();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says one attempt is left in the singular", async () => {
      const screen = await renderForm({
        submit: recording({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 1 }).submit,
      });

      await authorizeAs(screen, "Grace", "9999");

      await expect
        .element(
          screen.getByText(
            "Revisá el PIN y volvé a escribirlo. Queda 1 intento antes de que el usuario se bloquee.",
            { exact: true },
          ),
        )
        .toBeVisible();
    });

    it("holds the PIN and counts the wait down, then offers the attempts again", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const screen = await renderForm({
        submit: recording({ kind: "wrong_pin", retry_after_seconds: 2, attempts_left: 6 }).submit,
      });

      await authorizeAs(screen, "Grace", "9999");

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      await expect
        .element(
          screen.getByText(waitingNotice(2), {
            exact: true,
          }),
        )
        .toBeVisible();
      await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
      await expect.element(screen.getByRole("button", { name: "Cargar" })).toBeDisabled();

      await vi.advanceTimersByTimeAsync(1000);
      await expect.element(screen.getByText(waitingNotice(1), { exact: true })).toBeVisible();
      await expect.element(screen.getByLabelText("PIN")).toBeDisabled();

      await vi.advanceTimersByTimeAsync(1000);
      await expect.element(screen.getByLabelText("PIN")).toBeEnabled();
      await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
      await expect
        .element(
          screen.getByText(
            "Revisá el PIN y volvé a escribirlo. Quedan 6 intentos antes de que el usuario se bloquee.",
            { exact: true },
          ),
        )
        .toBeVisible();
    });

    it("tells the person still has to wait, then drops the notice when the wait is over", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const screen = await renderForm({
        submit: recording({ kind: "rate_limited", retry_after_seconds: 1, attempts_left: 5 })
          .submit,
      });

      await authorizeAs(screen, "Grace", "1234");

      await expect.element(screen.getByText("Todavía no se puede volver a intentar")).toBeVisible();
      await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
      await expectNoAccessibilityViolations(screen.container);

      await vi.advanceTimersByTimeAsync(1000);
      await expect
        .element(screen.getByText("Todavía no se puede volver a intentar"))
        .not.toBeInTheDocument();
      await expect.element(screen.getByLabelText("PIN")).toBeEnabled();
    });

    it("drops the wait and the notice when another person is picked", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const screen = await renderForm({
        submit: recording({ kind: "wrong_pin", retry_after_seconds: 20, attempts_left: 4 }).submit,
      });
      await authorizeAs(screen, "Grace", "9999");
      await expect.element(screen.getByLabelText("PIN")).toBeDisabled();

      await pick(screen, "Sofía");

      await expect.element(screen.getByLabelText("PIN")).toBeEnabled();
      await expect.element(screen.getByText("PIN incorrecto")).not.toBeInTheDocument();
    });

    it("says the picked person is locked and asks for someone else, without offering their PIN", async () => {
      const screen = await renderForm({
        submit: recording({ kind: "locked", consecutive_failures: 8 }).submit,
      });

      await authorizeAs(screen, "Sofía", "1234");

      await expect.element(screen.getByText("Sofía está bloqueado")).toBeVisible();
      await expect
        .element(
          screen.getByText(
            "Se equivocó 8 veces seguidas con el PIN. Elegí a otra persona con permiso.",
          ),
        )
        .toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: /Persona que autoriza/ }))
        .toHaveTextContent("Elegí a la persona");
      await expect.element(screen.getByLabelText("PIN")).toBeDisabled();
      await expect.element(screen.getByRole("button", { name: "Cargar" })).toBeDisabled();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("lets someone else authorize after a person turned out locked", async () => {
      const { submit, submissions } = recording(() =>
        submissions.length === 1
          ? { kind: "locked", consecutive_failures: 8 }
          : { kind: "performed", authorized_by: { user_id: "u2", first_name: "Grace" } },
      );
      const screen = await renderForm({ submit });
      await authorizeAs(screen, "Sofía", "1234");
      await expect.element(screen.getByText("Sofía está bloqueado")).toBeVisible();

      await authorizeAs(screen, "Grace", "5678");

      await expect.element(screen.getByText("Cargado con autorización de Grace")).toBeVisible();
      expect(submissions).toEqual([
        { user_id: "u3", pin: "1234" },
        { user_id: "u2", pin: "5678" },
      ]);
    });

    it("says the picked person cannot authorize it when they lack the permission", async () => {
      const screen = await renderForm({ submit: recording({ kind: "lacks_permission" }).submit });

      await authorizeAs(screen, "Sofía", "1234");

      await expect.element(screen.getByText("Sofía no puede autorizar esto")).toBeVisible();
      await expect.element(screen.getByText("Elegí a otra persona con permiso.")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("unpicks the person who lacks the permission, still naming them", async () => {
      const screen = await renderForm({ submit: recording({ kind: "lacks_permission" }).submit });

      await authorizeAs(screen, "Sofía", "1234");

      await expect.element(screen.getByText("Sofía no puede autorizar esto")).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: /Persona que autoriza/ }))
        .toHaveTextContent("Elegí a la persona");
      await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
      await expect.element(screen.getByRole("button", { name: "Cargar" })).toBeDisabled();
    });

    it("reads the authorizers again when the picked person lacks the permission", async () => {
      const answers = [AUTHORIZERS, [{ id: "u2", first_name: "Grace" }]];
      let loads = 0;
      const loadAuthorizers = async () => {
        loads += 1;
        return answers[Math.min(loads, answers.length) - 1] ?? [];
      };
      const screen = await renderForm({
        loadAuthorizers,
        submit: recording({ kind: "lacks_permission" }).submit,
      });

      await authorizeAs(screen, "Sofía", "1234");
      await expect.poll(() => loads).toBe(2);
      await expect.element(screen.getByText("Sofía no puede autorizar esto")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));

      await expect.element(screen.getByRole("option", { name: "Grace" })).toBeVisible();
      await expect.element(screen.getByRole("option", { name: "Sofía" })).not.toBeInTheDocument();
      expect(loads).toBe(2);
    });

    it("says the PIN could not be checked when the register cannot verify it", async () => {
      const screen = await renderForm({ submit: recording({ kind: "unavailable" }).submit });

      await authorizeAs(screen, "Grace", "1234");

      await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
      await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    });

    it("drops the refusal as soon as the PIN is typed again", async () => {
      const screen = await renderForm({ submit: recording(NO_WAIT).submit });
      await authorizeAs(screen, "Grace", "9999");

      await userEvent.type(screen.getByLabelText("PIN"), "1");

      await expect.element(screen.getByText("PIN incorrecto")).not.toBeInTheDocument();
    });

    it("clears the PIN when another person is picked", async () => {
      const screen = await renderForm({});
      await pick(screen, "Grace");
      await userEvent.type(screen.getByLabelText("PIN"), "1234");

      await pick(screen, "Sofía");

      await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
    });
  });

  describe("while the authorizers are read", () => {
    it("shows they are loading", async () => {
      const screen = await renderForm({
        loadAuthorizers: () => new Promise<SignInUser[]>(() => {}),
      });

      await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
      await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
      await expect.element(screen.getByRole("button", { name: "Cargar" })).toBeDisabled();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says nobody can authorize when no one holds the permission", async () => {
      const screen = await renderForm({ loadAuthorizers: loading([]).loadAuthorizers });

      await expect
        .element(
          screen.getByText("Nadie en esta caja tiene permiso para cargar movimientos de efectivo."),
        )
        .toBeVisible();
      await expect.element(screen.getByLabelText("PIN")).not.toBeInTheDocument();
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
      const screen = await renderForm({ loadAuthorizers });
      await expect
        .element(screen.getByText("No se pudieron cargar las personas con permiso"))
        .toBeVisible();
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await expect.element(screen.getByLabelText("PIN")).toBeVisible();
      expect(attempts).toBe(2);
    });
  });
});
