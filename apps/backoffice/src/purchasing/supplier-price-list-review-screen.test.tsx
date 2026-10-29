import type { SupplierPriceListReview } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  StubCategoryCreationModal,
  StubProductCreationModal,
} from "../platform/test-support/creation-parts";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { SupplierPriceListReviewScreen } from "./supplier-price-list-review-screen";
import type { SupplierPriceListReviewScreenServices } from "./supplier-price-list-review-services";
import {
  type SupplierPriceListReviewFilters,
  supplierPriceListReviewFilters,
} from "./supplier-price-lists-filters";
import { LINK_CHOICES, NO_PROPOSAL, PROPOSED_BY_BARCODE } from "./test-support/supplier-item-links";
import {
  CREATION_BRANDS,
  CREATION_CATEGORIES,
  CREATION_TAG_LIST,
  PRODUCT_CREATED,
} from "./test-support/supplier-item-products";
import {
  DISCARDED_LIST,
  EVERY_REVIEW_ACTION,
  EXTRACTED_ROWS,
  FAILED_LIST,
  itemRow,
  LINKED_ROW,
  ONLY_DISCARD,
  READ_LIST,
  READING_LIST,
  REVIEWED_LIST,
  REVIEWED_ROW,
  reviewOf,
  WEB_LIST,
  WEB_PAGE_URL,
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
    markSupplierPriceListRowReviewed: vi.fn(),
    linkSupplierPriceListRow: vi.fn(),
    fetchSupplierItemLinkProposal: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchSupplierItemLinkChoices: vi.fn().mockReturnValue(new Promise(() => {})),
    createPackaging: vi.fn(),
    createProductFromSupplierItem: vi.fn(),
    fetchProductCreationCategories: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchProductCreationBrands: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchProductCreationTags: vi.fn().mockReturnValue(new Promise(() => {})),
    createBrand: vi.fn(),
    createTag: vi.fn(),
    generateInternalBarcode: vi.fn(),
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
    access = ADMINISTRATOR_ACCESS,
  }: {
    access?: BackofficeAccess;
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
          access={access}
          categoryCreationModal={StubCategoryCreationModal}
          productCreationModal={StubProductCreationModal}
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

const extracted = reviewOf(READ_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION, true, {
  needingReview: 3,
  linkedAutomatically: 12,
});

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

test("counts the items shown, the ones to review, the ones linked from earlier lists and the ones without a price", async () => {
  const screen = await loaded(createServices(), extracted);

  await expect
    .element(
      screen.getByText(
        "1 a 3 de 3 ítems · 3 para revisar · 12 vinculados de listas anteriores · 2 sin precio",
      ),
    )
    .toBeVisible();
});

test("leaves out of the count what there is none of", async () => {
  const screen = await loaded(createServices(), reviewOf(READ_LIST, EXTRACTED_ROWS));

  await expect.element(screen.getByText("1 a 3 de 3 ítems · 2 sin precio")).toBeVisible();
});

test("speaks of a single item to review and a single item linked from an earlier list in the singular", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf({ ...READ_LIST, unpricedRowCount: 0 }, EXTRACTED_ROWS, EVERY_REVIEW_ACTION, true, {
      needingReview: 1,
      linkedAutomatically: 1,
    }),
  );

  await expect
    .element(
      screen.getByText("1 a 3 de 3 ítems · 1 para revisar · 1 vinculado de listas anteriores"),
    )
    .toBeVisible();
});

test("shows the items in pages of 25", async () => {
  const rows = Array.from({ length: 120 }, (_, index) => itemRow(index));
  const screen = await loaded(
    createServices(),
    reviewOf({ ...READ_LIST, unpricedRowCount: 0 }, rows, EVERY_REVIEW_ACTION),
  );

  await expect.element(screen.getByText("1 a 25 de 120 ítems")).toBeVisible();
  expect(itemRows(screen)).toHaveLength(25);

  await userEvent.click(screen.getByRole("button", { name: /Siguiente/ }));

  await expect.element(screen.getByText("26 a 50 de 120 ítems")).toBeVisible();
});

