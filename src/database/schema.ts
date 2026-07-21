import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    apiKey: varchar('api_key', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    apiKeyUnique: uniqueIndex('organizations_api_key_unique').on(table.apiKey),
  }),
);

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const restrictedTopics = pgTable('restricted_topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  knowledgeDocuments: many(knowledgeDocuments),
  restrictedTopics: many(restrictedTopics),
}));

export const knowledgeDocumentsRelations = relations(
  knowledgeDocuments,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [knowledgeDocuments.organizationId],
      references: [organizations.id],
    }),
  }),
);

export const restrictedTopicsRelations = relations(restrictedTopics, ({ one }) => ({
  organization: one(organizations, {
    fields: [restrictedTopics.organizationId],
    references: [organizations.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type RestrictedTopic = typeof restrictedTopics.$inferSelect;
