import type { Authorization, IdentifyLockedCloserOutcome, SignInUser } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { IdentifiedCloser, ReturnedCloser } from "./locked-closer-identification";
import { LockedCloserIdentification } from "./locked-closer-identification";

const CLOSERS: SignInUser[] = [{ id: "u3", first_name: "Sofía" }];

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
      loadClosers={options.loadClosers ?? (async () => CLOSERS)}
      identify={identify}
      returned={options.returned}
      onIdentified={(closer) => identified.push(closer)}
    />,
  );
  return { screen, identify, identified };
}

type Screen = Awaited<ReturnType<typeof renderStep>>["screen"];

async function identifyAs(screen: Screen, firstName: string, pin: string) {
  await userEvent.click(screen.getByText(firstName, { exact: true }));
  await userEvent.type(screen.getByLabelText("PIN"), pin);
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("LockedCloserIdentification", () => {
  it("asks who closes the register among the people the core says may", async () => {
    const { screen } = await renderStep();

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Sofía" })).toBeVisible();
    expect(screen.getByRole("radio").elements()).toHaveLength(1);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows no cash figure", async () => {
    const { screen } = await renderStep();
    await expect.element(screen.getByRole("radio", { name: "Sofía" })).toBeVisible();

    expect(screen.container.textContent).not.toContain("$");
  });

  it("identifies the chosen person with their PIN and hands on who they are", async () => {
    const { screen, identify, identified } = await renderStep();

    await identifyAs(screen, "Sofía", "1234");

    await expect
      .poll(() => identified)
      .toEqual([{ authorization: { user_id: "u3", pin: "1234" }, first_name: "Sofía" }]);
    expect(identify).toHaveBeenCalledWith({ user_id: "u3", pin: "1234" });
  });

  it("says when the PIN is wrong, without handing anyone on", async () => {
    const { screen, identified } = await renderStep({
      identify: async () => ({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 }),
    });

    await identifyAs(screen, "Sofía", "1234");

    await expect.element(screen.getByText("PIN incorrecto")).toBeVisible();
    expect(identified).toEqual([]);
  });

  it("says the chosen person cannot close the register when they lack the permission", async () => {
    const { screen } = await renderStep({ identify: async () => ({ kind: "lacks_permission" }) });

    await identifyAs(screen, "Sofía", "1234");

    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();
  });

  it.each<IdentifyLockedCloserOutcome>([{ kind: "unavailable" }, { kind: "not_locked" }])(
    "says the PIN could not be checked when the core answers $kind",
    async (outcome) => {
      const { screen } = await renderStep({ identify: async () => outcome });

      await identifyAs(screen, "Sofía", "1234");

      await expect.element(screen.getByText("No se pudo verificar el PIN")).toBeVisible();
    },
  );

  it("says the chosen person is locked out after too many wrong PINs", async () => {
    const { screen } = await renderStep({
      identify: async () => ({ kind: "locked", consecutive_failures: 8 }),
    });

    await identifyAs(screen, "Sofía", "1234");

    await expect
      .element(screen.getByRole("heading", { name: "Sofía está bloqueado" }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Volver a la lista" }));
    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
  });

  it("says why it came back from the count until someone is chosen again", async () => {
    const { screen } = await renderStep({
      returned: { refusal: { kind: "lacks_permission" }, firstName: "Sofía" },
    });

    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();
    await userEvent.click(screen.getByText("Sofía", { exact: true }));
    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).not.toBeInTheDocument();
  });

  it.each<[ReturnedCloser["refusal"], string]>([
    [{ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 4 }, "El PIN de Sofía cambió"],
    [{ kind: "locked", consecutive_failures: 8 }, "Sofía está bloqueado"],
    [{ kind: "not_locked" }, "No se pudo cerrar la caja"],
  ])("says why it came back from the count: %j", async (refusal, title) => {
    const { screen } = await renderStep({ returned: { refusal, firstName: "Sofía" } });

    await expect.element(screen.getByText(title)).toBeVisible();
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
      loadClosers: async () => [...CLOSERS, { id: "u4", first_name: "Tomás" }],
      identify: async () => ({ kind: "locked", consecutive_failures: 8 }),
      returned: { refusal: { kind: "lacks_permission" }, firstName: "Sofía" },
    });
    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).toBeVisible();

    await identifyAs(screen, "Tomás", "1234");
    await userEvent.click(screen.getByRole("button", { name: "Volver a la lista" }));

    await expect
      .element(screen.getByRole("heading", { name: "¿Quién cierra la caja?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Sofía no puede cerrar la caja")).not.toBeInTheDocument();
  });

  it("shows the people with permission are loading", async () => {
    const { screen } = await renderStep({ loadClosers: () => new Promise(() => {}) });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("offers to read the people with permission again when they could not be read", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByRole("radio", { name: "Sofía" })).toBeVisible();
  });

  it("says nobody can close the register when the core answers nobody", async () => {
    const { screen } = await renderStep({
      loadClosers: async () => [],
    });

    await expect
      .element(
        screen.getByText("Nadie en esta caja tiene permiso para cerrar la sesión de otra persona."),
      )
      .toBeVisible();
  });

  it("goes back to the locked register", async () => {
    const { screen } = await renderStep();

    await userEvent.click(screen.getByRole("link", { name: "Volver" }));

    expect(screen.router.state.location.pathname).toBe("/locked");
  });
});
