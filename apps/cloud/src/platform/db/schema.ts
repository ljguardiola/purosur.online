import {
  ALERT_AUDIENCES,
  ALERT_LEVELS,
  type JsonValue,
  POINT_OF_SALE_NUMBER_MAX,
} from "@purosur/domain";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
});

export const priceLists = pgTable("price_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
});

export const branchSettings = pgTable("branch_settings", {
  locationId: uuid("location_id")
    .primaryKey()
    .references(() => locations.id),
  address: text("address").notNull().default(""),
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  instagramHandle: text("instagram_handle").notNull().default(""),
  expiringLotAlertDays: integer("expiring_lot_alert_days").notNull().default(30),
  unreviewedPriceAlertDays: integer("unreviewed_price_alert_days").notNull().default(30),
  goodConditionReturnDays: integer("good_condition_return_days").notNull().default(15),
  priceListId: uuid("price_list_id")
    .notNull()
    .references(() => priceLists.id),
  // Optimistic concurrency: a stale version is rejected, not overwritten; editing branch_hours bumps this too.
  version: integer("version").notNull().default(1),
});

// day_of_week: 1 = Monday … 7 = Sunday; a day with no rows here is closed.
export const branchHours = pgTable(
  "branch_hours",
  {
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    dayOfWeek: smallint("day_of_week").notNull(),
    position: integer("position").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.locationId, table.dayOfWeek, table.position] }),
    check("branch_hours_day_of_week_check", sql`${table.dayOfWeek} BETWEEN 1 AND 7`),
    check("branch_hours_closes_after_opens", sql`${table.closesAt} > ${table.opensAt}`),
  ],
);

export const ISSUER_IDENTIFICATION_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

// `id` is pinned to ISSUER_IDENTIFICATION_SINGLETON_ID by default and CHECK: a different id fails
// the CHECK, and this one collides on the primary key, together guaranteeing at most one row.
export const issuerIdentification = pgTable(
  "issuer_identification",
  {
    id: uuid("id").primaryKey().default(sql`'00000000-0000-0000-0000-000000000001'`),
    legalName: text("legal_name"),
    grossIncomeRegistration: text("gross_income_registration"),
    activityStartDate: date("activity_start_date"),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    check(
      "issuer_identification_single_row",
      sql`${table.id} = '00000000-0000-0000-0000-000000000001'::uuid`,
    ),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    email: text("email").notNull(),
    active: boolean("active").notNull().default(true),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
);

// Append-only like prices: one row per version of the issuer identification, so a reprint can show
// what was printed at the time. The version the migration kept from the row that existed before
// versions were stored has neither `authorized_cuit` nor `recorded_by`; a version recorded when the
// cloud starts under another certificate's CUIT has no `recorded_by`.
export const issuerIdentificationVersions = pgTable("issuer_identification_versions", {
  version: integer("version").primaryKey(),
  legalName: text("legal_name"),
  grossIncomeRegistration: text("gross_income_registration"),
  activityStartDate: date("activity_start_date", { mode: "string" }),
  authorizedCuit: text("authorized_cuit"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  recordedBy: uuid("recorded_by").references(() => users.id),
});

// `amount` is in cents.
export const buyerIdentificationThresholds = pgTable(
  "buyer_identification_thresholds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid("recorded_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("buyer_identification_thresholds_valid_from_key").on(table.validFrom),
    check("buyer_identification_thresholds_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const buyerTaxStatusSets = pgTable(
  "buyer_tax_status_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paramsVersion: integer("params_version").notNull(),
    options: jsonb("options")
      .$type<{ code: number; description: string; invoiceClass: string }[]>()
      .notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("buyer_tax_status_sets_params_version_key").on(table.paramsVersion),
    check("buyer_tax_status_sets_params_version_positive", sql`${table.paramsVersion} > 0`),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    isAdministrator: boolean("is_administrator").notNull().default(false),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("roles_single_administrator_key")
      .on(table.isAdministrator)
      .where(sql`${table.isAdministrator} = true`),
    check(
      "roles_name_unless_administrator",
      sql`(${table.isAdministrator} AND ${table.name} IS NULL) OR (NOT ${table.isAdministrator} AND ${table.name} IS NOT NULL)`,
    ),
    // Nulls are distinct to Postgres, so every Administrator's null name never conflicts here.
    uniqueIndex("roles_name_lower_key").on(sql`lower(${table.name})`),
  ],
);

// The permission catalog lives in code (@purosur/domain), not here, so a new key needs no
// migration. Administrator holds every permission implicitly (roles.is_administrator) and gets no rows.
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionKey: text("permission_key").notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    uniqueIndex("user_roles_user_id_key").on(table.userId),
  ],
);

