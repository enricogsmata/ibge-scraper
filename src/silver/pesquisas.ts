import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverMetadadosPesquisas, silverMetadadosPesquisasClassificacoes } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformMetadadosPesquisas() {
    const endpointKey = 'http://servicodados.ibge.gov.br/api/v2/metadados/pesquisas';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar.');
        return;
    }

    const pesquisasToInsert = [];
    const classificacoesToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;
        
        if (!Array.isArray(payload)) continue;

        for (const item of payload) {
            if (!item.codigo || !item.nome) continue;
            
            const codigoStr = String(item.codigo).trim();

            pesquisasToInsert.push({
                codigo: codigoStr,
                nome: String(item.nome).trim(),
                situacao: item.situacao ? String(item.situacao).trim() : null,
                categoria: item.categoria ? String(item.categoria).trim() : null,
                nomeIngles: item.nome_ingles ? String(item.nome_ingles).trim() : null,
                periodicidadeColeta: item.periodicidade_coleta ? String(item.periodicidade_coleta).trim() : null,
                periodicidadeDivulgacao: item.periodicidade_divulgacao ? String(item.periodicidade_divulgacao).trim() : null,
            });

            if (Array.isArray(item.classificacoes_tematicas)) {
                for (const classif of item.classificacoes_tematicas) {
                    if (!classif.nome) continue;
                    classificacoesToInsert.push({
                        pesquisaCodigo: codigoStr,
                        nome: String(classif.nome).trim(),
                        dominio: classif.dominio ? String(classif.dominio).trim() : null,
                        descricao: classif.descricao ? String(classif.descricao).trim() : null,
                        nomeIngles: classif.nome_ingles ? String(classif.nome_ingles).trim() : null,
                        dominioIngles: classif.dominio_ingles ? String(classif.dominio_ingles).trim() : null,
                        descricaoIngles: classif.descricao_ingles ? String(classif.descricao_ingles).trim() : null,
                    });
                }
            }
        }
    }

    if (pesquisasToInsert.length > 0) {
        await normalizedDb.insert(silverMetadadosPesquisas)
            .values(pesquisasToInsert)
            .onDuplicateKeyUpdate({
                set: {
                    nome: sql`VALUES(nome)`,
                    situacao: sql`VALUES(situacao)`,
                    categoria: sql`VALUES(categoria)`,
                    nomeIngles: sql`VALUES(nome_ingles)`,
                    periodicidadeColeta: sql`VALUES(periodicidade_coleta)`,
                    periodicidadeDivulgacao: sql`VALUES(periodicidade_divulgacao)`,
                    transformedAt: sql`CURRENT_TIMESTAMP`,
                }
            });

        logger.info(`Fase 1 Silver: ${pesquisasToInsert.length} registros persistidos em silver_metadados_pesquisas.`);
    }

    if (classificacoesToInsert.length > 0) {
        await normalizedDb.insert(silverMetadadosPesquisasClassificacoes)
            .values(classificacoesToInsert)
            .onDuplicateKeyUpdate({
                set: {
                    dominio: sql`VALUES(dominio)`,
                    descricao: sql`VALUES(descricao)`,
                    nomeIngles: sql`VALUES(nome_ingles)`,
                    dominioIngles: sql`VALUES(dominio_ingles)`,
                    descricaoIngles: sql`VALUES(descricao_ingles)`,
                }
            });
            
        logger.info(`Fase 1 Silver: ${classificacoesToInsert.length} registros persistidos em silver_metadados_pesquisas_classificacoes.`);
    }
}