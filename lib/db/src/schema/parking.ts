import { pgTable, serial, text, timestamp, integer, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const parkingStatusEnum = pgEnum("parking_status", [
  "active",
  "pending_payment",
  "paid",
  "completed",
]);

export const parkingRecordsTable = pgTable("parking_records", {
  id: serial("id").primaryKey(),
  plateNumber: text("plate_number").notNull(),
  entryTime: timestamp("entry_time", { withTimezone: true }).notNull().defaultNow(),
  exitTime: timestamp("exit_time", { withTimezone: true }),
  fee: real("fee"),
  durationMinutes: integer("duration_minutes"),
  status: parkingStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParkingRecordSchema = createInsertSchema(parkingRecordsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertParkingRecord = z.infer<typeof insertParkingRecordSchema>;
export type ParkingRecord = typeof parkingRecordsTable.$inferSelect;

export const tariffSettingsTable = pgTable("tariff_settings", {
  id: serial("id").primaryKey(),
  ratePerHour: real("rate_per_hour").notNull().default(2000),
  minimumFee: real("minimum_fee").notNull().default(500),
  freeMinutes: integer("free_minutes").notNull().default(10),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parkingCapacityTable = pgTable("parking_capacity", {
  id: serial("id").primaryKey(),
  totalSpaces: integer("total_spaces").notNull().default(50),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
