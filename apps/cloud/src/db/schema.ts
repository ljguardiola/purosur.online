import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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

// The business runs a single branch today; every user belongs to it. The migration seeds this
// table's one row (like the Administrator role below) and backfills every existing user onto it.
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
});

// A price list groups the `prices` rows a product is looked up in. The business runs a single
// list today (the migration seeds its one row, "Lista general", the same way `locations` seeds
// its own single row); `branch_settings.price_list_id` below decides which list a branch's Prices
// screen works on.
export const priceLists = pgTable("price_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

// One row per location (1:1, `location_id` is both primary and foreign key), holding the settings
// a user with `configure_branch` edits from the backoffice Sucursal screen: the ticket header, and
// the alert and return windows, in days. The migration creates this row, with these defaults, for
// every location that already exists, so a branch always has settings to read. The hours of
// attention themselves live in `branch_hours` below, one or more rows per day of the week, not on
// this row.
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
  // The price list the Prices screen works on for this branch. Not editable from this issue's
  // Sucursal screen (there is a single list, so a dropdown would be a no-op); the migration
  // backfills every existing row onto the seeded "Lista general" list.
  priceListId: uuid("price_list_id")
    .notNull()
    .references(() => priceLists.id),
  // Optimistic concurrency for a branch settings row, the same shape `roles.version` gives role
  // rows: starts at 1 and every edit of that row increments it, so a save over a version someone
  // else already changed is rejected instead of silently overwriting their change. A change to
  // this branch's hours (`branch_hours` below) bumps this same version, even though the hours
  // themselves live on the other table.
  version: integer("version").notNull().default(1),
});

// A branch's hours of attention: zero or more ranges per day of the week (`day_of_week`, 1 =
// Monday … 7 = Sunday, so a day with no rows here is closed), following the `product_barcodes`
// precedent for an ordered list of child rows scoped to one parent. `register_silent` evaluates
// these in the branch's own timezone (design doc §12.3) to know whether the branch is open right
// now, so a schedule it can compute against has to be structured, not free text. Overlap between
// two ranges of the same day is validated in the application, not here: an exclusion constraint
// would need the `btree_gist` extension.
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

// The one, fixed id `issuer_identification`'s single row ever carries; every read and write is
// keyed by this exact constant rather than a lookup, since there is never a location (or any
// other scope) to look one up by.
export const ISSUER_IDENTIFICATION_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

// The taxpayer identification a user with `change_fiscal_configuration` keeps from the
// backoffice's fiscal configuration: the legal name, the gross-income tax registration and the
// start-of-activity date. One row for the whole business, never per location: `id` is pinned to
// `ISSUER_IDENTIFICATION_SINGLETON_ID` by its own default and CHECK, so a second row can never
// exist (an insert with any other id fails the CHECK, and one with this same id collides on the
// primary key). The migration seeds this one row with every field null, which `GET` reports as an
// incomplete identification until the first save; the authorized CUIT and tax status shown
// alongside it are deployment configuration, never stored here.
export const issuerIdentification = pgTable(
  "issuer_identification",
  {
    id: uuid("id").primaryKey().default(sql`'00000000-0000-0000-0000-000000000001'`),
    legalName: text("legal_name"),
    grossIncomeRegistration: text("gross_income_registration"),
    activityStartDate: date("activity_start_date"),
    // Optimistic concurrency for this row, the same shape `branch_settings.version` gives branch
    // settings rows.
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
    // Optimistic concurrency for a user row: starts at 1 and every update of that row increments
    // it. A caller sends back the version it last read; a mismatch means someone else changed the
    // row since (the user edit route checks it).
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    isAdministrator: boolean("is_administrator").notNull().default(false),
    // Optimistic concurrency for a role row, the same shape `users.version` gives user rows:
    // starts at 1 and every edit of that row increments it, so a save over a version someone else
    // already changed is rejected instead of silently overwriting their change.
    version: integer("version").notNull().default(1),
  },
  // The migration seeds the only Administrator role; no other row may ever carry the flag.
  (table) => [
    uniqueIndex("roles_single_administrator_key")
      .on(table.isAdministrator)
      .where(sql`${table.isAdministrator} = true`),
    // The Administrator role is fixed and never renamed, so its display name comes from the
    // backoffice's message catalog instead of being stored; every other role stores its own.
    check(
      "roles_name_unless_administrator",
      sql`(${table.isAdministrator} AND ${table.name} IS NULL) OR (NOT ${table.isAdministrator} AND ${table.name} IS NOT NULL)`,
    ),
    // Roles aren't scoped to a branch (the business runs a single one today), so this is a
    // global, case-insensitive uniqueness rule; Postgres treats every Administrator's null name
    // as distinct, so this never conflicts with `roles_single_administrator_key` above.
    uniqueIndex("roles_name_lower_key").on(sql`lower(${table.name})`),
  ],
);

