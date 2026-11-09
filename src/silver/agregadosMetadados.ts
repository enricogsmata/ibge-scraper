// src/silver/agregadosMetadados.ts
import { sql } from 'drizzle-orm';

import { normalizedDb } from '../db/normalized/connection.js';
import {
    silverAgregadosMetadados,
    silverAgregadosMetadadosVariaveis,
    silverAgregadosMetadadosClassificacoes,
    silverAgregadosMetadadosCategorias,
} from '../db/normalized/schema.js';

import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);

    return Number.isSafeInteger(number) ? number : null;
}

function toText(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();

    return text || null;
}

function getUniqueRecords<T>(
    records: T[],
    getKey: (record: T) => string,
): T[] {
    const unique = new Map<string, T>();

    for (const record of records) {
        unique.set(getKey(record), record);
    }

    return [...unique.values()];
}

export async function transformAgregadosMetadados() {
    const endpointKey =
        'https://servicodados.ibge.gov.br/api/v3/agregados/{agregado}/metadados';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { eq }) => eq(row.endpointKey, endpointKey),
    });

    if (rawData.length === 0) {
        logger.warn(
            { endpointKey },
            'Sem dados brutos para processar em agregados metadados.',
        );
        return;
    }

    const metadadosToInsert: Array<
        typeof silverAgregadosMetadados.$inferInsert
    > = [];

    const variaveisToInsert: Array<
        typeof silverAgregadosMetadadosVariaveis.$inferInsert
    > = [];

    const classificacoesToInsert: Array<
        typeof silverAgregadosMetadadosClassificacoes.$inferInsert
    > = [];

    const categoriasToInsert: Array<
        typeof silverAgregadosMetadadosCategorias.$inferInsert
    > = [];

    for (const row of rawData) {
        const payload = row.payload;
        const items = Array.isArray(payload) ? payload : [payload];

        for (const item of items) {
            if (!isRecord(item)) continue;

            const agregadoId = toNumber(item.id);
            const nome = toText(item.nome);

            if (agregadoId === null || nome === null) {
                continue;
            }

            const periodicidade = isRecord(item.periodicidade)
                ? item.periodicidade
                : {};

            metadadosToInsert.push({
                id: agregadoId,
                url: toText(item.URL),
                nome,
                assunto: toText(item.assunto),
                pesquisa: toText(item.pesquisa),
                periodoInicio: toNumber(periodicidade.inicio),
                periodoFim: toNumber(periodicidade.fim),
                periodicidadeFreq: toText(periodicidade.frequencia),
                nivelTerritorial: isRecord(item.nivelTerritorial)
                    ? item.nivelTerritorial
                    : null,
            });

            if (Array.isArray(item.variaveis)) {
                for (const variavel of item.variaveis) {
                    if (!isRecord(variavel)) continue;

                    const id = toNumber(variavel.id);
                    const nomeVariavel = toText(variavel.nome);

                    if (id === null || nomeVariavel === null) {
                        continue;
                    }

                    variaveisToInsert.push({
                        id,
                        agregadoId,
                        nome: nomeVariavel,
                        unidade: toText(variavel.unidade),
                        sumarizacao: Array.isArray(variavel.sumarizacao)
                            ? variavel.sumarizacao
                            : [],
                    });
                }
            }

            if (Array.isArray(item.classificacoes)) {
                for (const classificacao of item.classificacoes) {
                    if (!isRecord(classificacao)) continue;

                    const classificacaoId = toNumber(classificacao.id);
                    const nomeClassificacao = toText(classificacao.nome);

                    if (
                        classificacaoId === null
                        || nomeClassificacao === null
                    ) {
                        continue;
                    }

                    classificacoesToInsert.push({
                        id: classificacaoId,
                        agregadoId,
                        nome: nomeClassificacao,
                        sumarizacao: isRecord(classificacao.sumarizacao)
                            ? classificacao.sumarizacao
                            : null,
                    });

                    if (Array.isArray(classificacao.categorias)) {
                        for (const categoria of classificacao.categorias) {
                            if (!isRecord(categoria)) continue;

                            const categoriaId = toNumber(categoria.id);
                            const nomeCategoria = toText(categoria.nome);

                            if (
                                categoriaId === null
                                || nomeCategoria === null
                            ) {
                                continue;
                            }

                            categoriasToInsert.push({
                                id: categoriaId,
                                agregadoId,
                                classificacaoId,
                                nome: nomeCategoria,
                                nivel: toNumber(categoria.nivel),
                                unidade: toText(categoria.unidade),
                            });
                        }
                    }
                }
            }
        }
    }

    const metadados = getUniqueRecords(
        metadadosToInsert,
        (item) => String(item.id),
    );

    const variaveis = getUniqueRecords(
        variaveisToInsert,
        (item) => `${item.agregadoId}:${item.id}`,
    );

    const classificacoes = getUniqueRecords(
        classificacoesToInsert,
        (item) => `${item.agregadoId}:${item.id}`,
    );

    const categorias = getUniqueRecords(
        categoriasToInsert,
        (item) => `${item.agregadoId}:${item.classificacaoId}:${item.id}`,
    );

    const BATCH_SIZE = 1000;

    for (let i = 0; i < metadados.length; i += BATCH_SIZE) {
        const batch = metadados.slice(i, i + BATCH_SIZE);

        await normalizedDb
            .insert(silverAgregadosMetadados)
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
                },
            });
    }

    for (let i = 0; i < variaveis.length; i += BATCH_SIZE) {
        const batch = variaveis.slice(i, i + BATCH_SIZE);

        await normalizedDb
            .insert(silverAgregadosMetadadosVariaveis)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    nome: sql`VALUES(nome)`,
                    unidade: sql`VALUES(unidade)`,
                    sumarizacao: sql`VALUES(sumarizacao)`,
                },
            });
    }

    for (let i = 0; i < classificacoes.length; i += BATCH_SIZE) {
        const batch = classificacoes.slice(i, i + BATCH_SIZE);

        await normalizedDb
            .insert(silverAgregadosMetadadosClassificacoes)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    nome: sql`VALUES(nome)`,
                    sumarizacao: sql`VALUES(sumarizacao)`,
                },
            });
    }

    for (let i = 0; i < categorias.length; i += BATCH_SIZE) {
        const batch = categorias.slice(i, i + BATCH_SIZE);

        await normalizedDb
            .insert(silverAgregadosMetadadosCategorias)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    nome: sql`VALUES(nome)`,
                    nivel: sql`VALUES(nivel)`,
                    unidade: sql`VALUES(unidade)`,
                },
            });
    }

    logger.info(
        {
            agregados: metadados.length,
            variaveis: variaveis.length,
            classificacoes: classificacoes.length,
            categorias: categorias.length,
        },
        'Fase Silver: metadados dos agregados persistidos.',
    );
}