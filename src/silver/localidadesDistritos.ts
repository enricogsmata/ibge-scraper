// src/silver/localidadesDistritos.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverLocalidadesDistritos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformLocalidadesDistritos() {
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/localidades/distritos';

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

            // Extração segura da estrutura aninhada
            const municipio = item.municipio || {};
            const microrregiao = municipio.microrregiao || {};
            const mesorregiao = microrregiao.mesorregiao || {};
            const mesorregiaoUF = mesorregiao.UF || {};
            const mesorregiaoUFRegiao = mesorregiaoUF.regiao || {};

            const regiaoImediata = municipio['regiao-imediata'] || {};
            const regiaoIntermediaria = regiaoImediata['regiao-intermediaria'] || {};
            
            recordsToInsert.push({
                id: Number(item.id),
                nome: String(item.nome).trim(),
                
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
                
                ufId: mesorregiaoUF.id ? Number(mesorregiaoUF.id) : null,
                ufNome: mesorregiaoUF.nome ? String(mesorregiaoUF.nome).trim() : null,
                ufSigla: mesorregiaoUF.sigla ? String(mesorregiaoUF.sigla).trim() : null,
                
                regiaoId: mesorregiaoUFRegiao.id ? Number(mesorregiaoUFRegiao.id) : null,
                regiaoNome: mesorregiaoUFRegiao.nome ? String(mesorregiaoUFRegiao.nome).trim() : null,
                regiaoSigla: mesorregiaoUFRegiao.sigla ? String(mesorregiaoUFRegiao.sigla).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;
        
        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
            
            await normalizedDb.insert(silverLocalidadesDistritos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
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

        logger.info(`Fase 1 Silver: ${recordsToInsert.length} registros persistidos em silver_localidades_distritos.`);
    }
}