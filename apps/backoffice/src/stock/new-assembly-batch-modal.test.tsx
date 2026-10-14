import type { AssemblyBatchPreview, AssemblyBatchResult, RecipeSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { AssemblyBatchPreviewRequest, fetchAssemblyBatches } from "./assembly-batches-api";
import {
  NewAssemblyBatchModal,
  type NewAssemblyBatchModalServices,
} from "./new-assembly-batch-modal";
import { assemblyBatchList, mixPreview } from "./test-support/assembly-batches";
import { AssemblyBatchesReader } from "./test-support/assembly-batches-reader";
import {
  almendras,
  cajaDeInfusiones,
  mixDeFrutosSecos,
  nueces,
  teVerde,
} from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const registered: AssemblyBatchResult["batch"] = {
  id: "b0000000-0000-4000-8000-000000000009",
  productId: mixDeFrutosSecos.productId,
  assembledAt: "2026-09-15T13:30:00.000Z",
  output: 4_950,
  unitCostCents: 991_200,
  costIncomplete: false,
  expiresOn: "2026-11-02",
};

function previewFor({ size, used }: AssemblyBatchPreviewRequest): AssemblyBatchPreview {
  const scale = (quantity: number) => Math.round((quantity * size) / 5_000);
  const proposal = {
    used: mixPreview.proposal.used.map((use) => ({ ...use, quantity: scale(use.quantity) })),
    output: scale(4_950),
  };
  return used === undefined ? { ...mixPreview, proposal, used: proposal.used } : mixPreview;
}

function createServices(
  overrides: Partial<NewAssemblyBatchModalServices> = {},
): NewAssemblyBatchModalServices {
  return {
    fetchAssemblyBatchPreview: vi
      .fn<NewAssemblyBatchModalServices["fetchAssemblyBatchPreview"]>()
      .mockImplementation(async (request) => ({ kind: "ok", value: previewFor(request) })),
    registerAssemblyBatch: vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>(),
    ...overrides,
  };
}

function renderModal({
  services = createServices(),
  recipes = [mixDeFrutosSecos, cajaDeInfusiones],
  onRegistered = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
  readBatches = vi.fn<typeof fetchAssemblyBatches>().mockResolvedValue({
    kind: "ok",
    value: assemblyBatchList([]),
  }),
}: {
  services?: NewAssemblyBatchModalServices;
  recipes?: RecipeSummary[];
  onRegistered?: (batch: AssemblyBatchResult["batch"], recipe: RecipeSummary) => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
  readBatches?: typeof fetchAssemblyBatches;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <AssemblyBatchesReader read={readBatches} />
        <NewAssemblyBatchModal
          recipes={recipes}
          services={services}
          onRegistered={onRegistered}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type ModalScreen = Awaited<ReturnType<typeof renderModal>>;

// A locator click scrolls the option into view first, and the scroll event closes the list.
async function chooseProduct(screen: ModalScreen, name: string) {
  await userEvent.click(
    screen.getByRole("dialog").getByRole("combobox", { name: /^Producto armado/ }),
  );
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

async function typeSize(screen: ModalScreen, size: string) {
  await userEvent.fill(
    screen.getByRole("dialog").getByRole("textbox", { name: /^Tamaño de la tanda/ }),
    size,
  );
}

async function prepareMix(screen: ModalScreen, size = "5") {
  await chooseProduct(screen, "Mix de frutos secos");
  await typeSize(screen, size);
  await expect
    .element(screen.getByRole("textbox", { name: "Usado de Almendras" }))
    .toHaveValue(size === "5" ? "2,000" : "2,400");
}

async function submit(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la tanda" }));
  return dialog;
}

async function registerMixWith(
  registerAssemblyBatch: NewAssemblyBatchModalServices["registerAssemblyBatch"],
  options: Parameters<typeof renderModal>[0] = {},
) {
  const screen = await renderModal({
    ...options,
    services: createServices({ registerAssemblyBatch }),
  });
  await prepareMix(screen);
  return submit(screen);
}

test("shows the eyebrow, the title, the product and size fields and both actions", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Stock · Tandas")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nueva tanda" })).toBeVisible();
  await expect.element(dialog.getByRole("combobox", { name: /^Producto armado/ })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Tamaño de la tanda/ })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Registrar la tanda" })).toBeVisible();
});