// Siblings' names collide case-insensitively even both top-level (null parent), via
// `NULLS NOT DISTINCT` — Postgres otherwise treats each null as distinct.
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    // NULLS NOT DISTINCT has no builder here in this drizzle-orm version, so the migration SQL is
    // hand-edited to add it.
    uniqueIndex("categories_name_lower_key").on(table.parentId, sql`lower(${table.name})`),
    index("categories_parent_id_idx").on(table.parentId),
    check("categories_parent_is_not_itself", sql`${table.parentId} <> ${table.id}`),
  ],
);

// A name is unique ignoring letter case across every brand, deactivated ones included.
export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("brands_name_lower_key").on(sql`lower(${table.name})`)],
);

// active is one-way (never deleted): the migration also revokes DELETE on this table, so
// historical sale lines keep referencing it.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    brandId: uuid("brand_id").references(() => brands.id),
    saleUnit: text("sale_unit").notNull(),
    active: boolean("active").notNull().default(true),
    netContentQuantity: numeric("net_content_quantity", {
      precision: 10,
      scale: 3,
      mode: "number",
    }),
    netContentUnit: text("net_content_unit"),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("products_brand_id_idx").on(table.brandId),
    check("products_sale_unit_check", sql`${table.saleUnit} in ('UNIT', 'KG')`),
    check(
      "products_net_content_unit_check",
      sql`${table.netContentUnit} in ('G', 'KG', 'ML', 'L', 'UNIT')`,
    ),
    check(
      "products_net_content_both_or_neither_check",
      sql`(${table.netContentQuantity} is null) = (${table.netContentUnit} is null)`,
    ),
    check("products_net_content_quantity_positive_check", sql`${table.netContentQuantity} > 0`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("tags_name_lower_key").on(sql`lower(${table.name})`)],
);

export const productTags = pgTable(
  "product_tags",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.tagId] }),
    index("product_tags_tag_id_idx").on(table.tagId),
  ],
);

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    percent: integer("percent"),
    buyQty: integer("buy_qty"),
    payQty: integer("pay_qty"),
    productId: uuid("product_id").references(() => products.id),
    categoryId: uuid("category_id").references(() => categories.id),
    tagId: uuid("tag_id").references(() => tags.id),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }).notNull(),
    weekdays: smallint("weekdays").array().notNull().default(sql`'{}'`),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("discounts_product_id_idx").on(table.productId),
    index("discounts_category_id_idx").on(table.categoryId),
    index("discounts_tag_id_idx").on(table.tagId),
    check("discounts_kind_check", sql`${table.kind} in ('PERCENT_OFF', 'BUY_N_PAY_M')`),
    check(
      "discounts_percent_check",
      sql`${table.kind} <> 'PERCENT_OFF' or coalesce(${table.percent} between 1 and 99, false)`,
    ),
    check(
      "discounts_buy_n_pay_m_quantities_check",
      sql`${table.kind} <> 'BUY_N_PAY_M' or coalesce(${table.payQty} >= 1 and ${table.buyQty} > ${table.payQty}, false)`,
    ),
    check(
      "discounts_percent_off_has_no_quantities_check",
      sql`${table.kind} <> 'PERCENT_OFF' or (${table.buyQty} is null and ${table.payQty} is null)`,
    ),
    check(
      "discounts_buy_n_pay_m_has_no_percent_check",
      sql`${table.kind} <> 'BUY_N_PAY_M' or ${table.percent} is null`,
    ),
    check(
      "discounts_buy_n_pay_m_product_check",
      sql`${table.kind} <> 'BUY_N_PAY_M' or ${table.productId} is not null`,
    ),
    check(
      "discounts_exactly_one_target_check",
      sql`num_nonnulls(${table.productId}, ${table.categoryId}, ${table.tagId}) = 1`,
    ),
    check("discounts_valid_to_not_before_from_check", sql`${table.validTo} >= ${table.validFrom}`),
    check(
      "discounts_weekdays_check",
      sql`${table.weekdays} <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]`,
    ),
  ],
);