// The permission catalog itself (`@purosur/contracts`) lives in code, not in this table: a key
// added there later reaches every role that explicitly grants it, without a migration. The
// Administrator role never gets rows here; it holds every permission implicitly through
// `roles.is_administrator`.
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
    // A user holds exactly one role.
    uniqueIndex("user_roles_user_id_key").on(table.userId),
  ],
);

// Catalog categories aren't scoped to a branch (the business runs a single one today), so this is
// a global, case-insensitive uniqueness rule, the same shape `roles.name` enforces.
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Optimistic concurrency for a category row, the same shape `roles.version` gives role rows.
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("categories_name_lower_key").on(sql`lower(${table.name})`)],
);

// A product's own name carries no uniqueness rule (unlike a category's), so only its sale unit is
// constrained here; the rest is enforced by application code the same way category validation is.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    saleUnit: text("sale_unit").notNull(),
    // Optimistic concurrency for a product row, the same shape `categories.version` gives category
    // rows.
    version: integer("version").notNull().default(1),
  },
  (table) => [check("products_sale_unit_check", sql`${table.saleUnit} in ('UNIT', 'KG')`)],
);

// Every product is active until #309 lands, so a barcode's uniqueness is global for now; #309
// narrows this index to active products only. `position` preserves the order barcodes were
// submitted in, since the primary key alone (a random UUID on `products`, not this table) can't.
export const productBarcodes = pgTable(
  "product_barcodes",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    code: text("code").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.position] }),
    uniqueIndex("product_barcodes_code_key").on(table.code),
  ],
);

// A product's price at a point in time, in cents per unit or per kilogram (`products.sale_unit`
// decides which). Append-only: changing a price always inserts a new row instead of touching an
// old one, so the full history of what a product cost at any moment is never lost (drafts/docs
// §6.1, D25). Enforced the same way `audit_log` enforces it (migration 0016): the migration
// revokes UPDATE, DELETE, and TRUNCATE on this table from `cloud_app`, so the database itself
// refuses a rewrite even from application code, not just by convention.
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
    // The target `price_reviews`' composite foreign key needs, so a review can only point at a
    // price of its own product and price list.
    unique("prices_id_product_id_price_list_id_key").on(
      table.id,
      table.productId,
      table.priceListId,
    ),
  ],
);

// One row per price review: setting a new price and confirming the current one without a change
// both insert a row here (drafts/docs §6.1, D27), pointing at the price it reviewed. A product's
// last-reviewed moment is the newest row here for it, never a column updated in place; append-only
// for the same reason and the same way `prices` above is (migration revokes UPDATE, DELETE, and
// TRUNCATE on this table from `cloud_app` too).
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

// Backs a product's internal barcode, allocated for a product with no manufacturer barcode
// (`internal-barcode-route.ts`): each value is a 12-digit EAN-13 body inside GS1's 20-29
// restricted-circulation prefix range, handed out once and never cycled back to the start once
// the range is exhausted.
export const internalBarcodeSequence = pgSequence("internal_barcode_sequence", {
  minValue: "200000000001",
  maxValue: "299999999999",
  startWith: "200000000001",
  increment: 1,
  cycle: false,
});

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

// Registered by the recovery redemption route; created now so that later work only ever inserts,
// never migrates.
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

// One live token per user at a time, enforced by `recovery_tokens_one_live_per_user`: an admitted
// request voids any previous row before inserting its own.
export const recoveryTokens = pgTable(
  "recovery_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    // When the admitted request behind this token was made, which can be well before `issued_at`
    // when its job is retried; a job never replaces a token issued for a newer request.
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    // Identifies that admitted request, so a retry of its job recognizes the token it issued.
    requestId: uuid("request_id").notNull().defaultRandom(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    // Set by the registration-options endpoint once WebAuthn registration starts for this token.
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
  // The registration-options and redeem endpoints share this one, keyed by source address only
  // (there is no destination address once the recovery token itself identifies the account).
  "redemption_source_address",
]);

// One row per admitted attempt, so each limit counts the last 60 minutes rather than a clock hour.
// Rows that leave the window are pruned as later attempts are recorded, which keeps the table
// bounded by the attempts admitted within one hour.
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