test("offers the products that have a recipe, sorted by name", async () => {
  const screen = await renderModal();

  await userEvent.click(
    screen.getByRole("dialog").getByRole("combobox", { name: /^Producto armado/ }),
  );

  await expect
    .poll(() =>
      screen
        .getByRole("option")
        .all()
        .map((option) => option.element().textContent),
    )
    .toEqual(["Caja de infusiones", "Mix de frutos secos"]);
});

test("explains there is nothing to assemble when no product has a recipe", async () => {
  const screen = await renderModal({ recipes: [] });

  await expect.element(screen.getByText("No hay productos armados")).toBeVisible();
  await expect
    .element(screen.getByText("Creá una receta en Recetas para registrar una tanda."))
    .toBeVisible();
});

test("asks the cloud for the proposal of the typed size and fills the components and the output", async () => {
  const services = createServices();
  const screen = await renderModal({ services });

  await prepareMix(screen);

  expect(services.fetchAssemblyBatchPreview).toHaveBeenCalledWith({
    productId: mixDeFrutosSecos.productId,
    size: 5_000,
  });
  const dialog = screen.getByRole("dialog");
  await expect
    .poll(() =>
      dialog
        .getByRole("row")
        .all()
        .map((row) => row.element().textContent),
    )
    .toEqual([
      "ComponenteRecetaUsado",
      "Almendras2,000 kgUsado de Almendraskg",
      "Nueces1,500 kgUsado de Nueceskg",
      "Maní1,000 kgUsado de Maníkg",
      "Pasas0,500 kgUsado de Pasaskg",
    ]);
  await expect.element(dialog.getByRole("textbox", { name: /^Obtenido/ })).toHaveValue("4,950");
  await expect.element(dialog.getByText("Propuesto: 4,950 kg, la suma de lo usado.")).toBeVisible();
});

test("shows no unit suffix of kilos for a product sold by unit", async () => {
  const services = createServices({
    fetchAssemblyBatchPreview: vi.fn().mockResolvedValue({
      kind: "ok",
      value: {
        ...mixPreview,
        proposal: {
          used: [
            { componentProductId: teVerde.id, quantity: 24_000 },
            {
              componentProductId: cajaDeInfusiones.components[1]?.componentProductId,
              quantity: 12_000,
            },
          ],
          output: null,
        },
      },
    }),
  });
  const screen = await renderModal({ services });

  await chooseProduct(screen, "Caja de infusiones");
  await typeSize(screen, "12");

  await expect
    .element(screen.getByRole("textbox", { name: "Usado de Té verde" }))
    .toHaveValue("24");
  await expect.element(screen.getByRole("textbox", { name: /^Obtenido/ })).toHaveValue("");
  expect(screen.getByText(/Propuesto/).query()).toBeNull();
});

test("shows the cost and the expiry the cloud previews for what is used and obtained", async () => {
  const services = createServices();
  const screen = await renderModal({ services });

  await prepareMix(screen);

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("$ 9.912,00 / kg")).toBeVisible();
  await expect.element(dialog.getByText("02/11/2026")).toBeVisible();
  await expect
    .element(dialog.getByText("El vencimiento más próximo entre los lotes de los componentes."))
    .toBeVisible();
  expect(services.fetchAssemblyBatchPreview).toHaveBeenCalledWith({
    productId: mixDeFrutosSecos.productId,
    size: 5_000,
    used: [
      { componentProductId: almendras.id, quantity: 2_000 },
      { componentProductId: nueces.id, quantity: 1_500 },
      { componentProductId: mixDeFrutosSecos.components[2]?.componentProductId, quantity: 1_000 },
      { componentProductId: mixDeFrutosSecos.components[3]?.componentProductId, quantity: 500 },
    ],
    output: 4_950,
  });
});

test("reads the preview again with what the person typed as used and as obtained", async () => {
  const services = createServices();
  const screen = await renderModal({ services });
  await prepareMix(screen);

  await userEvent.fill(screen.getByRole("textbox", { name: "Usado de Nueces" }), "1,4");
  await userEvent.fill(screen.getByRole("textbox", { name: /^Obtenido/ }), "4,8");

  await expect
    .poll(() =>
      vi
        .mocked(services.fetchAssemblyBatchPreview)
        .mock.calls.some(
          ([request]) =>
            request.output === 4_800 &&
            request.used?.some(
              (use) => use.componentProductId === nueces.id && use.quantity === 1_400,
            ),
        ),
    )
    .toBe(true);
});