// Mirrors products.active (same transaction): a partial index can't read another table's column,
// so this flag scopes the uniqueness below to active products.
export const productBarcodes = pgTable(
  "product_barcodes",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    code: text("code").notNull(),
    position: integer("position").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.position] }),
    uniqueIndex("product_barcodes_code_key").on(table.code).where(sql`${table.active} = true`),
  ],
);

// unitPrice is in cents. Append-only: the migration revokes UPDATE, DELETE, and TRUNCATE on this
// table from cloud_app, so a rewrite is refused at the database level, not just by convention.
export const prices = pgTable(
  "prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id),
    unitPrice: integer("unit_price").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("prices_unit_price_positive", sql`${table.unitPrice} > 0`),
    index("prices_product_id_price_list_id_valid_from_idx").on(
      table.productId,
      table.priceListId,
      table.validFrom,
    ),
    // Lets price_reviews reference it with a composite foreign key, so a review can point only at
    // a price of its own product and price list.
    unique("prices_id_product_id_price_list_id_key").on(
      table.id,
      table.productId,
      table.priceListId,
    ),
  ],
);

// Append-only like prices (same revoked privileges): a product's last review is the newest row
// here, not a column updated in place.
export const priceReviews = pgTable(
  "price_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    priceListId: uuid("price_list_id")
      .notNull()
      .references(() => priceLists.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    priceId: uuid("price_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "price_reviews_price_product_price_list_fk",
      columns: [table.priceId, table.productId, table.priceListId],
      foreignColumns: [prices.id, prices.productId, prices.priceListId],
    }),
    index("price_reviews_product_id_price_list_id_reviewed_at_idx").on(
      table.productId,
      table.priceListId,
      table.reviewedAt,
    ),
  ],
);

// Append-only like prices: a quantity is in thousandths of the product's sale unit, and a movement
// dated at or before a later-registered count keeps superseded_by_count_id set from its insert on,
// never changing the balance.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    kind: text("kind").notNull(),
    reason: text("reason"),
    delta: bigint("delta", { mode: "number" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    supersededByCountId: uuid("superseded_by_count_id").references(
      (): AnyPgColumn => stockMovements.id,
    ),
  },
  (table) => [
    check("stock_movements_kind_check", sql`${table.kind} in ('loss', 'adjustment', 'count')`),
    check(
      "stock_movements_reason_unless_count_check",
      sql`(${table.kind} = 'count') = (${table.reason} is null)`,
    ),
    index("stock_movements_product_id_location_id_occurred_at_idx").on(
      table.productId,
      table.locationId,
      table.occurredAt,
    ),
    index("stock_movements_location_id_occurred_at_idx").on(table.locationId, table.occurredAt),
  ],
);

// Append-only like stock_movements.
export const stockCounts = pgTable(
  "stock_counts",
  {
    movementId: uuid("movement_id")
      .primaryKey()
      .references(() => stockMovements.id),
    counted: bigint("counted", { mode: "number" }).notNull(),
    expected: bigint("expected", { mode: "number" }).notNull(),
  },
  (table) => [check("stock_counts_counted_non_negative", sql`${table.counted} >= 0`)],
);

// The running total of a product's applied movements in a branch, only ever changed by adding a
// movement's delta in SQL within the transaction that inserts the movement.
export const stockBalances = pgTable(
  "stock_balances",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.productId, table.locationId] })],
);

// A 12-digit EAN-13 body inside GS1's 20-29 restricted-circulation prefix range, for a product
// with no manufacturer barcode; never cycles back once the range is exhausted.
export const internalBarcodeSequence = pgSequence("internal_barcode_sequence", {
  minValue: "200000000001",
  maxValue: "299999999999",
  startWith: "200000000001",
  increment: 1,
  cycle: false,
});

