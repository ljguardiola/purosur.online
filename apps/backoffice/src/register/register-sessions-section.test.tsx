import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { render } from "../shell/test-support/render-with-router";
import { periodSegments, typePeriodStart } from "../shell/test-support/report-dates";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import type { RegisterSessionsSectionServices } from "./register-sessions-section";
import { RegisterSessionsSection } from "./register-sessions-section";
import {
  emptyCashSessionClosesReport,
  weekCashSessionClosesReport,
} from "./test-support/cash-session-closes-fixtures";

const NO_PERIOD: ReportPeriodFilters = { from: "", to: "" };

function renderSection(
  read = vi
    .fn<RegisterSessionsSectionServices["fetchCashSessionCloses"]>()
    .mockResolvedValue({ kind: "ok", value: weekCashSessionClosesReport }),
  onSessionEnded: () => void = () => {},
  {
    period = NO_PERIOD,
    onPeriodChange = () => {},
  }: { period?: ReportPeriodFilters; onPeriodChange?: (period: ReportPeriodFilters) => void } = {},
) {
  const services: RegisterSessionsSectionServices = { fetchCashSessionCloses: read };
  return render(
    <main>
      <ControlledSection
        initialPeriod={period}
        onPeriodChange={onPeriodChange}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </main>,
  ).then((screen) => ({ screen, read }));
}

function ControlledSection({
  initialPeriod,
  onPeriodChange,
  onSessionEnded,
  services,
}: {
  initialPeriod: ReportPeriodFilters;
  onPeriodChange: (period: ReportPeriodFilters) => void;
  onSessionEnded: () => void;
  services: RegisterSessionsSectionServices;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  return (
    <RegisterSessionsSection
      registerId={FRONT_REGISTER_ID}
      period={period}
      onPeriodChange={(next) => {
        onPeriodChange(next);
        setPeriod(next);
      }}
      onSessionEnded={onSessionEnded}
      services={services}
    />
  );
}

const WEEK: ReportPeriodFilters = { from: "2026-10-01", to: "2026-10-07" };

test("asks the cloud for no range when it is given none, and shows the range it answered", async () => {
  const { screen, read } = await renderSection();

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["7", "10", "2026"]);
  expect(read.mock.calls).toEqual([[{ register_id: FRONT_REGISTER_ID }]]);
});

test("reads the closes of the register it is given over the period it is given", async () => {
  const { read } = await renderSection(undefined, undefined, { period: WEEK });

  await expect
    .poll(() => read.mock.calls)
    .toEqual([[{ from: "2026-10-01", to: "2026-10-07", register_id: FRONT_REGISTER_ID }]]);
});

test("reports the period typed in Período", async () => {
  const onPeriodChange = vi.fn();
  const { screen } = await renderSection(undefined, undefined, { onPeriodChange });
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);

  await typePeriodStart(screen, "02102026");

  await expect
    .poll(() => onPeriodChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-07" });
});

test("shows each close's date, cashier and cash, with no column naming the register", async () => {
  const { screen } = await renderSection();

  for (const name of ["Fecha", "Cajero", "Esperado", "Contado", "Diferencia"]) {
    await expect.element(screen.getByRole("columnheader", { name })).toBeVisible();
  }
  expect(screen.getByRole("columnheader", { name: "Caja" }).query()).toBeNull();
  await expect.element(screen.getByText("Tomás Ruiz").first()).toBeVisible();
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
});

test("links to Cierres de caja narrowed to that register", async () => {
  const { screen } = await renderSection();

  await expect
    .element(screen.getByRole("link", { name: "Ver en Cierres de caja" }))
    .toHaveAttribute("href", `/registers/closes?register=${FRONT_REGISTER_ID}`);
});

test("links to Cierres de caja narrowed to that register over the period it is given", async () => {
  const { screen } = await renderSection(undefined, undefined, { period: WEEK });

  await expect
    .element(screen.getByRole("link", { name: "Ver en Cierres de caja" }))
    .toHaveAttribute(
      "href",
      `/registers/closes?register=${FRONT_REGISTER_ID}&from=2026-10-01&to=2026-10-07`,
    );
});

test("shows loading placeholders while the closes load", async () => {
  const { screen } = await renderSection(
    vi
      .fn<RegisterSessionsSectionServices["fetchCashSessionCloses"]>()
      .mockReturnValue(new Promise(() => {})),
  );

  await expect.element(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
});

test("says the register has no closed sessions in the period", async () => {
  const { screen } = await renderSection(
    vi
      .fn<RegisterSessionsSectionServices["fetchCashSessionCloses"]>()
      .mockResolvedValue({ kind: "ok", value: emptyCashSessionClosesReport }),
  );

  await expect.element(screen.getByText("No hay sesiones cerradas en este período")).toBeVisible();
});

test("shows a load error whose retry reads again", async () => {
  const read = vi
    .fn<RegisterSessionsSectionServices["fetchCashSessionCloses"]>()
    .mockResolvedValueOnce({ kind: "failed" });
  read.mockResolvedValue({ kind: "ok", value: weekCashSessionClosesReport });
  const { screen } = await renderSection(read);
  await expect.element(screen.getByText("No pudimos abrir los cierres de caja")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
});

test("ends the session when the read finds no open session", async () => {
  const onSessionEnded = vi.fn();
  await renderSection(
    vi
      .fn<RegisterSessionsSectionServices["fetchCashSessionCloses"]>()
      .mockResolvedValue({ kind: "unauthenticated" }),
    onSessionEnded,
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded", async () => {
  const { screen } = await renderSection();
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
