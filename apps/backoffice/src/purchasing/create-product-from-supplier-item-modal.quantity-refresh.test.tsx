import type { SupplierItemQuantityProposal } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { StubCategoryCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import {
  CreateProductFromSupplierItemModal,
  type CreateProductFromSupplierItemModalServices,
} from "./create-product-from-supplier-item-modal";
import {
  LINK_CHOICES,
  NO_QUANTITY_PROPOSAL,
  PROPOSED_QUANTITY_OF_UNITS,
  UNAVAILABLE_QUANTITY_PROPOSAL,
} from "./test-support/supplier-item-links";
import {
  CREATION_BRANDS,
  CREATION_CATEGORIES,
  CREATION_TAG_LIST,
  PRODUCT_CREATED,
} from "./test-support/supplier-item-products";
import { EXTRACTED_ROWS, READ_LIST } from "./test-support/supplier-price-lists";

const nutRow = EXTRACTED_ROWS[2] as (typeof EXTRACTED_ROWS)[number];
const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };
const PROPOSED_ANOTHER_QUANTITY: SupplierItemQuantityProposal = {
  kind: "proposed",
  quantity: 24_000,
};

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 900);
});

type Fetch = CreateProductFromSupplierItemModalServices["fetchSupplierItemQuantityProposal"];
type Answer = Awaited<ReturnType<Fetch>>;

const proposal = (value: SupplierItemQuantityProposal): Answer => ({ kind: "ok", value });

function answering(...answers: Answer[]): CreateProductFromSupplierItemModalServices {
  const fetchProposal = vi.fn<Fetch>();
  for (const answer of answers) {
    fetchProposal.mockResolvedValueOnce(answer);
  }
  return {
    createProductFromSupplierItem: vi
      .fn<CreateProductFromSupplierItemModalServices["createProductFromSupplierItem"]>()
      .mockResolvedValue({ kind: "ok", created: PRODUCT_CREATED }),
    fetchProductCreationCategories: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchProductCreationCategories"]>()
      .mockResolvedValue({ kind: "ok", value: CREATION_CATEGORIES }),
    fetchProductCreationBrands: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchProductCreationBrands"]>()
      .mockResolvedValue({ kind: "ok", value: CREATION_BRANDS }),
    fetchProductCreationTags: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchProductCreationTags"]>()
      .mockResolvedValue({ kind: "ok", value: CREATION_TAG_LIST }),
    createBrand: vi.fn<CreateProductFromSupplierItemModalServices["createBrand"]>(),
    createTag: vi.fn<CreateProductFromSupplierItemModalServices["createTag"]>(),
    fetchSupplierItemLinkChoices: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchSupplierItemLinkChoices"]>()
      .mockResolvedValue({ kind: "ok", value: LINK_CHOICES }),
    generateInternalBarcode:
      vi.fn<CreateProductFromSupplierItemModalServices["generateInternalBarcode"]>(),
    fetchSupplierItemQuantityProposal: fetchProposal,
  };
}

async function opened(services: CreateProductFromSupplierItemModalServices) {
  const onSessionEnded = vi.fn();
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CreateProductFromSupplierItemModal
          list={LIST}
          target={nutRow}
          mayCreateCatalogRecords
          categoryCreationModal={StubCategoryCreationModal}
          services={services}
          onCreated={() => {}}
          onOutdated={() => {}}
          onClose={() => {}}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Crear producto desde la lista" });
  await expect.element(dialog.getByRole("combobox", { name: /^Categoría/ })).toBeVisible();
  return { dialog, onSessionEnded };
}

type Dialog = Awaited<ReturnType<typeof opened>>["dialog"];

const askAgain = (dialog: Dialog) => dialog.getByRole("button", { name: "Volver a proponer" });
const quantityField = (dialog: Dialog) =>
  dialog.getByRole("textbox", { name: /^Cantidad que trae/ });

test.each([
  ["a quantity", proposal(PROPOSED_QUANTITY_OF_UNITS)],
  ["no quantity", proposal(NO_QUANTITY_PROPOSAL)],
  ["an unavailable proposal", proposal(UNAVAILABLE_QUANTITY_PROPOSAL)],
])("offers to propose the quantity again once %s is loaded", async (_kind, answer) => {
  const { dialog } = await opened(answering(answer));

  await expect.element(askAgain(dialog)).toBeEnabled();
});

test("offers no new proposal while the quantity proposal loads", async () => {
  const { dialog } = await opened({
    ...answering(),
    fetchSupplierItemQuantityProposal: vi.fn<Fetch>().mockReturnValue(new Promise(() => {})),
  });

  expect(askAgain(dialog).query()).toBeNull();
});

test("asks the model again for the shape of the product and fills the new quantity the person did not touch", async () => {
  const services = answering(
    proposal(PROPOSED_QUANTITY_OF_UNITS),
    proposal(PROPOSED_ANOTHER_QUANTITY),
  );
  const { dialog } = await opened(services);
  await expect.element(quantityField(dialog)).toHaveValue("36");

  await userEvent.click(askAgain(dialog));

  expect(services.fetchSupplierItemQuantityProposal).toHaveBeenLastCalledWith(LIST.id, nutRow.id, {
    saleUnit: "UNIT",
    netContent: null,
    refresh: true,
  });
  await expect.element(quantityField(dialog)).toHaveValue("24");
});

test("keeps the quantity the person typed when the new proposal arrives", async () => {
  const services = answering(
    proposal(PROPOSED_QUANTITY_OF_UNITS),
    proposal(PROPOSED_ANOTHER_QUANTITY),
  );
  const { dialog } = await opened(services);
  await expect.element(quantityField(dialog)).toHaveValue("36");
  await userEvent.fill(quantityField(dialog), "7");

  await userEvent.click(askAgain(dialog));

  await expect
    .poll(() => vi.mocked(services.fetchSupplierItemQuantityProposal).mock.calls.length)
    .toBe(2);
  await expect.element(quantityField(dialog)).toHaveValue("7");
});

test("disables the action while the new quantity is being asked", async () => {
  let settle: (answer: Answer) => void = () => {};
  const services = answering(proposal(PROPOSED_QUANTITY_OF_UNITS));
  vi.mocked(services.fetchSupplierItemQuantityProposal).mockReturnValueOnce(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  const { dialog } = await opened(services);
  await expect.element(askAgain(dialog)).toBeEnabled();

  await userEvent.click(askAgain(dialog));
  await expect.element(askAgain(dialog)).toBeDisabled();

  settle(proposal(PROPOSED_ANOTHER_QUANTITY));
  await expect.element(askAgain(dialog)).toBeEnabled();
});

test("shows that asking again did not work and keeps the quantity", async () => {
  const { dialog } = await opened(
    answering(proposal(PROPOSED_QUANTITY_OF_UNITS), { kind: "failed" }),
  );
  await expect.element(quantityField(dialog)).toHaveValue("36");

  await userEvent.click(askAgain(dialog));

  await expect.element(dialog.getByText("No pudimos volver a proponer")).toBeVisible();
  await expect.element(quantityField(dialog)).toHaveValue("36");
});

test("ends the session when asking again finds it ended", async () => {
  const { dialog, onSessionEnded } = await opened(
    answering(proposal(PROPOSED_QUANTITY_OF_UNITS), { kind: "unauthenticated" }),
  );

  await userEvent.click(askAgain(dialog));

  await expect.poll(() => onSessionEnded).toHaveBeenCalledTimes(1);
});
