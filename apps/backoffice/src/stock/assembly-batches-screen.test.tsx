import type { AssemblyBatch, RecipeSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { AssemblyBatchesScreen } from "./assembly-batches-screen";
import type { AssemblyBatchesScreenServices } from "./assembly-batches-services";
import { type AssemblyBatchesFilters, assemblyBatchesFilters } from "./routes";
import { assemblyBatchList, infusionsBatch, mixBatch } from "./test-support/assembly-batches";
import { almendras, cajaDeInfusiones, mixDeFrutosSecos } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<AssemblyBatchesScreenServices> = {},
): AssemblyBatchesScreenServices {
  return {
    fetchAssemblyBatches: vi.fn(),
    fetchAssemblyBatchPreview: vi.fn(),
    registerAssemblyBatch: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(
  services: AssemblyBatchesScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = assemblyBatchesFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: AssemblyBatchesFilters;
    onFiltersChange?: (filters: AssemblyBatchesFilters) => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <AssemblyBatchesScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
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

async function loaded(
  services: AssemblyBatchesScreenServices,
  batches: AssemblyBatch[],
  options: Parameters<typeof renderScreen>[2] = {},
  recipes: RecipeSummary[] = [mixDeFrutosSecos, cajaDeInfusiones],
) {
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList(batches, recipes),
  });
  const screen = await renderScreen(services, () => {}, options);
  await expect.element(screen.getByRole("table", { name: "Tandas" })).toBeVisible();
  return screen;
}

test("shows the breadcrumb, the heading and each batch with its moment, product, output, cost and expiry", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch, infusionsBatch]);

  await expect.element(screen.getByText("Stock").first()).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Tandas", level: 1 })).toBeVisible();
  await expect
    .poll(() => rowTexts(screen))
    .toEqual([
      "15/09/202610:30Mix de frutos secos4,950 kg$ 9.912,00 / kg02/11/2026",
      "10/09/202612:05Caja de infusiones12 uCosto incompletoSin vencimiento",
    ]);
  expect(services.fetchAssemblyBatches).toHaveBeenCalledWith(30);
  await expectNoAccessibilityViolations(screen.container);
});

test("counts the batches of the period under the table", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch, infusionsBatch]);
  await expect.element(screen.getByText("2 tandas en los últimos 30 días")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto armado"), "mix");

  await expect.element(screen.getByText("1 tanda en los últimos 30 días")).toBeVisible();
});

test("the search field filters by the assembled product's name, case-insensitively", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch, infusionsBatch]);
  const search = screen.getByPlaceholder("Buscar un producto armado");

  await userEvent.fill(search, "CAJA");
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(15, 19))).toEqual(["Caja"]);

  await userEvent.fill(search, "mix");
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(15, 18))).toEqual(["Mix"]);
});

test("reads the period the URL names, and reports and reads again a period the person picks", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([mixBatch]),
  });
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, {
    filters: assemblyBatchesFilters.parse({ period: "90" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("Mix de frutos secos")).toBeVisible();
  expect(services.fetchAssemblyBatches).toHaveBeenCalledWith(90);

  await userEvent.click(screen.getByRole("button", { name: /Período:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Últimos 7 días" }));

  await expect.poll(() => vi.mocked(services.fetchAssemblyBatches).mock.lastCall).toEqual([7]);
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ period: "7" });
});

test("says there are no batches in the period when there are none", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([]),
  });

  const screen = await renderScreen(services, () => {}, {
    filters: assemblyBatchesFilters.parse({ period: "7" }),
  });

  await expect.element(screen.getByText("Sin tandas en los últimos 7 días")).toBeVisible();
  await expect
    .element(screen.getByText("Cada tanda registra lo que se usó y lo que se obtuvo."))
    .toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch]);

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto armado"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchAssemblyBatches>>>();
  vi.mocked(services.fetchAssemblyBatches)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las tandas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Tandas" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: assemblyBatchList([mixBatch]) });
  await expect.element(screen.getByText("Mix de frutos secos")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the batches request comes back forbidden", async () => {
  window.history.pushState(null, "", "/assembly-batches");
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the batches request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("the create action waits for the recipes it offers: disabled while loading and after a failure", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchAssemblyBatches>>>();
  vi.mocked(services.fetchAssemblyBatches)
    .mockReturnValueOnce(firstLoad.promise)
    .mockResolvedValueOnce({ kind: "ok", value: assemblyBatchList([]) });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nueva tanda" })).toBeDisabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las tandas")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva tanda" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect.element(screen.getByRole("button", { name: "Nueva tanda" })).toBeEnabled();
});

