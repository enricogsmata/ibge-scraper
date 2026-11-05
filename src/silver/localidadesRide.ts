// src/silver/localidadesRide.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverLocalidadesRide, silverLocalidadesRideMunicipios } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformLocalidadesRide() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/localidades/regioes-integradas-de-desenvolvimento';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const rideToInsert = [];
    const municipiosToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;

        if (!Array.isArray(payload)) continue;

        for (const item of payload as any[]) {
            if (!item.id || !item.nome) continue;

            const rideId = String(item.id).trim();

            rideToInsert.push({
                id: rideId,
                nome: String(item.nome).trim(),
            });

            if (Array.isArray(item.municipios)) {
                for (const mun of item.municipios) {
                    if (!mun.id || !mun.nome) continue;

                    municipiosToInsert.push({
                        id: Number(mun.id),
                        rideId,
                        nome: String(mun.nome).trim(),
                        ufId: mun.UF?.id ? Number(mun.UF.id) : null,
                        ufNome: mun.UF?.nome ? String(mun.UF.nome).trim() : null,
                        ufSigla: mun.UF?.sigla ? String(mun.UF.sigla).trim() : null,
                        regiaoId: mun.UF?.regiao?.id ? Number(mun.UF.regiao.id) : null,
                        regiaoNome: mun.UF?.regiao?.nome ? String(mun.UF.regiao.nome).trim() : null,
                        regiaoSigla: mun.UF?.regiao?.sigla ? String(mun.UF.regiao.sigla).trim() : null,
                    });
                }
            }
        }
    }

    if (rideToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < rideToInsert.length; i += BATCH_SIZE) {
            const batch = rideToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverLocalidadesRide)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }
        logger.info(`Fase 1 Silver: ${rideToInsert.length} registros persistidos em silver_localidades_ride.`);
    }

    if (municipiosToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < municipiosToInsert.length; i += BATCH_SIZE) {
            const batch = municipiosToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverLocalidadesRideMunicipios)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        rideId: sql`VALUES(ride_id)`,
                        nome: sql`VALUES(nome)`,
                        ufId: sql`VALUES(uf_id)`,
                        ufNome: sql`VALUES(uf_nome)`,
                        ufSigla: sql`VALUES(uf_sigla)`,
                        regiaoId: sql`VALUES(regiao_id)`,
                        regiaoNome: sql`VALUES(regiao_nome)`,
                        regiaoSigla: sql`VALUES(regiao_sigla)`,
                    }
                });
        }
        logger.info(`Fase 1 Silver: ${municipiosToInsert.length} registros persistidos em silver_localidades_ride_municipios.`);
    }
}