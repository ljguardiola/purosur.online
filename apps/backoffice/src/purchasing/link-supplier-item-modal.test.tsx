import type { PackagingSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  LinkSupplierItemModal,
  type LinkSupplierItemModalServices,
} from "./link-supplier-item-modal";
import {
  BOLSA_DE_PASAS,
  CAJA_DE_PASAS,
  LINK_CHOICES,
  NO_PROPOSAL,
  PASAS_ID,
  PROPOSED_BY_AI,
  PROPOSED_BY_BARCODE,
  UNAVAILABLE_PROPOSAL,
} from "./test-support/supplier-item-links";
import { ALMOND_LINK, EXTRACTED_ROWS, READ_LIST } from "./test-support/supplier-price-lists";

const [, , nutRow] = EXTRACTED_ROWS as [
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
  (typeof EXTRACTED_ROWS)[number],
];
const [almondRow] = EXTRACTED_ROWS as [(typeof EXTRACTED_ROWS)[number]];
const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<LinkSupplierItemModalServices> = {},
): LinkSupplierItemModalServices {
  return {
    linkSupplierPriceListRow: vi.fn<LinkSupplierItemModalServices["linkSupplierPriceListRow"]>(),
    fetchSupplierItemLinkProposal: vi
      .fn<LinkSupplierItemModalServices["fetchSupplierItemLinkProposal"]>()
      .mockResolvedValue({ kind: "ok", value: NO_PROPOSAL }),
    fetchSupplierItemLinkChoices: vi
      .fn<LinkSupplierItemModalServices["fetchSupplierItemLinkChoices"]>()
      .mockResolvedValue({ kind: "ok", value: LINK_CHOICES }),
    createPackaging: vi.fn<LinkSupplierItemModalServices["createPackaging"]>(),
    ...overrides,
  };
}

function renderModal({
  services = createServices(),
  list = LIST,
  target = nutRow,
  mayCreatePackaging = true,
  remembersOnConfirm = true,
  onCreateProduct = null,
  onLinked = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  services?: LinkSupplierItemModalServices;
  list?: Parameters<typeof LinkSupplierItemModal>[0]["list"];
  target?: typeof nutRow | null;
  mayCreatePackaging?: boolean;
  remembersOnConfirm?: boolean;
  onCreateProduct?: ((row: typeof nutRow) => void) | null;
  onLinked?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <LinkSupplierItemModal
          list={list}
          target={target}
          mayCreatePackaging={mayCreatePackaging}
          remembersOnConfirm={remembersOnConfirm}
          onCreateProduct={onCreateProduct}
          services={services}
          onLinked={onLinked}
          onOutdated={onOutdated}
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
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }));
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

async function chooseRadio(screen: ModalScreen, name: string) {
  const radio = screen.getByRole("dialog").getByRole("radio", { name });
  await expect.element(radio).toBeVisible();
  const label = radio.element().closest("label");
  if (!label) {
    throw new Error(`no label for the radio ${name}`);
  }
  label.click();
}

async function choosePackaging(screen: ModalScreen, name: string) {
  await chooseRadio(screen, name);
}

async function link(screen: ModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Vincular" }));
  return dialog;
}

async function linkPasas(screen: ModalScreen) {
  await chooseProduct(screen, "Pasas de uva");
  await choosePackaging(screen, "Caja de 10 kg");
  return link(screen);
}

test("shows nothing and reads nothing while no item is chosen", async () => {
  const services = createServices();
  const screen = await renderModal({ services, target: null });

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchSupplierItemLinkProposal).not.toHaveBeenCalled();
  expect(services.fetchSupplierItemLinkChoices).not.toHaveBeenCalled();
});

test("names the item and what the list printed about it", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Pedidos · Vincular un ítem")).toBeVisible();
  await expect
    .element(dialog.getByRole("heading", { name: "Nuez mariposa extra light x 10 kg" }))
    .toBeVisible();
  await expect.element(dialog.getByText("NM-10")).toBeVisible();
  await expect.element(dialog.getByText("Caja 10 kg")).toBeVisible();
  await expect.element(dialog.getByText("$ 142.000,00")).toBeVisible();
});

