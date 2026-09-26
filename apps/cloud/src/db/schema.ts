import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// The business runs a single branch today; every user belongs to it. The migration seeds this
// table's one row (like the Administrator role below) and backfills every existing user onto it.
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
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

// Catalog categories form a tree (#332): `parent_id` is nullable and self-referencing, and a null
// parent means a top-level category, exactly like every category before nesting existed. Names
// are unique among siblings, case-insensitively, rather than globally: two top-level categories
// (both with a null parent) still collide with each other, which `NULLS NOT DISTINCT` on the
// index below is what makes happen, since Postgres otherwise treats every null as distinct from
// every other null. `parentId` has no `onDelete` because, like every other row referenced by a
// category (`products.categoryId`), categories are never deleted.
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
    // Optimistic concurrency for a category row, the same shape `roles.version` gives role rows.
    version: integer("version").notNull().default(1),
  },
  (table) => [
    // `NULLS NOT DISTINCT` has no fluent builder for an index in this drizzle-orm version (only
    // `unique()`'s table-level constraint builder has one, and that builder can't take the
    // `lower(name)` expression this index needs), so the migration drizzle-kit generates for this
    // is hand-edited to add it, the same way 0026_deactivate_products.sql hand-edits generated SQL
    // for a trigger drizzle-kit has no declarative support for.
    uniqueIndex("categories_name_lower_key").on(table.parentId, sql`lower(${table.name})`),
    index("categories_parent_id_idx").on(table.parentId),
    check("categories_parent_is_not_itself", sql`${table.parentId} <> ${table.id}`),
  ],
);

// A product's own name carries no uniqueness rule (unlike a category's), so only its sale unit is
// constrained here; the rest is enforced by application code the same way category validation is.
// `active` (#309) is one-way: a product is never deleted (the migration also rejects any `DELETE`
// on this table outright), only deactivated, so its historical sale lines keep referencing it.
// `netContentQuantity`/`netContentUnit` (#334) are purely informational (never read by pricing or
// stock) and optional: both null together, for a product with no fixed content, or both set
// together, never one without the other — application code (`product-validation.ts`) already
// guarantees this before either route ever writes, so the checks below are only the database's own
// backstop.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    saleUnit: text("sale_unit").notNull(),
    active: boolean("active").notNull().default(true),
    netContentQuantity: numeric("net_content_quantity", {
      precision: 10,
      scale: 3,
      mode: "number",
    }),
    netContentUnit: text("net_content_unit"),
    // Optimistic concurrency for a product row, the same shape `categories.version` gives category
    // rows.
    version: integer("version").notNull().default(1),
  },
  (table) => [
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

// `active` (#309) mirrors its own product's `products.active`, kept in step in the same
// transaction that deactivates the product: a partial unique index can't read another table's
// column, so a barcode's uniqueness (below) is scoped to active products by carrying the flag
// here instead. A deactivated product's barcode is left free for a different, active product to
// take. `position` preserves the order barcodes were submitted in, since the primary key alone (a
// random UUID on `products`, not this table) can't.
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

// A backoffice register: created from the "Nueva caja" modal by a holder of
// `enroll_register_devices`, belonging to the branch of the session that created it. Its name must
// be unique within its own branch (case-insensitive, trimmed), the same shape `categories.name`
// enforces globally; points of sale and fiscal address are configured elsewhere, not here.
export const registers = pgTable(
  "registers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("registers_location_id_name_lower_key").on(
      table.locationId,
      sql`lower(${table.name})`,
    ),
  ],
);

// The single pending enrollment code for a register: one row per register (`register_id` is both
// primary and foreign key), so emitting a new code overwrites the previous pending one instead of
// accumulating a history. Only `code_hash` (SHA-256, the same shape `sessions.session_id_hash`
// stores its own secret in) is ever stored, never the raw code. `redeemed_at` and `failed_attempts`
// exist for #341 (redemption) to enforce single use and the 5-failed-attempt burn; this migration
// only adds the columns that issue needs, without implementing redemption itself.
export const registerEnrollmentCodes = pgTable("register_enrollment_codes", {
  registerId: uuid("register_id")
    .primaryKey()
    .references(() => registers.id),
  codeHash: text("code_hash").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
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
