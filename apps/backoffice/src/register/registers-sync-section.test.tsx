import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { FetchRegisterSyncStatusOutcome, RegisterSyncStatus } from "./registers-api";
import { RegistersSyncSection } from "./registers-sync-section";
import type { RegistersSyncSectionServices } from "./registers-sync-services";

const synced: RegisterSyncStatus = {
  id: "register-1",
  name: "Caja 1",
  lastSuccessfulSyncAt: "2026-03-02T09:30:00.000Z",
};
const neverSynced: RegisterSyncStatus = {
  id: "register-2",
  name: "Caja 2",
  lastSuccessfulSyncAt: null,
};

function ok(value: RegisterSyncStatus[]): FetchRegisterSyncStatusOutcome {
  return { kind: "ok", value };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createServices(): RegistersSyncSectionServices {
  return { fetchRegisterSyncStatus: vi.fn() };
}

function renderSection(services: RegistersSyncSectionServices, onSessionEnded = () => {}) {
  return render(
    <main>
      <RegistersSyncSection onSessionEnded={onSessionEnded} services={services} />
    </main>,
  );
}

test("shows each register with the day and time of its last successful sync, and Nunca sincronizó for one that never synced", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue(ok([synced, neverSynced]));

  const screen = await renderSection(services);

  await expect.element(screen.getByRole("heading", { name: "Cajas", level: 2 })).toBeVisible();
  await expect
    .element(screen.getByRole("columnheader", { name: "Última sincronización" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 02\/03\/2026 06:30$/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 2 Nunca sincronizó$/ }))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("shows a loading state until the registers arrive", async () => {
  const services = createServices();
  const load = deferred<FetchRegisterSyncStatusOutcome>();
  vi.mocked(services.fetchRegisterSyncStatus).mockReturnValue(load.promise);

  const screen = await renderSection(services);

  await expect
    .element(screen.getByRole("table", { name: "Última sincronización de las cajas" }))
    .toHaveAttribute("aria-busy", "true");
  load.resolve(ok([synced]));
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("says there are no registers when the branch has none", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue(ok([]));

  const screen = await renderSection(services);

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});

test("shows a load error whose retry starts again from the loading state", async () => {
  const services = createServices();
  const retry = deferred<FetchRegisterSyncStatusOutcome>();
  vi.mocked(services.fetchRegisterSyncStatus)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderSection(services);
  await expect.element(screen.getByText("No pudimos abrir las cajas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir las cajas")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Última sincronización de las cajas" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve(ok([synced]));
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
});

test("ends the session when the request comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderSection(services, onSessionEnded);

  await expect.poll(() => onSessionEnded).toHaveBeenCalled();
});

test("navigates to Mi cuenta when the request comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchRegisterSyncStatus).mockResolvedValue({ kind: "forbidden" });

  await renderSection(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});
