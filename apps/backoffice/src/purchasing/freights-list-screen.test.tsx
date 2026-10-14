import type { FreightList } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { FreightsListScreen } from "./freights-list-screen";
import type { FreightsListScreenServices } from "./freights-list-services";
import { type FreightsListFilters, freightsListFilters } from "./routes";
import { fillFreight } from "./test-support/freight-form-fill";
import {
  compraAndina,
  compraMolinos,
  envioDesdeBuenosAires,
  recordedEnvio,
  retiroEnElMolino,
} from "./test-support/freights";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const twoFreights: FreightList = {
  items: [envioDesdeBuenosAires, retiroEnElMolino],
  count: 2,
  totalCents: 2_750_000,
};

const noFreights: FreightList = { items: [], count: 0, totalCents: 0 };

function createServices(
  overrides: Partial<FreightsListScreenServices> = {},
): FreightsListScreenServices {
  return {
    fetchFreights: vi
      .fn<FreightsListScreenServices["fetchFreights"]>()
      .mockResolvedValue({ kind: "ok", value: twoFreights }),
    fetchLinkablePurchases: vi
      .fn<FreightsListScreenServices["fetchLinkablePurchases"]>()
      .mockResolvedValue({ kind: "ok", value: [compraAndina, compraMolinos] }),
    recordFreight: vi.fn<FreightsListScreenServices["recordFreight"]>(),
    editFreight: vi.fn<FreightsListScreenServices["editFreight"]>(),
    ...overrides,
  };
}

function renderScreen(
  services: FreightsListScreenServices,
  {
    filters = freightsListFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: FreightsListFilters;
    onFiltersChange?: (filters: FreightsListFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FreightsListScreen
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function rowTexts(screen: Screen): string[] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

async function loaded(services: FreightsListScreenServices, options = {}) {
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Fletes" })).toBeVisible();
  await expect.poll(() => rowTexts(screen).length).toBeGreaterThan(0);
  return screen;
}

test("shows the breadcrumb, the heading and each freight with its means, purchases and amount", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("Stock").first()).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Flete", level: 1 })).toBeVisible();
  await expect
    .poll(() => rowTexts(screen))
    .toEqual([
      "12/09/2026Envío desde Buenos AiresExpreso Sur2 comprasDistribuidora Andina · Molinos del Valle$ 18.500,00",
      "28/08/2026Retiro en el molinoViaje propio · costo estimado1 compraMolinos del Valle$ 9.000,00",
    ]);
});

test("shows the count and the total of the freights below the table", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("2 fletes · $ 27.500,00")).toBeVisible();
});

test("counts a single freight in the singular", async () => {
  const services = createServices({
    fetchFreights: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { items: [retiroEnElMolino], count: 1, totalCents: 900_000 },
    }),
  });
  const screen = await loaded(services);

  await expect.element(screen.getByText("1 flete · $ 9.000,00")).toBeVisible();
});

test("reads the freights of the default period without a search", async () => {
  const services = createServices();
  await loaded(services);

  expect(services.fetchFreights).toHaveBeenCalledWith({ period: 90, search: "" });
});

test("opens on the period and the search the URL carries", async () => {
  const services = createServices();
  await loaded(services, {
    filters: freightsListFilters.parse({ period: 365, search: "expreso" }),
  });

  await expect
    .poll(() => vi.mocked(services.fetchFreights).mock.calls)
    .toContainEqual([{ period: 365, search: "expreso" }]);
});

test("the search field reads the freights again with the typed text", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await userEvent.fill(screen.getByPlaceholder("Buscar por descripción o medio"), "  molino ");

  await expect
    .poll(() => vi.mocked(services.fetchFreights).mock.calls)
    .toContainEqual([{ period: 90, search: "molino" }]);
});

test("the period filter offers the periods and reads the freights again for the chosen one", async () => {
  const services = createServices();
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: /Período:/ }));
  await expect
    .poll(() =>
      screen
        .getByRole("option")
        .all()
        .map((option) => option.element().textContent),
    )
    .toEqual(["Últimos 30 días", "Últimos 90 días", "Últimos 365 días"]);
  await userEvent.click(screen.getByRole("option", { name: "Últimos 30 días" }));

  await expect
    .poll(() => vi.mocked(services.fetchFreights).mock.calls)
    .toContainEqual([{ period: 30, search: "" }]);
});