test("leaves out what the list did not print about the item", async () => {
  const [, unpriced] = EXTRACTED_ROWS as [unknown, (typeof EXTRACTED_ROWS)[number]];
  const screen = await renderModal({ target: unpriced });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByRole("heading", { name: unpriced.description })).toBeVisible();
  expect(dialog.getByText("Código").query()).toBeNull();
  expect(dialog.getByText("Presentación", { exact: true }).query()).toBeNull();
  expect(dialog.getByText("Precio", { exact: true }).query()).toBeNull();
});

test("links to the page of the PDF the item was read from", async () => {
  const screen = await renderModal({ target: nutRow });

  await expect
    .element(screen.getByRole("dialog").getByRole("link", { name: "Ver la página 3" }))
    .toHaveAttribute("href", `/api/supplier-price-lists/${READ_LIST.id}/file#page=3`);
});

test("offers no link to a page for a list read from a web page", async () => {
  const screen = await renderModal({
    list: {
      ...LIST,
      source: { kind: "WEB_PAGE", url: "https://distribuidora-sur.example/precios" },
    },
  });

  await expect
    .element(screen.getByRole("dialog").getByRole("heading", { name: nutRow.description }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: /^Ver la página/ }).query()).toBeNull();
});

test("reads the proposal for the item of the list, and the choices", async () => {
  const services = createServices();
  await renderModal({ services });

  await expect
    .poll(() => services.fetchSupplierItemLinkProposal)
    .toHaveBeenCalledWith(LIST.id, nutRow.id);
  expect(services.fetchSupplierItemLinkChoices).toHaveBeenCalledTimes(1);
});

test("shows the proposal loading in the shape of its notice", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toBeVisible();
  await expect.element(dialog.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(dialog.getByText("Buscando una propuesta…").query()).toBeNull();
});

test("shows a load error for the proposal whose retry looks for it again from its loading placeholder", async () => {
  let resolveRetry: (outcome: { kind: "ok"; value: typeof NO_PROPOSAL }) => void = () => {};
  const retry = new Promise<{ kind: "ok"; value: typeof NO_PROPOSAL }>((settle) => {
    resolveRetry = settle;
  });
  const services = createServices({
    fetchSupplierItemLinkProposal: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockReturnValueOnce(retry),
  });
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("No pudimos abrir la propuesta de producto")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("status").first()).toHaveTextContent("Cargando…");
  resolveRetry({ kind: "ok", value: NO_PROPOSAL });
  await expect.element(dialog.getByText("Sin propuesta para este ítem.")).toBeVisible();
});

test("proposes the product of the barcode and chooses it without linking", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: PROPOSED_BY_BARCODE }),
  });
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByText("Propuesto por código de barras: Pasas de uva").first())
    .toBeVisible();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toHaveValue("Pasas de uva");
  await expect.element(dialog.getByRole("radio", { name: "Caja de 10 kg" })).toBeVisible();
  expect(services.linkSupplierPriceListRow).not.toHaveBeenCalled();
});

test("proposes the product the model chose", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi.fn().mockResolvedValue({ kind: "ok", value: PROPOSED_BY_AI }),
  });
  const screen = await renderModal({ services });

  await expect
    .element(screen.getByRole("dialog").getByText("Propuesto por IA: Pasas de uva").first())
    .toBeVisible();
});

