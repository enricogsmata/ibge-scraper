import { ModuleApiData, Modules } from "./schema.js";

export type TModule = typeof Modules.$inferSelect;

export type TModuleApiData = typeof ModuleApiData.$inferSelect;
export type TModuleApiDataRaw = typeof ModuleApiData.$inferInsert;