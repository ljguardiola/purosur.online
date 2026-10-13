import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expiringLotsFilters } from "./routes";
import { chiaExpiredLot } from "./test-support/expiring-lots-fixtures";
import {
  createServices,
  listed,
  renderScreen,
  shownProductNames,
} from "./test-support/expiring-lots-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const PRODUCT_NAMES = ["Semillas de chía", "Avena arrollada", "Yogur natural"];

test("shows each lot with its product, category, number, expiry day, stock and value", async () => {
  const screen = await renderScreen(listed());

  await expect
    .element(screen.getByRole("heading", { name: "Vencimientos", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Stock", { exact: true })).toBeVisible();
  const table = screen.getByRole("table", { name: "Vencimientos" });
  await expect.element(table.getByText("L-SC02")).toBeVisible();
  await expect.element(table.getByText("Semillas", { exact: true }).first()).toBeVisible();
  await expect.element(table.getByText("10/10/2026")).toBeVisible();
  await expect.element(table.getByText("1,200 kg")).toBeVisible();
  await expect.element(table.getByText("$ 4.800,00")).toBeVisible();
  await expect.element(table.getByText("24 u")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("says when each lot expires, an expired one apart from the rest", async () => {
  const screen = await renderScreen(listed());

  const table = screen.getByRole("table", { name: "Vencimientos" });
  await expect.element(table.getByText("Venció hace 3 días")).toBeVisible();
  await expect.element(table.getByText("Venció ayer")).toBeVisible();
  await expect.element(table.getByText("Vence hoy")).toBeVisible();
  await expect.element(table.getByText("Vence mañana")).toBeVisible();
  await expect.element(table.getByText("Vence en 12 días")).toBeVisible();
  const expired = getComputedStyle(table.getByText("Venció hace 3 días").element()).color;
  const upcoming = getComputedStyle(table.getByText("Vence hoy").element()).color;
  expect(expired).not.toBe(upcoming);
});

test("shows a dash for a lot without a number and for one without a cost", async () => {
  const screen = await renderScreen(listed());

  await expect.element(screen.getByText("Venció ayer")).toBeVisible();
  const row = screen.getByText("Venció ayer").element().closest("tr") as HTMLElement;
  expect(row.textContent).toContain("—");
});

test("sums the lots listed with their value and counts the ones without a cost", async () => {
  const screen = await renderScreen(listed());

  await expect
    .element(screen.getByText("5 lotes · valorizado $ 42.400,00 · 1 sin costo"))
    .toBeVisible();
});

test("writes a single lot in the singular and leaves out the lots without a cost when none lacks it", async () => {
  const screen = await renderScreen(listed([chiaExpiredLot]));

  await expect.element(screen.getByText("1 lote · valorizado $ 4.800,00")).toBeVisible();
});

test("opens on the expired lots the URL asks for", async () => {
  const screen = await renderScreen(listed(), {
    filters: expiringLotsFilters.parse({ expiry: "expired" }),
  });

  await expect.element(screen.getByText("Venció hace 3 días")).toBeVisible();
  expect(shownProductNames(screen, PRODUCT_NAMES)).toEqual(["Semillas de chía", "Avena arrollada"]);
  expect(screen.getByText("Vence hoy").query()).toBeNull();
});

test("opens on the lots still to expire the URL asks for", async () => {
  const screen = await renderScreen(listed(), {
    filters: expiringLotsFilters.parse({ expiry: "upcoming" }),
  });

  await expect.element(screen.getByText("Vence hoy")).toBeVisible();
  expect(shownProductNames(screen, PRODUCT_NAMES)).toEqual([
    "Yogur natural",
    "Semillas de chía",
    "Avena arrollada",
  ]);
  expect(screen.getByText("Venció ayer").query()).toBeNull();
});

test("names the window the cloud answers in the first expiry option and reports the one chosen", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), { onFiltersChange });
  await expect.element(screen.getByText("Venció ayer")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Vencimiento:/ }));
  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual(["Vencidos y en los próximos 30 días", "Vencidos", "Por vencer"]);
  await userEvent.click(screen.getByRole("option", { name: "Vencidos", exact: true }));

  await expect.element(screen.getByText("Vence hoy")).not.toBeInTheDocument();
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ expiry: "expired" });
});

test("filters by the category and the name typed, and reports each change", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(listed(), { onFiltersChange });
  await expect.element(screen.getByText("Yogur natural")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Semillas" }));

  await expect.element(screen.getByText("Yogur natural")).not.toBeInTheDocument();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toMatchObject({ category: "category-seeds" });

  await userEvent.fill(screen.getByRole("searchbox"), "avena");
  await expect.element(screen.getByText("Semillas de chía").first()).not.toBeInTheDocument();
});

test("offers the categories of the listed lots, by name", async () => {
  const screen = await renderScreen(listed());
  await expect.element(screen.getByText("Yogur natural")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Categoría:/ }));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual(["Todas", "Cereales", "Lácteos", "Semillas"]);
});

test("says there is nothing to expire when the cloud lists no lot", async () => {
  const screen = await renderScreen(listed([]));

  await expect.element(screen.getByText("Sin lotes por vencer")).toBeVisible();
  await expect
    .element(screen.getByText("Ningún lote venció ni vence en los próximos 30 días."))
    .toBeVisible();
});

test("says nothing matches when the filters hide every lot", async () => {
  const screen = await renderScreen(listed([chiaExpiredLot]), {
    filters: expiringLotsFilters.parse({ expiry: "upcoming" }),
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a failed load with a retry that loads the lots again", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpiringLots)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({
      kind: "ok",
      value: {
        windowDays: 30,
        lots: [chiaExpiredLot],
        summary: { valueCents: 480_000, withoutCostCount: 0 },
      },
    });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Semillas de chía")).toBeVisible();
  expect(services.fetchExpiringLots).toHaveBeenCalledTimes(2);
});

test("shows the table loading while the lots are not here yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpiringLots).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("table", { name: "Vencimientos" })).toBeVisible();
  expect(screen.getByText("Sin lotes por vencer").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reintentar" }).query()).toBeNull();
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.fetchExpiringLots).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
