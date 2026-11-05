// src/silver/bngbCategoria.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverBngbCategoria } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformBngbCategoria() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/bngb/listacategoria';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const recordsToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;
        
        if (!Array.isArray(payload)) continue;

        for (const item of payload as any[]) {
            if (!item.categoria) continue;

            recordsToInsert.push({
                categoria: String(item.categoria).trim(),
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;
        
        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
            
            await normalizedDb.insert(silverBngbCategoria)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_bngb_categoria.`);
    }
}