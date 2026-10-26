import type { ContingencyTicketRecoveriesResponse } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CloudData } from "../platform/use-cloud-query";
import { render } from "../shell/test-support/render-with-router";
import { TicketRecoveriesSection } from "./ticket-recoveries-section";

const recovery = {
  recovery_id: "5b1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a21",
  register_id: "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11",
  register_name: "Caja 1",
  opened_at: "2026-09-14T20:22:00.000Z",
};

const second = {
  ...recovery,
  recovery_id: "5b1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a22",
  register_id: "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a12",
  register_name: "Caja 2",
  opened_at: "2026-09-15T01:30:00.000Z",
};

function loaded(
  recoveries: ContingencyTicketRecoveriesResponse["recoveries"],
): CloudData<ContingencyTicketRecoveriesResponse> {
  return { status: "loaded", value: { recoveries }, refreshing: false };
}

function renderSection(data: CloudData<ContingencyTicketRecoveriesResponse>, onFinish = vi.fn()) {
  return render(
    <main aria-label="Pantalla">
      <TicketRecoveriesSection data={data} onFinish={onFinish} />
    </main>,
  );
}

test("shows nothing when no register awaits its ticket recovery", async () => {
  const screen = await renderSection(loaded([]));

  expect(screen.getByRole("main").element().textContent).toBe("");
});

test("tells to check the printer and the counter before scanning", async () => {
  const screen = await renderSection(loaded([recovery]));

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent(
      "Antes de escanear, revisá la impresora y el mostrador: el último ticket de respaldo suele seguir ahí.",
    );
});

test("lists each register awaiting since when", async () => {
  const screen = await renderSection(loaded([recovery, second]));

  await expect
    .element(screen.getByRole("table", { name: "Cajas esperando el rescate de tickets" }))
    .toBeVisible();
  await expect.element(screen.getByText("Caja 1")).toBeVisible();
  await expect.element(screen.getByText("14/09/2026 · 17:22")).toBeVisible();
  await expect.element(screen.getByText("Caja 2")).toBeVisible();
  await expect.element(screen.getByText("14/09/2026 · 22:30")).toBeVisible();
});

test("finishing a register's rescue hands over that register's recovery", async () => {
  const onFinish = vi.fn();
  const screen = await renderSection(loaded([recovery, second]), onFinish);

  await userEvent.click(screen.getByRole("button", { name: "Terminar el rescate de Caja 2" }));

  expect(onFinish).toHaveBeenCalledWith(second);
});

test("shows a placeholder while the recoveries load", async () => {
  const screen = await renderSection({ status: "loading" });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByRole("table").query()).toBeNull();
});

test("offers to retry when the recoveries fail to load", async () => {
  const retry = vi.fn();
  const screen = await renderSection({ status: "failed", retry });

  await expect
    .element(screen.getByText("No pudimos abrir las cajas esperando el rescate"))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(retry).toHaveBeenCalledTimes(1);
});

test("has no accessibility violations", async () => {
  await renderSection(loaded([recovery]));

  await expectNoAccessibilityViolations(document.body);
});
