// src/silver/pesquisasGerais.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverPesquisas, silverPesquisasPeriodos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformPesquisasGerais() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/pesquisas';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const pesquisasToInsert = [];
    const periodosToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;

        if (!Array.isArray(payload)) continue;

        for (const item of payload as any[]) {
            if (item.id === undefined || item.id === null || !item.nome) continue;

            const pesquisaId = Number(item.id);

            pesquisasToInsert.push({
                id: pesquisaId,
                nome: String(item.nome).trim(),
                descricao: item.descricao ? String(item.descricao).trim() : null,
                observacao: item.observacao ? String(item.observacao).trim() : null,
                contexto: item.contexto ? String(item.contexto).trim() : null,
            });

            if (Array.isArray(item.periodos)) {
                for (const per of item.periodos) {
                    if (!per.periodo) continue;

                    periodosToInsert.push({
                        pesquisaId,
                        periodo: String(per.periodo).trim(),
                        versao: per.versao !== undefined && per.versao !== null ? Number(per.versao) : null,
                        publicacao: per.publicacao ? String(per.publicacao).trim() : null,
                        fonte: Array.isArray(per.fonte) ? per.fonte : [],
                        nota: Array.isArray(per.nota) ? per.nota : [],
                    });
                }
            }
        }
    }

    if (pesquisasToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < pesquisasToInsert.length; i += BATCH_SIZE) {
            const batch = pesquisasToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverPesquisas)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        descricao: sql`VALUES(descricao)`,
                        observacao: sql`VALUES(observacao)`,
                        contexto: sql`VALUES(contexto)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${pesquisasToInsert.length} registros persistidos em silver_pesquisas.`);
    }

    if (periodosToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < periodosToInsert.length; i += BATCH_SIZE) {
            const batch = periodosToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverPesquisasPeriodos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        publicacao: sql`VALUES(publicacao)`,
                        fonte: sql`VALUES(fonte)`,
                        nota: sql`VALUES(nota)`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${periodosToInsert.length} registros persistidos em silver_pesquisas_periodos.`);
    }
}