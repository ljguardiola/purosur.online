import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ReportFilters } from "./report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportFiltersSearch,
} from "./report-filters-search";
import { render } from "./test-support/render-with-router";
import { dateSegments, typeDate } from "./test-support/report-dates";
import { BACK_REGISTER_ID, FRONT_REGISTER_ID } from "./test-support/report-fixtures";

const ANSWERED = { from: "2026-10-01", to: "2026-10-07" };

function RegisterFilterStub({
  value,
  onChange,
}: {
  value: string;
  onChange: (register: string) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(FRONT_REGISTER_ID)}>
      {`Caja elegida: ${value}`}
    </button>
  );
}

type Handlers = {
  filters?: ReportFiltersValue;
  onFiltersChange?: (filters: ReportFiltersValue) => void;
};

function ControlledFilters({
  filters: initial = reportFiltersSearch.parse({}),
  onFiltersChange = () => {},
}: Handlers) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportFilters
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          answeredPeriod={ANSWERED}
          registerFilter={(field) => <RegisterFilterStub {...field} />}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderFilters(handlers: Handlers = {}) {
  return render(<ControlledFilters {...handlers} />);
}

test("shows the period the cloud answered while the URL names none", async () => {
  const screen = await renderFilters();

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the range and the register the URL names", async () => {
  const screen = await renderFilters({
    filters: reportFiltersSearch.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: BACK_REGISTER_ID,
    }),
  });

  expect(dateSegments(screen, "Desde")).toEqual(["2", "10", "2026"]);
  await expect
    .element(screen.getByRole("button", { name: `Caja elegida: ${BACK_REGISTER_ID}` }))
    .toBeVisible();
});

test("reports the register chosen in the register filter, keeping the range", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderFilters({
    filters: reportFiltersSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
    onFiltersChange,
  });

  await userEvent.click(screen.getByRole("button", { name: "Caja elegida: ALL" }));

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-05", register: FRONT_REGISTER_ID });
});

test("reports the range typed once both days are complete, never a half-typed year", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderFilters({ onFiltersChange });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);

  await typeDate(screen, "Desde", "02102026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-07", register: "ALL" });
  expect(
    onFiltersChange.mock.calls
      .map(([next]) => next.from)
      .filter((from) => from < "1000" && from !== ""),
  ).toEqual([]);
});

test("says the end cannot come before the start and reports nothing", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderFilters({
    filters: reportFiltersSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
    onFiltersChange,
  });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["2", "10", "2026"]);

  await typeDate(screen, "Hasta", "01102026");

  await expect
    .element(screen.getByText("La fecha de fin no puede ser anterior a la de inicio."))
    .toBeVisible();
  expect(onFiltersChange).not.toHaveBeenCalled();
});

test("asks again once a range that was out of order is put right", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderFilters({
    filters: reportFiltersSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
    onFiltersChange,
  });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["2", "10", "2026"]);
  await typeDate(screen, "Hasta", "01102026");

  await typeDate(screen, "Hasta", "06102026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-06", register: "ALL" });
  expect(
    screen.getByText("La fecha de fin no puede ser anterior a la de inicio.").query(),
  ).toBeNull();
});
