import type { StockMovementKind } from "../../stock/index.js";
import { readsPulledEntity, unreadableStockMovementKinds } from "./pull-readers.js";

export const PULLED_ENTITIES = [
  "branch_settings",
  "branch_first_cash_session",
  "category",
  "product",
  "tag",
  "brand",
  "price_list",
  "price",
  "user",
  "role",
  "register",
  "register_point_of_sale",
  "register_point_terminal",
  "register_qr_point_of_sale",
  "register_offline_point_of_sale",
  "discount",
  "issuer_identification",
  "buyer_identification_threshold",
  "buyer_tax_status_set",
  "zone_rules",
  "stock_movement",
  "refund_completion",
  "offline_authorization_code",
  "offline_number_block",
] as const;

export type PulledEntity = (typeof PULLED_ENTITIES)[number];

export type PullReach =
  | { kind: "every_row" }
  | { kind: "row"; id: string }
  | { kind: "rows_of_branch"; locationId: string }
  | {
      kind: "rows_of_branch_except_stock_movement_kinds";
      locationId: string;
      kinds: readonly StockMovementKind[];
    }
  | { kind: "rows_of_price_list"; priceListId: string }
  | { kind: "rows_of_register"; registerId: string }
  | { kind: "none" };

export type PullAudience = Readonly<Record<PulledEntity, PullReach>>;

export interface PullingRegister {
  registerId: string;
  locationId: string;
  priceListId: string | null;
}

const EVERY_ROW: PullReach = { kind: "every_row" };
const NONE: PullReach = { kind: "none" };

const NOTHING: PullAudience = {
  branch_settings: NONE,
  branch_first_cash_session: NONE,
  category: NONE,
  product: NONE,
  tag: NONE,
  brand: NONE,
  price_list: NONE,
  price: NONE,
  user: NONE,
  role: NONE,
  register: NONE,
  register_point_of_sale: NONE,
  register_point_terminal: NONE,
  register_qr_point_of_sale: NONE,
  register_offline_point_of_sale: NONE,
  discount: NONE,
  issuer_identification: NONE,
  buyer_identification_threshold: NONE,
  buyer_tax_status_set: NONE,
  zone_rules: NONE,
  stock_movement: NONE,
  refund_completion: NONE,
  offline_authorization_code: NONE,
  offline_number_block: NONE,
};

function stockMovementReach(locationId: string, readerVersion: string | null): PullReach {
  const kinds = unreadableStockMovementKinds(readerVersion);
  return kinds.length === 0
    ? { kind: "rows_of_branch", locationId }
    : { kind: "rows_of_branch_except_stock_movement_kinds", locationId, kinds };
}

export function pullAudienceOf(
  { registerId, locationId, priceListId }: PullingRegister,
  readerVersion: string | null,
): PullAudience {
  const audience: PullAudience = {
    branch_settings: { kind: "row", id: locationId },
    branch_first_cash_session: { kind: "row", id: locationId },
    category: EVERY_ROW,
    product: EVERY_ROW,
    tag: EVERY_ROW,
    brand: EVERY_ROW,
    price_list: priceListId === null ? NONE : { kind: "row", id: priceListId },
    price: priceListId === null ? NONE : { kind: "rows_of_price_list", priceListId },
    user: { kind: "rows_of_branch", locationId },
    role: EVERY_ROW,
    register: { kind: "row", id: registerId },
    register_point_of_sale: { kind: "row", id: registerId },
    register_point_terminal: { kind: "row", id: registerId },
    register_qr_point_of_sale: { kind: "row", id: registerId },
    register_offline_point_of_sale: { kind: "row", id: registerId },
    discount: EVERY_ROW,
    issuer_identification: EVERY_ROW,
    buyer_identification_threshold: EVERY_ROW,
    buyer_tax_status_set: EVERY_ROW,
    zone_rules: EVERY_ROW,
    stock_movement: stockMovementReach(locationId, readerVersion),
    refund_completion: { kind: "rows_of_branch", locationId },
    offline_authorization_code: EVERY_ROW,
    offline_number_block: { kind: "rows_of_register", registerId },
  };
  return Object.fromEntries(
    PULLED_ENTITIES.map((entity) => [
      entity,
      readsPulledEntity(readerVersion, entity) ? audience[entity] : NONE,
    ]),
  ) as PullAudience;
}

export function pullAudienceOfEntity(
  register: PullingRegister,
  entity: PulledEntity,
  readerVersion: string | null,
): PullAudience {
  return { ...NOTHING, [entity]: pullAudienceOf(register, readerVersion)[entity] };
}
