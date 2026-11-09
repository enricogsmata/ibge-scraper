// src/silver/pesquisasResultados.ts

import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverPesquisasResultados } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function transformPesquisasResultados() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/resultados/{localidades}';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const recordsToInsert: Array<typeof silverPesquisasResultados.$inferInsert> = [];

    for (const row of rawData) {
        const pesquisaCodigo = row.apiUrl.match(
            /\/pesquisas\/([^/?#]+)\/resultados(?:\/|$)/
        )?.[1];

        if (!pesquisaCodigo) {
            logger.warn(
                { apiUrl: row.apiUrl },
                'Não foi possível identificar o código da pesquisa.'
            );
            continue;
        }

        const payload = row.payload;

        const indicators = Array.isArray(payload) ? payload : [payload];

        for (const indicator of indicators) {
            if (!isRecord(indicator)) continue;

            const indicadorId = Number(indicator.id);

            if (!Number.isSafeInteger(indicadorId)) continue;

            if (!Array.isArray(indicator.res)) continue;

            for (const result of indicator.res) {
                if (!isRecord(result)) continue;

                const localidade = String(result.localidade ?? '').trim();

                if (!localidade || !isRecord(result.res)) continue;

                const valores = result.res;
                const notas = isRecord(result.notas) ? result.notas : {};

                for (const [periodo, valorBruto] of Object.entries(valores)) {
                    const ano = Number(periodo);

                    if (!Number.isInteger(ano) || ano <= 0) continue;

                    const valor = valorBruto === null || valorBruto === undefined || valorBruto === ''
                        ? null
                        : Number(valorBruto);

                    const notaBruta = notas[periodo];

                    recordsToInsert.push({
                        pesquisaCodigo,
                        indicadorId,
                        localidade,
                        ano,
                        valor: String(valor) ?? valor,
                        nota: notaBruta !== null && notaBruta !== undefined
                            ? String(notaBruta).trim() || null
                            : null,
                    });
                }
            }
        }
    }

    if (recordsToInsert.length === 0) {
        logger.warn({ endpointKey }, 'Nenhum resultado válido encontrado para transformar.');
        return;
    }

    const BATCH_SIZE = 1000;

    for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
        const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

        await normalizedDb
            .insert(silverPesquisasResultados)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    valor: sql`VALUES(valor)`,
                    nota: sql`VALUES(nota)`,
                    transformedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
    }

    logger.info(
        { total: recordsToInsert.length },
        'Fase Silver: resultados das pesquisas persistidos em silver_pesquisas_resultados.'
    );
}