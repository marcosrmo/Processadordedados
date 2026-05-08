import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ===========================
   USERS (AUTH)
=========================== */

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  blocked: boolean("blocked").notNull().default(false),
  blockedAt: timestamp("blocked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  role: true,
  passwordHash: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

/* ===========================
   AUDIT LOGS
=========================== */

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId:       text("actor_id"),
  actorUsername: text("actor_username").notNull(),
  action:        text("action").notNull(),
  targetId:      text("target_id"),
  targetUsername:text("target_username"),
  details:       text("details"),
  ip:            text("ip"),
  userAgent:     text("user_agent"),
  success:       boolean("success").notNull().default(true),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

/* ===========================
   UPLOADED FILES
=========================== */

export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalName: text("original_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("pending"),
  totalSheets: integer("total_sheets"),
  totalRows: integer("total_rows"),
  totalColumns: integer("total_columns"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ===========================
   SHEET METADATA
=========================== */

export const sheetMetadata = pgTable("sheet_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id")
    .notNull()
    .references(() => uploadedFiles.id, { onDelete: "cascade" }),
  sheetName: text("sheet_name").notNull(),
  sheetIndex: integer("sheet_index").notNull(),
  rowCount: integer("row_count").notNull(),
  columnCount: integer("column_count").notNull(),
  columnNames: jsonb("column_names").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ===========================
   COLUMN MAPPINGS
=========================== */

export const columnMappings = pgTable("column_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sheetId: varchar("sheet_id")
    .notNull()
    .references(() => sheetMetadata.id, { onDelete: "cascade" }),
  originalColumnName: text("original_column_name").notNull(),
  columnIndex: integer("column_index").notNull(),
  mappedFieldName: text("mapped_field_name"),
  detectionMethod: text("detection_method"),
  confidence: integer("confidence").notNull().default(0),
  sampleValues: jsonb("sample_values").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ===========================
   CONSOLIDATED RECORDS
=========================== */

export const consolidatedRecords = pgTable("consolidated_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Personal
  name: text("name"),
  cpf: text("cpf"),
  cnpj: text("cnpj"),
  phone: text("phone"),
  phone2: text("phone2"),
  phone3: text("phone3"),
  phone4: text("phone4"),
  ddd: text("ddd"),       // ← NOVO: DDD extraído de coluna separada
  email: text("email"),

  // Address
  address: text("address"),
  number: text("number"),
  complement: text("complement"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  state: text("state"),
  cep: text("cep"),

  // Commercial
  ticketAverage: text("ticket_average"),
  purchaseDate: text("purchase_date"),
  produto: text("produto"),
  quantidade: text("quantidade"),

  // Campo bruto
  rawText: text("raw_text"),

  // Metadata
  status: text("status").notNull().default("valid"),
  confidence: integer("confidence").notNull().default(0),
  sourceFiles: jsonb("source_files").$type<string[]>().notNull(),
  mergedFrom: jsonb("merged_from").$type<string[]>(),

  // Soft-delete
  deletedAt: timestamp("deleted_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ===========================
   ZOD SCHEMAS
=========================== */

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  createdAt: true,
  totalSheets: true,
  totalRows: true,
  totalColumns: true,
});

export const insertSheetMetadataSchema = createInsertSchema(sheetMetadata).omit({
  id: true,
  createdAt: true,
});

export const insertColumnMappingSchema = createInsertSchema(columnMappings).omit({
  id: true,
  createdAt: true,
});

export const insertConsolidatedRecordSchema =
  createInsertSchema(consolidatedRecords).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  });

/* ===========================
   TYPES
=========================== */

export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;

export type SheetMetadata = typeof sheetMetadata.$inferSelect;
export type InsertSheetMetadata = z.infer<typeof insertSheetMetadataSchema>;

export type ColumnMapping = typeof columnMappings.$inferSelect;
export type InsertColumnMapping = z.infer<typeof insertColumnMappingSchema>;

export type ConsolidatedRecord = typeof consolidatedRecords.$inferSelect;
export type InsertConsolidatedRecord =
  z.infer<typeof insertConsolidatedRecordSchema>;
