// src/silver/bngbClasse.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverBngbClasse } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformBngbClasse() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/bngb/listaclasse';

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
            if (!item.classe || !item.categoria) continue;

            recordsToInsert.push({
                classe: String(item.classe).trim(),
                categoria: String(item.categoria).trim(),
                descricaoEdgv: (item.descricao_edgv || item.descricao) ? String(item.descricao_edgv || item.descricao).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;
        
        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
            
            await normalizedDb.insert(silverBngbClasse)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        categoria: sql`VALUES(categoria)`,
                        descricaoEdgv: sql`VALUES(descricao_edgv)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_bngb_classe.`);
    }
}