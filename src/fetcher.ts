import { TModuleApiDataRaw } from "./db/raw/types.js";
import { logger } from "./logger.js";

const baseLogger = logger.forModule(import.meta.url);

export async function fetchModuleEndpoints(apiDataList: TModuleApiDataRaw[]) {
    const log = baseLogger.forMethod('fetchModuleEndpoints');
    log.info('> Iniciando fetch nos endpoints disponíveis... <');

    for (const apiData of apiDataList) {
        
    }
}