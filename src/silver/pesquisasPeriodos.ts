// src/silver/pesquisasPeriodos.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverPesquisasPeriodos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

interface RawPeriodoItem {
    periodo?: string | number | null;
    versao?: number | null;
    publicacao?: string | null;
    fonte?: unknown;
    nota?: unknown;
}

export async function transformPesquisasPeriodos() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/periodos';
    const endpointPattern = 'https://servicodados.ibge.gov.br/api/v1/pesquisas/%/periodos';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { or, eq, like }) => or(
            eq(row.endpointKey, endpointKey),
            like(row.endpointKey, endpointPattern),
            like(row.apiUrl, endpointPattern)
        ),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar em pesquisasPeriodos.');
        return;
    }

    const recordsMap = new Map<string, typeof silverPesquisasPeriodos.$inferInsert>();

    for (const row of rawData) {
        const match = row.apiUrl.match(/pesquisas\/(\d+)\/periodos/i);
        if (!match) continue;

        const pesquisaId = parseInt(match[1]!, 10);
        if (isNaN(pesquisaId)) continue;

        const payload = row.payload as unknown;
        if (!payload) continue;

        const items: RawPeriodoItem[] = Array.isArray(payload)
            ? payload
            : typeof payload === 'object'
                ? [payload as RawPeriodoItem]
                : [];

        for (const item of items) {
            if (!item || item.periodo === undefined || item.periodo === null) continue;

            const periodo = String(item.periodo).trim();
            const versao = typeof item.versao === 'number' ? item.versao : null;
            const dedupeKey = `${pesquisaId}_${periodo}_${versao}`;

            recordsMap.set(dedupeKey, {
                pesquisaId,
                periodo,
                versao,
                publicacao: item.publicacao ? String(item.publicacao).trim() : null,
                fonte: Array.isArray(item.fonte) ? item.fonte.map(String) : null,
                nota: Array.isArray(item.nota) ? item.nota.map(String) : null,
            });
        }
    }

    const recordsToInsert = Array.from(recordsMap.values());

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverPesquisasPeriodos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        publicacao: sql`VALUES(publicacao)`,
                        fonte: sql`VALUES(fonte)`,
                        nota: sql`VALUES(nota)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
        }

        logger.info(`Fase 2 Silver: ${recordsToInsert.length} registros persistidos em silver_pesquisas_periodos.`);
    }
}