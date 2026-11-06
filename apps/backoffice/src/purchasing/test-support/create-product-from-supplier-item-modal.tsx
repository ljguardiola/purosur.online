import { FieldSizeProvider } from "@purosur/ui";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { StubCategoryCreationModal } from "../../platform/test-support/creation-parts";
import { render } from "../../shell/test-support/render-with-router";
import {
  CreateProductFromSupplierItemModal,
  type CreateProductFromSupplierItemModalServices,
} from "../create-product-from-supplier-item-modal";
import { LINK_CHOICES, NO_QUANTITY_PROPOSAL } from "./supplier-item-links";
import {
  CREATION_BRANDS,
  CREATION_CATEGORIES,
  CREATION_TAG_LIST,
  PRODUCT_CREATED,
} from "./supplier-item-products";
import { EXTRACTED_ROWS, READ_LIST } from "./supplier-price-lists";

type Row = (typeof EXTRACTED_ROWS)[number];

export const [, pasasRow, nutRow] = EXTRACTED_ROWS as [Row, Row, Row];
export const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };

export function createServices(
  overrides: Partial<CreateProductFromSupplierItemModalServices> = {},
): CreateProductFromSupplierItemModalServices {
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
    fetchSupplierItemQuantityProposal: vi
      .fn<CreateProductFromSupplierItemModalServices["fetchSupplierItemQuantityProposal"]>()
      .mockResolvedValue({ kind: "ok", value: NO_QUANTITY_PROPOSAL }),
    ...overrides,
  };
}

export type ModalOptions = {
  services?: CreateProductFromSupplierItemModalServices;
  list?: Parameters<typeof CreateProductFromSupplierItemModal>[0]["list"];
  target?: Row | null;
  mayCreateCatalogRecords?: boolean;
  onCreated?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
  besideModal?: ReactNode;
};

export function modalElement({
  services = createServices(),
  list = LIST,
  target = nutRow,
  mayCreateCatalogRecords = true,
  onCreated = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
  besideModal = null,
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <CreateProductFromSupplierItemModal
          list={list}
          target={target}
          mayCreateCatalogRecords={mayCreateCatalogRecords}
          categoryCreationModal={StubCategoryCreationModal}
          services={services}
          onCreated={onCreated}
          onOutdated={onOutdated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
        {besideModal}
      </main>
    </FieldSizeProvider>
  );
}

export function renderModal(options: ModalOptions = {}) {
  return render(modalElement(options));
}

export type ModalScreen = Awaited<ReturnType<typeof renderModal>>;