test("shows a very long list in pages of 25, and confirming sends none of its items", async () => {
  const rows = Array.from({ length: 3_000 }, (_, index) => itemRow(index));
  const services = createServices();
  vi.mocked(services.confirmSupplierPriceList).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(
    services,
    reviewOf({ ...READ_LIST, unpricedRowCount: 0 }, rows, EVERY_REVIEW_ACTION),
  );

  await expect.element(screen.getByText("1 a 25 de 3.000 ítems")).toBeVisible();
  expect(itemRows(screen)).toHaveLength(25);

  await userEvent.click(screen.getByRole("button", { name: "Confirmar la lista" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Confirmar la lista" }),
  );

  expect(services.confirmSupplierPriceList).toHaveBeenCalledWith(LIST_ID, {
    listDate: "2026-09-25",
    pricesIncludeVat: true,
    version: 3,
  });
});

test.each([
  [true, "Precios con IVA incluido"],
  [false, "Precios sin IVA"],
] as const)("says whether the prices include VAT: %s", async (pricesIncludeVat, text) => {
  const screen = await loaded(
    createServices(),
    reviewOf(READ_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION, pricesIncludeVat),
  );

  await expect.element(screen.getByText(text)).toBeVisible();
});

test("says nothing about VAT while the list is not known to say", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf(READ_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION, null),
  );

  expect(screen.getByText(/Precios (con|sin) IVA/).elements()).toEqual([]);
});

test("the search field filters the items by description or code, and reports the filters", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), extracted, { onFiltersChange });

  await userEvent.fill(screen.getByPlaceholder("Buscar un ítem"), "nm-10");

  await expect.poll(() => itemRows(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Nuez mariposa extra light x 10 kg")).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "nm-10", show: "review" });
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

test("offers to open the page a list was read from instead of downloading a PDF", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf(WEB_LIST, EXTRACTED_ROWS, EVERY_REVIEW_ACTION),
  );

  const link = screen.getByRole("link", { name: "Abrir la página" });
  await expect.element(link).toHaveAttribute("href", WEB_PAGE_URL);
  await expect.element(link).toHaveAttribute("target", "_blank");
  await expect.element(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByRole("link", { name: "Descargar el PDF" }).query()).toBeNull();
});

test("offers only the actions the cloud allows, even on a list waiting for review", async () => {
  const screen = await loaded(createServices(), reviewOf(READ_LIST, EXTRACTED_ROWS, ONLY_DISCARD));

  await expect.element(screen.getByRole("button", { name: "Descartar la lista" })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Editar el precio/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: /^Quitar/ }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
});

test("offers the item actions the cloud allows, even on a reviewed list", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf(REVIEWED_LIST, EXTRACTED_ROWS, {
      changeRows: true,
      confirm: false,
      discard: false,
      linkRows: false,
      markRowsReviewed: false,
    }),
  );

  await expect
    .element(
      screen.getByRole("button", { name: "Editar el precio de Almendra pelada Nonpareil x 25 kg" }),
    )
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Descartar la lista" }).query()).toBeNull();
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
    value: { kind: "found", review: reviewOf(FAILED_LIST, [], ONLY_DISCARD) },
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No se pudo leer")).toBeVisible();
  await expect.element(screen.getByText("No se pudo leer el contenido del archivo.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Descartar la lista" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirmar la lista" }).query()).toBeNull();
  expect(screen.getByRole("table").query()).toBeNull();
  expect(screen.getByText("La lista no tiene ítems").query()).toBeNull();
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
    expect(screen.getByRole("table").query()).toBeNull();
    expect(screen.getByText("La lista no tiene ítems").query()).toBeNull();

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
    pricesIncludeVat: true,
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

const withEveryKindOfRow = reviewOf(
  READ_LIST,
  [...EXTRACTED_ROWS, LINKED_ROW, REVIEWED_ROW],
  EVERY_REVIEW_ACTION,
);

test("shows the items to review by default and every item on asking for them", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), withEveryKindOfRow, { onFiltersChange });

  await expect.poll(() => itemRows(screen)).toHaveLength(3);
  expect(screen.getByText(LINKED_ROW.description).query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: /Mostrar:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));

  await expect.poll(() => itemRows(screen)).toHaveLength(5);
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toEqual({ search: "", show: "all" });
});

test("offers the filters to review, every item and the items without a price", async () => {
  const screen = await loaded(createServices(), extracted);

  await userEvent.click(screen.getByRole("button", { name: /Mostrar:/ }));

  expect(
    screen
      .getByRole("option")
      .elements()
      .map((option) => option.textContent),
  ).toEqual(["Para revisar", "Todos", "Sin precio"]);
});

