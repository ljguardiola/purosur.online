export type { NameMatch } from "../model/product-name-match.js";
export type { SearchableProduct } from "../model/product-search.js";
export type {
  AddScannedProductInput,
  AddScannedProductOutcome,
  AddScannedProductPorts,
} from "./add-scanned-product.js";
export { addScannedProduct } from "./add-scanned-product.js";
export type {
  AddSearchedProductInput,
  AddSearchedProductOutcome,
  AddSearchedProductPorts,
} from "./add-searched-product.js";
export { addSearchedProduct } from "./add-searched-product.js";
export type {
  CurrentSaleInput,
  CurrentSaleOutcome,
  CurrentSalePorts,
} from "./current-sale.js";
export { currentSale } from "./current-sale.js";
export type {
  CandidatePromotion,
  Clock,
  IdGenerator,
  RegisterIdentity,
  SaleLedger,
  SaleLedgerTransaction,
  SellableProduct,
  SellingSession,
} from "./sale-ledger.js";
export type {
  FoundProduct,
  SearchProductsByNameInput,
  SearchProductsByNameOutcome,
  SearchProductsByNamePorts,
} from "./search-products-by-name.js";
export { searchProductsByName } from "./search-products-by-name.js";
