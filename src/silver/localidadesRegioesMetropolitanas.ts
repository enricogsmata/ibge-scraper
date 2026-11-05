// src/silver/localidadesRegioesMetropolitanas.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import {
    silverLocalidadesRegioesMetropolitanas,
    silverLocalidadesRegioesMetropolitanasMunicipios
} from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformLocalidadesRegioesMetropolitanas() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/localidades/regioes-metropolitanas';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const regioesMetropolitanasToInsert = [];
    const municipiosToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;

        if (!Array.isArray(payload)) continue;

        for (const item of payload as any[]) {
            if (!item.id || !item.nome) continue;

            const rmId = String(item.id).trim();
            const uf = item.UF || {};
            const regiao = uf.regiao || {};

            regioesMetropolitanasToInsert.push({
                id: rmId,
                nome: String(item.nome).trim(),
                ufId: uf.id ? Number(uf.id) : null,
                ufNome: uf.nome ? String(uf.nome).trim() : null,
                ufSigla: uf.sigla ? String(uf.sigla).trim() : null,
                regiaoId: regiao.id ? Number(regiao.id) : null,
                regiaoNome: regiao.nome ? String(regiao.nome).trim() : null,
                regiaoSigla: regiao.sigla ? String(regiao.sigla).trim() : null,
            });

            if (Array.isArray(item.municipios)) {
                for (const mun of item.municipios) {
                    if (!mun.id || !mun.nome) continue;

                    municipiosToInsert.push({
                        id: Number(mun.id),
                        regiaoMetropolitanaId: rmId,
                        nome: String(mun.nome).trim(),
                    });
                }
            }
        }
    }

    if (regioesMetropolitanasToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < regioesMetropolitanasToInsert.length; i += BATCH_SIZE) {
            const batch = regioesMetropolitanasToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverLocalidadesRegioesMetropolitanas)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
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
        logger.info(`Fase 1 Silver: ${regioesMetropolitanasToInsert.length} registros persistidos em silver_localidades_regioes_metropolitanas.`);
    }

    if (municipiosToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < municipiosToInsert.length; i += BATCH_SIZE) {
            const batch = municipiosToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverLocalidadesRegioesMetropolitanasMunicipios)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        regiaoMetropolitanaId: sql`VALUES(regiao_metropolitana_id)`,
                        nome: sql`VALUES(nome)`,
                    }
                });
        }
        logger.info(`Fase 1 Silver: ${municipiosToInsert.length} registros persistidos em silver_localidades_regioes_metropolitanas_municipios.`);
    }
}