// src/silver/noticias.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverNoticias } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformNoticias() {
    const endpointKey = 'http://servicodados.ibge.gov.br/api/v3/noticias/';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const noticiasToInsert = [];

    for (const row of rawData) {
        const payload = row.payload as any;
        
        // Estrutura do payload de notícias possui paginação encapsulada: { items: [...] }
        if (!payload || !Array.isArray(payload.items)) continue;

        for (const item of payload.items) {
            if (!item.id || !item.titulo) continue;

            noticiasToInsert.push({
                id: Number(item.id),
                tipo: item.tipo ? String(item.tipo).trim() : null,
                titulo: String(item.titulo).trim(),
                introducao: item.introducao ? String(item.introducao).trim() : null,
                dataPublicacao: item.data_publicacao ? String(item.data_publicacao).trim() : null,
                produtoId: item.produto_id ? Number(item.produto_id) : null,
                produtos: item.produtos ? String(item.produtos).trim() : null,
                editorias: item.editorias ? String(item.editorias).trim() : null,
                imagens: item.imagens ? String(item.imagens).trim() : null,
                produtosRelacionados: item.produtos_relacionados ? String(item.produtos_relacionados).trim() : null,
                destaque: Boolean(item.destaque),
                link: item.link ? String(item.link).trim() : null,
            });
        }
    }

    if (noticiasToInsert.length > 0) {
        // Inserção em lotes (chunks) para evitar limite de placeholder e max_allowed_packet do MySQL
        const BATCH_SIZE = 1000;
        
        for (let i = 0; i < noticiasToInsert.length; i += BATCH_SIZE) {
            const batch = noticiasToInsert.slice(i, i + BATCH_SIZE);
            
            await normalizedDb.insert(silverNoticias)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        tipo: sql`VALUES(tipo)`,
                        titulo: sql`VALUES(titulo)`,
                        introducao: sql`VALUES(introducao)`,
                        dataPublicacao: sql`VALUES(data_publicacao)`,
                        produtoId: sql`VALUES(produto_id)`,
                        produtos: sql`VALUES(produtos)`,
                        editorias: sql`VALUES(editorias)`,
                        imagens: sql`VALUES(imagens)`,
                        produtosRelacionados: sql`VALUES(produtos_relacionados)`,
                        destaque: sql`VALUES(destaque)`,
                        link: sql`VALUES(link)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${noticiasToInsert.length} registros persistidos em silver_noticias.`);
    }
}