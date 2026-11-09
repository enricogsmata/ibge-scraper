import { inArray, sql } from 'drizzle-orm';

import { normalizedDb } from '../db/normalized/connection.js';
import {
    silverMalhasPaisesMetadados,
    silverMalhasPaisesRegioesLimitrofes,
} from '../db/normalized/schema.js';

import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value);
}

function toText(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();

    return text || null;
}

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

export async function transformMalhasPaisesMetadados() {
    const endpointKey =
        'https://servicodados.ibge.gov.br/api/v4/malhas/paises/{id}/metadados';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn(
            { endpointKey },
            'Sem dados brutos para processar em malhas dos países.',
        );
        return;
    }

    const metadadosMap = new Map<
        string,
        typeof silverMalhasPaisesMetadados.$inferInsert
    >();

    const limitrofesMap = new Map<
        string,
        typeof silverMalhasPaisesRegioesLimitrofes.$inferInsert
    >();

    for (const row of rawData) {
        const payload = row.payload;
        const items = Array.isArray(payload) ? payload : [payload];

        for (const item of items) {
            if (!isRecord(item)) continue;

            const id = toText(item.id);
            const nome = toText(item.nome);

            if (!id || !nome) continue;

            const area = isRecord(item.area) ? item.area : {};
            const areaUnidade = isRecord(area.unidade)
                ? area.unidade
                : {};
            const centroide = isRecord(item.centroide)
                ? item.centroide
                : {};

            metadadosMap.set(id, {
                id,
                nome,

                areaDimensao: toNumber(area.dimensao),
                areaUnidadeId: toText(areaUnidade.id),
                areaUnidadeNome: toText(areaUnidade.nome),

                centroideLatitude: toNumber(centroide.latitude),
                centroideLongitude: toNumber(centroide.longitude),

                nivelGeografico: toText(item['nivel-geografico']),
            });

            if (Array.isArray(item['regiao-limitrofe'])) {
                item['regiao-limitrofe'].forEach((ponto, index) => {
                    if (!isRecord(ponto)) return;

                    const latitude = toNumber(ponto.latitude);
                    const longitude = toNumber(ponto.longitude);

                    if (latitude === null || longitude === null) {
                        return;
                    }

                    const key = `${id}:${index}`;

                    limitrofesMap.set(key, {
                        paisId: id,
                        ordem: index,
                        latitude,
                        longitude,
                    });
                });
            }
        }
    }

    const metadados = [...metadadosMap.values()];
    const limitrofes = [...limitrofesMap.values()];

    const BATCH_SIZE = 1000;

    // 1. Persistir metadados dos países
    for (let i = 0; i < metadados.length; i += BATCH_SIZE) {
        const batch = metadados.slice(i, i + BATCH_SIZE);

        await normalizedDb
            .insert(silverMalhasPaisesMetadados)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    nome: sql`VALUES(nome)`,
                    areaDimensao: sql`VALUES(area_dimensao)`,
                    areaUnidadeId: sql`VALUES(area_unidade_id)`,
                    areaUnidadeNome: sql`VALUES(area_unidade_nome)`,
                    centroideLatitude: sql`VALUES(centroide_latitude)`,
                    centroideLongitude: sql`VALUES(centroide_longitude)`,
                    nivelGeografico: sql`VALUES(nivel_geografico)`,
                    transformedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
    }

    // 2. Remover coordenadas anteriores dos países processados
    const paisIds = metadados.map((item) => item.id);

    if (paisIds.length > 0) {
        await normalizedDb
            .delete(silverMalhasPaisesRegioesLimitrofes)
            .where(
                inArray(
                    silverMalhasPaisesRegioesLimitrofes.paisId,
                    paisIds,
                ),
            );
    }

    // 3. Inserir coordenadas atualizadas
    for (let i = 0; i < limitrofes.length; i += BATCH_SIZE) {
        const batch = limitrofes.slice(i, i + BATCH_SIZE);

        await normalizedDb
            .insert(silverMalhasPaisesRegioesLimitrofes)
            .values(batch);
    }

    logger.info(
        {
            paises: metadados.length,
            pontosLimitrofes: limitrofes.length,
        },
        'Fase Silver: metadados das malhas dos países persistidos.',
    );
}