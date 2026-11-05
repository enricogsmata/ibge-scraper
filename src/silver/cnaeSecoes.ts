// src/silver/cnaeSecoes.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverCnaeSecoes } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformCnaeSecoes() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v2/cnae/secoes';

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
            if (!item.id || !item.descricao) continue;

            recordsToInsert.push({
                id: String(item.id).trim(),
                descricao: String(item.descricao).trim(),
                observacoes: Array.isArray(item.observacoes) ? item.observacoes : [],
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverCnaeSecoes)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        descricao: sql`VALUES(descricao)`,
                        observacoes: sql`VALUES(observacoes)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_cnae_secoes.`);
    }
}