test("shows the product and presentation an item is linked to, or that it is not linked", async () => {
  const screen = await loaded(createServices(), withEveryKindOfRow, {
    filters: supplierPriceListReviewFilters.parse({ show: "all" }),
  });

  const almond = screen.getByRole("row", { name: /Almendra pelada/ });
  await expect.element(almond.getByText("Almendras peladas")).toBeVisible();
  await expect.element(almond.getByText("Bolsa de 25 kg")).toBeVisible();
  await expect
    .element(
      screen
        .getByRole("row", { name: /Pasas de uva/ })
        .getByText("Sin vincular")
        .first(),
    )
    .toBeVisible();
});

test("says only once that an item seen in another list is not linked", async () => {
  const unlinked = {
    ...itemRow(7),
    description: "Maní tostado x 5 kg",
    status: "unlinked" as const,
  };
  const screen = await loaded(
    createServices(),
    reviewOf(READ_LIST, [unlinked], EVERY_REVIEW_ACTION),
  );

  const row = screen.getByRole("row", { name: /Maní tostado/ });
  await expect.element(row.getByText("Visto en otra lista")).toBeVisible();
  expect(row.getByText("Sin vincular").elements()).toHaveLength(1);
});

test("shows each item's status, and the earlier price of one whose price changed", async () => {
  const screen = await loaded(createServices(), withEveryKindOfRow, {
    filters: supplierPriceListReviewFilters.parse({ show: "all" }),
  });

  const almond = screen.getByRole("row", { name: /Almendra pelada/ });
  await expect.element(almond.getByText("Cambió el precio")).toBeVisible();
  await expect.element(almond.getByText("Antes $ 248.000,00")).toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /Nuez mariposa/ }).getByText("Nuevo"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /Castañas de cajú/ }).getByText("Vinculado"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /Mix tropical/ }).getByText("Revisado"))
    .toBeVisible();
});

test("shows the price per sale unit under the price of a linked item, and none under another", async () => {
  const screen = await loaded(createServices(), withEveryKindOfRow);

  const almond = screen.getByRole("row", { name: /Almendra pelada/ });
  await expect.element(almond.getByText("$ 254.500,00")).toBeVisible();
  await expect.element(almond.getByText("$ 10.180,00 / kg")).toBeVisible();
  expect(screen.getByRole("row", { name: /Nuez mariposa/ }).element().textContent).not.toContain(
    "/ kg",
  );
});

test("rounds a price per sale unit only for the screen", async () => {
  const rows = [
    {
      ...LINKED_ROW,
      needsReview: true,
      pricePerSaleUnit: { numerator: "25000", denominator: "3" },
    },
  ];
  const screen = await loaded(createServices(), reviewOf(READ_LIST, rows, EVERY_REVIEW_ACTION));

  await expect.element(screen.getByText("$ 83,33 / kg")).toBeVisible();
});

test("offers to link each item, and to change the link of one already linked", async () => {
  const screen = await loaded(createServices(), withEveryKindOfRow, {
    filters: supplierPriceListReviewFilters.parse({ show: "all" }),
  });

  await expect
    .element(screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }))
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("button", {
        name: "Cambiar el vínculo de Castañas de cajú W320 x 11,34 kg",
      }),
    )
    .toBeVisible();
});

test("opens the link modal for the item, with the proposal and the choices read for it", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierItemLinkChoices).mockResolvedValue({
    kind: "ok",
    value: LINK_CHOICES,
  });
  vi.mocked(services.fetchSupplierItemLinkProposal).mockResolvedValue({
    kind: "ok",
    value: PROPOSED_BY_BARCODE,
  });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
  );

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Pedidos · Vincular un ítem")).toBeVisible();
  await expect.element(dialog.getByText("Nuez mariposa extra light x 10 kg")).toBeVisible();
  expect(services.fetchSupplierItemLinkProposal).toHaveBeenCalledWith(
    LIST_ID,
    EXTRACTED_ROWS[2]?.id,
  );
});

