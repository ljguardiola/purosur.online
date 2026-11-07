import { FieldSizeProvider } from "@purosur/ui";
import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import {
  LinkSupplierItemModal,
  type LinkSupplierItemModalServices,
} from "../link-supplier-item-modal";
import { LINK_CHOICES, NO_PROPOSAL } from "./supplier-item-links";
import { EXTRACTED_ROWS, READ_LIST } from "./supplier-price-lists";

type Row = (typeof EXTRACTED_ROWS)[number];

export const [almondRow, pasasRow, nutRow] = EXTRACTED_ROWS as [Row, Row, Row];
export const LIST = { ...READ_LIST, version: 3, requiresVatRate: false };

export function createServices(
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
    ...overrides,
  };
}

export type ModalOptions = {
  services?: LinkSupplierItemModalServices;
  list?: Parameters<typeof LinkSupplierItemModal>[0]["list"];
  target?: Row | null;
  remembersOnConfirm?: boolean;
  onCreateProduct?: ((row: Row) => void) | null;
  onLinked?: () => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
};

export function modalElement({
  services = createServices(),
  list = LIST,
  target = nutRow,
  remembersOnConfirm = true,
  onCreateProduct = null,
  onLinked = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: ModalOptions = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <LinkSupplierItemModal
          list={list}
          target={target}
          remembersOnConfirm={remembersOnConfirm}
          onCreateProduct={onCreateProduct}
          services={services}
          onLinked={onLinked}
          onOutdated={onOutdated}
          onClose={onClose}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderModal(options: ModalOptions = {}) {
  return render(modalElement(options));
}

export type ModalScreen = Awaited<ReturnType<typeof renderModal>>;
