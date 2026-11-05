// src/silver/agregados.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverAgregados, silverAgregadosGrupos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformAgregados() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v3/agregados';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const gruposToInsert = [];
    const agregadosToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;

        if (!Array.isArray(payload)) continue;

        for (const item of payload as any[]) {
            if (!item.id || !item.nome) continue;

            const grupoId = String(item.id).trim();

            gruposToInsert.push({
                id: grupoId,
                nome: String(item.nome).trim(),
            });

            if (Array.isArray(item.agregados)) {
                for (const agr of item.agregados) {
                    if (!agr.id || !agr.nome) continue;

                    agregadosToInsert.push({
                        id: String(agr.id).trim(),
                        grupoId,
                        nome: String(agr.nome).trim(),
                    });
                }
            }
        }
    }

    if (gruposToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < gruposToInsert.length; i += BATCH_SIZE) {
            const batch = gruposToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverAgregadosGrupos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }
        logger.info(`Fase 1 Silver: ${gruposToInsert.length} registros persistidos em silver_agregados_grupos.`);
    }

    if (agregadosToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < agregadosToInsert.length; i += BATCH_SIZE) {
            const batch = agregadosToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverAgregados)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        grupoId: sql`VALUES(grupo_id)`,
                        nome: sql`VALUES(nome)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }
        logger.info(`Fase 1 Silver: ${agregadosToInsert.length} registros persistidos em silver_agregados.`);
    }
}