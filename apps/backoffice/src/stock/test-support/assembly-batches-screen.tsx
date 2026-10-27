import type { AssemblyBatch, RecipeSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { AssemblyBatchesScreen } from "../assembly-batches-screen";
import type { AssemblyBatchesScreenServices } from "../assembly-batches-services";
import { type AssemblyBatchesFilters, assemblyBatchesFilters } from "../routes";
import { assemblyBatchList } from "./assembly-batches";
import { cajaDeInfusiones, mixDeFrutosSecos } from "./recipes";

export function createServices(
  overrides: Partial<AssemblyBatchesScreenServices> = {},
): AssemblyBatchesScreenServices {
  return {
    fetchAssemblyBatches: vi.fn(),
    fetchAssemblyBatchPreview: vi.fn(),
    registerAssemblyBatch: vi.fn(),
    voidAssemblyBatch: vi.fn(),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export function renderScreen(
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

export type Screen = Awaited<ReturnType<typeof renderScreen>>;

export function rowTexts(screen: Screen): string[] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

export async function loaded(
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
