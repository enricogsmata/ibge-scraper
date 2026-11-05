// src/silver/agregadosMetadados.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import {
    silverAgregadosMetadados,
    silverAgregadosMetadadosVariaveis,
    silverAgregadosMetadadosClassificacoes,
    silverAgregadosMetadadosCategorias
} from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformAgregadosMetadados() {
    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { like }) => like(row.endpointKey, 'https://servicodados.ibge.gov.br/api/v3/agregados/%/metadados'),
    });

    if (rawData.length === 0) {
        logger.warn('Sem dados brutos para processar em agregados metadados.');
        return;
    }

    const metadadosToInsert = [];
    const variaveisToInsert = [];
    const classificacoesToInsert = [];
    const categoriasToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;
        const items = Array.isArray(payload) ? payload : [payload];

        for (const item of items as any[]) {
            if (item.id === undefined || item.id === null || !item.nome) continue;

            const agregadoId = Number(item.id);
            const periodicidade = item.periodicidade || {};

            metadadosToInsert.push({
                id: agregadoId,
                url: item.URL ? String(item.URL).trim() : null,
                nome: String(item.nome).trim(),
                assunto: item.assunto ? String(item.assunto).trim() : null,
                pesquisa: item.pesquisa ? String(item.pesquisa).trim() : null,
                periodoInicio: periodicidade.inicio !== undefined && periodicidade.inicio !== null ? Number(periodicidade.inicio) : null,
                periodoFim: periodicidade.fim !== undefined && periodicidade.fim !== null ? Number(periodicidade.fim) : null,
                periodicidadeFreq: periodicidade.frequencia ? String(periodicidade.frequencia).trim() : null,
                nivelTerritorial: item.nivelTerritorial || null,
            });

            if (Array.isArray(item.variaveis)) {
                for (const variavel of item.variaveis) {
                    if (variavel.id === undefined || variavel.id === null || !variavel.nome) continue;

                    variaveisToInsert.push({
                        id: Number(variavel.id),
                        agregadoId,
                        nome: String(variavel.nome).trim(),
                        unidade: variavel.unidade ? String(variavel.unidade).trim() : null,
                        sumarizacao: Array.isArray(variavel.sumarizacao) ? variavel.sumarizacao : [],
                    });
                }
            }

            if (Array.isArray(item.classificacoes)) {
                for (const classif of item.classificacoes) {
                    if (classif.id === undefined || classif.id === null || !classif.nome) continue;

                    const classificacaoId = Number(classif.id);

                    classificacoesToInsert.push({
                        id: classificacaoId,
                        agregadoId,
                        nome: String(classif.nome).trim(),
                        sumarizacao: classif.sumarizacao || null,
                    });

                    if (Array.isArray(classif.categorias)) {
                        for (const cat of classif.categorias) {
                            if (cat.id === undefined || cat.id === null || !cat.nome) continue;

                            categoriasToInsert.push({
                                id: Number(cat.id),
                                agregadoId,
                                classificacaoId,
                                nome: String(cat.nome).trim(),
                                nivel: cat.nivel !== undefined && cat.nivel !== null ? Number(cat.nivel) : null,
                                unidade: cat.unidade ? String(cat.unidade).trim() : null,
                            });
                        }
                    }
                }
            }
        }
    }

    const BATCH_SIZE = 1000;

    if (metadadosToInsert.length > 0) {
        for (let i = 0; i < metadadosToInsert.length; i += BATCH_SIZE) {
            const batch = metadadosToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverAgregadosMetadados)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        url: sql`VALUES(url)`,
                        nome: sql`VALUES(nome)`,
                        assunto: sql`VALUES(assunto)`,
                        pesquisa: sql`VALUES(pesquisa)`,
                        periodoInicio: sql`VALUES(periodo_inicio)`,
                        periodoFim: sql`VALUES(periodo_fim)`,
                        periodicidadeFreq: sql`VALUES(periodicidade_freq)`,
                        nivelTerritorial: sql`VALUES(nivel_territorial)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }
        logger.info(`Fase 2 Silver: ${metadadosToInsert.length} registros persistidos em silver_agregados_metadados.`);
    }

    if (variaveisToInsert.length > 0) {
        for (let i = 0; i < variaveisToInsert.length; i += BATCH_SIZE) {
            const batch = variaveisToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverAgregadosMetadadosVariaveis)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        unidade: sql`VALUES(unidade)`,
                        sumarizacao: sql`VALUES(sumarizacao)`,
                    }
                });
        }
        logger.info(`Fase 2 Silver: ${variaveisToInsert.length} registros persistidos em silver_agregados_metadados_variaveis.`);
    }

    if (classificacoesToInsert.length > 0) {
        for (let i = 0; i < classificacoesToInsert.length; i += BATCH_SIZE) {
            const batch = classificacoesToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverAgregadosMetadadosClassificacoes)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        sumarizacao: sql`VALUES(sumarizacao)`,
                    }
                });
        }
        logger.info(`Fase 2 Silver: ${classificacoesToInsert.length} registros persistidos em silver_agregados_metadados_classificacoes.`);
    }

    if (categoriasToInsert.length > 0) {
        for (let i = 0; i < categoriasToInsert.length; i += BATCH_SIZE) {
            const batch = categoriasToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverAgregadosMetadadosCategorias)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nome: sql`VALUES(nome)`,
                        nivel: sql`VALUES(nivel)`,
                        unidade: sql`VALUES(unidade)`,
                    }
                });
        }
        logger.info(`Fase 2 Silver: ${categoriasToInsert.length} registros persistidos em silver_agregados_metadados_categorias.`);
    }
}