export const registers = pgTable(
  "registers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("registers_location_id_name_lower_key").on(
      table.locationId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const registerEnrollmentCodes = pgTable(
  "register_enrollment_codes",
  {
    registerId: uuid("register_id")
      .primaryKey()
      .references(() => registers.id),
    // A code emitted before this column existed has an empty lookup, which no typed code matches.
    codeLookup: text("code_lookup").notNull(),
    codeHash: text("code_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
  },
  (table) => [index("register_enrollment_codes_code_lookup_idx").on(table.codeLookup)],
);

export const fiscalAddresses = pgTable(
  "fiscal_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    streetAddress: text("street_address").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("fiscal_addresses_name_lower_key").on(sql`lower(${table.name})`)],
);

// Append-only: a number once claimed by a register stays that register's, even after the register
// is given another one.
export const pointOfSaleClaims = pgTable(
  "point_of_sale_claims",
  {
    pointOfSaleNumber: integer("point_of_sale_number").primaryKey(),
    registerId: uuid("register_id")
      .notNull()
      .references(() => registers.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    claimedBy: uuid("claimed_by")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      "point_of_sale_claims_number_in_range",
      sql`${table.pointOfSaleNumber} between 1 and ${sql.raw(String(POINT_OF_SALE_NUMBER_MAX))}`,
    ),
    unique("point_of_sale_claims_number_register_key").on(
      table.pointOfSaleNumber,
      table.registerId,
    ),
  ],
);

// The composite foreign key makes the database itself refuse a register using a number another
// register claimed.
export const registerPointsOfSale = pgTable(
  "register_points_of_sale",
  {
    registerId: uuid("register_id")
      .primaryKey()
      .references(() => registers.id),
    pointOfSaleNumber: integer("point_of_sale_number").notNull(),
    fiscalAddressId: uuid("fiscal_address_id")
      .notNull()
      .references(() => fiscalAddresses.id),
    version: integer("version").notNull(),
  },
  (table) => [
    foreignKey({
      name: "register_points_of_sale_claim_fk",
      columns: [table.pointOfSaleNumber, table.registerId],
      foreignColumns: [pointOfSaleClaims.pointOfSaleNumber, pointOfSaleClaims.registerId],
    }),
  ],
);

export const installationRevocationReason = pgEnum("installation_revocation_reason", [
  "replaced",
  "outbox_chain_broken",
]);

export const registerInstallations = pgTable(
  "register_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registerId: uuid("register_id")
      .notNull()
      .references(() => registers.id),
    tokenLookupPrefix: text("token_lookup_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenIssuedAt: timestamp("token_issued_at", { withTimezone: true }).notNull(),
    pendingTokenLookupPrefix: text("pending_token_lookup_prefix"),
    pendingTokenHash: text("pending_token_hash"),
    pendingTokenIssuedAt: timestamp("pending_token_issued_at", { withTimezone: true }),
    // Null only for an installation enrolled before installations were handed one.
    outboxChainKey: text("outbox_chain_key"),
    hostname: text("hostname").notNull(),
    windowsVersion: text("windows_version").notNull(),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: installationRevocationReason("revocation_reason"),
  },
  (table) => [
    uniqueIndex("register_installations_token_lookup_prefix_key").on(table.tokenLookupPrefix),
    uniqueIndex("register_installations_pending_token_lookup_prefix_key").on(
      table.pendingTokenLookupPrefix,
    ),
    uniqueIndex("register_installations_active_register_id_key")
      .on(table.registerId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

function registerKeyVersions(name: string) {
  return pgTable(
    name,
    {
      registerId: uuid("register_id")
        .notNull()
        .references(() => registers.id),
      version: integer("version").notNull(),
      key: text("key").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.registerId, table.version] })],
  );
}

export const registerSnapshotKeys = registerKeyVersions("register_snapshot_keys");

export const registerContingencyTicketKeys = registerKeyVersions(
  "register_contingency_ticket_keys",
);

export const deviceState = pgTable("device_state", {
  deviceId: uuid("device_id")
    .primaryKey()
    .references(() => registerInstallations.id, { onDelete: "cascade" }),
  // Null until the installation pulls: its first push can come before.
  lastPullSince: bigint("last_pull_since", { mode: "number" }),
  lastPulledAt: timestamp("last_pulled_at", { withTimezone: true }),
  appVersion: text("app_version"),
  lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
  walSizeBytes: bigint("wal_size_bytes", { mode: "number" }),
  diskFreeBytes: bigint("disk_free_bytes", { mode: "number" }),
  diskFreeRatio: doublePrecision("disk_free_ratio"),
});

export const inbox = pgTable(
  "inbox",
  {
    eventId: uuid("event_id").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => registerInstallations.id),
    deviceSeq: bigint("device_seq", { mode: "number" }).notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    payload: jsonb("payload").$type<{ [member: string]: JsonValue }>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    chainHmac: text("chain_hmac").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    unique("inbox_device_id_device_seq_key").on(table.deviceId, table.deviceSeq),
    check("inbox_device_seq_positive", sql`${table.deviceSeq} > 0`),
    index("inbox_unapplied_aggregate_idx")
      .on(table.aggregateType, table.aggregateId, table.receivedAt)
      .where(sql`${table.appliedAt} is null`),
    index("inbox_applied_aggregate_idx")
      .on(table.aggregateType, table.aggregateId)
      .where(sql`${table.appliedAt} is not null`),
  ],
);

// What the cloud derived from the events it applied. The location, register and installation of a
// row come from the installation that pushed the event, never from the event's own payload; the
// people (`actor_id`, `opened_by`, ...) are the register's user ids as the event named them, and
// the frozen product, price list and promotion of a line are not checked against today's.
// A sale, its lines and payments, and a cash movement are never changed once recorded.
export const cashSessions = pgTable("cash_sessions", {
  id: uuid("id").primaryKey(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id),
  registerId: uuid("register_id")
    .notNull()
    .references(() => registers.id),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => registerInstallations.id),
  openedBy: text("opened_by").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  openingFloat: bigint("opening_float", { mode: "number" }).notNull(),
  closedBy: text("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  expectedCash: bigint("expected_cash", { mode: "number" }),
  countedCash: bigint("counted_cash", { mode: "number" }),
  difference: bigint("difference", { mode: "number" }),
});

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id),
  registerId: uuid("register_id")
    .notNull()
    .references(() => registers.id),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => registerInstallations.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => cashSessions.id),
  actorId: text("actor_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  total: bigint("total", { mode: "number" }).notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
});

