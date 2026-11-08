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
  battery: null,
  disk: null,
};
const neverSynced: RegisterSyncStatus = {
  id: "register-2",
  name: "Caja 2",
  lastSuccessfulSyncAt: null,
  battery: null,
  disk: null,
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

  await expect
    .element(screen.getByRole("heading", { name: "Estado de las cajas", level: 2 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("columnheader", { name: "Última sincronización" }))
    .toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Batería" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Disco" })).toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 02\/03\/2026 06:30 Sin datos Sin datos$/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 2 Nunca sincronizó Sin datos Sin datos$/ }))
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

function registerWith(overrides: Partial<RegisterSyncStatus>): RegisterSyncStatus {
  return { ...synced, ...overrides };
}

const presentBattery = {
  present: true,
  chargePercent: 87,
  onBattery: false,
  onBatteryMinutes: 0,
  healthPercent: null,
  worn: false,
} as const;

test("shows a register running on battery with its charge, and for how long it has had no mains power, in the error tone", async () => {
  const screen = await renderSection({
    status: "loaded",
    value: [
      registerWith({
        battery: { ...presentBattery, chargePercent: 64, onBattery: true, onBatteryMinutes: 14 },
      }),
    ],
    refreshing: false,
  });

  await expect.element(screen.getByText("A batería · 64 %")).toHaveClass("text-error-strong");
  await expect
    .element(screen.getByText("Sin corriente hace 14 min"))
    .toHaveClass("text-error-strong");
  await expectNoAccessibilityViolations(document.body);
});

test("shows a register on mains power with its charge in the neutral tone", async () => {
  const screen = await renderSection({
    status: "loaded",
    value: [registerWith({ battery: presentBattery })],
    refreshing: false,
  });

  const text = screen.getByText("Con corriente · 87 %");
  await expect.element(text).toBeVisible();
  await expect.element(text).not.toHaveClass("text-error-strong");
  await expect.element(text).not.toHaveClass("text-warning-strong");
});

test("shows Sin batería in the warning tone for a register that reports no battery", async () => {
  const screen = await renderSection({
    status: "loaded",
    value: [registerWith({ battery: { present: false } })],
    refreshing: false,
  });

  await expect.element(screen.getByText("Sin batería")).toHaveClass("text-warning-strong");
});

test("adds the battery health in the warning tone when the cloud says the battery is worn, below the on-battery lines", async () => {
  const screen = await renderSection({
    status: "loaded",
    value: [
      registerWith({
        battery: {
          ...presentBattery,
          onBattery: true,
          onBatteryMinutes: 3,
          healthPercent: 55,
          worn: true,
        },
      }),
    ],
    refreshing: false,
  });

  await expect.element(screen.getByText("Salud 55 %")).toHaveClass("text-warning-strong");
  await expect
    .element(
      screen.getByRole("row", { name: /A batería · 87 % Sin corriente hace 3 min Salud 55 %/ }),
    )
    .toBeVisible();
});

test("shows no battery health for a battery the cloud does not say is worn, whatever its health", async () => {
  const screen = await renderSection({
    status: "loaded",
    value: [registerWith({ battery: { ...presentBattery, healthPercent: 95, worn: false } })],
    refreshing: false,
  });

  await expect.element(screen.getByText("Con corriente · 87 %")).toBeVisible();
  expect(screen.container.textContent).not.toContain("Salud");
});

test("shows the share of free disk with the free size below it", async () => {
  const screen = await renderSection({
    status: "loaded",
    value: [registerWith({ disk: { freeBytes: 105226698752, freeRatio: 0.41 } })],
    refreshing: false,
  });

  await expect.element(screen.getByText("41 % libre")).toBeVisible();
  await expect.element(screen.getByText("98 GB")).toHaveClass("text-text-subtle");
});
