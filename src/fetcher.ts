// fetcher.ts
import { rawDb } from './db/raw/connection.js';
import { ModuleApiData, RawRootResponses } from './db/raw/schema.js';
import {
    isExcludedEndpoint,
    isRootEndpoint,
    sortEndpointsByDependency,
    isPaginatedEndpoint,
    getRootEndpointKey,
} from './helpers.js';
import { logger } from './logger.js';

const baseLogger = logger.forModule('fetcher');

export interface IngestionOptions {
    /** Processa apenas o endpoint nesta posição da ORDEM DE EXECUÇÃO (0 = 1º endpoint-mãe do plano). */
    debugIndex?: number;
    /** Alternativa: processa apenas o endpoint nesta posição original de ModuleApiData. */
    debugOriginalIndex?: number;
    /** Loga o 1º registro e persiste apenas ele (e apenas a 1ª página). */
    sampleOnly?: boolean;
    /** Itens por página nos endpoints paginados (calendário, notícias). Padrão: 100. */
    pageSize?: number;
    /** Limite de segurança de páginas por endpoint paginado. Padrão: 1000. */
    maxPages?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 1000;
const FETCH_TIMEOUT_MS = 60_000;
const FETCH_RETRIES = 3;

/** Faz GET com timeout e retry simples (backoff linear). Retorna o corpo JSON bruto. */
async function fetchJson(url: string): Promise<{ status: number; data: any }> {
    let lastError: any;
    for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
            }
            return { status: response.status, data: await response.json() };
        } catch (error: any) {
            lastError = error;
            if (attempt < FETCH_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
        }
    }
    throw lastError;
}

/** Monta a URL de uma página (apenas para endpoints paginados). */
function buildPageUrl(url: string, page: number, pageSize: number): string {
    const u = new URL(url.trim());
    u.searchParams.set('qtd', String(pageSize));
    u.searchParams.set('page', String(page));
    return u.toString();
}

/** Envelope paginado: objeto com `items` em array. */
function isPagedEnvelope(data: any): data is { items: any[]; totalPages?: number } {
    return data !== null && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items);
}

/** Extrai a lista de registros da resposta, só para contagem e amostra (payload não é alterado). */
function extractRecords(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (isPagedEnvelope(data)) return data.items;
    return data === null || data === undefined ? [] : [data];
}

/** Reduz o payload ao 1º registro mantendo o formato original (modo amostra). */
function reducePayloadToSample(data: any): any {
    if (Array.isArray(data)) return data.slice(0, 1);
    if (isPagedEnvelope(data)) return { ...data, items: data.items.slice(0, 1) };
    return data;
}

