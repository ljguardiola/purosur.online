import type { RegisterStatus } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CoreData } from "../platform/use-core-query";
import type { CashSessionState } from "../register/cash-session-state";
import { RegisterStatusBar } from "./register-status-bar";
import type { SignedInPerson } from "./signed-in-person";

const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["open_cash_session"],
};
const NO_SESSION: CashSessionState = { status: "none" };
const OPEN_SESSION: CashSessionState = {
  status: "open",
  id: "s1",
  openedAt: "2026-09-30T09:02:00.000-03:00",
  openedBy: PERSON,
  locked: false,
};
const LOCKED_SESSION: CashSessionState = { ...OPEN_SESSION, locked: true };

const SALES_DENIED_TITLE = "La caja no puede vender";
const SILENT_TITLE = "La caja no está sincronizando";

function loaded(status: Partial<RegisterStatus> = {}): CoreData<RegisterStatus> {
  return {
    status: "loaded",
    value: { conditions: [], cloud: "reachable", ...status },
    refreshing: false,
  };
}

function renderBar(
  props: {
    person?: SignedInPerson | undefined;
    cashSession?: CashSessionState;
    status?: CoreData<RegisterStatus>;
  } = {},
) {
  return render(
    <RegisterStatusBar
      person={"person" in props ? props.person : PERSON}
      cashSession={props.cashSession ?? NO_SESSION}
      status={props.status ?? loaded()}
    />,
  );
}

function barOf(screen: Awaited<ReturnType<typeof renderBar>>) {
  return screen.getByRole("region", { name: "Estado de la caja" });
}

describe("RegisterStatusBar", () => {
  it("shows the first name of the person signed in, and nothing of their role or abilities", async () => {
    const screen = await renderBar();

    await expect.element(barOf(screen)).toHaveTextContent("Ada");
    expect(barOf(screen).element().textContent).not.toContain("open_cash_session");
    expect(barOf(screen).element().textContent).not.toMatch(/Administrador|Cajero/);
  });

  it("shows no name while nobody is signed in", async () => {
    const screen = await renderBar({ person: undefined, cashSession: LOCKED_SESSION });

    await expect.element(barOf(screen)).not.toHaveTextContent("Ada");
  });

  it.each([
    [NO_SESSION, "Sin sesión abierta"],
    [OPEN_SESSION, "Sesión abierta"],
    [LOCKED_SESSION, "Caja bloqueada"],
  ])("shows the cash session as %j", async (cashSession, text) => {
    const screen = await renderBar({ cashSession });

    await expect.element(barOf(screen)).toHaveTextContent(text);
  });

  it.each<CashSessionState>([{ status: "unknown" }, { status: "unavailable" }])(
    "says nothing of the cash session while it is %j",
    async (cashSession) => {
      const screen = await renderBar({ cashSession });

      await expect.element(barOf(screen)).not.toHaveTextContent(/sesión|bloqueada/i);
    },
  );

  it.each([
    ["reachable", "Nube conectada"],
    ["unreachable", "Sin conexión con la nube"],
    ["unknown", "Conectando con la nube"],
  ] as const)("shows the cloud as %s with %s", async (cloud, text) => {
    const screen = await renderBar({ status: loaded({ cloud }) });

    await expect.element(barOf(screen)).toHaveTextContent(text);
  });

  it("shows the cloud as being connected while the status is read", async () => {
    const screen = await renderBar({ status: { status: "loading" } });

    await expect.element(barOf(screen)).toHaveTextContent("Conectando con la nube");
    expect(barOf(screen).element().textContent).not.toContain(SALES_DENIED_TITLE);
  });

  it("shows no condition when the register holds none", async () => {
    const screen = await renderBar();

    await expect.element(screen.getByText(SALES_DENIED_TITLE)).not.toBeInTheDocument();
    await expect.element(screen.getByText(SILENT_TITLE)).not.toBeInTheDocument();
    await expect.element(screen.getByText("Qué hacer")).not.toBeInTheDocument();
  });

  it("shows a condition with its title, what it means and what to do", async () => {
    const screen = await renderBar({ status: loaded({ conditions: ["sales_denied"] }) });

    await expect.element(screen.getByText(SALES_DENIED_TITLE)).toBeVisible();
    await expect
      .element(screen.getByText(/dejó de abrir ventas nuevas porque encontró un problema/))
      .toBeVisible();
    await expect.element(screen.getByText("Qué hacer")).toBeVisible();
    await expect.element(screen.getByText(/Avisar al Administrador de inmediato/)).toBeVisible();
  });

  it("shows every condition it holds, in the order the core gave them", async () => {
    const screen = await renderBar({
      status: loaded({ conditions: ["sales_denied", "register_silent"] }),
    });

    await expect.element(screen.getByText(SALES_DENIED_TITLE)).toBeVisible();
    await expect.element(screen.getByText(SILENT_TITLE)).toBeVisible();
    const text = barOf(screen).element().textContent;
    expect(text.indexOf(SALES_DENIED_TITLE)).toBeLessThan(text.indexOf(SILENT_TITLE));
  });

  it("shows a condition even when the cloud can't be reached", async () => {
    const screen = await renderBar({
      status: loaded({ conditions: ["register_silent"], cloud: "unreachable" }),
    });

    await expect.element(screen.getByText(SILENT_TITLE)).toBeVisible();
    await expect.element(barOf(screen)).toHaveTextContent("Sin conexión con la nube");
  });

  it("says the status could not be read and reads it again on Reintentar", async () => {
    const retry = vi.fn();
    const screen = await renderBar({ status: { status: "failed", retry } });

    await expect.element(screen.getByText("No se pudo leer el estado de la caja")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations with conditions, nor when the status failed", async () => {
    const withConditions = await renderBar({
      cashSession: OPEN_SESSION,
      status: loaded({ conditions: ["sales_denied", "register_silent"], cloud: "unreachable" }),
    });
    await expectNoAccessibilityViolations(withConditions.container);
    await withConditions.unmount();

    const failed = await renderBar({ status: { status: "failed", retry: () => {} } });
    await expectNoAccessibilityViolations(failed.container);
  });
});
