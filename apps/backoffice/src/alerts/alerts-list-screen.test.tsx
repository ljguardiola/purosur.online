import type { AlertDetail, AlertListPage, AlertSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { notifyManager } from "@tanstack/react-query";
import { act } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import type { FetchAlertsOutcome } from "./alerts-api";
import { AlertsListScreen } from "./alerts-list-screen";
import type { AlertsListScreenServices } from "./alerts-list-services";
import { type AlertsListFilters, alertsListFilters } from "./routes";

function createServices(
  overrides: Partial<AlertsListScreenServices> = {},
): AlertsListScreenServices {
  return {
    fetchAlerts: vi.fn(),
    alertDetailModal: {
      fetchAlert: vi.fn().mockReturnValue(new Promise<never>(() => {})),
      fetchPermissionCatalog: vi.fn(),
      closeAlert: vi.fn(),
    },
    ...overrides,
  };
}

const passkeyAlert: AlertSummary = {
  id: "alert-1",
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  level: "warning",
  audience: "all",
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
};

const lockoutAlert: AlertSummary = {
  id: "alert-2",
  kind: "backoffice_sign_in_lockout",
  scope: "203.0.113.5",
  scopeDisplay: "203.0.113.5",
  level: "critical",
  audience: "all",
  openedAt: "2026-01-05T10:00:00.000Z",
  escalatedAt: "2026-01-06T10:00:00.000Z",
  resolvedAt: null,
};

const closedAlert: AlertSummary = {
  id: "alert-3",
  kind: "backoffice_passkey_changed",
  scope: "user-3",
  scopeDisplay: "Marta Ruiz",
  level: "warning",
  audience: "all",
  openedAt: "2026-01-04T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: "2026-01-05T09:00:00.000Z",
};

function ok(
  alerts: AlertSummary[],
  page: Partial<Omit<AlertListPage, "alerts">> = {},
): FetchAlertsOutcome {
  return {
    kind: "ok",
    value: {
      alerts,
      total: alerts.length,
      pageSize: 25,
      openCount: alerts.filter((alert) => alert.resolvedAt === null).length,
      openCriticalCount: alerts.filter(
        (alert) => alert.resolvedAt === null && alert.level === "critical",
      ).length,
      ...page,
    },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: AlertsListScreenServices,
  onSessionEnded: () => void = () => {},
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
  {
    filters = alertsListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: AlertsListFilters;
    onFiltersChange?: (filters: AlertsListFilters) => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <AlertsListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          access={access}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

test("shows the breadcrumb, heading, each alert's level/kind/scope/opened date, the pill, and the footer", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert, lockoutAlert]));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Inicio")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("2 alertas abiertas").first()).toBeVisible();
  const passkeyRow = screen.getByRole("row", { name: /Lucía Pérez/ });
  const lockoutRow = screen.getByRole("row", { name: /203\.0\.113\.5/ });
  await expect.element(passkeyRow.getByText("Advertencia")).toBeVisible();
  await expect.element(lockoutRow.getByText("Crítica")).toBeVisible();
  await expect.element(passkeyRow.getByText("Passkey")).toBeVisible();
  await expect.element(passkeyRow.getByText("Lucía Pérez")).toBeVisible();
  await expect.element(lockoutRow.getByText("203.0.113.5")).toBeVisible();
  await expect.element(screen.getByText("2 alertas abiertas · 1 crítica")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("hides the header pill and shows the blank empty state when there are no open alerts", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([]));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin alertas abiertas")).toBeVisible();
  expect(screen.getByText("alertas abiertas").query()).toBeNull();
});

test("shows no counts line under the empty state, which already says nothing is open", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([]));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin alertas abiertas")).toBeVisible();
  expect(screen.getByText("0 alertas abiertas · 0 críticas").query()).toBeNull();
  expect(screen.getByRole("navigation", { name: "Páginas de alertas" }).query()).toBeNull();
});