// One row per (kind, key hash, hour window), incremented synchronously on every rejected request
// or redemption attempt instead of writing an individual audit row per attempt. `key_hash` is the
// same SHA-256 the rate limiter already keys its destination-address counter by (for `request`)
// or the token hash already stored on `recovery_tokens` (for `registration_options`/`redeem`), so
// this upsert never needs to look an address or token up. A periodic graphile-worker cron task
// resolves each closed window to an account and turns it into one audit_log row, then deletes the
// rows it flushed; storage stays bounded to one row per key per open hour.
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

// A server-side session: the cookie carries only the raw, opaque id, this row carries only its
// SHA-256 hash (the same shape `recovery_tokens.token_hash` already stores its own secret in).
// `created_at` anchors the session's absolute expiry, `last_seen_at` its idle expiry, and
// `revoked_at` covers every way a session stops early (sign-out, a redeemed recovery link ending
// every open session of the account, or any future forced termination) without a separate events
// table. `passkey_authorized_at` is the session's own step-up window: set by a passkey sign-in (which opens the session) or by `POST
// /users/session/authorization`, it covers every sensitive action for 5 minutes from that moment,
// checked by `requirePasskeyAuthorization` and never itself consumed by a covered action. Redeeming
// a recovery link never sets it, since redemption never opens a session.
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
    passkeyAuthorizedAt: timestamp("passkey_authorized_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("sessions_session_id_hash_key").on(table.sessionIdHash)],
);

// Every sensitive backoffice action used to run its own per-action step-up (a `removal`,
// `user_creation`, `user_email_change`, `user_passkey_removal`, `role_creation`, or `role_edit`
// challenge, one per route); those all moved onto the shared `sessions.passkey_authorized_at`
// window instead (migration 0019), leaving only the two kinds a `passkey_challenges` row can still
// hold: `registration` (a new passkey's own registration challenge) and `session_authorization`
// (the assertion challenge behind `POST /users/session/authorization`, which refreshes that
// window).
export const passkeyManagementChallengeKind = pgEnum("passkey_management_challenge_kind", [
  "registration",
  "session_authorization",
]);

// One row per open session per pending-challenge kind: `registration` stores only
// `registration_challenge` (for a new credential; no reauthentication is asked for it, since
// registering a passkey is itself gated by the shared step-up guard), and `session_authorization`
// stores only `reauthentication_challenge` (an assertion against the account's existing passkeys,
// verified by `POST /users/session/authorization`). Keyed by `(session_id, kind)` rather than by
// challenge value the way `sign_in_challenges` is, because these options requests are never
// discoverable (an open session already identifies the account). The pair is unique per kind, not
// per session (`passkey_challenges_session_id_kind_key`), so a `session_authorization` challenge
// requested from another tab of the same session never overwrites an in-flight `registration`
// challenge (or the reverse): a fresh options request replaces only its own kind's pending row. A
// row is deleted once consumed (or once it has aged past its short lifetime).
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

// One row per short-lived WebAuthn authentication challenge `POST
// /users/session/authentication-options` issues: sign-in is discoverable (no username or token
// submitted first), so there is no existing per-user row to stash the challenge on the way
// `recovery_tokens.registration_challenge` does. The challenge value itself is the lookup key when
// `POST /users/session/authenticate` verifies an assertion, and the row is deleted once consumed
// (or once it has aged past its short lifetime).
export const signInChallenges = pgTable(
  "sign_in_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challenge: text("challenge").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sign_in_challenges_challenge_key").on(table.challenge)],
);

// One row per server-rejected sign-in attempt, keyed by source address only (never by account:
// without a password there's no "wrong password", and without a username there's no account to
// key a lockout on). Modeled on `recovery_rate_limit_attempts`'s own rolling-window shape (one row
// per event, pruned as later attempts land) rather than reused directly: that table counts every
// *admitted* recovery request to throttle volume, while this one counts only *rejected* sign-ins
// and, on reaching the threshold, imposes a fixed 15-minute block independent of the window's own
// decay (see `sign_in_lockouts` below).
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

// The fixed-duration block a source address earns once `sign_in_failures` reaches the rolling
// limit: one row per source address, holding only how long the block still runs.
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

// One row per admitted backoffice API request, counting every request made under an
// open session's cookie against both a per-session and a per-source-address rolling one-hour
// limit. Same rolling-window shape as `recovery_rate_limit_attempts`: one row per event, pruned as
// later requests are recorded, so a limit never doubles across a clock hour and storage stays
// bounded to the last hour's admitted requests.
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
