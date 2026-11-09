// src/silver/publicacoes.ts
import { sql } from 'drizzle-orm';
import { rawDb } from '../db/raw/connection.js';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverProdutos, silverPublicacoes } from '../db/normalized/schema.js';
import { logger } from '../logger.js';

interface RawPublicacaoItem {
    chave?: number | string | null;
    id?: number | string | null;
    titulo?: string | null;
    autor?: string | null;
    ano?: string | null;
    link?: string | null;
    classificacao?: string | null;
    nomenclatura?: string | null;
}

interface RawPublicacoesPayload {
    items?: RawPublicacaoItem[];
}

const parseString = (val: unknown): string | null => {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str.length > 0 ? str : null;
};

export async function transformPublicacoes() {
    logger.info("Transformando dados: Publicações por Produto (Silver)");

    const validProdutos = await normalizedDb
        .select({ id: silverProdutos.id })
        .from(silverProdutos);

    const validProdutoIds = new Set(validProdutos.map((p) => p.id));
    if (validProdutoIds.size === 0) {
        logger.warn("Nenhum produto encontrado em silverProdutos para associar publicações.");
        return;
    }

    const records = await rawDb.query.RawRootResponses.findMany({
        where: (row, { like }) => like(row.apiUrl, '%/publicacoes/%'),
    });

    const publicacoesMap = new Map<string, typeof silverPublicacoes.$inferInsert>();

    for (const record of records) {
        const match = record.apiUrl.match(/\/publicacoes\/(\d+)/);
        if (!match || !match[1]) continue;

        const produtoId = Number(match[1]);
        if (!validProdutoIds.has(produtoId)) continue;

        const payload = record.payload as RawPublicacoesPayload | RawPublicacaoItem[] | null;
        if (!payload) continue;

        const items = Array.isArray(payload) ? payload : (payload.items ?? []);
        if (!Array.isArray(items) || items.length === 0) continue;

        for (const item of items) {
            if (item.chave === undefined || item.chave === null || item.chave === '') continue;
            const chave = Number(item.chave);
            if (Number.isNaN(chave)) continue;

            const titulo = parseString(item.titulo);
            if (!titulo) continue;

            const compositeKey = `${produtoId}-${chave}`;
            publicacoesMap.set(compositeKey, {
                produtoId,
                chave,
                publicacaoId: item.id !== undefined && item.id !== null && item.id !== '' ? Number(item.id) : null,
                titulo,
                autor: parseString(item.autor),
                ano: parseString(item.ano),
                link: parseString(item.link),
                classificacao: parseString(item.classificacao),
                nomenclatura: parseString(item.nomenclatura),
            });
        }
    }

    const uniqueRows = Array.from(publicacoesMap.values());
    if (uniqueRows.length === 0) return;

    const BATCH_SIZE = 100;
    for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
        const batch = uniqueRows.slice(i, i + BATCH_SIZE);
        await normalizedDb.insert(silverPublicacoes)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    publicacaoId: sql`VALUES(publicacao_id)`,
                    titulo: sql`VALUES(titulo)`,
                    autor: sql`VALUES(autor)`,
                    ano: sql`VALUES(ano)`,
                    link: sql`VALUES(link)`,
                    classificacao: sql`VALUES(classificacao)`,
                    nomenclatura: sql`VALUES(nomenclatura)`,
                    transformedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
    }
}