test("keeps the rows while the list is read again after a change", async () => {
  const services = createServices();
  const reload = deferred<Awaited<ReturnType<typeof services.fetchAssemblyBatches>>>();
  const screen = await loaded(services, [mixBatch]);
  vi.mocked(services.fetchAssemblyBatches).mockReturnValue(reload.promise);
  vi.mocked(services.fetchAssemblyBatchPreview).mockResolvedValue({
    kind: "ok",
    value: previewOf5kg(),
  });
  vi.mocked(services.registerAssemblyBatch).mockResolvedValue({
    kind: "ok",
    batch: registeredBatch(),
  });

  await registerMix(screen);

  await expect
    .element(screen.getByRole("table", { name: "Tandas" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Mix de frutos secos").first()).toBeVisible();
  reload.resolve({ kind: "ok", value: assemblyBatchList([mixBatch]) });
});

test("the create action opens the new batch modal, and the registered batch is listed and confirmed", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatches)
    .mockResolvedValueOnce({ kind: "ok", value: assemblyBatchList([infusionsBatch]) })
    .mockResolvedValueOnce({
      kind: "ok",
      value: assemblyBatchList([mixBatch, infusionsBatch]),
    });
  vi.mocked(services.fetchAssemblyBatchPreview).mockResolvedValue({
    kind: "ok",
    value: previewOf5kg(),
  });
  vi.mocked(services.registerAssemblyBatch).mockResolvedValue({
    kind: "ok",
    batch: registeredBatch(),
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja de infusiones")).toBeVisible();

  await registerMix(screen);

  expect(services.registerAssemblyBatch).toHaveBeenCalledWith(
    expect.objectContaining({
      productId: mixDeFrutosSecos.productId,
      recipeVersion: mixDeFrutosSecos.version,
      output: 4_950,
    }),
  );
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Mix de frutos secos").first()).toBeVisible();
  await expect.element(screen.getByText("Tanda registrada")).toBeVisible();
  await expect
    .element(screen.getByText("Se registró una tanda de Mix de frutos secos."))
    .toBeVisible();
});

test("cancel closes the new batch modal", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixBatch]);
  await userEvent.click(screen.getByRole("button", { name: "Nueva tanda" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("the confirmation goes away when dismissed", async () => {
  const services = createServices();
  vi.mocked(services.fetchAssemblyBatchPreview).mockResolvedValue({
    kind: "ok",
    value: previewOf5kg(),
  });
  vi.mocked(services.registerAssemblyBatch).mockResolvedValue({
    kind: "ok",
    batch: registeredBatch(),
  });
  const screen = await loaded(services, [mixBatch]);
  await registerMix(screen);
  await expect.element(screen.getByText("Tanda registrada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.poll(() => screen.getByText("Tanda registrada").query()).toBeNull();
});

async function registerMix(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Nueva tanda" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("combobox", { name: /^Producto armado/ }));
  await expect.element(screen.getByRole("option", { name: "Mix de frutos secos" })).toBeVisible();
  (screen.getByRole("option", { name: "Mix de frutos secos" }).element() as HTMLElement).click();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Tamaño de la tanda/ }), "5");
  await expect
    .element(dialog.getByRole("textbox", { name: "Usado de Almendras" }))
    .toHaveValue("2,000");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la tanda" }));
}

function previewOf5kg() {
  return {
    proposal: {
      used: mixDeFrutosSecos.components.map((component) => ({
        componentProductId: component.componentProductId,
        quantity: component.componentProductId === almendras.id ? 2_000 : 1_000,
      })),
      output: 4_950,
    },
    lot: null,
  };
}

function registeredBatch() {
  return {
    id: mixBatch.id,
    productId: mixBatch.productId,
    assembledAt: mixBatch.assembledAt,
    output: mixBatch.output,
    unitCostCents: mixBatch.unitCostCents,
    costIncomplete: mixBatch.costIncomplete,
    expiresOn: mixBatch.expiresOn,
  };
}
