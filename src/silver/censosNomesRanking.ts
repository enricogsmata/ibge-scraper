// src/silver/censosNomesRanking.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverCensosNomesRanking } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformCensosNomesRanking() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v2/censos/nomes/ranking';

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

        const items = Array.isArray(payload) ? payload : [payload];

        for (const item of items as any[]) {
            if (!item || !Array.isArray(item.res)) continue;

            const localidade = item.localidade ? String(item.localidade).trim() : 'BR';
            const sexo = item.sexo ? String(item.sexo).trim() : null;

            for (const rankItem of item.res) {
                if (!rankItem.nome || rankItem.ranking === undefined || rankItem.ranking === null) continue;

                recordsToInsert.push({
                    localidade,
                    sexo,
                    ranking: Number(rankItem.ranking),
                    nome: String(rankItem.nome).trim(),
                    frequencia: Number(rankItem.frequencia ?? 0),
                });
            }
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverCensosNomesRanking)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        frequencia: sql`VALUES(frequencia)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_censos_nomes_ranking.`);
    }
}