async function linkPasasInTheOpenModal(screen: Screen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("combobox", { name: /Producto del catálogo/ }));
  await userEvent.click(screen.getByRole("option", { name: "Pasas de uva" }));
  const radio = dialog.getByRole("radio", { name: "Caja de 10 kg" });
  await expect.element(radio).toBeVisible();
  radio.element().closest("label")?.click();
  await userEvent.click(dialog.getByRole("button", { name: "Vincular" }));
}

test.each([
  [
    "a list waiting for confirmation",
    READ_LIST,
    EVERY_REVIEW_ACTION,
    "Se recuerda para las próximas listas al confirmar esta.",
    "Al confirmar la lista, el vínculo se recuerda y las próximas listas de este proveedor reconocen el ítem solas.",
  ],
  [
    "a confirmed list",
    REVIEWED_LIST,
    { changeRows: false, confirm: false, discard: false, linkRows: true, markRowsReviewed: false },
    "Las próximas listas del proveedor lo reconocen solas.",
    "El vínculo se recuerda: en las próximas listas de este proveedor el ítem se reconoce solo.",
  ],
] as const)(
  "says when the link of an item of %s is remembered",
  async (_name, list, actions, notice, modalText) => {
    const services = createServices();
    vi.mocked(services.fetchSupplierItemLinkChoices).mockResolvedValue({
      kind: "ok",
      value: LINK_CHOICES,
    });
    vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
    const screen = await loaded(services, reviewOf(list, EXTRACTED_ROWS, actions));

    await userEvent.click(
      screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
    );
    await expect.element(screen.getByRole("dialog").getByText(modalText)).toBeVisible();
    await linkPasasInTheOpenModal(screen);

    await expect.element(screen.getByText("Ítem vinculado")).toBeVisible();
    await expect.element(screen.getByText(notice)).toBeVisible();
  },
);

test("does not read the proposal or the choices until a link modal opens", async () => {
  const services = createServices();
  await loaded(services, extracted);

  expect(services.fetchSupplierItemLinkProposal).not.toHaveBeenCalled();
  expect(services.fetchSupplierItemLinkChoices).not.toHaveBeenCalled();
});

test("offers no link action when the cloud does not allow linking", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf(READ_LIST, EXTRACTED_ROWS, { ...EVERY_REVIEW_ACTION, linkRows: false }),
  );

  expect(screen.getByRole("button", { name: /^Vincular / }).query()).toBeNull();
});

test("offers to mark an item as reviewed only when the cloud allows it, even where linking is allowed", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf(REVIEWED_LIST, EXTRACTED_ROWS, {
      changeRows: false,
      confirm: false,
      discard: false,
      linkRows: true,
      markRowsReviewed: false,
    }),
  );

  await expect
    .element(screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: /^Marcar como revisado/ }).query()).toBeNull();
});

test("offers to mark as reviewed only an item that needs review", async () => {
  const screen = await loaded(createServices(), withEveryKindOfRow, {
    filters: supplierPriceListReviewFilters.parse({ show: "all" }),
  });

  await expect
    .element(
      screen.getByRole("button", {
        name: "Marcar como revisado Almendra pelada Nonpareil x 25 kg",
      }),
    )
    .toBeVisible();
  expect(
    screen
      .getByRole("button", { name: "Marcar como revisado Castañas de cajú W320 x 11,34 kg" })
      .query(),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Marcar como revisado Mix tropical x 5 kg" }).query(),
  ).toBeNull();
});

test("marking an item as reviewed sends the list's version, reads the list again and says so", async () => {
  const services = createServices();
  vi.mocked(services.markSupplierPriceListRowReviewed).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como revisado Almendra pelada Nonpareil x 25 kg" }),
  );

  expect(services.markSupplierPriceListRowReviewed).toHaveBeenCalledWith(
    LIST_ID,
    EXTRACTED_ROWS[0]?.id,
    { version: 3 },
  );
  await expect.element(screen.getByText("Ítem revisado")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchSupplierPriceListReview).mock.calls.length)
    .toBeGreaterThan(1);
});

test("an item marked as reviewed on a list that changed reads the list again and says so", async () => {
  const services = createServices();
  vi.mocked(services.markSupplierPriceListRowReviewed).mockResolvedValue({
    kind: "stale_version",
  });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como revisado Almendra pelada Nonpareil x 25 kg" }),
  );

  await expect.element(screen.getByText("La lista cambió")).toBeVisible();
  await expect
    .poll(() => vi.mocked(services.fetchSupplierPriceListReview).mock.calls.length)
    .toBeGreaterThan(1);
});

