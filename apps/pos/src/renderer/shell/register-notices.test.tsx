import type { RegisterStatus } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { registerNoticeSummary, registerNotices } from "./register-notices";
import { backupTickets } from "./test-support/contingency-backup-tickets";

type Condition = RegisterStatus["conditions"][number];
type Input = Parameters<typeof registerNotices>[0];

const SINCE = "2026-11-04T14:20:00.000-03:00";
const CLOCK_DRIFT: Condition = { kind: "clock_drift", level: "warning", since: SINCE };
const SILENT: Condition = { kind: "register_silent", level: "critical", since: SINCE };
const OFFLINE_CODE = { kind: "offline_code", notice: true } as const;

function input(overrides: Partial<Input> = {}): Input {
  return { conditions: [], contingency: null, backupTickets: undefined, ...overrides };
}

describe("registerNoticeSummary", () => {
  it("counts the conditions, the contingency notice and the backup ticket notices", () => {
    const summary = registerNoticeSummary(
      input({
        conditions: [CLOCK_DRIFT],
        contingency: OFFLINE_CODE,
        backupTickets: backupTickets({ to_print: 1, discardable: 1, may_discard: true }),
      }),
    );

    expect(summary.count).toBe(4);
  });

  it("does not count a contingency without a notice nor tickets still being read", () => {
    const summary = registerNoticeSummary(
      input({ contingency: { kind: "deferring", notice: false }, backupTickets: undefined }),
    );

    expect(summary.count).toBe(0);
  });

  it("is a warning unless a condition is critical or a ticket has no backup key", () => {
    expect(registerNoticeSummary(input({ conditions: [CLOCK_DRIFT] })).tone).toBe("warning");
    expect(registerNoticeSummary(input({ conditions: [CLOCK_DRIFT, SILENT] })).tone).toBe("error");
    expect(
      registerNoticeSummary(input({ backupTickets: backupTickets({ missing_key: 1 }) })).tone,
    ).toBe("error");
  });
});

describe("registerNotices", () => {
  it("tells each condition by its title, since when it holds and its level's tone", () => {
    const [silent, drift] = registerNotices(input({ conditions: [CLOCK_DRIFT, SILENT] }));

    expect(drift).toMatchObject({
      tone: "warning",
      title: "Reloj de la caja desajustado",
      subtitle: "Desde 04/11/2026 · 14:20",
    });
    expect(drift?.description).toBeTruthy();
    expect(drift?.whatToDo).toBeTruthy();
    expect(silent).toMatchObject({ tone: "error", title: "La caja no está sincronizando" });
  });

  it("tells the contingency with its own texts, in the warning tone and with no start", () => {
    const [notice] = registerNotices(input({ contingency: OFFLINE_CODE }));

    expect(notice).toMatchObject({ tone: "warning", title: "Facturación en modo de respaldo" });
    expect(notice).not.toHaveProperty("subtitle");
  });

  it("tells no contingency while its notice is off", () => {
    expect(registerNotices(input({ contingency: { kind: "deferring", notice: false } }))).toEqual(
      [],
    );
  });

  it("puts the critical conditions first, then the contingency, then the backup tickets, then the other conditions", () => {
    const notices = registerNotices(
      input({
        conditions: [CLOCK_DRIFT, SILENT],
        contingency: OFFLINE_CODE,
        backupTickets: backupTickets({ to_print: 1 }),
      }),
    );

    expect(notices.map((notice) => notice.title)).toEqual([
      "La caja no está sincronizando",
      "Facturación en modo de respaldo",
      "Tickets de respaldo sin imprimir",
      "Reloj de la caja desajustado",
    ]);
  });

  it("marks only the discard notice of a person who may discard as discardable", () => {
    const notices = registerNotices(
      input({
        conditions: [CLOCK_DRIFT],
        backupTickets: backupTickets({ discardable: 3, may_discard: true }),
      }),
    );

    expect(notices.filter((notice) => notice.discardable).map((notice) => notice.title)).toEqual([
      "Ya podés descartar los tickets de respaldo",
    ]);
  });

  it("gives every notice its own id", () => {
    const notices = registerNotices(
      input({
        conditions: [CLOCK_DRIFT, SILENT],
        contingency: OFFLINE_CODE,
        backupTickets: backupTickets({
          to_print: 1,
          missing_key: 1,
          discardable: 1,
          may_discard: true,
        }),
      }),
    );

    expect(new Set(notices.map((notice) => notice.id)).size).toBe(6);
  });

  it.each<[Condition, string]>([
    [
      { kind: "sales_denied", reason: "event_history_broken", level: "critical", since: SINCE },
      "lucide-ban",
    ],
    [{ kind: "installation_revoked", level: "critical", since: SINCE }, "lucide-shield-off"],
    [{ kind: "fiscal_emission_stopped", level: "critical", since: SINCE }, "lucide-receipt"],
    [CLOCK_DRIFT, "lucide-clock"],
    [SILENT, "lucide-cloud-off"],
    [{ kind: "serial_device_missing", level: "warning", since: SINCE }, "lucide-scan-barcode"],
    [{ kind: "disk_space_low", level: "warning", since: SINCE }, "lucide-hard-drive"],
    [{ kind: "wal_oversized", level: "warning", since: SINCE }, "lucide-database"],
  ])("draws %j with the %s icon", async (condition, icon) => {
    const [notice] = registerNotices(input({ conditions: [condition] }));

    const screen = await render(<div>{notice?.icon}</div>);

    expect(screen.container.querySelector(`svg.${icon}`)).not.toBeNull();
  });
});
