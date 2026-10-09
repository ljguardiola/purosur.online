export type PulledEntity =
  | "branch_settings"
  | "category"
  | "product"
  | "tag"
  | "price_list"
  | "price"
  | "user"
  | "role"
  | "register"
  | "register_point_of_sale"
  | "discount"
  | "issuer_identification"
  | "buyer_identification_threshold"
  | "buyer_tax_status_set"
  | "stock_movement";

export type PullReach =
  | { kind: "every_row" }
  | { kind: "row"; id: string }
  | { kind: "rows_of_branch"; locationId: string }
  | { kind: "rows_of_price_list"; priceListId: string }
  | { kind: "none" };

export type PullAudience = Readonly<Record<PulledEntity, PullReach>>;

export interface PullingRegister {
  registerId: string;
  locationId: string;
  priceListId: string | null;
}

const EVERY_ROW: PullReach = { kind: "every_row" };
const NONE: PullReach = { kind: "none" };

export function pullAudienceOf({
  registerId,
  locationId,
  priceListId,
}: PullingRegister): PullAudience {
  return {
    branch_settings: { kind: "row", id: locationId },
    category: EVERY_ROW,
    product: EVERY_ROW,
    tag: EVERY_ROW,
    price_list: priceListId === null ? NONE : { kind: "row", id: priceListId },
    price: priceListId === null ? NONE : { kind: "rows_of_price_list", priceListId },
    user: { kind: "rows_of_branch", locationId },
    role: EVERY_ROW,
    register: { kind: "row", id: registerId },
    register_point_of_sale: { kind: "row", id: registerId },
    discount: EVERY_ROW,
    issuer_identification: EVERY_ROW,
    buyer_identification_threshold: EVERY_ROW,
    buyer_tax_status_set: EVERY_ROW,
    stock_movement: { kind: "rows_of_branch", locationId },
  };
}
