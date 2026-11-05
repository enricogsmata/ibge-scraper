// src/silver/localidadesPaises.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverLocalidadesPaises } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformLocalidadesPaises() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/localidades/paises';

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
            const m49 = item.id?.M49 ?? item.id?.m49;
            if (!m49 || !item.nome) continue;

            const subRegiao = item['sub-regiao'] || {};
            const subRegiaoId = subRegiao.id || {};
            const regiao = subRegiao.regiao || {};
            const regiaoId = regiao.id || {};

            const regiaoIntermediaria = item['regiao-intermediaria'] || {};
            const regiaoIntermediariaId = regiaoIntermediaria.id || {};

            recordsToInsert.push({
                m49: Number(m49),
                isoAlpha2: item.id['ISO-ALPHA-2'] ? String(item.id['ISO-ALPHA-2']).trim() : null,
                isoAlpha3: item.id['ISO-ALPHA-3'] ? String(item.id['ISO-ALPHA-3']).trim() : null,
                nome: String(item.nome).trim(),
                subRegiaoM49: subRegiaoId.M49 ? Number(subRegiaoId.M49) : null,
                subRegiaoNome: subRegiao.nome ? String(subRegiao.nome).trim() : null,
                regiaoM49: regiaoId.M49 ? Number(regiaoId.M49) : null,
                regiaoNome: regiao.nome ? String(regiao.nome).trim() : null,
                regiaoIntermediariaM49: regiaoIntermediariaId.M49 ? Number(regiaoIntermediariaId.M49) : null,
                regiaoIntermediariaNome: regiaoIntermediaria.nome ? String(regiaoIntermediaria.nome).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverLocalidadesPaises)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        isoAlpha2: sql`VALUES(iso_alpha_2)`,
                        isoAlpha3: sql`VALUES(iso_alpha_3)`,
                        nome: sql`VALUES(nome)`,
                        subRegiaoM49: sql`VALUES(sub_regiao_m49)`,
                        subRegiaoNome: sql`VALUES(sub_regiao_nome)`,
                        regiaoM49: sql`VALUES(regiao_m49)`,
                        regiaoNome: sql`VALUES(regiao_nome)`,
                        regiaoIntermediariaM49: sql`VALUES(regiao_intermediaria_m49)`,
                        regiaoIntermediariaNome: sql`VALUES(regiao_intermediaria_nome)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_localidades_paises.`);
    }
}