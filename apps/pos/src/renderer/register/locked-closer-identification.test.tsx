import type { Authorization, IdentifyLockedCloserOutcome, SignInUser } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { IdentifiedCloser, ReturnedCloser } from "./locked-closer-identification";
import { LockedCloserIdentification } from "./locked-closer-identification";

const CLOSERS: SignInUser[] = [{ id: "u3", first_name: "Sofía" }];
const TWO_CLOSERS: SignInUser[] = [
  { id: "u4", first_name: "Tomás" },
  { id: "u3", first_name: "Sofía" },
];

type Identify = (closer: Authorization) => Promise<IdentifyLockedCloserOutcome>;

async function renderStep(
  options: {
    loadClosers?: () => Promise<SignInUser[]>;
    identify?: Identify;
    returned?: ReturnedCloser;
  } = {},
) {
  const identified: IdentifiedCloser[] = [];
  const identify =
    options.identify ??
    vi.fn<Identify>(async () => ({
      kind: "identified",
      person: { user_id: "u3", first_name: "Sofía" },
    }));
  const screen = await render(
    <LockedCloserIdentification
      sessionId="s1"
      registerName="Caja 1"
      version="1.4.212"
      loadClosers={options.loadClosers ?? (async () => CLOSERS)}
      identify={identify}
      returned={options.returned}
      onIdentified={(closer) => identified.push(closer)}
    />,
  );
  return { screen, identify, identified };
}

type Screen = Awaited<ReturnType<typeof renderStep>>["screen"];

function userSelect(screen: Screen) {
  return screen.getByRole("button", { name: /USUARIO/ });
}

async function expectChosen(screen: Screen, firstName: string) {
  await expect.element(userSelect(screen).getByText(firstName, { exact: true })).toBeVisible();
}

