import type {
  CreateCatalogProductInput,
  CreateCatalogProductOutcome,
  SupplierItemProductStore,
  SupplierItemProductStoreTransaction,
} from "../supplier-item-product-store.js";
import type {
  FakeSupplierPriceListState,
  FakeSupplierPriceListWrite,
} from "./fake-supplier-price-list-store.js";
import { FakeSupplierPriceListStore } from "./fake-supplier-price-list-store.js";

export interface FakeSupplierItemProductState {
  lists: FakeSupplierPriceListState;
  products: ({ id: string } & CreateCatalogProductInput)[];
}

export class FakeSupplierItemProductStore implements SupplierItemProductStore {
  readonly lists = new FakeSupplierPriceListStore();
  catalogRefusal: Exclude<CreateCatalogProductOutcome, { kind: "created" }> | null = null;
  callOrder: string[] = [];
  private products: FakeSupplierItemProductState["products"] = [];

  failWrite(operation: FakeSupplierPriceListWrite): void {
    this.lists.failingWrites.add(operation);
  }

  snapshot(): FakeSupplierItemProductState {
    return {
      lists: this.lists.snapshot(),
      products: this.products.map((product) => ({
        ...product,
        barcodes: [...product.barcodes],
        tagIds: [...product.tagIds],
      })),
    };
  }

  async transaction<TOutcome>(
    work: (tx: SupplierItemProductStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const products = [...this.products];
    const callOrder = [...this.callOrder];
    try {
      return await this.lists.transaction((inner) =>
        work({
          lockList: (listId) => {
            this.callOrder.push("lockList");
            return inner.lockList(listId);
          },
          lockRow: async (listId, rowId) => {
            this.callOrder.push("lockRow");
            const locked = await inner.lockRow(listId, rowId);
            if (locked.kind === "not_found") {
              return locked;
            }
            const stored = this.lists.snapshot().rows.find((row) => row.id === rowId);
            return {
              kind: "locked",
              row: {
                ...locked.row,
                presentation: stored?.presentation ?? null,
                link: stored?.link ?? null,
              },
            };
          },
          linkRow: (listId, rowId, link, actorId) => {
            this.callOrder.push("linkRow");
            return inner.linkRow(listId, rowId, link, actorId);
          },
          lockSupplierItems: (supplierId, keys) => {
            this.callOrder.push("lockSupplierItems");
            return inner.lockSupplierItems(supplierId, keys);
          },
          rememberSupplierItemLink: (itemId, link) => {
            this.callOrder.push("rememberSupplierItemLink");
            return inner.rememberSupplierItemLink(itemId, link);
          },
          createCatalogProduct: async (input) => {
            this.callOrder.push("createCatalogProduct");
            if (this.catalogRefusal) {
              return this.catalogRefusal;
            }
            const id = `product-new-${this.products.length + 1}`;
            this.products.push({
              id,
              ...input,
              barcodes: [...input.barcodes],
              tagIds: [...input.tagIds],
            });
            return { kind: "created", productId: id };
          },
        }),
      );
    } catch (error) {
      this.products = products;
      this.callOrder = callOrder;
      throw error;
    }
  }
}
