import type { SupplierPriceListSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  type SupplierPriceListsFilters,
  supplierPriceListsFilters,
} from "./supplier-price-lists-filters";
import { SupplierPriceListsScreen } from "./supplier-price-lists-screen";
import type { SupplierPriceListsScreenServices } from "./supplier-price-lists-services";
import {
  DISCARDED_LIST,
  FAILED_LIST,
  READ_LIST,
  READING_LIST,
  REPLACED_LIST,
  REVIEWED_LIST,
} from "./test-support/supplier-price-lists";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<SupplierPriceListsScreenServices> = {},
): SupplierPriceListsScreenServices {
  return {
    fetchSupplierPriceLists: vi.fn(),
    uploadSupplierPriceList: vi.fn(),
    fetchSuppliers: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
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
  services: SupplierPriceListsScreenServices,
  {
    filters = supplierPriceListsFilters.parse({}),
    onFiltersChange = () => {},
    onOpenReview = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: SupplierPriceListsFilters;
    onFiltersChange?: (filters: SupplierPriceListsFilters) => void;
    onOpenReview?: (listId: string) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SupplierPriceListsScreen
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onOpenReview={onOpenReview}
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

function rowOf(screen: Screen, supplier: string) {
  return screen.getByRole("row", { name: new RegExp(supplier) });
}

function supplierNames(screen: Screen): string[] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map(
      (row) => row.element().querySelector("td, [role=cell], [role=rowheader]")?.textContent ?? "",
    );
}

async function loaded(
  services: SupplierPriceListsScreenServices,
  lists: SupplierPriceListSummary[],
  options: Parameters<typeof screenElement>[1] = {},
) {
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "ok", value: lists });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Listas de proveedores" })).toBeVisible();
  return screen;
}

test("shows the heading under Pedidos and every list with its supplier, file, date, items and state", async () => {
  const services = createServices();
  const screen = await loaded(services, [READ_LIST, REVIEWED_LIST]);

  await expect.element(screen.getByText("Pedidos").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  const andina = rowOf(screen, "Distribuidora Andina");
  await expect.element(andina).toHaveTextContent("lista-septiembre-2026.pdf");
  await expect.element(andina).toHaveTextContent("PDF");
  await expect.element(andina).toHaveTextContent("25/09/2026");
  await expect.element(andina).toHaveTextContent("14 ítems para revisar");
  const granos = rowOf(screen, "Granos del Valle");
  await expect.element(granos).toHaveTextContent("212");
  await expect.element(granos).toHaveTextContent("Revisada");
});

test("shows a dash for a list without a date, and every other state with its own label", async () => {
  const services = createServices();
  const screen = await loaded(services, [READING_LIST, FAILED_LIST, DISCARDED_LIST, REPLACED_LIST]);

  await expect.element(rowOf(screen, "Cerealera del Norte")).toHaveTextContent("—");
  await expect.element(rowOf(screen, "Cerealera del Norte")).toHaveTextContent("Leyendo la lista");
  await expect.element(rowOf(screen, "Molinos San Javier")).toHaveTextContent("No se pudo leer");
  await expect
    .element(rowOf(screen, "Molinos San Javier"))
    .toHaveTextContent("No se pudo leer el contenido del archivo.");
  await expect.element(screen.getByText("Descartada")).toBeVisible();
  await expect.element(screen.getByText("Reemplazada")).toBeVisible();
});

test("counts the lists in the footer", async () => {
  const services = createServices();
  const screen = await loaded(services, [READ_LIST, REVIEWED_LIST, READING_LIST]);

  await expect.element(screen.getByText("3 listas")).toBeVisible();
});

test("explains that there are no lists yet", async () => {
  const services = createServices();
  const screen = await loaded(services, []);

  await expect.element(screen.getByText("Todavía no hay listas cargadas")).toBeVisible();
  await expect
    .element(
      screen.getByText("Con las listas se comparan precios y se arman las sugerencias de pedido."),
    )
    .toBeVisible();
});

test("the search field filters by supplier or file name, and reports the filters", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [READ_LIST, REVIEWED_LIST], { onFiltersChange });

  await userEvent.fill(screen.getByPlaceholder("Buscar un proveedor"), "granos");

  await expect.poll(() => supplierNames(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Granos del Valle")).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "granos", state: "ALL" });
});

test("the state filter shows only the lists in that state, and says when none is", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [READ_LIST, REVIEWED_LIST], { onFiltersChange });

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Revisadas" }));

  await expect.poll(() => supplierNames(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Granos del Valle")).toBeVisible();
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", state: "REVIEWED" });

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Descartadas" }));
  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("opens on the filters the URL carries", async () => {
  const services = createServices();
  const screen = await loaded(services, [READ_LIST, REVIEWED_LIST], {
    filters: supplierPriceListsFilters.parse({ state: "EXTRACTED", search: "andina" }),
  });

  await expect.poll(() => supplierNames(screen)).toHaveLength(1);
  await expect.element(screen.getByPlaceholder("Buscar un proveedor")).toHaveValue("andina");
});

test("opens the review of a list that has been read, reviewed, discarded or failed, and of no other", async () => {
  const services = createServices();
  const onOpenReview = vi.fn();
  const screen = await loaded(services, [READ_LIST, READING_LIST, FAILED_LIST], { onOpenReview });

  expect(
    rowOf(screen, "Cerealera del Norte")
      .getByRole("button", { name: /^Abrir la lista/ })
      .query(),
  ).toBeNull();
  await userEvent.click(
    rowOf(screen, "Distribuidora Andina").getByRole("button", {
      name: "Abrir la lista de Distribuidora Andina",
    }),
  );
  expect(onOpenReview).toHaveBeenCalledWith(READ_LIST.id);
});

test("loading a failed list again opens the upload with its supplier chosen", async () => {
  const services = createServices();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: FAILED_LIST.supplier.id,
        name: "Molinos San Javier",
        cuit: null,
        contact: null,
        note: null,
        active: true,
        version: 1,
      },
    ],
  });
  const screen = await loaded(services, [FAILED_LIST, READ_LIST]);

  expect(
    rowOf(screen, "Distribuidora Andina")
      .getByRole("button", { name: /^Cargar de nuevo/ })
      .query(),
  ).toBeNull();
  await userEvent.click(
    rowOf(screen, "Molinos San Javier").getByRole("button", {
      name: "Cargar de nuevo la lista de Molinos San Javier",
    }),
  );

  await expect.element(screen.getByRole("heading", { name: "Cargar una lista" })).toBeVisible();
  await expect
    .element(screen.getByRole("dialog").getByRole("button", { name: /Proveedor/ }))
    .toHaveTextContent("Molinos San Javier");
});