export const saleLines = pgTable("sale_lines", {
  id: uuid("id").primaryKey(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id),
  productId: uuid("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  listUnitPrice: bigint("list_unit_price", { mode: "number" }).notNull(),
  priceListId: uuid("price_list_id").notNull(),
  promotionId: uuid("promotion_id"),
  discountAmount: bigint("discount_amount", { mode: "number" }).notNull(),
  lineTotal: bigint("line_total", { mode: "number" }).notNull(),
});

export const salePayments = pgTable("sale_payments", {
  id: uuid("id").primaryKey(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id),
  method: text("method").notNull(),
  provider: text("provider").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  tendered: bigint("tendered", { mode: "number" }),
  state: text("state").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  authorizedBy: text("authorized_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const cashMovements = pgTable("cash_movements", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => cashSessions.id),
  type: text("type").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  reason: text("reason"),
  refType: text("ref_type"),
  refId: text("ref_id"),
  actorId: text("actor_id").notNull(),
  authorizedBy: text("authorized_by"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
});

// A push refused for a broken chain, kept for a person to review and never applied.
export const refusedEvents = pgTable("refused_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => registerInstallations.id),
  eventId: uuid("event_id").notNull(),
  deviceSeq: bigint("device_seq", { mode: "number" }).notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  payload: jsonb("payload").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actorId: text("actor_id").notNull(),
  chainHmac: text("chain_hmac").notNull(),
  refusedAt: timestamp("refused_at", { withTimezone: true }).notNull(),
});

export const installationRequestEndpoint = pgEnum("installation_request_endpoint", [
  "push",
  "pull",
  "health_check",
]);

// The limiter's own bookkeeping, not business data: what left the limit's window is deleted.
export const installationRequestAttempts = pgTable(
  "installation_request_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => registerInstallations.id),
    endpoint: installationRequestEndpoint("endpoint").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("installation_request_attempts_device_endpoint_idx").on(
      table.deviceId,
      table.endpoint,
      table.attemptedAt,
    ),
  ],
);

export const changeOp = pgEnum("change_op", ["insert", "update", "delete"]);

// Append-only and never pruned: a register returning after any time offline catches up from it.
// `origin_device_id` has no foreign key so a change outlives the installation that made it.
export const changes = pgTable(
  "changes",
  {
    changeSeq: bigserial("change_seq", { mode: "number" }).primaryKey(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    version: integer("version").notNull(),
    op: changeOp("op").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    originDeviceId: uuid("origin_device_id"),
    // Set on a price's changes only, so the feed can tell which branch's list a price belongs to
    // after the price itself is gone.
    priceListId: uuid("price_list_id"),
    // Set on a user's changes only, so the feed can tell which branch a user belongs to after the
    // user itself is gone.
    locationId: uuid("location_id"),
  },
  (table) => [
    index("changes_entity_entity_id_idx").on(table.entity, table.entityId, table.changeSeq),
    index("changes_entity_price_list_id_idx").on(table.entity, table.priceListId, table.changeSeq),
    index("changes_entity_location_id_idx").on(table.entity, table.locationId, table.changeSeq),
  ],
);

export const registerEnrollmentAttemptKeyKind = pgEnum("register_enrollment_attempt_key_kind", [
  "source_address",
  "register",
]);

export const registerEnrollmentAttempts = pgTable(
  "register_enrollment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyKind: registerEnrollmentAttemptKeyKind("key_kind").notNull(),
    keyValue: text("key_value").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("register_enrollment_attempts_key_idx").on(
      table.keyKind,
      table.keyValue,
      table.attemptedAt,
    ),
    index("register_enrollment_attempts_attempted_at_idx").on(table.attemptedAt),
  ],
);

export const pinCodeRedemptionAttemptKeyKind = pgEnum("pin_code_redemption_attempt_key_kind", [
  "source_address",
  "register",
]);

export const pinCodeRedemptionAttempts = pgTable(
  "pin_code_redemption_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyKind: pinCodeRedemptionAttemptKeyKind("key_kind").notNull(),
    keyValue: text("key_value").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("pin_code_redemption_attempts_key_idx").on(
      table.keyKind,
      table.keyValue,
      table.attemptedAt,
    ),
    index("pin_code_redemption_attempts_attempted_at_idx").on(table.attemptedAt),
  ],
);

