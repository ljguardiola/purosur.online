import type { ContingencyBackupTicketsAnswer, RegisterStatus } from "@purosur/contracts";
import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CoreData } from "../platform/use-core-query";
import type { CashSessionState } from "../register/cash-session-state";
import { RegisterHeader } from "./register-header";
import type { SignedInPerson } from "./signed-in-person";
import { backupTickets } from "./test-support/contingency-backup-tickets";
import { render } from "./test-support/render-with-router";

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

const SINCE = "2026-10-29T09:30:00.000-03:00";
const SALES_DENIED_TITLE = "La caja no puede vender";
const OFFLINE_CODE = { kind: "offline_code", notice: true, since: null } as const;
const SOLD_LATER = { kind: "deferring", notice: true, since: null } as const;
const SOLD_LATER_WITHOUT_NOTICE = { kind: "deferring", notice: false, since: null } as const;

function loaded(status: Partial<RegisterStatus> = {}): CoreData<RegisterStatus> {
  return {
    status: "loaded",
    value: {
      conditions: [],
      cloud: "reachable",
      serial_devices: { scale: "matching", reader: "matching" },
      serial_devices_setup_offered: false,
      contingency: null,
      ...status,
    },
    refreshing: false,
  };
}

function renderHeader(
  props: {
    person?: SignedInPerson | undefined;
    registerName?: string | null;
    cashSession?: CashSessionState;
    status?: CoreData<RegisterStatus>;
    backupTickets?: CoreData<ContingencyBackupTicketsAnswer>;
    onDiscardBackupTickets?: () => void;
    crumb?: string;
  } = {},
) {
  return render(
    <RegisterHeader
      person={"person" in props ? props.person : PERSON}
      registerName={"registerName" in props ? props.registerName : "Caja 1"}
      cashSession={props.cashSession ?? NO_SESSION}
      status={props.status ?? loaded()}
      backupTickets={props.backupTickets ?? loadedTickets()}
      onDiscardBackupTickets={props.onDiscardBackupTickets ?? (() => {})}
      crumb={props.crumb}
    />,
  );
}

function loadedTickets(
  tickets: Partial<ContingencyBackupTicketsAnswer> = {},
): CoreData<ContingencyBackupTicketsAnswer> {
  return { status: "loaded", value: backupTickets(tickets), refreshing: false };
}

function headerText(screen: Awaited<ReturnType<typeof renderHeader>>): string {
  return screen.getByRole("region", { name: "Estado de la caja" }).element().textContent;
}