test("does not choose a proposed product the person already chose another over", async () => {
  let resolveProposal: (outcome: { kind: "ok"; value: typeof PROPOSED_BY_AI }) => void = () => {};
  const proposal = {
    promise: new Promise<{ kind: "ok"; value: typeof PROPOSED_BY_AI }>((settle) => {
      resolveProposal = settle;
    }),
  };
  const services = createServices({
    fetchSupplierItemLinkProposal: vi.fn().mockReturnValue(proposal.promise),
  });
  const screen = await renderModal({ services });
  await chooseProduct(screen, "Almendras peladas");

  resolveProposal({ kind: "ok", value: PROPOSED_BY_AI });

  await expect
    .element(screen.getByRole("dialog").getByText("Propuesto por IA: Pasas de uva").first())
    .toBeVisible();
  await expect
    .element(screen.getByRole("dialog").getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toHaveValue("Almendras peladas");
});

test("does not choose a proposed product the catalog no longer offers", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { kind: "proposed", by: "ai", product: { id: "gone", name: "Descontinuado" } },
    }),
  });
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Propuesto por IA: Descontinuado").first()).toBeVisible();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toHaveValue("");
});

test("says quietly that there is no proposal", async () => {
  const screen = await renderModal();

  await expect
    .element(screen.getByRole("dialog").getByText("Sin propuesta para este ítem."))
    .toBeVisible();
});

test("offers to create the product when the item has no proposal and the screen allows it", async () => {
  const onCreateProduct = vi.fn();
  const screen = await renderModal({ onCreateProduct });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Crear producto" }));

  expect(onCreateProduct).toHaveBeenCalledWith(nutRow);
});

test("does not offer to create the product when the screen does not allow it", async () => {
  const screen = await renderModal();

  await expect
    .element(screen.getByRole("dialog").getByText("Sin propuesta para este ítem."))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Crear producto" }).query()).toBeNull();
});

test("does not offer to create the product for an item the cloud says cannot have one", async () => {
  const screen = await renderModal({
    onCreateProduct: () => {},
    target: { ...nutRow, mayCreateProduct: false },
  });

  await expect
    .element(screen.getByRole("dialog").getByText("Sin propuesta para este ítem."))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Crear producto" }).query()).toBeNull();
});

test("does not offer to create the product when a product is proposed", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: PROPOSED_BY_BARCODE }),
  });
  const screen = await renderModal({ services, onCreateProduct: () => {} });

  await expect
    .element(
      screen.getByRole("dialog").getByText("Propuesto por código de barras: Pasas de uva").first(),
    )
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Crear producto" }).query()).toBeNull();
});

test("says the proposal could not be made, and a product can still be searched", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: UNAVAILABLE_PROPOSAL }),
  });
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByText("No pudimos proponer un producto. Podés buscarlo vos."))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toBeEnabled();
});

test("a product can still be searched when reading the proposal failed", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi.fn().mockResolvedValue({ kind: "failed" }),
  });
  const screen = await renderModal({ services });

  await expect
    .element(screen.getByRole("dialog").getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toBeEnabled();
});

test("searches the products of the catalog by typing", async () => {
  const screen = await renderModal();

  await userEvent.fill(
    screen.getByRole("dialog").getByRole("combobox", { name: /^Producto del catálogo/ }),
    "miel",
  );

  await expect
    .element(screen.getByRole("option", { name: "Miel pura de abeja 1 kg" }))
    .toBeVisible();
  expect(screen.getByRole("option", { name: "Pasas de uva" }).query()).toBeNull();
});

test("shows the packagings of the chosen product with what each holds", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await chooseProduct(screen, "Pasas de uva");

  await expect.element(dialog.getByRole("radio", { name: "Caja de 10 kg" })).toBeVisible();
  await expect.element(dialog.getByText("Contiene 10,000 kg")).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "Bolsa de 5 kg" })).toBeVisible();
  await expect.element(dialog.getByText("Contiene 5,000 kg")).toBeVisible();
});

test("shows no packagings until a product is chosen", async () => {
  const screen = await renderModal();

  await expect
    .element(screen.getByRole("dialog").getByRole("heading", { name: nutRow.description }))
    .toBeVisible();
  expect(screen.getByRole("radio").query()).toBeNull();
});

test("clears the packaging chosen when another product is chosen", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, "Pasas de uva");
  await choosePackaging(screen, "Caja de 10 kg");

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }), "");
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await expect.element(dialog.getByRole("radio", { name: "Caja x 12" })).toBeVisible();
  await link(screen);

  await expect.element(dialog.getByText("Elegí la presentación de compra.")).toBeVisible();
});

