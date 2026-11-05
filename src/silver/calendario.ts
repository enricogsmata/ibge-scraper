// src/silver/calendario.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverCalendario } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformCalendario() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v3/calendario/';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const recordsToInsert = [];

    for (const row of rawData) {
        const payload = row.payload as any;

        if (!payload) continue;

        const items = Array.isArray(payload)
            ? payload
            : Array.isArray(payload.items)
              ? payload.items
              : [];

        for (const item of items) {
            if (item.id === undefined || item.id === null || !item.titulo) continue;

            recordsToInsert.push({
                id: Number(item.id),
                tipoId: item.tipo_id !== undefined && item.tipo_id !== null ? Number(item.tipo_id) : null,
                tipo: item.tipo ? String(item.tipo).trim() : null,
                titulo: String(item.titulo).trim(),
                link: item.link ? String(item.link).trim() : null,
                descricao: item.descricao ? String(item.descricao).trim() : null,
                produtoId: item.produto_id !== undefined && item.produto_id !== null ? Number(item.produto_id) : null,
                nomeProduto: item.nome_produto ? String(item.nome_produto).trim() : null,
                aliasProduto: item.alias_produto ? String(item.alias_produto).trim() : null,
                descricaoProduto: item.descricao_produto ? String(item.descricao_produto).trim() : null,
                dataDivulgacao: item.data_divulgacao ? String(item.data_divulgacao).trim() : null,
                anoRefInicio: item.ano_referencia_inicio !== undefined && item.ano_referencia_inicio !== null ? Number(item.ano_referencia_inicio) : null,
                mesRefInicio: item.mes_referencia_inicio !== undefined && item.mes_referencia_inicio !== null ? Number(item.mes_referencia_inicio) : null,
                anoRefFim: item.ano_referencia_fim !== undefined && item.ano_referencia_fim !== null ? Number(item.ano_referencia_fim) : null,
                mesRefFim: item.mes_referencia_fim !== undefined && item.mes_referencia_fim !== null ? Number(item.mes_referencia_fim) : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverCalendario)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        tipoId: sql`VALUES(tipo_id)`,
                        tipo: sql`VALUES(tipo)`,
                        titulo: sql`VALUES(titulo)`,
                        link: sql`VALUES(link)`,
                        descricao: sql`VALUES(descricao)`,
                        produtoId: sql`VALUES(produto_id)`,
                        nomeProduto: sql`VALUES(nome_produto)`,
                        aliasProduto: sql`VALUES(alias_produto)`,
                        descricaoProduto: sql`VALUES(descricao_produto)`,
                        dataDivulgacao: sql`VALUES(data_divulgacao)`,
                        anoRefInicio: sql`VALUES(ano_ref_inicio)`,
                        mesRefInicio: sql`VALUES(mes_ref_inicio)`,
                        anoRefFim: sql`VALUES(ano_ref_fim)`,
                        mesRefFim: sql`VALUES(mes_ref_fim)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_calendario.`);
    }
}