describe("RegisterHeader", () => {
  it("shows the register's name in capitals, then the first name of the person signed in, and nothing of their role or abilities", async () => {
    const screen = await renderHeader({ cashSession: OPEN_SESSION });

    expect(headerText(screen)).toBe("CAJA 1•Ada");
    expect(headerText(screen)).not.toMatch(/open_cash_session|Administrador|Cajero/);
  });

  it("shows only the register's name while nobody is signed in", async () => {
    const screen = await renderHeader({ person: undefined, cashSession: LOCKED_SESSION });

    expect(headerText(screen)).toBe("CAJA 1");
  });

  it("calls the register CAJA when it has no name yet", async () => {
    const screen = await renderHeader({ registerName: null, cashSession: OPEN_SESSION });

    expect(headerText(screen)).toBe("CAJA•Ada");
  });

  it("adds a third crumb while there is no cash session", async () => {
    const screen = await renderHeader({ cashSession: NO_SESSION });

    expect(headerText(screen)).toBe("CAJA 1•Ada•Sin sesión abierta");
  });

  it("shows the crumb of the screen shown in place of the missing cash session", async () => {
    const screen = await renderHeader({ cashSession: NO_SESSION, crumb: "Inventario inicial" });

    expect(headerText(screen)).toBe("CAJA 1•Ada•Inventario inicial");
  });

  it("ends with the crumb of the screen shown, after the person", async () => {
    const screen = await renderHeader({ cashSession: OPEN_SESSION, crumb: "Antes de empezar" });

    expect(headerText(screen)).toBe("CAJA 1•Ada•Antes de empezar");
  });

  it("draws the register as a bold eyebrow and the other crumbs as plain text after a quiet dot", async () => {
    const screen = await renderHeader({ cashSession: NO_SESSION });

    const register = getComputedStyle(screen.getByText("CAJA 1", { exact: true }).element());
    expect(register.color).toBe(tokenRgb("text-eyebrow"));
    expect(register.fontWeight).toBe("700");
    for (const crumb of ["Ada", "Sin sesión abierta"]) {
      const style = getComputedStyle(screen.getByText(crumb, { exact: true }).element());
      expect(style.color).toBe(tokenRgb("text"));
      expect(style.fontWeight).toBe("400");
    }
    const dot = getComputedStyle(screen.getByText("•").first().element());
    expect(dot.color).toBe(tokenRgb("border"));
  });

  it.each<CashSessionState>([
    OPEN_SESSION,
    LOCKED_SESSION,
    { status: "unknown" },
    { status: "unavailable" },
  ])("adds no third crumb while the cash session is %j", async (cashSession) => {
    const screen = await renderHeader({ cashSession });

    expect(headerText(screen)).not.toMatch(/sesión/i);
  });

  it("shows no pill when the cloud, the fiscal mode, the scale, the reader and the notices are all fine", async () => {
    const screen = await renderHeader({ cashSession: OPEN_SESSION });

    expect(headerText(screen)).toBe("CAJA 1•Ada");
    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  it.each(["reachable", "unknown"] as const)(
    "shows no pill while the cloud is %s",
    async (cloud) => {
      const screen = await renderHeader({ status: loaded({ cloud }) });

      expect(headerText(screen)).not.toMatch(/nube/i);
    },
  );

  it("shows the pill 'Sin conexión con la nube' while the cloud can't be reached", async () => {
    const screen = await renderHeader({ status: loaded({ cloud: "unreachable" }) });

    await expect.element(screen.getByText("Sin conexión con la nube")).toBeVisible();
  });

  it("shows a loading placeholder, and neither the cloud nor a condition, while the status is read", async () => {
    const screen = await renderHeader({ status: { status: "loading" } });

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(headerText(screen)).not.toMatch(/nube/i);
    expect(headerText(screen)).not.toContain(SALES_DENIED_TITLE);
  });

  it("shows no notices pill while the register holds no condition", async () => {
    const screen = await renderHeader();

    await expect.element(screen.getByRole("button", { name: /aviso/ })).not.toBeInTheDocument();
    await expect.element(screen.getByText(SALES_DENIED_TITLE)).not.toBeInTheDocument();
  });

  it("takes the person to Esta caja in Ajustes when the notices pill is pressed", async () => {
    const screen = await renderHeader({
      status: loaded({
        conditions: [{ kind: "register_silent", level: "critical", since: SINCE }],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "1 aviso" }));

    await expect.poll(() => screen.router.state.location.pathname).toBe("/settings");
    expect(screen.router.state.location.search).toEqual({ section: "register" });
  });

  it("shows no condition's text, only the notices pill", async () => {
    const screen = await renderHeader({
      status: loaded({
        conditions: [
          { kind: "sales_denied", reason: "event_history_broken", level: "critical", since: SINCE },
        ],
      }),
    });

    await expect.element(screen.getByRole("button", { name: "1 aviso" })).toBeVisible();
    await expect.element(screen.getByText(SALES_DENIED_TITLE)).not.toBeInTheDocument();
  });

  it("counts several conditions on the pill", async () => {
    const screen = await renderHeader({
      status: loaded({
        conditions: [
          { kind: "sales_denied", reason: "event_history_broken", level: "critical", since: SINCE },
          { kind: "register_silent", level: "critical", since: SINCE },
        ],
      }),
    });

    await expect.element(screen.getByRole("button", { name: "2 avisos" })).toBeVisible();
  });

  it("shows the pill in the error tone when a condition is critical", async () => {
    const screen = await renderHeader({
      status: loaded({
        conditions: [
          { kind: "register_silent", level: "critical", since: SINCE },
          { kind: "serial_device_missing", level: "warning", since: SINCE },
        ],
      }),
    });

    const pill = screen.getByRole("button", { name: "2 avisos" }).element();
    expect(getComputedStyle(pill).backgroundColor).toBe(tokenRgb("error-subtle"));
  });

  it("shows the pill in the warning tone when no condition is critical", async () => {
    const screen = await renderHeader({
      status: loaded({
        conditions: [{ kind: "serial_device_missing", level: "warning", since: SINCE }],
      }),
    });

    const pill = screen.getByRole("button", { name: "1 aviso" }).element();
    expect(getComputedStyle(pill).backgroundColor).toBe(tokenRgb("warning-subtle"));
  });

  it("shows a notice even when the cloud can't be reached", async () => {
    const screen = await renderHeader({
      status: loaded({
        conditions: [{ kind: "register_silent", level: "critical", since: SINCE }],
        cloud: "unreachable",
      }),
    });

    await expect.element(screen.getByRole("button", { name: "1 aviso" })).toBeVisible();
    expect(headerText(screen)).toContain("Sin conexión con la nube");
  });

  it("shows a pill for a scale that is not connected, and none for a reader that matches", async () => {
    const screen = await renderHeader({
      status: loaded({ serial_devices: { scale: "not_detected", reader: "matching" } }),
    });

    await expect.element(screen.getByText("Balanza sin conectar")).toBeVisible();
    expect(headerText(screen)).not.toContain("Lector");
  });

  it("shows neither device while the status is read", async () => {
    const screen = await renderHeader({ status: { status: "loading" } });

    expect(headerText(screen)).not.toMatch(/Balanza|Lector/);
  });

  it("has no accessibility violations with a device not detected", async () => {
    const screen = await renderHeader({
      status: loaded({
        conditions: [{ kind: "serial_device_missing", level: "warning", since: SINCE }],
        serial_devices: { scale: "not_detected", reader: "not_registered" },
      }),
    });

    await expectNoAccessibilityViolations(screen.container);
  });

  it("says the status could not be read and reads it again on Reintentar", async () => {
    const retry = vi.fn();
    const screen = await renderHeader({ status: { status: "failed", retry } });

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo leer el estado de la caja");
    expect(headerText(screen)).not.toMatch(/nube/i);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations with conditions, nor when the status failed", async () => {
    const withConditions = await renderHeader({
      cashSession: OPEN_SESSION,
      status: loaded({
        conditions: [
          { kind: "sales_denied", reason: "event_history_broken", level: "critical", since: SINCE },
          { kind: "register_silent", level: "critical", since: SINCE },
        ],
        cloud: "unreachable",
      }),
    });
    await expectNoAccessibilityViolations(withConditions.container);
    await withConditions.unmount();

    const failed = await renderHeader({ status: { status: "failed", retry: () => {} } });
    await expectNoAccessibilityViolations(failed.container);
  });

  it("shows the contingency mode as a pill", async () => {
    const screen = await renderHeader({ status: loaded({ contingency: OFFLINE_CODE }) });

    expect(headerText(screen)).toContain("Contingencia CAEA");
  });

  it("shows no fiscal pill while there is no contingency", async () => {
    const screen = await renderHeader({ status: loaded({ contingency: null }) });

    expect(headerText(screen)).not.toMatch(/Venta diferida|Contingencia CAEA/);
  });

  it.each([[SOLD_LATER], [SOLD_LATER_WITHOUT_NOTICE]])(
    "shows the deferred sale pill while the contingency is deferring (%j)",
    async (contingency) => {
      const screen = await renderHeader({ status: loaded({ contingency }) });

      expect(headerText(screen)).toContain("Venta diferida");
    },
  );

  it("shows no fiscal pill while the status is loading", async () => {
    const screen = await renderHeader({ status: { status: "loading" } });

    expect(headerText(screen)).not.toMatch(/Contingencia CAEA/);
  });

  it("counts the contingency as one more notice, shown in the warning tone with its explanation", async () => {
    const screen = await renderHeader({
      status: loaded({
        contingency: OFFLINE_CODE,
        conditions: [{ kind: "serial_device_missing", level: "warning", since: SINCE }],
      }),
    });

    await expect.element(screen.getByRole("button", { name: "2 avisos" })).toBeVisible();
  });

  it("shows the notices pill for the contingency alone", async () => {
    const screen = await renderHeader({ status: loaded({ contingency: OFFLINE_CODE }) });

    await expect.element(screen.getByRole("button", { name: "1 aviso" })).toBeVisible();
  });

  it("counts a deferring contingency with a notice as one notice, with its own explanation", async () => {
    const screen = await renderHeader({ status: loaded({ contingency: SOLD_LATER }) });

    await expect.element(screen.getByRole("button", { name: "1 aviso" })).toBeVisible();
  });

  it("shows the pill but no notice for a deferring contingency without a notice", async () => {
    const screen = await renderHeader({
      status: loaded({ contingency: SOLD_LATER_WITHOUT_NOTICE }),
    });

    await expect.element(screen.getByRole("button", { name: /aviso/ })).not.toBeInTheDocument();
  });

  it("shows no contingency notice in real time", async () => {
    const screen = await renderHeader({ status: loaded({ contingency: null }) });

    await expect.element(screen.getByRole("button", { name: /aviso/ })).not.toBeInTheDocument();
  });
  describe("contingency backup tickets", () => {
    it("counts a notice for tickets that did not print, whatever the fiscal mode", async () => {
      const screen = await renderHeader({
        status: loaded({ contingency: null }),
        backupTickets: loadedTickets({ to_print: 2 }),
      });

      await expect.element(screen.getByRole("button", { name: "1 aviso" })).toBeVisible();
    });

    it("counts them beside the conditions and the contingency", async () => {
      const screen = await renderHeader({
        status: loaded({
          contingency: OFFLINE_CODE,
          conditions: [{ kind: "serial_device_missing", level: "warning", since: SINCE }],
        }),
        backupTickets: loadedTickets({ to_print: 1, missing_key: 1 }),
      });

      await expect.element(screen.getByRole("button", { name: "4 avisos" })).toBeVisible();
    });

    it.each([
      ["loading", { status: "loading" }],
      ["failed", { status: "failed", retry: () => {} }],
      ["quiet", loadedTickets({ kept: 3 })],
    ] as const)("shows no notice while the tickets are %s", async (_name, backupTicketsData) => {
      const screen = await renderHeader({ backupTickets: backupTicketsData });

      await expect.element(screen.getByRole("button", { name: /aviso/ })).not.toBeInTheDocument();
    });
  });
});