test("says a product has no packagings to buy it by", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await chooseProduct(screen, "Almendras peladas");

  await expect
    .element(dialog.getByText("Este producto no tiene presentaciones de compra"))
    .toBeVisible();
  expect(dialog.getByRole("radio").query()).toBeNull();
});

test("says the link is remembered for the next lists of the supplier once the list is confirmed", async () => {
  const screen = await renderModal({ remembersOnConfirm: true });

  await expect
    .element(
      screen
        .getByRole("dialog")
        .getByText(
          "Al confirmar la lista, el vínculo se recuerda y las próximas listas de este proveedor reconocen el ítem solas.",
        ),
    )
    .toBeVisible();
  expect(screen.getByText(/^El vínculo se recuerda:/).query()).toBeNull();
});

test("remembers the link for the next lists of the supplier of a confirmed list", async () => {
  const screen = await renderModal({ remembersOnConfirm: false });

  await expect
    .element(
      screen
        .getByRole("dialog")
        .getByText(
          "El vínculo se recuerda: en las próximas listas de este proveedor el ítem se reconoce solo.",
        ),
    )
    .toBeVisible();
});

test("links the item to the chosen product and packaging against the loaded version, and reports it", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const onLinked = vi.fn();
  const screen = await renderModal({ services, onLinked });

  await linkPasas(screen);

  expect(services.linkSupplierPriceListRow).toHaveBeenCalledWith(LIST.id, nutRow.id, {
    version: 3,
    productId: PASAS_ID,
    packagingId: CAJA_DE_PASAS.id,
    vatRate: null,
  });
  await expect.poll(() => onLinked.mock.calls.length).toBe(1);
});

test("links a proposed product once the person confirms it with a packaging", async () => {
  const services = createServices({
    fetchSupplierItemLinkProposal: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: PROPOSED_BY_BARCODE }),
  });
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ services });
  await expect
    .element(screen.getByRole("dialog").getByRole("radio", { name: "Bolsa de 5 kg" }))
    .toBeVisible();

  await choosePackaging(screen, "Bolsa de 5 kg");
  await link(screen);

  expect(services.linkSupplierPriceListRow).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ productId: PASAS_ID, packagingId: BOLSA_DE_PASAS.id }),
  );
});

test("asks for the product and the packaging without calling the cloud", async () => {
  const services = createServices();
  const screen = await renderModal({ services });

  const dialog = await link(screen);

  await expect.element(dialog.getByText("Elegí el producto del catálogo.")).toBeVisible();
  await chooseProduct(screen, "Pasas de uva");
  await link(screen);
  await expect.element(dialog.getByText("Elegí la presentación de compra.")).toBeVisible();
  expect(services.linkSupplierPriceListRow).not.toHaveBeenCalled();
});

test("offers no VAT rate when the cloud says the list's links need none", async () => {
  const screen = await renderModal({ list: { ...LIST, requiresVatRate: false } });

  await expect
    .element(screen.getByRole("dialog").getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toBeVisible();
  expect(screen.getByText("IVA del ítem").query()).toBeNull();
});

test("offers the VAT rate with 21 % chosen when the cloud says the list's links need one", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ services, list: { ...LIST, requiresVatRate: true } });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("IVA del ítem")).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "21 %" })).toBeChecked();
  await linkPasas(screen);

  expect(services.linkSupplierPriceListRow).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ vatRate: 2_100 }),
  );
});

test("offers the VAT rates the cloud answers, with its default chosen", async () => {
  const services = createServices({
    fetchSupplierItemLinkChoices: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { ...LINK_CHOICES, vatRates: { offered: [2700, 1050], default: 1050 } },
    }),
  });
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ services, list: { ...LIST, requiresVatRate: true } });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByRole("radio", { name: "27 %" })).toBeVisible();
  await expect.element(dialog.getByRole("radio", { name: "10,5 %" })).toBeChecked();
  expect(dialog.getByRole("radio", { name: "21 %" }).query()).toBeNull();
  await linkPasas(screen);

  expect(services.linkSupplierPriceListRow).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ vatRate: 1_050 }),
  );
});

