// src/silver/rmpgMaregrafos.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverRmpgMaregrafos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformRmpgMaregrafos() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/rmpg/maregrafos';

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
            if (!item.siglaMaregrafo || !item.nomeMaregrafo) continue;

            recordsToInsert.push({
                siglaMaregrafo: String(item.siglaMaregrafo).trim(),
                nomeMaregrafo: String(item.nomeMaregrafo).trim(),
                local: item.local ? String(item.local).trim() : null,
                siglaUf: item.siglaUF ? String(item.siglaUF).trim() : null,
                lat: item.lat !== undefined && item.lat !== null ? Number(item.lat) : null,
                lon: item.lon !== undefined && item.lon !== null ? Number(item.lon) : null,
                idGloss: item.idGLOSS !== undefined && item.idGLOSS !== null ? Number(item.idGLOSS) : null,
                idPsmsl: item.idPSMSL !== undefined && item.idPSMSL !== null ? Number(item.idPSMSL) : null,
                idUhslc: item.idUHSLC !== undefined && item.idUHSLC !== null ? Number(item.idUHSLC) : null,
                urlRelatorio: item.urlRelatorio ? String(item.urlRelatorio).trim() : null,
                dataInicialOperacao: item.dataInicialOperacao ? String(item.dataInicialOperacao).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverRmpgMaregrafos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nomeMaregrafo: sql`VALUES(nome_maregrafo)`,
                        local: sql`VALUES(local)`,
                        siglaUf: sql`VALUES(sigla_uf)`,
                        lat: sql`VALUES(lat)`,
                        lon: sql`VALUES(lon)`,
                        idGloss: sql`VALUES(id_gloss)`,
                        idPsmsl: sql`VALUES(id_psmsl)`,
                        idUhslc: sql`VALUES(id_uhslc)`,
                        urlRelatorio: sql`VALUES(url_relatorio)`,
                        dataInicialOperacao: sql`VALUES(data_inicial_operacao)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_rmpg_maregrafos.`);
    }
}