import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    email: text("email").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (table) => [uniqueIndex("users_email_key").on(table.email)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    isAdministrator: boolean("is_administrator").notNull().default(false),
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
  ],
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
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
});

// Registered by T2's redeem endpoint; created now so that work only ever inserts, never migrates.
export const passkeys = pgTable(
  "passkeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    credentialId: text("credential_id").notNull(),
    // Base64url-encoded WebAuthn COSE public key, the same at-rest representation the device
    // token already uses for opaque high-entropy values (§11 "El token de dispositivo...").
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull(),
    transports: jsonb("transports").$type<string[]>(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("passkeys_credential_id_key").on(table.credentialId)],
);

// One live token per user at a time: an admitted request voids any previous row before inserting
// its own (§9.7 "Cada pedido admitido emite un enlace nuevo y deja sin efecto el anterior").
export const recoveryTokens = pgTable(
  "recovery_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    // Set by T2's registration-options endpoint once WebAuthn registration starts for this token.
    registrationChallenge: text("registration_challenge"),
  },
  (table) => [uniqueIndex("recovery_tokens_token_hash_key").on(table.tokenHash)],
);

export const recoveryRateLimitKeyKind = pgEnum("recovery_rate_limit_key_kind", [
  "destination_address",
  "source_address",
  // T2's registration-options and redeem endpoints share this one, keyed by source address only
  // (there is no destination address once the recovery token itself identifies the account).
  "redemption_source_address",
]);

// A fixed hourly window, keyed by (kind, value, window start): the request handler upserts and
// increments the row for the current hour instead of a sliding window (§11, issue #167).
export const recoveryRateLimitCounters = pgTable(
  "recovery_rate_limit_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyKind: recoveryRateLimitKeyKind("key_kind").notNull(),
    keyValue: text("key_value").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("recovery_rate_limit_counters_key").on(
      table.keyKind,
      table.keyValue,
      table.windowStart,
    ),
  ],
);
