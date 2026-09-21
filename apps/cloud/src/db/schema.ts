import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
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
    name: text("name").notNull(),
    isAdministrator: boolean("is_administrator").notNull().default(false),
  },
  // At most one role can carry the Administrator flag: the migration seeds exactly one and no
  // further row may ever set it, so the constraint enforces what the design doc promises.
  (table) => [
    uniqueIndex("roles_single_administrator_key")
      .on(table.isAdministrator)
      .where(sql`${table.isAdministrator} = true`),
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