test("links with the 10,5 % rate when it is chosen", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ services, list: { ...LIST, requiresVatRate: true } });

  await chooseRadio(screen, "10,5 %");
  await linkPasas(screen);

  expect(services.linkSupplierPriceListRow).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ vatRate: 1_050 }),
  );
});

test("starts with the product, packaging and rate an item is already linked with", async () => {
  const choices = {
    products: [
      {
        id: ALMOND_LINK.product.id,
        name: "Almendras peladas",
        saleUnit: "KG" as const,
        packagings: [ALMOND_LINK.packaging],
      },
    ],
    vatRates: LINK_CHOICES.vatRates,
  };
  const services = createServices({
    fetchSupplierItemLinkChoices: vi.fn().mockResolvedValue({ kind: "ok", value: choices }),
  });
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const target = { ...almondRow, link: { ...ALMOND_LINK, vatRate: 1_050 } };
  const screen = await renderModal({
    services,
    target,
    list: { ...LIST, requiresVatRate: true },
  });
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toHaveValue("Almendras peladas");
  await expect.element(dialog.getByRole("radio", { name: "Bolsa de 25 kg" })).toBeChecked();
  await expect.element(dialog.getByRole("radio", { name: "10,5 %" })).toBeChecked();
  await link(screen);

  expect(services.linkSupplierPriceListRow).toHaveBeenCalledWith(LIST.id, target.id, {
    version: 3,
    productId: ALMOND_LINK.product.id,
    packagingId: ALMOND_LINK.packaging.id,
    vatRate: 1_050,
  });
});

test("tells the list changed, and updating it reports it", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "stale_version" });
  const onOutdated = vi.fn();
  const screen = await renderModal({ services, onOutdated });

  const dialog = await linkPasas(screen);

  await expect.element(dialog.getByText("La lista cambió")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("tells the product or the packaging can no longer be linked, and reads the choices again", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({
    kind: "packaging_not_linkable",
  });
  const screen = await renderModal({ services });

  const dialog = await linkPasas(screen);

  await expect
    .element(dialog.getByText("El producto o la presentación ya no se pueden vincular"))
    .toBeVisible();
  expect(dialog.getByText(/creá una nueva/).query()).toBeNull();
  await expect
    .poll(() => vi.mocked(services.fetchSupplierItemLinkChoices).mock.calls.length)
    .toBeGreaterThan(1);
  await expect.element(dialog.getByRole("button", { name: "Vincular" })).toBeEnabled();
});

test("tells the VAT rate is missing", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "vat_rate_missing" });
  const screen = await renderModal({ services });

  const dialog = await linkPasas(screen);

  await expect.element(dialog.getByText("Elegí el IVA del ítem")).toBeVisible();
});

test("tells the item was not linked, and linking stays available", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ services });

  const dialog = await linkPasas(screen);

  await expect.element(dialog.getByText("No se vinculó el ítem")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Vincular" })).toBeEnabled();
});