export async function runIngestion(options: IngestionOptions = {}) {
    const log = baseLogger.forMethod('runIngestion');
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

    log.info('Iniciando processo de ingestão...');

    try {
        const apiDataList = await rawDb
            .select()
            .from(ModuleApiData);

        log.info(`Encontrados ${apiDataList.length} endpoints mapeados na tabela ModuleApiData.`);

        // Ordem de execução: mães (nível 0) -> filhos (1) -> netos (2) ...
        const ordered = sortEndpointsByDependency(apiDataList);

        const perLevel = new Map<number, number>();
        for (const e of ordered) perLevel.set(e.level, (perLevel.get(e.level) ?? 0) + 1);
        log.info(
            'Plano de ingestão por nível: ' +
            [...perLevel.entries()].map(([lvl, n]) => `nível ${lvl}: ${n}`).join(' | ')
        );

        const seen = new Set<string>();
        let currentLevel = -1;

        // Plano completo com os índices de execução (úteis para escolher o debugIndex)
        ordered.forEach((e, idx) =>
            log.debug(`[plano ${idx}] nível ${e.level} (original ${e.originalIndex}): ${e.apiUrl}`)
        );

        for (const [execIndex, apiData] of ordered.entries()) {
            if (!apiData) throw new Error("Api Data inválida");

            const url = apiData.apiUrl.trim();

            // Filtros de debug: índice na ordem de execução ou índice original de ModuleApiData
            if (options.debugIndex !== undefined && execIndex !== options.debugIndex) {
                continue;
            }
            if (options.debugOriginalIndex !== undefined && apiData.originalIndex !== options.debugOriginalIndex) {
                continue;
            }

            if (apiData.level !== currentLevel) {
                currentLevel = apiData.level;
                log.info(`=== Iniciando nível ${currentLevel} ${currentLevel === 0 ? '(endpoints-mãe)' : '(dependentes)'} ===`);
            }

            if (apiData.method.toUpperCase() !== 'GET') {
                log.debug(`Método ${apiData.method} não suportado na ingestão, ignorando: ${url}`);
                continue;
            }

            if (isExcludedEndpoint(url)) {
                log.debug(`Endpoint ignorado por regra de exclusão: ${url}`);
                continue;
            }

            // Endpoints com parâmetros de rota (ex: {agregado}) dependem de descoberta/expansão
            // de URLs reais e não fazem parte desta etapa (apenas endpoints raiz).
            if (!isRootEndpoint(url)) {
                log.warn(`Endpoint dependente (nível ${apiData.level}) aguarda expansão de parâmetros a partir dos pais, ignorando: ${url}`);
                continue;
            }

            if (seen.has(url)) {
                log.debug(`Endpoint duplicado em ModuleApiData, ignorando: ${url}`);
                continue;
            }
            seen.add(url);

            try {
                const endpointKey = getRootEndpointKey(url);
                log.info(`Processando endpoint raiz [execução ${execIndex}]: ${url} -> dataset: ${endpointKey}`);

                const paginated = isPaginatedEndpoint(url);
                let page = 1;
                let totalPages = 1;
                let totalRecords = 0;

                do {
                    const requestUrl = paginated ? buildPageUrl(url, page, pageSize) : url;
                    const { status, data } = await fetchJson(requestUrl);

                    if (paginated && isPagedEnvelope(data) && typeof data.totalPages === 'number') {
                        totalPages = data.totalPages;
                    }

                    const records = extractRecords(data);

                    if (records.length === 0) {
                        log.info(`Nenhum dado retornado da API: ${requestUrl}`);
                        break;
                    }

                    let payload = data;
                    let recordCount = records.length;

                    // Flag de amostra: loga o 1º registro e persiste APENAS ele, para validação
                    if (options.sampleOnly) {
                        log.info(`[DEBUG] Amostra do 1º registro bruto do dataset ${endpointKey}:`);
                        console.log(JSON.stringify(records[0], null, 2));
                        log.info(`[DEBUG] Modo amostra habilitado: persistindo apenas o 1º registro (1ª página).`);
                        payload = reducePayloadToSample(data);
                        recordCount = 1;
                    }

                    const row = {
                        endpointKey,
                        apiUrl: url,
                        page,
                        totalPages: paginated ? totalPages : null,
                        httpStatus: status,
                        recordCount,
                        payload,
                    };

                    // Upsert pela chave única (api_url, page): reexecuções sobrescrevem o snapshot
                    await rawDb.insert(RawRootResponses)
                        .values(row)
                        .onDuplicateKeyUpdate({
                            set: {
                                endpointKey: row.endpointKey,
                                totalPages: row.totalPages,
                                httpStatus: row.httpStatus,
                                recordCount: row.recordCount,
                                payload: row.payload,
                                fetchedAt: new Date(),
                            },
                        });

                    totalRecords += recordCount;
                    log.info(`Persistida resposta bruta de ${endpointKey} (página ${page}/${totalPages}, ${recordCount} registros).`);

                    if (options.sampleOnly) break;
                    page++;
                } while (paginated && page <= totalPages && page <= maxPages);

                if (paginated && page <= totalPages && !options.sampleOnly) {
                    log.warn(`Limite de ${maxPages} páginas atingido em ${url} (totalPages=${totalPages}).`);
                }

                log.info(`Endpoint ${endpointKey} concluído: ${totalRecords} registros persistidos.`);
            } catch (error: any) {
                log.error({}, `Erro ao processar URL ${url}: ${error.message}`);
            }
        }

        log.info('Processo de ingestão concluído com sucesso.');
    } catch (error: any) {
        log.error({}, `Erro fatal no processo de ingestão: ${error.message}`);
    }
}