test("reports the search and the period that change", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), { onFiltersChange });

  await userEvent.fill(screen.getByPlaceholder("Buscar por descripción o medio"), "molino");
  await userEvent.click(screen.getByRole("button", { name: /Período:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Últimos 365 días" }));

  await expect
    .poll(() => onFiltersChange.mock.calls.at(-1))
    .toEqual([{ search: "molino", period: 365 }]);
});

test("says there are no freights in the period, following the chosen period", async () => {
  const services = createServices({
    fetchFreights: vi.fn().mockResolvedValue({ kind: "ok", value: noFreights }),
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin fletes en los últimos 90 días")).toBeVisible();
  await expect
    .element(screen.getByText("Un flete se vincula a una o varias compras."))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Período:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Últimos 30 días" }));

  await expect.element(screen.getByText("Sin fletes en los últimos 30 días")).toBeVisible();
});

test("says nothing matches a search", async () => {
  const services = createServices({
    fetchFreights: vi.fn().mockResolvedValue({ kind: "ok", value: noFreights }),
  });
  const screen = await renderScreen(services, {
    filters: freightsListFilters.parse({ search: "zzz" }),
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  await expect.element(screen.getByText("Probá con otra descripción o medio.")).toBeVisible();
});

test("shows the table loading while the freights load", async () => {
  const services = createServices({
    fetchFreights: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Fletes" }))
    .toHaveAttribute("aria-busy", "true");
});

test("offers to read the freights again when they could not be loaded", async () => {
  const fetchFreights = vi
    .fn<FreightsListScreenServices["fetchFreights"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue({ kind: "ok", value: twoFreights });
  const screen = await renderScreen(createServices({ fetchFreights }));

  await expect.element(screen.getByText("No pudimos abrir los fletes")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Envío desde Buenos Aires")).toBeVisible();
});

test("ends the session when the freights are refused for lack of one", async () => {
  const onSessionEnded = vi.fn();
  const services = createServices({
    fetchFreights: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the freights are forbidden", async () => {
  window.history.pushState(null, "", "/freights");
  const services = createServices({
    fetchFreights: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("Nuevo flete opens the modal, and recording closes it and reads the freights again", async () => {
  const services = createServices();
  vi.mocked(services.recordFreight).mockResolvedValue({ kind: "ok", freight: recordedEnvio });
  const screen = await loaded(services);

  await userEvent.click(screen.getByRole("button", { name: "Nuevo flete" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Nuevo flete" })).toBeVisible();
  await expect
    .element(dialog.getByRole("checkbox", { name: "Distribuidora Andina" }))
    .toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchLinkablePurchases).mock.calls)
    .toEqual([[{ period: 90 }]]);
  await fillFreight(dialog, {
    date: "12092026",
    amount: "18500",
    carrierName: "Expreso Sur",
    description: "Envío desde Buenos Aires",
    suppliers: ["Distribuidora Andina"],
  });
  const readsBefore = vi.mocked(services.fetchFreights).mock.calls.length;
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el flete" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect
    .poll(() => vi.mocked(services.fetchFreights).mock.calls.length)
    .toBeGreaterThan(readsBefore);
});

test("the edit button opens the freight in the modal, and saving closes it and reads the freights again", async () => {
  const services = createServices();
  vi.mocked(services.editFreight).mockResolvedValue({ kind: "ok", freight: recordedEnvio });
  const screen = await loaded(services);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar el flete Envío desde Buenos Aires" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: "Envío desde Buenos Aires" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("checkbox", { name: "Molinos del Valle" })).toBeChecked();
  const readsBefore = vi.mocked(services.fetchFreights).mock.calls.length;
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.editFreight).toHaveBeenCalledWith(
    envioDesdeBuenosAires.id,
    expect.objectContaining({ description: "Envío desde Buenos Aires" }),
  );
  await expect
    .poll(() => vi.mocked(services.fetchFreights).mock.calls.length)
    .toBeGreaterThan(readsBefore);
});

test("has no accessibility violations", async () => {
  const screen = await loaded(createServices());

  await expectNoAccessibilityViolations(screen.container);
});
