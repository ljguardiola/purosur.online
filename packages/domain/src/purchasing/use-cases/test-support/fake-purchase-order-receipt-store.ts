import type {
  PurchaseOrderReceiptStore,
  PurchaseOrderReceiptStoreTransaction,
} from "../purchase-order-receipt-store.js";
import type { FakePurchaseOrderStore } from "./fake-purchase-order-store.js";
import type { FakePurchasingStore } from "./fake-purchasing-store.js";

export class FakePurchaseOrderReceiptStore implements PurchaseOrderReceiptStore {
  readonly purchasing: FakePurchasingStore;
  readonly orders: FakePurchaseOrderStore;
  lockLog: string[] = [];

  constructor(purchasing: FakePurchasingStore, orders: FakePurchaseOrderStore) {
    this.purchasing = purchasing;
    this.orders = orders;
  }

  async transaction<TOutcome>(
    work: (tx: PurchaseOrderReceiptStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.purchasing.transaction((purchasing) =>
      this.orders.transaction((orders) =>
        work({
          lockSupplier: (supplierId) => {
            this.lockLog.push(`supplier:${supplierId}`);
            return purchasing.lockSupplier(supplierId);
          },
          holdPurchasedProduct: (productId) => {
            this.lockLog.push(`product:${productId}`);
            return purchasing.holdPurchasedProduct(productId);
          },
          insertPurchase: (fields) => purchasing.insertPurchase(fields),
          insertPurchaseLine: (fields) => purchasing.insertPurchaseLine(fields),
          postponePriceReviews: (postponement) => purchasing.postponePriceReviews(postponement),
          receiveStock: (receipt) => purchasing.receiveStock(receipt),
          lockPurchaseOrder: (locationId, orderId) => {
            this.lockLog.push(`order:${orderId}`);
            return orders.lockPurchaseOrder(locationId, orderId);
          },
          supplierOffers: (supplierId, productId) => orders.supplierOffers(supplierId, productId),
          receivedQuantities: (orderId) => orders.receivedQuantities(orderId),
          insertPurchaseOrderReceipt: (fields) => orders.insertPurchaseOrderReceipt(fields),
          markPurchaseOrderReceived: (orderId, receiving) =>
            orders.markPurchaseOrderReceived(orderId, receiving),
        }),
      ),
    );
  }
}
