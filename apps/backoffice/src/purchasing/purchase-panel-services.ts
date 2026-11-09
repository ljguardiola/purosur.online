import type { ChangePurchaseLineProductModalServices } from "./change-purchase-line-product-modal";
import type { CorrectPurchaseLineCostModalServices } from "./correct-purchase-line-cost-modal";
import type { CorrectPurchaseLineExpiryModalServices } from "./correct-purchase-line-expiry-modal";
import type { CorrectPurchaseLineQuantityModalServices } from "./correct-purchase-line-quantity-modal";
import type { RemovePurchaseLineModalServices } from "./remove-purchase-line-modal";
import type { SplitPurchaseLineExpiryModalServices } from "./split-purchase-line-expiry-modal";

export type PurchasePanelServices = CorrectPurchaseLineExpiryModalServices &
  SplitPurchaseLineExpiryModalServices &
  CorrectPurchaseLineCostModalServices &
  CorrectPurchaseLineQuantityModalServices &
  ChangePurchaseLineProductModalServices &
  RemovePurchaseLineModalServices;