test("ends the session when linking finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ services, onSessionEnded });

  await linkPasas(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when linking comes back forbidden", async () => {
  window.history.pushState(null, "", "/lists");
  const services = createServices();
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ services });

  await linkPasas(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("says the choices are loading and linking waits for them", async () => {
  const services = createServices({
    fetchSupplierItemLinkChoices: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByRole("button", { name: "Vincular" })).toBeDisabled();
  expect(dialog.getByRole("combobox").query()).toBeNull();
});

test("shows a load error with a retry that reads the choices again", async () => {
  const services = createServices({
    fetchSupplierItemLinkChoices: vi
      .fn<LinkSupplierItemModalServices["fetchSupplierItemLinkChoices"]>()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValue({ kind: "ok", value: LINK_CHOICES }),
  });
  const screen = await renderModal({ services });
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("No pudimos abrir los productos")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Vincular" })).toBeDisabled();

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toBeVisible();
});

test("ends the session when the choices come back unauthenticated", async () => {
  const services = createServices({
    fetchSupplierItemLinkChoices: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();
  await renderModal({ services, onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("cancel closes the modal without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const screen = await renderModal({ services, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.linkSupplierPriceListRow).not.toHaveBeenCalled();
});

test("offers a new packaging only once a product is chosen, and only to a session that may create one", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("combobox", { name: /^Producto del catálogo/ }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Nueva presentación" }).query()).toBeNull();

  await chooseProduct(screen, "Pasas de uva");

  await expect.element(dialog.getByRole("button", { name: "Nueva presentación" })).toBeVisible();
});

test("offers no new packaging to a session that may not create one", async () => {
  const screen = await renderModal({ mayCreatePackaging: false });
  await chooseProduct(screen, "Pasas de uva");

  await expect
    .element(screen.getByRole("dialog").getByRole("radio", { name: "Caja de 10 kg" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Nueva presentación" }).query()).toBeNull();
});

test("creates a packaging for the chosen product, reads the choices again and chooses it", async () => {
  const created: PackagingSummary = {
    id: "9ac00000-0000-4000-8000-000000000099",
    productId: PASAS_ID,
    productName: "Pasas de uva",
    brandName: null,
    netContent: null,
    productSaleUnit: "KG",
    saleUnit: "KG",
    saleUnitChanged: false,
    name: "Caja de 20 kg",
    quantityPerPackage: 20_000,
    active: true,
    version: 1,
  };
  const withCreated = {
    ...LINK_CHOICES,
    products: LINK_CHOICES.products.map((product) =>
      product.id === PASAS_ID
        ? {
            ...product,
            packagings: [
              ...product.packagings,
              {
                id: created.id,
                name: created.name,
                quantityPerPackage: created.quantityPerPackage,
              },
            ],
          }
        : product,
    ),
  };
  const services = createServices({
    fetchSupplierItemLinkChoices: vi
      .fn<LinkSupplierItemModalServices["fetchSupplierItemLinkChoices"]>()
      .mockResolvedValueOnce({ kind: "ok", value: LINK_CHOICES })
      .mockResolvedValue({ kind: "ok", value: withCreated }),
  });
  vi.mocked(services.createPackaging).mockResolvedValue({ kind: "ok", packaging: created });
  vi.mocked(services.linkSupplierPriceListRow).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ services });
  await chooseProduct(screen, "Pasas de uva");

  await userEvent.click(screen.getByRole("button", { name: "Nueva presentación" }));
  const newDialog = screen.getByRole("dialog", { name: "Nueva presentación" });
  await userEvent.fill(newDialog.getByRole("textbox", { name: /^Nombre/ }), "Caja de 20 kg");
  await userEvent.fill(
    newDialog.getByRole("textbox", { name: /^Cantidad por presentación/ }),
    "20",
  );
  await userEvent.click(newDialog.getByRole("button", { name: "Crear la presentación" }));

  expect(services.createPackaging).toHaveBeenCalledWith({
    productId: PASAS_ID,
    name: "Caja de 20 kg",
    quantityPerPackage: 20_000,
  });
  await expect.element(screen.getByRole("radio", { name: "Caja de 20 kg" })).toBeChecked();
  expect(services.fetchSupplierItemLinkProposal).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Vincular" }));
  expect(services.linkSupplierPriceListRow).toHaveBeenCalledWith(
    LIST.id,
    nutRow.id,
    expect.objectContaining({ productId: PASAS_ID, packagingId: created.id }),
  );
});

test("has no accessibility violations loaded and with the product's packagings shown", async () => {
  const screen = await renderModal({ list: { ...LIST, requiresVatRate: true } });
  await expect
    .element(screen.getByRole("dialog").getByText("Sin propuesta para este ítem."))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
  await chooseProduct(screen, "Pasas de uva");
  await expect
    .element(screen.getByRole("dialog").getByRole("radio", { name: "Caja de 10 kg" }))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
