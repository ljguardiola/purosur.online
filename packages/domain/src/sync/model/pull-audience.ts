export const PULLED_ENTITIES = [
  "branch_settings",
  "branch_first_cash_session",
  "category",
  "product",
  "tag",
  "price_list",
  "price",
  "user",
  "role",
  "register",
  "register_point_of_sale",
  "register_point_terminal",
  "register_offline_point_of_sale",
  "discount",
  "issuer_identification",
  "buyer_identification_threshold",
  "buyer_tax_status_set",
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
  price_list: NONE,
  price: NONE,
  user: NONE,
  role: NONE,
  register: NONE,
  register_point_of_sale: NONE,
  register_point_terminal: NONE,
  register_offline_point_of_sale: NONE,
  discount: NONE,
  issuer_identification: NONE,
  buyer_identification_threshold: NONE,
  buyer_tax_status_set: NONE,
  stock_movement: NONE,
  refund_completion: NONE,
  offline_authorization_code: NONE,
  offline_number_block: NONE,
};

export function pullAudienceOf({
  registerId,
  locationId,
  priceListId,
}: PullingRegister): PullAudience {
  return {
    branch_settings: { kind: "row", id: locationId },
    branch_first_cash_session: { kind: "row", id: locationId },
    category: EVERY_ROW,
    product: EVERY_ROW,
    tag: EVERY_ROW,
    price_list: priceListId === null ? NONE : { kind: "row", id: priceListId },
    price: priceListId === null ? NONE : { kind: "rows_of_price_list", priceListId },
    user: { kind: "rows_of_branch", locationId },
    role: EVERY_ROW,
    register: { kind: "row", id: registerId },
    register_point_of_sale: { kind: "row", id: registerId },
    register_point_terminal: { kind: "row", id: registerId },
    register_offline_point_of_sale: { kind: "row", id: registerId },
    discount: EVERY_ROW,
    issuer_identification: EVERY_ROW,
    buyer_identification_threshold: EVERY_ROW,
    buyer_tax_status_set: EVERY_ROW,
    stock_movement: { kind: "rows_of_branch", locationId },
    refund_completion: { kind: "rows_of_branch", locationId },
    offline_authorization_code: EVERY_ROW,
    offline_number_block: { kind: "rows_of_register", registerId },
  };
}

export function pullAudienceOfEntity(
  register: PullingRegister,
  entity: PulledEntity,
): PullAudience {
  return { ...NOTHING, [entity]: pullAudienceOf(register)[entity] };
}