test("says the cost is incomplete and the batch does not expire when the cloud previews so", async () => {
  const services = createServices({
    fetchAssemblyBatchPreview: vi.fn().mockImplementation(async (request) => ({
      kind: "ok",
      value:
        request.used === undefined
          ? mixPreview
          : {
              ...mixPreview,
              lot: {
                ...mixPreview.lot,
                unitCostCents: null,
                costIncomplete: true,
                expiresOn: null,
              },
            },
    })),
  });
  const screen = await renderModal({ services });

  await prepareMix(screen);

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Costo incompleto")).toBeVisible();
  await expect.element(dialog.getByText("Sin vencimiento")).toBeVisible();
});

test("replaces the quantities the person did not edit when the size changes and keeps the edited ones", async () => {
  const screen = await renderModal();
  await prepareMix(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "Usado de Nueces" }), "1,4");

  await typeSize(screen, "6");

  await expect
    .element(screen.getByRole("textbox", { name: "Usado de Almendras" }))
    .toHaveValue("2,400");
  await expect.element(screen.getByRole("textbox", { name: "Usado de Nueces" })).toHaveValue("1,4");
  await expect.element(screen.getByRole("textbox", { name: /^Obtenido/ })).toHaveValue("5,940");
});

test("starts over when another product is chosen", async () => {
  const screen = await renderModal();
  await prepareMix(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "Usado de Nueces" }), "1,4");
  const product = screen.getByRole("dialog").getByRole("combobox", { name: /^Producto armado/ });

  await userEvent.fill(product, "");
  await chooseProduct(screen, "Caja de infusiones");
  await userEvent.fill(product, "");
  await chooseProduct(screen, "Mix de frutos secos");

  await expect
    .element(screen.getByRole("textbox", { name: "Usado de Nueces" }))
    .toHaveValue("1,500");
});

test("tells the proposal could not be calculated and reads it again on retry", async () => {
  const fetchAssemblyBatchPreview = vi
    .fn<NewAssemblyBatchModalServices["fetchAssemblyBatchPreview"]>()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockImplementation(async (request) => ({ kind: "ok", value: previewFor(request) }));
  const screen = await renderModal({ services: createServices({ fetchAssemblyBatchPreview }) });
  await chooseProduct(screen, "Mix de frutos secos");

  await typeSize(screen, "5");
  await expect
    .element(screen.getByText("No pudimos abrir las cantidades de la tanda"))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("textbox", { name: "Usado de Almendras" }))
    .toHaveValue("2,000");
});

test("registers the batch with the loaded recipe version, what is used and what is obtained", async () => {
  const registerAssemblyBatch = vi
    .fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>()
    .mockResolvedValue({ kind: "ok", batch: registered });
  const onRegistered = vi.fn();
  const screen = await renderModal({
    services: createServices({ registerAssemblyBatch }),
    onRegistered,
  });
  await prepareMix(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "Usado de Nueces" }), "1,4");
  await userEvent.fill(screen.getByRole("textbox", { name: /^Obtenido/ }), "4,8");

  await submit(screen);

  await expect.poll(() => onRegistered.mock.calls.length).toBe(1);
  expect(registerAssemblyBatch).toHaveBeenCalledWith({
    productId: mixDeFrutosSecos.productId,
    recipeVersion: mixDeFrutosSecos.version,
    used: [
      { componentProductId: almendras.id, quantity: 2_000 },
      { componentProductId: nueces.id, quantity: 1_400 },
      { componentProductId: mixDeFrutosSecos.components[2]?.componentProductId, quantity: 1_000 },
      { componentProductId: mixDeFrutosSecos.components[3]?.componentProductId, quantity: 500 },
    ],
    output: 4_800,
  });
  expect(onRegistered).toHaveBeenCalledWith(registered, mixDeFrutosSecos);
});

test("asks for the product without calling the cloud", async () => {
  const registerAssemblyBatch = vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>();
  const screen = await renderModal({ services: createServices({ registerAssemblyBatch }) });

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Elegí el producto armado.")).toBeVisible();
  expect(registerAssemblyBatch).not.toHaveBeenCalled();
});

test("asks for the size without calling the cloud", async () => {
  const registerAssemblyBatch = vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>();
  const screen = await renderModal({ services: createServices({ registerAssemblyBatch }) });
  await chooseProduct(screen, "Mix de frutos secos");

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Ingresá el tamaño de la tanda.")).toBeVisible();
  expect(registerAssemblyBatch).not.toHaveBeenCalled();
});

