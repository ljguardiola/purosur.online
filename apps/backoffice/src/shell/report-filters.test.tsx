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
import { periodSegments, typePeriodEnd, typePeriodStart } from "./test-support/report-dates";
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

  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);
  expect(periodSegments(screen).slice(3)).toEqual(["7", "10", "2026"]);
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

  expect(periodSegments(screen).slice(0, 3)).toEqual(["2", "10", "2026"]);
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
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);

  await typePeriodStart(screen, "02102026");

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
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["2", "10", "2026"]);

  await typePeriodEnd(screen, "01102026");

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
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["2", "10", "2026"]);
  await typePeriodEnd(screen, "01102026");

  await typePeriodEnd(screen, "06102026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-06", register: "ALL" });
  expect(
    screen.getByText("La fecha de fin no puede ser anterior a la de inicio.").query(),
  ).toBeNull();
});

test("reports an empty period once one end of the period is erased", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderFilters({
    filters: reportFiltersSearch.parse({ from: "2026-10-02", to: "2026-10-05" }),
    onFiltersChange,
  });

  for (const segment of screen
    .getByRole("group", { name: /^Período/ })
    .getByRole("spinbutton")
    .all()
    .slice(0, 3)) {
    await userEvent.click(segment);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}");
  }

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "", to: "", register: "ALL" });
});

test("labels the single period field Período, with no separate start and end fields", async () => {
  const screen = await renderFilters();

  await expect.element(screen.getByRole("group", { name: /^Período/ })).toBeVisible();
  expect(screen.getByRole("group", { name: /^Desde/ }).query()).toBeNull();
  expect(screen.getByRole("group", { name: /^Hasta/ }).query()).toBeNull();
});

function ControlledPeriod({
  onFiltersChange,
}: {
  onFiltersChange?: (filters: { from: string; to: string }) => void;
}) {
  const [filters, setFilters] = useState({ from: "", to: "" });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportFilters
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange?.(next);
            setFilters(next);
          }}
          answeredPeriod={ANSWERED}
        />
      </main>
    </FieldSizeProvider>
  );
}

test("reports the range typed without a register when it offers no register filter", async () => {
  const onFiltersChange = vi.fn();
  const screen = await render(<ControlledPeriod onFiltersChange={onFiltersChange} />);
  await expect.poll(() => periodSegments(screen).slice(0, 3)).toEqual(["1", "10", "2026"]);

  await typePeriodStart(screen, "02102026");

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "2026-10-02", to: "2026-10-07" });
});

test("places the trailing content at the end of the filter row", async () => {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportFilters
          filters={reportFiltersSearch.parse({})}
          onFiltersChange={() => {}}
          answeredPeriod={ANSWERED}
          trailing={<button type="button">Al final</button>}
        />
      </main>
    </FieldSizeProvider>,
  );

  const trailing = screen.getByRole("button", { name: "Al final" });
  await expect.element(trailing).toBeVisible();
  const row = (trailing.element() as HTMLElement).parentElement as HTMLElement;
  const rowBox = row.getBoundingClientRect();
  const trailingBox = (trailing.element() as HTMLElement).getBoundingClientRect();
  expect(Math.round(rowBox.right - trailingBox.right)).toBe(0);
});

test("hands the register field a way to report the label of the register shown", async () => {
  const onRegisterLabelChange = vi.fn();
  const labels: unknown[] = [];

  await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportFilters
          filters={reportFiltersSearch.parse({})}
          onFiltersChange={() => {}}
          answeredPeriod={ANSWERED}
          onRegisterLabelChange={onRegisterLabelChange}
          registerFilter={(field) => {
            labels.push(field.onLabelChange);
            return null;
          }}
        />
      </main>
    </FieldSizeProvider>,
  );

  expect(labels).toContain(onRegisterLabelChange);
});
