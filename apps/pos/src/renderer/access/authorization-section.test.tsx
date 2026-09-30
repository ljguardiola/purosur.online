import type { Authorization, SignInUser } from "@purosur/contracts";
import { PERMISSION_KEYS } from "@purosur/domain";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
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
      const screen = await renderForm({ submit: recording({ kind: "wrong_pin" }).submit });

      await authorizeAs(screen, "Grace", "9999");

      await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
      await expect.element(screen.getByText("Revisá el PIN y volvé a escribirlo.")).toBeVisible();
      await expect.element(screen.getByLabelText("PIN")).toHaveValue("");
      await expect.element(screen.getByLabelText("PIN")).toHaveFocus();
      await expect.element(screen.getByLabelText("PIN")).toBeInvalid();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says the picked person cannot authorize it when they lack the permission", async () => {
      const screen = await renderForm({ submit: recording({ kind: "lacks_permission" }).submit });

      await authorizeAs(screen, "Sofía", "1234");

      await expect.element(screen.getByText("Sofía no puede autorizar esto")).toBeVisible();
      await expect.element(screen.getByText("Elegí a otra persona con permiso.")).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says the PIN could not be checked when the register cannot verify it", async () => {
      const screen = await renderForm({ submit: recording({ kind: "unavailable" }).submit });

      await authorizeAs(screen, "Grace", "1234");

      await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
      await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
    });

    it("drops the refusal as soon as the PIN is typed again", async () => {
      const screen = await renderForm({ submit: recording({ kind: "wrong_pin" }).submit });
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