async function identifyChosen(screen: Screen, pin: string) {
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

function pathname(screen: Screen) {
  return screen.router.state.location.pathname;
}

describe("LockedCloserIdentification", () => {
  it("asks who closes the register among the people the core says may, with the first of them chosen", async () => {
    const { screen } = await renderStep({ loadClosers: async () => TWO_CLOSERS });

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    await expectChosen(screen, "Sofía");
    await userEvent.click(userSelect(screen));
    const options = screen.getByRole("option").elements();
    expect(options.map((option) => option.textContent)).toEqual(["Sofía", "Tomás"]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the keys of the card and no link to another screen", async () => {
    const { screen } = await renderStep();
    await expectChosen(screen, "Sofía");

    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("↑", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("↓", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("0-9", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Enter", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("shows the full logo and the version, with no rail", async () => {
    const { screen } = await renderStep();

    await expect.element(screen.getByRole("img", { name: "Puro Sur" })).toBeVisible();
    await expect.element(screen.getByText("Versión 1.4.212")).toBeVisible();
    await expect
      .element(screen.getByRole("navigation", { name: "Menú de la caja" }))
      .not.toBeInTheDocument();
  });

  it("shows no cash figure", async () => {
    const { screen } = await renderStep();
    await expectChosen(screen, "Sofía");

    expect(screen.container.textContent).not.toContain("$");
  });

  it("changes the person with the arrows", async () => {
    const { screen } = await renderStep({ loadClosers: async () => TWO_CLOSERS });
    await expectChosen(screen, "Sofía");

    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Tomás");
    await userEvent.keyboard("{ArrowUp}");
    await expectChosen(screen, "Sofía");
  });

  it("goes back to the locked register with Esc", async () => {
    const { screen } = await renderStep();
    await expectChosen(screen, "Sofía");

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(pathname(screen)).toBe("/locked"));
  });

  it("stays while the PIN is being checked when Esc is pressed", async () => {
    let finish: () => void = () => {};
    const { screen } = await renderStep({
      identify: () =>
        new Promise((resolve) => {
          finish = () => resolve({ kind: "unavailable" });
        }),
    });
    await expectChosen(screen, "Sofía");
    await identifyChosen(screen, "1234");

    await userEvent.keyboard("{Escape}");

    expect(pathname(screen)).toBe("/");
    finish();
  });

  it("identifies the chosen person with their PIN and hands on who they are", async () => {
    const { screen, identify, identified } = await renderStep();
    await expectChosen(screen, "Sofía");

    await userEvent.type(screen.getByLabelText("PIN"), "1234{Enter}");

    await expect
      .poll(() => identified)
      .toEqual([{ authorization: { user_id: "u3", pin: "1234" }, first_name: "Sofía" }]);
    expect(identify).toHaveBeenCalledWith({ user_id: "u3", pin: "1234" });
  });

  it("identifies the person chosen with the arrows", async () => {
    const { screen, identify } = await renderStep({ loadClosers: async () => TWO_CLOSERS });
    await expectChosen(screen, "Sofía");
    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Tomás");

    await identifyChosen(screen, "1234");

    await expect.poll(() => identify).toHaveBeenCalledWith({ user_id: "u4", pin: "1234" });
  });

  it("says when the PIN is wrong, without handing anyone on", async () => {
    const { screen, identified } = await renderStep({
      identify: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 }),
    });
    await expectChosen(screen, "Sofía");

    await identifyChosen(screen, "1234");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    expect(identified).toEqual([]);
  });

  it("says the chosen person cannot close the register when they lack the permission", async () => {
    const { screen } = await renderStep({ identify: async () => ({ kind: "lacks_permission" }) });
    await expectChosen(screen, "Sofía");

    await identifyChosen(screen, "1234");

    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();
    await expect.element(screen.getByText("Elegí a otra persona con permiso.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it.each<IdentifyLockedCloserOutcome>([{ kind: "unavailable" }, { kind: "not_locked" }])(
    "says the PIN could not be checked when the core answers $kind",
    async (outcome) => {
      const { screen } = await renderStep({ identify: async () => outcome });
      await expectChosen(screen, "Sofía");

      await identifyChosen(screen, "1234");

      await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
    },
  );

  it("says the chosen person is locked out after too many wrong PINs, and Esc goes back to the list", async () => {
    const { screen } = await renderStep({
      identify: async () => ({ kind: "locked", consecutive_failures: 8 }),
    });
    await expectChosen(screen, "Sofía");

    await identifyChosen(screen, "1234");

    await expect
      .element(screen.getByRole("heading", { name: "Sofía está bloqueado" }))
      .toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Tengo un código" })).toBeVisible();
    await expect.element(screen.getByText("F3", { exact: true })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    expect(pathname(screen)).toBe("/");
  });

  it("says why it came back from the count until someone else is chosen", async () => {
    const { screen } = await renderStep({
      loadClosers: async () => TWO_CLOSERS,
      returned: { refusal: { kind: "lacks_permission" }, firstName: "Sofía" },
    });

    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).not.toBeInTheDocument();
  });

  it.each<[ReturnedCloser["refusal"], string, string]>([
    [
      { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 },
      "El PIN de Sofía cambió",
      "Elegí de nuevo quién cierra la caja.",
    ],
    [{ kind: "locked", consecutive_failures: 8 }, "Sofía está bloqueado", "Se equivocó 8 veces"],
    [{ kind: "not_locked" }, "No se pudo cerrar la caja", "Volvé a intentarlo"],
  ])("says why it came back from the count: %j", async (refusal, title, description) => {
    const { screen } = await renderStep({ returned: { refusal, firstName: "Sofía" } });

    await expect.element(screen.getByText(title)).toBeVisible();
    await expect.element(screen.getByText(description, { exact: false })).toBeVisible();
  });

  it("says the person has to wait before trying again when the close answered so", async () => {
    const { screen } = await renderStep({
      returned: {
        refusal: { kind: "rate_limited", retry_after_seconds: 5, attempts_left: 4 },
        firstName: "Sofía",
      },
    });

    await expect.element(screen.getByText("Todavía no se puede volver a intentar")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Esperá 5 segundos para volver a intentar. Quedan 4 intentos antes de que el usuario se bloquee.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText(/cambió/)).not.toBeInTheDocument();
  });

  it("does not bring back why it came back from the count once someone else was tried", async () => {
    const { screen } = await renderStep({
      loadClosers: async () => TWO_CLOSERS,
      identify: async () => ({ kind: "locked", consecutive_failures: 8 }),
      returned: { refusal: { kind: "lacks_permission" }, firstName: "Sofía" },
    });
    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await expectChosen(screen, "Tomás");

    await identifyChosen(screen, "1234");
    await userEvent.keyboard("{Escape}");

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).not.toBeInTheDocument();
  });

  it("shows the people with permission are loading", async () => {
    const { screen } = await renderStep({ loadClosers: () => new Promise(() => {}) });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(userSelect(screen)).not.toBeInTheDocument();
  });

  it("offers to read the people with permission again, with R, when they could not be read", async () => {
    let loads = 0;
    const { screen } = await renderStep({
      loadClosers: async () => {
        loads += 1;
        if (loads === 1) {
          throw new Error("the core connection was replaced");
        }
        return CLOSERS;
      },
    });

    await expect
      .element(screen.getByText("No se pudieron cargar las personas con permiso"))
      .toBeVisible();
    await expect.element(screen.getByText("R", { exact: true })).toBeVisible();
    await userEvent.keyboard("r");

    await expectChosen(screen, "Sofía");
  });

  it("says nobody can close the register when the core answers nobody, and Esc goes back", async () => {
    const { screen } = await renderStep({ loadClosers: async () => [] });

    await expect
      .element(
        screen.getByText("Nadie en esta caja tiene permiso para cerrar la sesión de otra persona."),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Esc", { exact: true })).toBeVisible();
    await expect.element(userSelect(screen)).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(pathname(screen)).toBe("/locked"));
  });
});