test("uploading a list closes the modal, reads the lists again and says it was loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: READ_LIST.supplier.id,
        name: "Distribuidora Andina",
        cuit: null,
        contact: null,
        note: null,
        active: true,
        version: 1,
      },
    ],
  });
  vi.mocked(services.uploadSupplierPriceList).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, []);
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({
    kind: "ok",
    value: [READING_LIST],
  });

  await userEvent.click(screen.getByRole("button", { name: "Cargar una lista" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: /Proveedor/ }));
  await userEvent.click(screen.getByRole("option", { name: "Distribuidora Andina" }));
  await userEvent.upload(
    dialog.getByLabelText("Archivo PDF"),
    new File(["%PDF-1.7"], "lista.pdf", { type: "application/pdf" }),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Leer la lista" }));

  await expect.element(screen.getByText("Lista cargada")).toBeVisible();
  await expect.element(screen.getByText("Cerealera del Norte")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("the upload action stays available while the lists load and after they fail", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir las listas de proveedores"))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cargar una lista" })).toBeEnabled();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchSupplierPriceLists>>>();
  vi.mocked(services.fetchSupplierPriceLists)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("No pudimos abrir las listas de proveedores"))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Listas de proveedores" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [READ_LIST] });
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when the lists come back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the lists come back forbidden", async () => {
  window.history.pushState(null, "", "/supplier-price-lists");
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "forbidden" });
  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("reads the lists again on its own while one is being read, until none is", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceLists)
    .mockResolvedValueOnce({ kind: "ok", value: [READING_LIST] })
    .mockResolvedValue({
      kind: "ok",
      value: [{ ...READING_LIST, state: "EXTRACTED", rowCount: 9 }],
    });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Leyendo la lista")).toBeVisible();

    vi.advanceTimersByTime(5_000);

    await expect.element(screen.getByText("9 ítems para revisar")).toBeVisible();
    const reads = vi.mocked(services.fetchSupplierPriceLists).mock.calls.length;
    vi.advanceTimersByTime(30_000);
    expect(vi.mocked(services.fetchSupplierPriceLists).mock.calls).toHaveLength(reads);
  } finally {
    vi.useRealTimers();
  }
});

test("does not read the lists again on its own when none is being read", async () => {
  const services = createServices();
  vi.mocked(services.fetchSupplierPriceLists).mockResolvedValue({ kind: "ok", value: [READ_LIST] });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    const screen = await renderScreen(services);
    await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();

    vi.advanceTimersByTime(60_000);

    expect(services.fetchSupplierPriceLists).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test("has no accessibility violations once loaded, and with the upload modal open", async () => {
  const services = createServices();
  const screen = await loaded(services, [READ_LIST, FAILED_LIST]);

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Cargar una lista" }));
  await expectNoAccessibilityViolations(document.body);
});
