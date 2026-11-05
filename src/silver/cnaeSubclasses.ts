// src/silver/cnaeSubclasses.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverCnaeSubclasses } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformCnaeSubclasses() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v2/cnae/subclasses';

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

            const classe = item.classe || {};
            const grupo = classe.grupo || {};
            const divisao = grupo.divisao || {};
            const secao = divisao.secao || {};

            recordsToInsert.push({
                id: String(item.id).trim(),
                descricao: String(item.descricao).trim(),
                classeId: classe.id ? String(classe.id).trim() : null,
                classeDescricao: classe.descricao ? String(classe.descricao).trim() : null,
                grupoId: grupo.id ? String(grupo.id).trim() : null,
                grupoDescricao: grupo.descricao ? String(grupo.descricao).trim() : null,
                divisaoId: divisao.id ? String(divisao.id).trim() : null,
                divisaoDescricao: divisao.descricao ? String(divisao.descricao).trim() : null,
                secaoId: secao.id ? String(secao.id).trim() : null,
                secaoDescricao: secao.descricao ? String(secao.descricao).trim() : null,
                atividades: Array.isArray(item.atividades) ? item.atividades : [],
                observacoes: Array.isArray(item.observacoes) ? item.observacoes : [],
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverCnaeSubclasses)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        descricao: sql`VALUES(descricao)`,
                        classeId: sql`VALUES(classe_id)`,
                        classeDescricao: sql`VALUES(classe_descricao)`,
                        grupoId: sql`VALUES(grupo_id)`,
                        grupoDescricao: sql`VALUES(grupo_descricao)`,
                        divisaoId: sql`VALUES(divisao_id)`,
                        divisaoDescricao: sql`VALUES(divisao_descricao)`,
                        secaoId: sql`VALUES(secao_id)`,
                        secaoDescricao: sql`VALUES(secao_descricao)`,
                        atividades: sql`VALUES(atividades)`,
                        observacoes: sql`VALUES(observacoes)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_cnae_subclasses.`);
    }
}