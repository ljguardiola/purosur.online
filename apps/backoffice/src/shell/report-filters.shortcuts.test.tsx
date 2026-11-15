import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import type { ReportFiltersProps } from "./report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportFiltersSearch,
} from "./report-filters-search";
import { choosePeriodShortcut, periodShortcuts } from "./test-support/period-shortcuts";
import { periodSegments, typePeriodEnd } from "./test-support/report-dates";
import { renderReportFilters } from "./test-support/report-filters";

const TODAY = "2026-10-15";

const ANSWERED_TODAY = { from: TODAY, to: TODAY, today: TODAY };

type Options = {
  filters?: ReportFiltersValue;
  answeredPeriod?: ReportFiltersProps<ReportFiltersValue>["answeredPeriod"];
  periodShortcuts?: boolean;
  onFiltersChange?: (filters: ReportFiltersValue) => void;
};

function renderFilters({ answeredPeriod, periodShortcuts = true, ...options }: Options = {}) {
  return renderReportFilters({
    ...options,
    answeredPeriodOf: (filters) =>
      answeredPeriod === undefined && filters.from !== ""
        ? { from: filters.from, to: filters.to, today: TODAY }
        : answeredPeriod,
    ...(periodShortcuts ? { periodShortcuts: true } : {}),
  });
}

const SHORTCUTS = ["Hoy", "Últimos 7 días", "Este mes", "Mes anterior"];

function chosenShortcuts(screen: Awaited<ReturnType<typeof renderFilters>>) {
  return SHORTCUTS.filter(
    (name) =>
      (periodShortcuts(screen).getByRole("radio", { name }).element() as HTMLInputElement).checked,
  );
}

test("offers the four shortcuts with today chosen when the URL names no period", async () => {
  const screen = await renderFilters({ answeredPeriod: ANSWERED_TODAY });

  for (const name of SHORTCUTS) {
    await expect.element(periodShortcuts(screen).getByRole("radio", { name })).toBeInTheDocument();
  }
  await expect.poll(() => chosenShortcuts(screen)).toEqual(["Hoy"]);
  await expectNoAccessibilityViolations(screen.container);
});

test.each([
  ["Últimos 7 días", { from: "2026-10-09", to: TODAY }, ["9", "10", "2026"]],
  ["Este mes", { from: "2026-10-01", to: TODAY }, ["1", "10", "2026"]],
  ["Mes anterior", { from: "2026-09-01", to: "2026-09-30" }, ["1", "9", "2026"]],
])("reports and shows the period of %s and marks it chosen", async (name, period, start) => {
  const onFiltersChange = vi.fn();
  const screen = await renderFilters({ answeredPeriod: ANSWERED_TODAY, onFiltersChange });
  await expect.poll(() => chosenShortcuts(screen)).toEqual(["Hoy"]);

  await choosePeriodShortcut(screen, name);

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ ...period, register: "ALL" });
  await expect
    .poll(() => periodSegments(screen).slice(0, 3).map(Number))
    .toEqual(start.map(Number));
  expect(chosenShortcuts(screen)).toEqual([name]);
});

test("marks the shortcut of the period the URL names", async () => {
  const screen = await renderFilters({
    filters: reportFiltersSearch.parse({ from: "2026-09-01", to: "2026-09-30" }),
  });

  await expect.poll(() => chosenShortcuts(screen)).toEqual(["Mes anterior"]);
});

test("leaves no shortcut chosen once a day is typed by hand", async () => {
  const screen = await renderFilters({
    filters: reportFiltersSearch.parse({ from: "2026-10-01", to: TODAY }),
  });
  await expect.poll(() => chosenShortcuts(screen)).toEqual(["Este mes"]);

  await typePeriodEnd(screen, "14102026");

  await expect.poll(() => chosenShortcuts(screen)).toEqual([]);
});

test("keeps the shortcuts disabled until the cloud has answered which day is today", async () => {
  const screen = await renderFilters({ answeredPeriod: undefined });

  await expect.element(periodShortcuts(screen)).toHaveAttribute("aria-disabled", "true");
  expect(chosenShortcuts(screen)).toEqual([]);
});

test("offers no shortcuts to a report that does not ask for them", async () => {
  const screen = await renderFilters({ answeredPeriod: ANSWERED_TODAY, periodShortcuts: false });

  await expect.element(screen.getByRole("group", { name: /^Período/ })).toBeVisible();
  expect(screen.getByRole("radiogroup", { name: "Atajos de período" }).query()).toBeNull();
});