test("shows the filtered empty state, without a counts line, when the filters hide every alert", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([]));

  const screen = await renderScreen(services, () => {}, ADMINISTRATOR_ACCESS, {
    filters: { ...alertsListFilters.parse({}), level: "critical" },
  });

  await expect.element(screen.getByText("No encontramos alertas")).toBeVisible();
  expect(screen.getByText("0 alertas abiertas · 0 críticas").query()).toBeNull();
});

test("shows the table loading until the first alerts arrive", async () => {
  const services = createServices();
  const firstLoad = deferred<FetchAlertsOutcome>();
  vi.mocked(services.fetchAlerts).mockReturnValue(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Alertas" }))
    .toHaveAttribute("aria-busy", "true");
  firstLoad.resolve(ok([passkeyAlert]));
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  await expect
    .element(screen.getByRole("table", { name: "Alertas" }))
    .not.toHaveAttribute("aria-busy");
});

test("makes one request per load, carrying the open-alert counts beyond the rows shown", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(
    ok([passkeyAlert], { total: 1, openCount: 4, openCriticalCount: 2 }),
  );

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("4 alertas abiertas · 2 críticas")).toBeVisible();
  await expect.element(screen.getByText("4 alertas abiertas", { exact: true })).toBeVisible();
  expect(services.fetchAlerts).toHaveBeenCalledTimes(1);
  expect(services.fetchAlerts).toHaveBeenCalledWith({ open: true, page: 1 });
});

test("searches server-side by the typed text, sending the kinds whose title matches it", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert, lockoutAlert]));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();

  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  await userEvent.fill(screen.getByPlaceholder("Buscar una alerta"), " passkey ");

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([
      { open: true, page: 1, search: { text: "passkey", kinds: ["backoffice_passkey_changed"] } },
    ]);
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  await expect.element(screen.getByText("203.0.113.5")).not.toBeInTheDocument();
});

test("pages through the alerts, going back to the first page when a filter changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert], { total: 30 }));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ open: true, page: 2 }]);
  await expect
    .element(screen.getByRole("button", { name: "Página 2" }))
    .toHaveAttribute("aria-current", "page");

  await screen.getByRole("button", { name: /Nivel/ }).click();
  await screen.getByRole("option", { name: "Crítica" }).click();

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ level: "critical", open: true, page: 1 }]);
});

test("keeps a page chosen right after opening once the untouched search settles", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  notifyManager.setScheduler(queueMicrotask);
  try {
    const services = createServices();
    vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert], { total: 30 }));
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Página 2" }));
    await expect
      .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
      .toContainEqual([{ open: true, page: 2 }]);
    await vi.advanceTimersByTimeAsync(300);

    await expect
      .element(screen.getByRole("button", { name: "Página 2" }))
      .toHaveAttribute("aria-current", "page");
    expect(vi.mocked(services.fetchAlerts).mock.calls).toEqual([
      [{ open: true, page: 1 }],
      [{ open: true, page: 2 }],
    ]);
  } finally {
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    vi.useRealTimers();
  }
});

test("drops a late response once the filters have changed since it was sent, still refreshing on a later filter change", async () => {
  const services = createServices();
  let resolveFirst: (outcome: FetchAlertsOutcome) => void = () => {};
  let resolveFirstSettled: () => void = () => {};
  const firstSettled = new Promise<void>((resolve) => {
    resolveFirstSettled = resolve;
  });
  vi.mocked(services.fetchAlerts)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = (outcome) => {
          resolve(outcome);
          resolveFirstSettled();
        };
      }),
    )
    .mockResolvedValue(ok([lockoutAlert]));
  const screen = await renderScreen(services);

  await screen.getByRole("button", { name: /Nivel/ }).click();
  await screen.getByRole("option", { name: "Crítica" }).click();
  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();
  // vitest-browser-react only marks the environment act-aware around its own render/userEvent
  // calls; a manual resolution outside those needs the flag set to use act() here too.
  const globalWithActEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = globalWithActEnvironment.IS_REACT_ACT_ENVIRONMENT;
  globalWithActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => {
      resolveFirst(ok([passkeyAlert]));
      await firstSettled;
    });
  } finally {
    if (previousActEnvironment === undefined) {
      delete globalWithActEnvironment.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalWithActEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
  }
  expect(screen.getByText("Lucía Pérez").query()).toBeNull();
  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();

  vi.mocked(services.fetchAlerts).mockResolvedValueOnce(ok([closedAlert]));
  await screen.getByRole("button", { name: /Estado/ }).click();
  await screen.getByRole("option", { name: "Cerradas" }).click();
  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ level: "critical", open: false, page: 1 }]);
  await expect.element(screen.getByText("Marta Ruiz")).toBeVisible();
});

