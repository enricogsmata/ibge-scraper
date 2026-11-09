// src/silver/metadadosPesquisasPeriodos.ts
import { sql } from 'drizzle-orm';
import { rawDb } from '../db/raw/connection.js';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverMetadadosPesquisasPeriodos } from '../db/normalized/schema.js';
import { logger } from '../logger.js';

interface RawPeriodoItem {
    ano: number;
    mes: number;
    ordem_periodo: number;
    nome_ocorrencia: string | null;
    nome_ocorrencia_ingles: string | null;
}

export async function transformMetadadosPesquisasPeriodos() {
    logger.info("Transformando dados: Metadados Pesquisas Períodos (Silver)");

    const records = await rawDb.query.RawRootResponses.findMany({
        where: (row, { like }) => like(row.apiUrl, '%/metadados/pesquisas/%/periodos%'),
    });

    for (const record of records) {
        const match = record.apiUrl.match(/\/metadados\/pesquisas\/([^/?#]+)\/periodos/);
        if (!match || !match[1]) continue;

        const pesquisaCodigo = match[1];
        const payload = record.payload as RawPeriodoItem[] | RawPeriodoItem | null;
        if (!payload) continue;

        const items = Array.isArray(payload) ? payload : [payload];
        if (items.length === 0) continue;

        const values = items.map((item) => ({
            pesquisaCodigo,
            ano: Number(item.ano),
            mes: Number(item.mes),
            ordemPeriodo: Number(item.ordem_periodo ?? 0),
            nomeOcorrencia: item.nome_ocorrencia ?? null,
            nomeOcorrenciaIngles: item.nome_ocorrencia_ingles ?? null,
        }));

        const BATCH_SIZE = 100;
        for (let i = 0; i < values.length; i += BATCH_SIZE) {
            const batch = values.slice(i, i + BATCH_SIZE);
            await normalizedDb.insert(silverMetadadosPesquisasPeriodos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nomeOcorrencia: sql`VALUES(nome_ocorrencia)`,
                        nomeOcorrenciaIngles: sql`VALUES(nome_ocorrencia_ingles)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
        }
    }
}