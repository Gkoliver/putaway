import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: text("user_id").notNull(),
    role: text("role").notNull(), // owner | member
  },
  (t) => ({
    uniq: uniqueIndex("household_members_unique").on(t.householdId, t.userId),
  }),
);

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
  },
  (t) => ({
    uniqName: uniqueIndex("items_household_name").on(t.householdId, sql`lower(${t.name})`),
  }),
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqSibling: uniqueIndex("locations_sibling_name")
      .on(t.householdId, sql`coalesce(${t.parentId}, ${sql.raw(`'${ZERO_UUID}'::uuid`)})`, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
  }),
);

export const stockLots = pgTable(
  "stock_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull(),
    putAwayCount: integer("put_away_count").notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("stock_lots_unique").on(t.householdId, t.itemId, t.locationId),
  }),
);

export const commandReceipts = pgTable(
  "command_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: text("user_id").notNull(),
    clientCommandId: text("client_command_id").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("command_receipts_unique").on(
      t.householdId,
      t.userId,
      t.clientCommandId,
    ),
  }),
);
