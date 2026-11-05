// src/silver/localidadesSubdistritos.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverLocalidadesSubdistritos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformLocalidadesSubdistritos() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/localidades/subdistritos';

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

            const distrito = item.distrito || {};
            const municipio = distrito.municipio || {};
            const microrregiao = municipio.microrregiao || {};
            const mesorregiao = microrregiao.mesorregiao || {};
            const mesorregiaoUf = mesorregiao.UF || {};
            const mesorregiaoUfRegiao = mesorregiaoUf.regiao || {};

            const regiaoImediata = municipio['regiao-imediata'] || {};
            const regiaoIntermediaria = regiaoImediata['regiao-intermediaria'] || {};
            const uf = mesorregiaoUf.id ? mesorregiaoUf : (regiaoIntermediaria.UF || {});
            const regiao = mesorregiaoUfRegiao.id ? mesorregiaoUfRegiao : (uf.regiao || {});

            recordsToInsert.push({
                id: Number(item.id),
                nome: String(item.nome).trim(),
                distritoId: distrito.id ? Number(distrito.id) : null,
                distritoNome: distrito.nome ? String(distrito.nome).trim() : null,
                municipioId: municipio.id ? Number(municipio.id) : null,
                municipioNome: municipio.nome ? String(municipio.nome).trim() : null,
                microrregiaoId: microrregiao.id ? Number(microrregiao.id) : null,
                microrregiaoNome: microrregiao.nome ? String(microrregiao.nome).trim() : null,
                mesorregiaoId: mesorregiao.id ? Number(mesorregiao.id) : null,
                mesorregiaoNome: mesorregiao.nome ? String(mesorregiao.nome).trim() : null,
                regiaoImediataId: regiaoImediata.id ? Number(regiaoImediata.id) : null,
                regiaoImediataNome: regiaoImediata.nome ? String(regiaoImediata.nome).trim() : null,
                regiaoIntermediariaId: regiaoIntermediaria.id ? Number(regiaoIntermediaria.id) : null,
                regiaoIntermediariaNome: regiaoIntermediaria.nome ? String(regiaoIntermediaria.nome).trim() : null,
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

            await normalizedDb.insert(silverLocalidadesSubdistritos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        distritoId: sql`VALUES(distrito_id)`,
                        distritoNome: sql`VALUES(distrito_nome)`,
                        municipioId: sql`VALUES(municipio_id)`,
                        municipioNome: sql`VALUES(municipio_nome)`,
                        microrregiaoId: sql`VALUES(microrregiao_id)`,
                        microrregiaoNome: sql`VALUES(microrregiao_nome)`,
                        mesorregiaoId: sql`VALUES(mesorregiao_id)`,
                        mesorregiaoNome: sql`VALUES(mesorregiao_nome)`,
                        regiaoImediataId: sql`VALUES(regiao_imediata_id)`,
                        regiaoImediataNome: sql`VALUES(regiao_imediata_nome)`,
                        regiaoIntermediariaId: sql`VALUES(regiao_intermediaria_id)`,
                        regiaoIntermediariaNome: sql`VALUES(regiao_intermediaria_nome)`,
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

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_localidades_subdistritos.`);
    }
}