import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CloudData } from "../platform/use-cloud-query";
import { render } from "../shell/test-support/render-with-router";
import type { RegisterSyncStatus } from "./registers-api";
import { RegistersSyncSection } from "./registers-sync-section";

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

function renderSection(data: CloudData<RegisterSyncStatus[]>) {
  return render(
    <main>
      <RegistersSyncSection data={data} />
    </main>,
  );
}

test("shows each register with the day and time of its last successful sync, and Nunca sincronizó for one that never synced", async () => {
  const screen = await renderSection({
    status: "loaded",
    value: [synced, neverSynced],
    refreshing: false,
  });

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

test("marks the table busy while the registers load", async () => {
  const screen = await renderSection({ status: "loading" });

  await expect
    .element(screen.getByRole("table", { name: "Última sincronización de las cajas" }))
    .toHaveAttribute("aria-busy", "true");
});

test("says there are no registers when the branch has none", async () => {
  const screen = await renderSection({ status: "loaded", value: [], refreshing: false });

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
});

test("shows the load error whose Reintentar retries the registers", async () => {
  const retry = vi.fn();

  const screen = await renderSection({ status: "failed", retry });

  await expect.element(screen.getByText("No pudimos abrir las cajas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
