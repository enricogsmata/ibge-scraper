// src/silver/bdgSituacao.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverBdgSituacao } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformBdgSituacao() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/bdg/situacao';

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
            if (!item.codigoSituacao || !item.descricaoSituacao) continue;

            recordsToInsert.push({
                codigoSituacao: String(item.codigoSituacao).trim(),
                descricaoSituacao: String(item.descricaoSituacao).trim(),
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;
        
        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
            
            await normalizedDb.insert(silverBdgSituacao)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        descricaoSituacao: sql`VALUES(descricao_situacao)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_bdg_situacao.`);
    }
}