export const signInLookupAttempts = pgTable(
  "sign_in_lookup_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registerId: uuid("register_id")
      .notNull()
      .references(() => registers.id),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sign_in_lookup_attempts_register_id_attempted_at_idx").on(
      table.registerId,
      table.attemptedAt,
    ),
    index("sign_in_lookup_attempts_attempted_at_idx").on(table.attemptedAt),
  ],
);

// `actor_id` is nullable: a null actor reads as "the service itself acted" (e.g. a sign-in
// lockout, which is keyed by source address and may match no account at all).
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
});

export const passkeys = pgTable(
  "passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    credentialId: text("credential_id").notNull(),
    // Base64url-encoded WebAuthn COSE public key.
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull(),
    transports: jsonb("transports").$type<string[]>(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("passkeys_credential_id_key").on(table.credentialId)],
);

export const userPins = pgTable("user_pins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  salt: text("salt").notNull(),
  hash: text("hash").notNull(),
  setAt: timestamp("set_at", { withTimezone: true }).notNull(),
});

export const userPinCodes = pgTable(
  "user_pin_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    codeHash: text("code_hash").notNull(),
    issuedBy: uuid("issued_by").references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("user_pin_codes_code_hash_key").on(table.codeHash),
    index("user_pin_codes_user_id_issued_at_idx").on(table.userId, table.issuedAt),
  ],
);

export const recoveryTokens = pgTable(
  "recovery_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    // Can be well before issued_at when a retried job reuses the same admitted request.
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    requestId: uuid("request_id").notNull().defaultRandom(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    registrationChallenge: text("registration_challenge"),
  },
  (table) => [
    uniqueIndex("recovery_tokens_token_hash_key").on(table.tokenHash),
    uniqueIndex("recovery_tokens_one_live_per_user")
      .on(table.userId)
      .where(sql`${table.usedAt} IS NULL AND ${table.voidedAt} IS NULL`),
  ],
);

export const recoveryRateLimitKeyKind = pgEnum("recovery_rate_limit_key_kind", [
  "destination_address",
  "source_address",
  // No destination address once the recovery token itself identifies the account.
  "redemption_source_address",
]);

// A rolling 60-minute window, not a clock hour.
export const recoveryRateLimitAttempts = pgTable(
  "recovery_rate_limit_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyKind: recoveryRateLimitKeyKind("key_kind").notNull(),
    keyValue: text("key_value").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("recovery_rate_limit_attempts_key_idx").on(
      table.keyKind,
      table.keyValue,
      table.attemptedAt,
    ),
    index("recovery_rate_limit_attempts_attempted_at_idx").on(table.attemptedAt),
  ],
);

export const recoveryRejectedAttemptKind = pgEnum("recovery_rejected_attempt_kind", [
  "request",
  "registration_options",
  "redeem",
]);