test("re-fetches with the chosen level when the Nivel filter changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Passkey")).toBeVisible();

  await screen.getByRole("button", { name: /Nivel/ }).click();
  await screen.getByRole("option", { name: "Crítica" }).click();

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ level: "critical", open: true, page: 1 }]);
});

test("re-fetches closed alerts when the Estado filter changes", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Passkey")).toBeVisible();

  await screen.getByRole("button", { name: /Estado/ }).click();
  await screen.getByRole("option", { name: "Cerradas" }).click();

  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls)
    .toContainEqual([{ open: false, page: 1 }]);
});

const passkeyDetail: AlertDetail = {
  id: "alert-1",
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  level: "warning",
  audience: "all",
  detail: {
    action: "registered",
    passkeyName: "Teléfono de Lucía",
    actorId: "user-1",
    via: "self",
  },
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  open: true,
  deliveries: [],
};

test("the eye action opens the detail modal for that alert", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert]));
  const fetchAlert = vi.fn().mockResolvedValue({ kind: "ok", value: passkeyDetail });
  services.alertDetailModal = { fetchAlert, fetchPermissionCatalog: vi.fn(), closeAlert: vi.fn() };
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Passkey")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta/ }));

  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();
  expect(fetchAlert).toHaveBeenCalledWith("alert-1");
});

test("ends the session when the alerts request comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("navigates to Mi cuenta when the alerts request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("shows a closed lockout alert's scope as a dash, since it no longer holds the address", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(
    ok([
      {
        ...lockoutAlert,
        scope: null,
        scopeDisplay: null,
        resolvedAt: "2026-01-06T12:00:00.000Z",
      },
    ]),
  );

  const screen = await renderScreen(services);

  const row = screen.getByRole("row", { name: /Bloqueo de ingreso/ });
  await expect.element(row.getByText("—", { exact: true })).toBeVisible();
});

test("shows a load error with a retry action when the alerts fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las alertas")).toBeVisible();

  vi.mocked(services.fetchAlerts).mockResolvedValueOnce(ok([passkeyAlert]));
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
});

test("keeps the search and the filters available when the alerts fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValueOnce({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las alertas")).toBeVisible();
  await expect.element(screen.getByPlaceholder("Buscar una alerta")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Nivel/ })).toBeVisible();
});

test("retrying a failed load starts again from the loading state", async () => {
  const services = createServices();
  const retry = deferred<FetchAlertsOutcome>();
  vi.mocked(services.fetchAlerts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las alertas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir las alertas")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Alertas" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve(ok([passkeyAlert]));
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
});

test("reads the alerts again after one is closed, keeping the rows shown while it does", async () => {
  const services = createServices();
  const refresh = deferred<FetchAlertsOutcome>();
  vi.mocked(services.fetchAlerts)
    .mockResolvedValueOnce(ok([passkeyAlert, lockoutAlert]))
    .mockReturnValueOnce(refresh.promise);
  services.alertDetailModal = {
    fetchAlert: vi.fn().mockResolvedValue({ kind: "ok", value: passkeyDetail }),
    fetchPermissionCatalog: vi.fn(),
    closeAlert: vi.fn().mockResolvedValue({ kind: "ok" }),
  };
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta «Passkey»/ }));
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect
    .element(screen.getByRole("table", { name: "Alertas" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("203.0.113.5").query()).not.toBeNull();
  refresh.resolve(ok([lockoutAlert]));
  await expect.element(screen.getByText("Lucía Pérez")).not.toBeInTheDocument();
  expect(services.fetchAlerts).toHaveBeenCalledTimes(2);
  expect(services.fetchAlerts).toHaveBeenLastCalledWith({ open: true, page: 1 });
  expect(services.alertDetailModal.fetchAlert).toHaveBeenCalledTimes(1);
});