test("asks for the output when it was cleared, without calling the cloud", async () => {
  const registerAssemblyBatch = vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>();
  const screen = await renderModal({ services: createServices({ registerAssemblyBatch }) });
  await prepareMix(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: /^Obtenido/ }), "");

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Ingresá lo obtenido.")).toBeVisible();
  expect(registerAssemblyBatch).not.toHaveBeenCalled();
});

test("refuses a used quantity that cannot be read, saying how to type it", async () => {
  const registerAssemblyBatch = vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>();
  const screen = await renderModal({ services: createServices({ registerAssemblyBatch }) });
  await prepareMix(screen);
  await userEvent.fill(screen.getByRole("textbox", { name: "Usado de Nueces" }), "x");

  const dialog = await submit(screen);

  await expect
    .element(
      dialog.getByText(
        "Nueces: escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
      ),
    )
    .toBeVisible();
  expect(registerAssemblyBatch).not.toHaveBeenCalled();
});

test("shows a quantity the cloud refused next to its component", async () => {
  const dialog = await registerMixWith(
    vi
      .fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>()
      .mockResolvedValue({ kind: "invalid_quantity", componentProductId: almendras.id }),
  );

  await expect
    .element(
      dialog
        .getByText("Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.")
        .first(),
    )
    .toBeVisible();
});

test("tells that nothing was used", async () => {
  const dialog = await registerMixWith(
    vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>().mockResolvedValue({
      kind: "nothing_used",
    }),
  );

  await expect.element(dialog.getByText("Usá al menos un componente.")).toBeVisible();
});

test("tells that the output was refused next to the output", async () => {
  const dialog = await registerMixWith(
    vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>().mockResolvedValue({
      kind: "invalid_output",
    }),
  );

  await expect
    .element(dialog.getByText("La cantidad obtenida no es válida para este producto."))
    .toBeVisible();
});

test("tells that the recipe changed and reads the batches again", async () => {
  const readBatches = vi
    .fn<typeof fetchAssemblyBatches>()
    .mockResolvedValue({ kind: "ok", value: assemblyBatchList([]) });

  const dialog = await registerMixWith(
    vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>().mockResolvedValue({
      kind: "stale_recipe",
    }),
    { readBatches },
  );

  await expect.element(dialog.getByText("La receta cambió")).toBeVisible();
  await expect
    .element(dialog.getByText("Cerrá esta ventana y volvé a abrirla para usar la receta actual."))
    .toBeVisible();
  await expect.poll(() => readBatches.mock.calls.length).toBe(2);
});

test.each(["product_not_found", "no_recipe"] as const)(
  "tells that the product has no recipe anymore on %s and reads the batches again",
  async (kind) => {
    const readBatches = vi
      .fn<typeof fetchAssemblyBatches>()
      .mockResolvedValue({ kind: "ok", value: assemblyBatchList([]) });

    const dialog = await registerMixWith(
      vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>().mockResolvedValue({ kind }),
      { readBatches },
    );

    await expect
      .element(dialog.getByText("Este producto ya no tiene receta").first())
      .toBeVisible();
    await expect.poll(() => readBatches.mock.calls.length).toBe(2);
  },
);

test("shows a failed attempt", async () => {
  const dialog = await registerMixWith(
    vi.fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>().mockResolvedValue({
      kind: "failed",
    }),
  );

  await expect.element(dialog.getByText("No se registró la tanda")).toBeVisible();
});

test("shows the time to wait after too many requests", async () => {
  const dialog = await registerMixWith(
    vi
      .fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>()
      .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  );

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the cloud finds none open", async () => {
  const onSessionEnded = vi.fn();

  await registerMixWith(
    vi
      .fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>()
      .mockResolvedValue({ kind: "unauthenticated" }),
    { onSessionEnded },
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends a person the cloud forbids to Mi cuenta", async () => {
  window.history.pushState(null, "", "/assembly-batches");

  await registerMixWith(
    vi
      .fn<NewAssemblyBatchModalServices["registerAssemblyBatch"]>()
      .mockResolvedValue({ kind: "forbidden" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("cancel closes the modal", async () => {
  const onClose = vi.fn();
  const screen = await renderModal({ onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
