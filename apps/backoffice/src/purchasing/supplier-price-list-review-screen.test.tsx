import type { SupplierPriceListReview } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { SupplierPriceListReviewScreen } from "./supplier-price-list-review-screen";
import type { SupplierPriceListReviewScreenServices } from "./supplier-price-list-review-services";
import {
  type SupplierPriceListReviewFilters,
  supplierPriceListReviewFilters,
} from "./supplier-price-lists-filters";
import {
  DISCARDED_LIST,
  EXTRACTED_ROWS,
  FAILED_LIST,
  READ_LIST,
  READING_LIST,
  REVIEWED_LIST,
  reviewOf,
} from "./test-support/supplier-price-lists";

const LIST_ID = READ_LIST.id;

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<SupplierPriceListReviewScreenServices> = {},
): SupplierPriceListReviewScreenServices {
  return {
    fetchSupplierPriceListReview: vi.fn(),
    setSupplierPriceListRowPrice: vi.fn(),
    removeSupplierPriceListRow: vi.fn(),
    confirmSupplierPriceList: vi.fn(),
    discardSupplierPriceList: vi.fn(),
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

function screenElement(
  services: SupplierPriceListReviewScreenServices,
  {
    filters = supplierPriceListReviewFilters.parse({}),
    onFiltersChange = () => {},
    onBack = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: SupplierPriceListReviewFilters;
    onFiltersChange?: (filters: SupplierPriceListReviewFilters) => void;
    onBack?: () => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SupplierPriceListReviewScreen
          listId={LIST_ID}
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onBack={onBack}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

async function loaded(
  services: SupplierPriceListReviewScreenServices,
  review: SupplierPriceListReview,
  options: Parameters<typeof screenElement>[1] = {},
) {
  vi.mocked(services.fetchSupplierPriceListReview).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", review },
  });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Ítems de la lista" })).toBeVisible();
  return screen;
}

function itemRows(screen: Screen) {
  return screen.getByRole("row").all().slice(1);
}

const extracted = reviewOf(READ_LIST, EXTRACTED_ROWS);

test("shows the supplier's name in the title, under Pedidos · Listas de proveedores", async () => {
  const screen = await loaded(createServices(), extracted);

  await expect.element(screen.getByText("Pedidos · Listas de proveedores")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Lista de Distribuidora Andina", level: 1 }))
    .toBeVisible();
});

test("shows each item with its code, presentation and source page, and its price as printed", async () => {
  const screen = await loaded(createServices(), extracted);

  const almond = screen.getByRole("row", { name: /Almendra pelada/ });
  await expect.element(almond.getByText("Cód. AL-25 · Bolsa 25 kg · página 2")).toBeVisible();
  await expect.element(almond.getByText("$ 254.500,00")).toBeVisible();
  const raisins = screen.getByRole("row", { name: /Pasas de uva/ });
  await expect.element(raisins.getByText("Sin precio")).toBeVisible();
  expect(raisins.element().textContent).not.toContain("Cód.");
  expect(raisins.element().textContent).not.toContain("página");
});

test("counts the items shown and the ones without a price", async () => {
  const screen = await loaded(createServices(), extracted);

  await expect.element(screen.getByText("1 a 3 de 3 ítems · 2 sin precio")).toBeVisible();
});

test("shows the items in pages of 25", async () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({
    id: `5b200000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    description: `Ítem ${index + 1}`,
    code: null,
    presentation: null,
    priceCents: 1_000,
    page: null,
  }));
  const screen = await loaded(
    createServices(),
    reviewOf({ ...READ_LIST, unpricedRowCount: 0 }, rows),
  );

  await expect.element(screen.getByText("1 a 25 de 120 ítems")).toBeVisible();
  expect(itemRows(screen)).toHaveLength(25);

  await userEvent.click(screen.getByRole("button", { name: /Siguiente/ }));

  await expect.element(screen.getByText("26 a 50 de 120 ítems")).toBeVisible();
});

test("the search field filters the items by description or code, and reports the filters", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), extracted, { onFiltersChange });

  await userEvent.fill(screen.getByPlaceholder("Buscar un ítem"), "nm-10");

  await expect.poll(() => itemRows(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Nuez mariposa extra light x 10 kg")).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "nm-10", show: "all" });
});

test("the filter can show only the items without a price", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), extracted, { onFiltersChange });

  await userEvent.click(screen.getByRole("button", { name: /Mostrar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Sin precio" }));

  await expect.poll(() => itemRows(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Pasas de uva sultanitas x 10 kg")).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", show: "unpriced" });
});

test("opens on the filters the URL carries", async () => {
  const screen = await loaded(createServices(), extracted, {
    filters: supplierPriceListReviewFilters.parse({ show: "unpriced", search: "pasas" }),
  });

  await expect.poll(() => itemRows(screen)).toHaveLength(1);
  await expect.element(screen.getByPlaceholder("Buscar un ítem")).toHaveValue("pasas");
});

test("offers to download the PDF, to discard the list and to confirm it", async () => {
  const screen = await loaded(createServices(), extracted);

  await expect
    .element(screen.getByRole("link", { name: "Descargar el PDF" }))
    .toHaveAttribute("href", `/api/supplier-price-lists/${LIST_ID}/file`);
  await expect.element(screen.getByRole("button", { name: "Descartar la lista" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Confirmar la lista" })).toBeVisible();
});

test("a reviewed list is read-only: no item action, no confirm, no discard", async () => {
  const screen = await loaded(createServices(), reviewOf(REVIEWED_LIST, EXTRACTED_ROWS));

  expect(screen.getByRole("button", { name: /^Editar el precio/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /^Quitar/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Descartar la lista" }).query()).toBeNull();
  await expect.element(screen.getByText("Revisada")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Descargar el PDF" })).toBeVisible();
});

test("a discarded list is read-only", async () => {
  const screen = await loaded(createServices(), reviewOf(DISCARDED_LIST, EXTRACTED_ROWS));

  expect(screen.getByRole("button", { name: /^Editar el precio/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
  await expect.element(screen.getByText("Descartada")).toBeVisible();
});

test("a list that could not be read says why and can only be discarded", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListReview).mockResolvedValue({
    kind: "ok",
    value: { kind: "found", review: reviewOf(FAILED_LIST, []) },
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No se pudo leer")).toBeVisible();
  await expect.element(screen.getByText("No se pudo leer el contenido del archivo.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Descartar la lista" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
});

test("a list still being read says so and reads again on its own until it is read", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListReview)
    .mockResolvedValueOnce({
      kind: "ok",
      value: { kind: "found", review: reviewOf(READING_LIST, []) },
    })
    .mockResolvedValue({ kind: "ok", value: { kind: "found", review: extracted } });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Leyendo la lista").first()).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();

    vi.advanceTimersByTime(5_000);

    await expect.element(screen.getByText("Almendra pelada Nonpareil x 25 kg")).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

test("says the list no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListReview).mockResolvedValue({
    kind: "ok",
    value: { kind: "not_found" },
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Esta lista ya no existe")).toBeVisible();
});

test("hides the list's actions while it loads and after loading fails", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<typeof services.fetchSupplierPriceListReview>>>();
  vi.mocked(services.fetchSupplierPriceListReview).mockReturnValueOnce(pending.promise);
  const screen = await renderScreen(services);

  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
  pending.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir la lista")).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Descartar la lista" }).query()).toBeNull();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchSupplierPriceListReview>>>();
  vi.mocked(services.fetchSupplierPriceListReview)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la lista")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Ítems de la lista" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: { kind: "found", review: extracted } });
  await expect.element(screen.getByText("Almendra pelada Nonpareil x 25 kg")).toBeVisible();
});

test("ends the session when the list comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceListReview).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("editing a price saves it, reads the list again and says so", async () => {
  const services = createServices();
  vi.mocked(services.setSupplierPriceListRowPrice).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar el precio de Pasas de uva sultanitas x 10 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Precio/ }), "58.990,00");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el precio" }));

  expect(services.setSupplierPriceListRowPrice).toHaveBeenCalledWith(
    LIST_ID,
    EXTRACTED_ROWS[1]?.id,
    { priceCents: 5_899_000, version: 3 },
  );
  await expect.element(screen.getByText("Precio guardado")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchSupplierPriceListReview).mock.calls.length)
    .toBeGreaterThan(1);
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("removing an item removes it, reads the list again and says so", async () => {
  const services = createServices();
  vi.mocked(services.removeSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Quitar Pasas de uva sultanitas x 10 kg de la lista" }),
  );
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Quitar el ítem" }));

  expect(services.removeSupplierPriceListRow).toHaveBeenCalledWith(LIST_ID, EXTRACTED_ROWS[1]?.id, {
    version: 3,
  });
  await expect.element(screen.getByText("Ítem quitado")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchSupplierPriceListReview).mock.calls.length)
    .toBeGreaterThan(1);
});

test("confirming the list goes back to the lists", async () => {
  const services = createServices();
  vi.mocked(services.confirmSupplierPriceList).mockResolvedValue({ kind: "ok" });
  const onBack = vi.fn();
  const screen = await loaded(services, extracted, { onBack });

  await userEvent.click(screen.getByRole("button", { name: "Confirmar la lista" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Confirmar la lista" }),
  );

  expect(services.confirmSupplierPriceList).toHaveBeenCalledWith(LIST_ID, {
    listDate: "2026-09-25",
    version: 3,
  });
  await expect.poll(() => onBack.mock.calls.length).toBe(1);
});

test("discarding the list goes back to the lists", async () => {
  const services = createServices();
  vi.mocked(services.discardSupplierPriceList).mockResolvedValue({ kind: "ok" });
  const onBack = vi.fn();
  const screen = await loaded(services, extracted, { onBack });

  await userEvent.click(screen.getByRole("button", { name: "Descartar la lista" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Descartar la lista" }),
  );

  expect(services.discardSupplierPriceList).toHaveBeenCalledWith(LIST_ID, { version: 3 });
  await expect.poll(() => onBack.mock.calls.length).toBe(1);
});

test("a change refused because the list changed reads it again and closes the modal", async () => {
  const services = createServices();
  vi.mocked(services.removeSupplierPriceListRow).mockResolvedValue({ kind: "stale_version" });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Quitar Pasas de uva sultanitas x 10 kg de la lista" }),
  );
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Quitar el ítem" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Actualizar la lista" }),
  );

  await expect
    .poll(() => vi.mocked(services.fetchSupplierPriceListReview).mock.calls.length)
    .toBeGreaterThan(1);
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("has no accessibility violations once loaded, and with the confirm modal open", async () => {
  const screen = await loaded(createServices(), extracted);

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Confirmar la lista" }));
  await expectNoAccessibilityViolations(document.body);
});