test("never shows an alert the person just closed as still open when it is opened again", async () => {
  const services = createServices();
  const closedPasskeyAlert = { ...passkeyAlert, resolvedAt: "2026-01-06T09:00:00.000Z" };
  vi.mocked(services.fetchAlerts).mockImplementation(async (query) =>
    query?.open === false ? ok([closedPasskeyAlert]) : ok([passkeyAlert]),
  );
  const reread = deferred<{ kind: "ok"; value: AlertDetail }>();
  services.alertDetailModal = {
    fetchAlert: vi
      .fn()
      .mockResolvedValueOnce({ kind: "ok", value: passkeyDetail })
      .mockReturnValueOnce(reread.promise),
    fetchPermissionCatalog: vi.fn(),
    closeAlert: vi.fn().mockResolvedValue({ kind: "ok" }),
  };
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta «Passkey»/ }));
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: /Estado/ }).click();
  await screen.getByRole("option", { name: "Cerradas" }).click();
  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls.at(-1))
    .toEqual([{ open: false, page: 1 }]);

  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta «Passkey»/ }));

  await expect.element(screen.getByRole("dialog")).toBeVisible();
  expect(services.alertDetailModal.fetchAlert).toHaveBeenCalledTimes(2);
  expect(screen.getByText("No se cierra sola", { exact: false }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeDisabled();
  reread.resolve({
    kind: "ok",
    value: { ...passkeyDetail, resolvedAt: "2026-01-06T09:00:00.000Z", open: false },
  });
  await expect
    .element(screen.getByRole("button", { name: "Cerrar la alerta" }))
    .not.toBeInTheDocument();
});

test("moves to the last page left when closing the only alert on the last page empties it", async () => {
  const services = createServices();
  let closed = false;
  vi.mocked(services.fetchAlerts).mockImplementation(async (query) => {
    if (query?.page === 2) {
      return closed ? ok([], { total: 25, openCount: 25 }) : ok([passkeyAlert], { total: 26 });
    }
    return ok([lockoutAlert], { total: closed ? 25 : 26, openCount: closed ? 25 : 26 });
  });
  services.alertDetailModal = {
    fetchAlert: vi.fn().mockResolvedValue({ kind: "ok", value: passkeyDetail }),
    fetchPermissionCatalog: vi.fn(),
    closeAlert: vi.fn().mockImplementation(async () => {
      closed = true;
      return { kind: "ok" };
    }),
  };
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta/ }));
  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();
  expect(services.alertDetailModal.fetchAlert).toHaveBeenCalledWith("alert-1");
  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls.at(-1))
    .toEqual([{ open: true, page: 1 }]);
  expect(screen.getByText("Sin alertas abiertas").query()).toBeNull();
});

test("never shows the emptied last page as empty while it moves to the last page left", async () => {
  const services = createServices();
  let closed = false;
  const lastPageLeft = deferred<FetchAlertsOutcome>();
  vi.mocked(services.fetchAlerts).mockImplementation(async (query) => {
    if (query?.page === 2) {
      return closed ? ok([], { total: 25, openCount: 25 }) : ok([passkeyAlert], { total: 26 });
    }
    return closed ? lastPageLeft.promise : ok([lockoutAlert], { total: 26, openCount: 26 });
  });
  services.alertDetailModal = {
    fetchAlert: vi.fn().mockResolvedValue({ kind: "ok", value: passkeyDetail }),
    fetchPermissionCatalog: vi.fn(),
    closeAlert: vi.fn().mockImplementation(async () => {
      closed = true;
      return { kind: "ok" };
    }),
  };
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("203.0.113.5")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta/ }));
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();
  let emptyStateShown = false;
  const observer = new MutationObserver((records) => {
    emptyStateShown ||= records.some((record) =>
      Array.from(record.addedNodes).some((node) =>
        node.textContent?.includes("Sin alertas abiertas"),
      ),
    );
  });
  observer.observe(document.body, { childList: true, subtree: true });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));
  await expect
    .poll(() => vi.mocked(services.fetchAlerts).mock.calls.at(-1))
    .toEqual([{ open: true, page: 1 }]);
  await act(async () => {});
  observer.disconnect();

  expect(emptyStateShown).toBe(false);
  expect(screen.getByText("Sin alertas abiertas").query()).toBeNull();
});