test("an item that could not be marked as reviewed says so", async () => {
  const services = createServices();
  vi.mocked(services.markSupplierPriceListRowReviewed).mockResolvedValue({ kind: "failed" });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como revisado Almendra pelada Nonpareil x 25 kg" }),
  );

  await expect.element(screen.getByText("No se marcó el ítem")).toBeVisible();
});

test("ends the session when marking an item as reviewed comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.markSupplierPriceListRowReviewed).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await loaded(services, extracted, { onSessionEnded });

  await userEvent.click(
    screen.getByRole("button", { name: "Marcar como revisado Almendra pelada Nonpareil x 25 kg" }),
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test.each([
  ["a session that may create packagings", ADMINISTRATOR_ACCESS, true],
  ["a session that may only link", accessWith("supplier_price_lists"), false],
])("hands the link modal whether %s may create one", async (_name, access, offered) => {
  const services = createServices();
  vi.mocked(services.fetchSupplierItemLinkChoices).mockResolvedValue({
    kind: "ok",
    value: LINK_CHOICES,
  });
  const screen = await loaded(services, extracted, { access });

  await userEvent.click(
    screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("combobox", { name: /Producto del catálogo/ }));
  await userEvent.click(screen.getByRole("option", { name: "Pasas de uva" }));

  await expect.element(dialog.getByRole("radio", { name: "Caja de 10 kg" })).toBeVisible();
  expect(dialog.getByRole("button", { name: "Nueva presentación" }).query() !== null).toBe(offered);
});

test.each([
  ["a session that manages products and categories", ADMINISTRATOR_ACCESS, true],
  ["a session that may only link", accessWith("supplier_price_lists"), false],
])(
  "offers creating a product from the link modal's product selector to %s only if allowed",
  async (_name, access, offered) => {
    const services = createServices();
    vi.mocked(services.fetchSupplierItemLinkChoices).mockResolvedValue({
      kind: "ok",
      value: LINK_CHOICES,
    });
    const screen = await loaded(services, extracted, { access });
    await userEvent.click(
      screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
    );
    const dialog = screen.getByRole("dialog");

    await userEvent.fill(
      dialog.getByRole("combobox", { name: /Producto del catálogo/ }),
      "Yerba mate",
    );

    await expect
      .element(screen.getByText("Sin resultados").or(screen.getByRole("option")))
      .toBeVisible();
    expect(
      screen.getByRole("option", { name: "Crear producto «Yerba mate»" }).query() !== null,
    ).toBe(offered);
  },
);

test("offers to create a product for each item the cloud says can have one", async () => {
  const screen = await loaded(createServices(), withEveryKindOfRow, {
    filters: supplierPriceListReviewFilters.parse({ show: "all" }),
  });

  await expect
    .element(
      screen.getByRole("button", { name: "Crear producto Nuez mariposa extra light x 10 kg" }),
    )
    .toBeVisible();
  expect(
    screen
      .getByRole("button", { name: "Crear producto Almendra pelada Nonpareil x 25 kg" })
      .query(),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Crear producto Castañas de cajú W320 x 11,34 kg" }).query(),
  ).toBeNull();
});

test("offers no action to create a product when the cloud does not allow linking", async () => {
  const screen = await loaded(
    createServices(),
    reviewOf(READ_LIST, EXTRACTED_ROWS, { ...EVERY_REVIEW_ACTION, linkRows: false }),
  );

  expect(screen.getByRole("button", { name: /^Crear producto / }).query()).toBeNull();
});

test("offers the action to create a product to a session that may only review supplier price lists", async () => {
  const screen = await loaded(createServices(), extracted, {
    access: accessWith("supplier_price_lists"),
  });

  await expect
    .element(
      screen.getByRole("button", { name: "Crear producto Nuez mariposa extra light x 10 kg" }),
    )
    .toBeVisible();
});

test("opens the create product modal for the item, with the categories read for it", async () => {
  const services = createServices();
  vi.mocked(services.fetchProductCreationCategories).mockResolvedValue({
    kind: "ok",
    value: CREATION_CATEGORIES,
  });
  const screen = await loaded(services, extracted);
  expect(services.fetchProductCreationCategories).not.toHaveBeenCalled();

  await userEvent.click(
    screen.getByRole("button", { name: "Crear producto Nuez mariposa extra light x 10 kg" }),
  );

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Crear producto desde la lista")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Nuez mariposa extra light x 10 kg");
  expect(services.fetchProductCreationCategories).toHaveBeenCalledTimes(1);
});

test("says the product was created, and reads the list again", async () => {
  const services = createServices();
  vi.mocked(services.fetchProductCreationCategories).mockResolvedValue({
    kind: "ok",
    value: CREATION_CATEGORIES,
  });
  vi.mocked(services.fetchProductCreationBrands).mockResolvedValue({
    kind: "ok",
    value: CREATION_BRANDS,
  });
  vi.mocked(services.fetchProductCreationTags).mockResolvedValue({
    kind: "ok",
    value: CREATION_TAG_LIST,
  });
  vi.mocked(services.createProductFromSupplierItem).mockResolvedValue({
    kind: "ok",
    created: PRODUCT_CREATED,
  });
  const screen = await loaded(services, extracted);
  const readsBefore = vi.mocked(services.fetchSupplierPriceListReview).mock.calls.length;

  await userEvent.click(
    screen.getByRole("button", { name: "Crear producto Nuez mariposa extra light x 10 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Contiene/ }), "10");
  await userEvent.click(dialog.getByRole("combobox", { name: /^Categoría/ }));
  await userEvent.click(page.getByRole("option", { name: "Almacén › Frutos secos" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear el producto" }));

  await expect.element(screen.getByText("Producto creado")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect
    .poll(() => vi.mocked(services.fetchSupplierPriceListReview).mock.calls.length)
    .toBeGreaterThan(readsBefore);
});

async function openCreateProductModal(access: Parameters<typeof screenElement>[1]) {
  const services = createServices();
  vi.mocked(services.fetchProductCreationBrands).mockResolvedValue({
    kind: "ok",
    value: CREATION_BRANDS,
  });
  vi.mocked(services.fetchProductCreationTags).mockResolvedValue({
    kind: "ok",
    value: CREATION_TAG_LIST,
  });
  const screen = await loaded(services, extracted, access);
  await userEvent.click(
    screen.getByRole("button", { name: "Crear producto Nuez mariposa extra light x 10 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("combobox", { name: /^Marca/ })).toBeVisible();
  return dialog;
}

test("offers to create a brand to a session that may manage products and categories", async () => {
  const dialog = await openCreateProductModal({ access: ADMINISTRATOR_ACCESS });

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Marca/ }), "Cabriola");
  await expect.element(page.getByRole("option", { name: "Crear marca «Cabriola»" })).toBeVisible();
});

test("offers no way to create a brand to a session that may only review supplier price lists", async () => {
  const dialog = await openCreateProductModal({ access: accessWith("supplier_price_lists") });

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Marca/ }), "Cabriola");
  expect(page.getByRole("option", { name: /^Crear marca/ }).query()).toBeNull();
});

test("moves from the link modal to the create product modal for the same item", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierItemLinkChoices).mockResolvedValue({
    kind: "ok",
    value: LINK_CHOICES,
  });
  vi.mocked(services.fetchSupplierItemLinkProposal).mockResolvedValue({
    kind: "ok",
    value: NO_PROPOSAL,
  });
  vi.mocked(services.fetchProductCreationCategories).mockResolvedValue({
    kind: "ok",
    value: CREATION_CATEGORIES,
  });
  const screen = await loaded(services, extracted);

  await userEvent.click(
    screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
  );
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Crear producto" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Crear producto desde la lista")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Nuez mariposa extra light x 10 kg");
  expect(screen.getByText("Pedidos · Vincular un ítem").query()).toBeNull();
});

test("offers the way to create a product from the link modal to a session that may only review supplier price lists", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierItemLinkChoices).mockResolvedValue({
    kind: "ok",
    value: LINK_CHOICES,
  });
  vi.mocked(services.fetchSupplierItemLinkProposal).mockResolvedValue({
    kind: "ok",
    value: NO_PROPOSAL,
  });
  const screen = await loaded(services, extracted, { access: accessWith("supplier_price_lists") });

  await userEvent.click(
    screen.getByRole("button", { name: "Vincular Nuez mariposa extra light x 10 kg" }),
  );

  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: "Crear producto" }))
    .toBeVisible();
});
