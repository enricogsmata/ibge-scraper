// src/silver/rmpgSensores.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverRmpgSensores } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformRmpgSensores() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/rmpg/sensores';

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
            if (!item.codigoSensor || !item.descricaoSensor) continue;

            recordsToInsert.push({
                codigoSensor: String(item.codigoSensor).trim(),
                nomeSensor: item.nomeSensor ? String(item.nomeSensor).trim() : null,
                descricaoSensor: String(item.descricaoSensor).trim(),
                unidadeMedida: item.unidadeMedida ? String(item.unidadeMedida).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverRmpgSensores)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nomeSensor: sql`VALUES(nome_sensor)`,
                        descricaoSensor: sql`VALUES(descricao_sensor)`,
                        unidadeMedida: sql`VALUES(unidade_medida)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_rmpg_sensores.`);
    }
}