// One row per (kind, key_hash, window): a graphile-worker cron flushes each closed window into
// one audit_log row, then deletes it.
export const recoveryRejectedAttemptAccumulator = pgTable(
  "recovery_rejected_attempt_accumulator",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: recoveryRejectedAttemptKind("kind").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("recovery_rejected_attempt_accumulator_key").on(
      table.kind,
      table.keyHash,
      table.windowStart,
    ),
    index("recovery_rejected_attempt_accumulator_window_idx").on(table.windowStart, table.id),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionIdHash: text("session_id_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Opens a 5-minute step-up window; never itself consumed, and a recovery redemption never sets it.
    passkeyAuthorizedAt: timestamp("passkey_authorized_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("sessions_session_id_hash_key").on(table.sessionIdHash)],
);

export const passkeyManagementChallengeKind = pgEnum("passkey_management_challenge_kind", [
  "registration",
  "session_authorization",
]);

// `registration` and `session_authorization` each populate only their own challenge column,
// not enforced by a check here — only by the routes that write them.
export const passkeyChallenges = pgTable(
  "passkey_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    kind: passkeyManagementChallengeKind("kind").notNull(),
    reauthenticationChallenge: text("reauthentication_challenge"),
    registrationChallenge: text("registration_challenge"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("passkey_challenges_session_id_kind_key").on(table.sessionId, table.kind),
  ],
);

// No user reference: sign-in is discoverable (no username submitted first), so the challenge
// value itself is the lookup key when verifying the assertion.
export const signInChallenges = pgTable(
  "sign_in_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenge: text("challenge").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sign_in_challenges_challenge_key").on(table.challenge)],
);

// Keyed by source address only: without a password there's no "wrong password", and without a
// username there's no account to lock out.
export const signInFailures = pgTable(
  "sign_in_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceAddress: text("source_address").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sign_in_failures_source_address_idx").on(table.sourceAddress, table.attemptedAt),
    index("sign_in_failures_attempted_at_idx").on(table.attemptedAt),
  ],
);

export const signInLockouts = pgTable(
  "sign_in_lockouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceAddress: text("source_address").notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("sign_in_lockouts_source_address_key").on(table.sourceAddress)],
);

export const backofficeRateLimitKeyKind = pgEnum("backoffice_rate_limit_key_kind", [
  "session",
  "source_address",
]);

export const backofficeRateLimitAttempts = pgTable(
  "backoffice_rate_limit_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyKind: backofficeRateLimitKeyKind("key_kind").notNull(),
    keyValue: text("key_value").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("backoffice_rate_limit_attempts_key_idx").on(
      table.keyKind,
      table.keyValue,
      table.attemptedAt,
    ),
    index("backoffice_rate_limit_attempts_attempted_at_idx").on(table.attemptedAt),
  ],
);

export const alertLevel = pgEnum("alert_level", ALERT_LEVELS);

export const alertAudience = pgEnum("alert_audience", ALERT_AUDIENCES);

// kind and scope are free text: the kind catalog lives in code, so a new kind needs no migration.
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    scope: text("scope").notNull(),
    level: alertLevel("level").notNull(),
    audience: alertAudience("audience").notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    escalateAt: timestamp("escalate_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    deduplicates: boolean("deduplicates").notNull().default(true),
  },
  (table) => [
    // Enforces at most one open alert per (kind, scope) for a kind that deduplicates: a duplicate
    // trigger hits this unique violation, which the caller treats as a no-op.
    uniqueIndex("alerts_open_dedup_key")
      .on(table.kind, table.scope)
      .where(sql`${table.resolvedAt} IS NULL AND ${table.deduplicates}`),
    index("alerts_level_idx").on(table.level),
    index("alerts_resolved_at_idx").on(table.resolvedAt),
    check(
      "alerts_location_id_matches_audience",
      sql`(${table.audience} = 'local' AND ${table.locationId} IS NOT NULL) OR (${table.audience} = 'all' AND ${table.locationId} IS NULL)`,
    ),
  ],
);

export const alertDeliveryChannel = pgEnum("alert_delivery_channel", ["backoffice"]);

export const alertDeliveryStatus = pgEnum("alert_delivery_status", ["sent", "failed"]);

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),
    channel: alertDeliveryChannel("channel").notNull().default("backoffice"),
    status: alertDeliveryStatus("status").notNull().default("sent"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("alert_deliveries_alert_recipient_channel_key").on(
      table.alertId,
      table.recipientUserId,
      table.channel,
    ),
  ],
);
