import { mysqlTable, serial, text, varchar, int, json, timestamp, bigint } from 'drizzle-orm/mysql-core';
import { relations, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// Tabela principal: Module
export const Modules = mysqlTable('module', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    link: text('link'),
});

// Tipagem dos parâmetros da API
export type ApiParam = {
    name: string;
    description: string;
    format: string;
};

// Tabela relacionada: ModuleApiData
export const ModuleApiData = mysqlTable('module_api_data', {
    id: serial('id').primaryKey(),
    moduleId: bigint('module_id', { mode: 'number', unsigned: true })
        .notNull()
        .references(() => Modules.id, { onDelete: 'cascade' }),
    apiUrl: text('api_url').notNull(),
    // O MySQL suporta colunas do tipo JSON diretamente:
    params: json('params').$type<ApiParam[]>().notNull(),
});

// Definição das relações (útil para consultas com db.query)
export const ModulesRelations = relations(Modules, ({ many }) => ({
    apiData: many(ModuleApiData),
}));

export const ModuleApiDataRelations = relations(ModuleApiData, ({ one }) => ({
    module: one(Modules, {
        fields: [ModuleApiData.moduleId],
        references: [Modules.id],
    }),
}));

export const Logs = mysqlTable('logs', {
    message: text(),
    level: text(),
    module: text(),
    context: text(),
    timestamp: timestamp(),
});