test("shows a rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();

  vi.mocked(services.fetchAlerts).mockResolvedValueOnce(ok([passkeyAlert]));
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
});

test("opens with the filters and page it is given, asking for them in its first request", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert], { total: 60 }));

  const screen = await renderScreen(services, () => {}, ADMINISTRATOR_ACCESS, {
    filters: { level: "critical", status: "closed", search: " passkey ", page: 2 },
  });

  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  expect(services.fetchAlerts).toHaveBeenNthCalledWith(1, {
    level: "critical",
    open: false,
    page: 2,
    search: { text: "passkey", kinds: ["backoffice_passkey_changed"] },
  });
  await expect.element(screen.getByPlaceholder("Buscar una alerta")).toHaveValue(" passkey ");
  await expect
    .element(screen.getByRole("button", { name: "Página 2" }))
    .toHaveAttribute("aria-current", "page");
});

test("reports every change to its filters and page, so they can be kept for a reload", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert], { total: 30 }));
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, ADMINISTRATOR_ACCESS, { onFiltersChange });
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

  await expect
    .poll(() => onFiltersChange.mock.lastCall)
    .toEqual([{ ...alertsListFilters.parse({}), page: 2 }]);

  await screen.getByRole("button", { name: /Nivel/ }).click();
  await screen.getByRole("option", { name: "Crítica" }).click();

  await expect
    .poll(() => onFiltersChange.mock.lastCall)
    .toEqual([{ ...alertsListFilters.parse({}), level: "critical" }]);
});

test("does not report its filters again when the route hands it a new callback", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(ok([passkeyAlert], { total: 30 }));
  const onFiltersChange = vi.fn();
  const filters = alertsListFilters.parse({});
  const screen = await renderScreen(services, () => {}, ADMINISTRATOR_ACCESS, {
    filters,
    onFiltersChange,
  });
  await expect.element(screen.getByText("Lucía Pérez")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Página 2" }));
  await expect.poll(() => onFiltersChange.mock.calls.length).toBe(1);

  await screen.rerender(
    screenElement(services, () => {}, ADMINISTRATOR_ACCESS, {
      filters,
      onFiltersChange: (reported) => onFiltersChange(reported),
    }),
  );

  expect(onFiltersChange).toHaveBeenCalledTimes(1);
});

test("names an alert for increased access by its kind and what happened", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(
    ok([
      {
        ...passkeyAlert,
        kind: "user_access_increased",
        level: "critical",
        scopeDisplay: "Grace Hopper",
      },
    ]),
  );

  const screen = await renderScreen(services);

  const row = screen.getByRole("row", { name: /Grace Hopper/ });
  await expect.element(row.getByText("Acceso ampliado")).toBeVisible();
  await expect.element(row.getByText("Se amplió el acceso de un usuario")).toBeVisible();
});

test("names an alert for a register's enrollment by its kind and what happened", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlerts).mockResolvedValue(
    ok([{ ...passkeyAlert, kind: "register_enrolled", scopeDisplay: "Caja 1" }]),
  );

  const screen = await renderScreen(services);

  const row = screen.getByRole("row", { name: /Caja 1/ });
  await expect.element(row.getByText("Alta de caja")).toBeVisible();
  await expect.element(row.getByText("Se dio de alta una caja")).toBeVisible();
});
