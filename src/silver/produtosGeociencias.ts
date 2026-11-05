// src/silver/produtosGeociencias.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverProdutos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformProdutosGeociencias() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/produtos/geociencias';

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
            if (item.id === undefined || item.id === null || !item.titulo) continue;

            recordsToInsert.push({
                id: Number(item.id),
                path: item.path ? String(item.path).trim() : null,
                tipo: item.tipo ? String(item.tipo).trim() : null,
                alias: item.alias ? String(item.alias).trim() : null,
                catId: item.catId !== undefined && item.catId !== null ? Number(item.catId) : null,
                sigla: item.sigla ? String(item.sigla).trim() : null,
                titulo: String(item.titulo).trim(),
                catTitle: item.catTitle ? String(item.catTitle).trim() : null,
                parentCatId: item.parentCatId !== undefined && item.parentCatId !== null ? Number(item.parentCatId) : null,
                parentCatTitle: item.parentCatTitle ? String(item.parentCatTitle).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverProdutos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        path: sql`VALUES(path)`,
                        tipo: sql`VALUES(tipo)`,
                        alias: sql`VALUES(alias)`,
                        catId: sql`VALUES(cat_id)`,
                        sigla: sql`VALUES(sigla)`,
                        titulo: sql`VALUES(titulo)`,
                        catTitle: sql`VALUES(cat_title)`,
                        parentCatId: sql`VALUES(parent_cat_id)`,
                        parentCatTitle: sql`VALUES(parent_cat_title)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_produtos (geociencias).`);
    }
}