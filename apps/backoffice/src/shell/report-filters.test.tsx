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
import { BACK_REGISTER_ID, FRONT_REGISTER_ID, registers } from "./test-support/report-fixtures";

const ANSWERED = { from: "2026-10-01", to: "2026-10-07" };

function createRegistersRead() {
  const read = vi.fn();
  read.mockResolvedValue({ kind: "ok", value: registers });
  return read;
}

type Handlers = {
  filters?: ReportFiltersValue;
  onFiltersChange?: (filters: ReportFiltersValue) => void;
  onSessionEnded?: () => void;
};

function ControlledFilters({
  fetchReportRegisters,
  filters: initial = reportFiltersSearch.parse({}),
  onFiltersChange = () => {},
  onSessionEnded = () => {},
}: Handlers & { fetchReportRegisters: ReturnType<typeof createRegistersRead> }) {
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
          onSessionEnded={onSessionEnded}
          fetchReportRegisters={fetchReportRegisters}
          answeredPeriod={ANSWERED}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderFilters(
  fetchReportRegisters: ReturnType<typeof createRegistersRead>,
  handlers: Handlers = {},
) {
  return render(<ControlledFilters fetchReportRegisters={fetchReportRegisters} {...handlers} />);
}

test("shows the period the cloud answered while the URL names none", async () => {
  const screen = await renderFilters(createRegistersRead());

  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);
  expect(dateSegments(screen, "Hasta")).toEqual(["7", "10", "2026"]);
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the range and the register the URL names", async () => {
  const screen = await renderFilters(createRegistersRead(), {
    filters: reportFiltersSearch.parse({
      from: "2026-10-02",
      to: "2026-10-05",
      register: BACK_REGISTER_ID,
    }),
  });

  expect(dateSegments(screen, "Desde")).toEqual(["2", "10", "2026"]);
  await expect.element(screen.getByRole("button", { name: "Caja: Caja del fondo" })).toBeVisible();
});

test("offers every register of the branch by name and reports the one chosen", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderFilters(createRegistersRead(), { onFiltersChange });
  await expect.poll(() => dateSegments(screen, "Desde")).toEqual(["1", "10", "2026"]);

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  await userEvent.click(screen.getByRole("option", { name: "Caja principal" }));

  expect(options).toEqual(["Todas", "Caja del fondo", "Caja principal"]);
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "", to: "", register: FRONT_REGISTER_ID });
});

test("offers only all the registers when the registers cannot be listed", async () => {
  const read = createRegistersRead();
  read.mockResolvedValue({ kind: "failed" });
  const screen = await renderFilters(read);

  await userEvent.click(screen.getByRole("button", { name: /Caja:/ }));

  await expect.element(screen.getByRole("option", { name: "Todas" })).toBeVisible();
  expect(screen.getByRole("option").elements()).toHaveLength(1);
});

test("ends the session when the cloud says it is over", async () => {
  const read = createRegistersRead();
  read.mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderFilters(read, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("keeps reading the register the URL names when the registers cannot be listed", async () => {
  const read = createRegistersRead();
  read.mockResolvedValue({ kind: "failed" });
  const onFiltersChange = vi.fn();

  const screen = await renderFilters(read, {
    filters: reportFiltersSearch.parse({ register: BACK_REGISTER_ID }),
    onFiltersChange,
  });

  await expect.element(screen.getByRole("button", { name: "Caja: La elegida" })).toBeVisible();
  expect(onFiltersChange).not.toHaveBeenCalled();
});

test("shows the register the URL names, never every register, while the registers load", async () => {
  const read = createRegistersRead();
  read.mockReturnValue(new Promise(() => {}));

  const screen = await renderFilters(read, {
    filters: reportFiltersSearch.parse({ register: BACK_REGISTER_ID }),
  });

  await expect.element(screen.getByRole("button", { name: "Caja: La elegida" })).toBeVisible();
});

test("goes back to every register when the URL names one the branch does not have", async () => {
  const onFiltersChange = vi.fn();

  await renderFilters(createRegistersRead(), {
    filters: reportFiltersSearch.parse({ register: "33333333-3333-4333-8333-333333333333" }),
    onFiltersChange,
  });

  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ from: "", to: "", register: "ALL" });
});

test("reports the range typed once both days are complete, never a half-typed year", async () => {
  const read = createRegistersRead();
  const onFiltersChange = vi.fn();
  const screen = await renderFilters(read, { onFiltersChange });
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
  const read = createRegistersRead();
  const onFiltersChange = vi.fn();
  const screen = await renderFilters(read, {
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
  const screen = await renderFilters(createRegistersRead(), {
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
