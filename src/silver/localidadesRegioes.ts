// src/silver/localidadesRegioes.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverLocalidadesRegioes } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformLocalidadesRegioes() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/localidades/regioes';

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
            if (!item.id || !item.nome) continue;

            recordsToInsert.push({
                id: Number(item.id),
                nome: String(item.nome).trim(),
                sigla: String(item.sigla).trim(),
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverLocalidadesRegioes)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        sigla: sql`VALUES(sigla)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_localidades_regioes.`);
    }
}