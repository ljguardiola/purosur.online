import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
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
// table.
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
  },
  (table) => [uniqueIndex("sessions_session_id_hash_key").on(table.sessionIdHash)],
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
