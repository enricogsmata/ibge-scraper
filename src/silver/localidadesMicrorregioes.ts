// src/silver/localidadesMicrorregioes.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverLocalidadesMicrorregioes } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformLocalidadesMicrorregioes() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/localidades/microrregioes';

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
            if (!item.id || !item.nome) continue;

            const mesorregiao = item.mesorregiao || {};
            const uf = mesorregiao.UF || {};
            const regiao = uf.regiao || {};

            recordsToInsert.push({
                id: Number(item.id),
                nome: String(item.nome).trim(),
                mesorregiaoId: mesorregiao.id ? Number(mesorregiao.id) : null,
                mesorregiaoNome: mesorregiao.nome ? String(mesorregiao.nome).trim() : null,
                ufId: uf.id ? Number(uf.id) : null,
                ufNome: uf.nome ? String(uf.nome).trim() : null,
                ufSigla: uf.sigla ? String(uf.sigla).trim() : null,
                regiaoId: regiao.id ? Number(regiao.id) : null,
                regiaoNome: regiao.nome ? String(regiao.nome).trim() : null,
                regiaoSigla: regiao.sigla ? String(regiao.sigla).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;
        
        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
            
            await normalizedDb.insert(silverLocalidadesMicrorregioes)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        mesorregiaoId: sql`VALUES(mesorregiao_id)`,
                        mesorregiaoNome: sql`VALUES(mesorregiao_nome)`,
                        ufId: sql`VALUES(uf_id)`,
                        ufNome: sql`VALUES(uf_nome)`,
                        ufSigla: sql`VALUES(uf_sigla)`,
                        regiaoId: sql`VALUES(regiao_id)`,
                        regiaoNome: sql`VALUES(regiao_nome)`,
                        regiaoSigla: sql`VALUES(regiao_sigla)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_localidades_microrregioes.`);
    }
}