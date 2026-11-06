import { sql, isNotNull } from 'drizzle-orm';
import { rawDb } from './db/raw/connection.js';
import { RawRootResponses } from './db/raw/schema.js';
import { logger } from './logger.js';
import { runSilverPhase1 } from './silver.js';
import { normalizedDb } from './db/normalized/connection.js';
import { silverLocalidadesRegioesIntermediarias } from './db/normalized/schema.js';
import { silverMetadadosPesquisas } from './db/normalized/schema.js';
import { silverLocalidadesEstados } from './db/normalized/schema.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithBackoff(url: string, maxRetries = 5, initialDelayMs = 1000): Promise<{ status: number; data: any }> {
    let retries = 0;
    let delay = initialDelayMs;

    while (retries <= maxRetries) {
        const start = Date.now();
        try {
            const response = await fetch(url);
            const duration = Date.now() - start;

            if (response.ok) {
                const data = await response.json();
                logger.info({ url, status: response.status, duration }, `Sucesso ao extrair dados`);
                return { status: response.status, data };
            }

            if (response.status === 429 || response.status >= 500) {
                logger.warn({ url, status: response.status, duration }, `Falha recuperável. Tentativa ${retries + 1}/${maxRetries}`);
                throw new Error(`HTTP ${response.status}`);
            }

            logger.error({ url, status: response.status, duration }, `Falha não recuperável (HTTP ${response.status})`);
            return { status: response.status, data: null };
        } catch (error) {
            if (retries === maxRetries) {
                logger.error({ url, error: (error as Error).message }, `Esgotadas as tentativas para o endpoint`);
                throw error;
            }
            await sleep(delay);
            delay *= 2;
            retries++;
        }
    }
    throw new Error('Unreachable');
}

async function ingestEndpoint(endpointKey: string, baseUrl: string) {
    let currentPage = 1;
    let totalPages = 1; // Será atualizado dinamicamente na primeira resposta bem-sucedida
    let isPaginated = false;

    // Condição inteligente: baseia-se no totalPages relatado pela API.
    // Assim, se uma página específica (ex: 142) falhar, o loop não é abortado e tenta a 143.
    while (currentPage <= totalPages) {
        const urlObj = new URL(baseUrl);

        // Adiciona o parâmetro dinâmico apenas se soubermos que é paginado ou se passou da página 1
        if (currentPage > 1 || isPaginated) {
            urlObj.searchParams.set('page', currentPage.toString());
        }

        const currentUrl = urlObj.toString();

        try {
            const { status, data } = await fetchWithBackoff(currentUrl);

            if (!data) {
                // Se retornou vazio de forma amigável (ex: 404 sem erro grave), ignora e tenta a próxima.
                currentPage++;
                continue;
            }

            let recordCount = 0;

            // Detecta padrão de paginação do IBGE (possui 'items' e 'totalPages')
            if (data && typeof data === 'object' && 'items' in data) {
                isPaginated = true;
                recordCount = Array.isArray(data.items) ? data.items.length : 0;

                // Atualiza o teto do loop com a resposta oficial da API
                if (data.totalPages) {
                    totalPages = data.totalPages;
                }
            } else {
                // Tratamento para endpoints estáticos/não paginados
                recordCount = Array.isArray(data) ? data.length : 1;
                totalPages = 1; // Força a parada imediata após o salvamento para endpoints normais
            }

            await rawDb.insert(RawRootResponses)
                .values({
                    endpointKey,
                    apiUrl: currentUrl,
                    page: currentPage,
                    totalPages,
                    httpStatus: status,
                    recordCount,
                    payload: data,
                })
                .onDuplicateKeyUpdate({
                    set: {
                        httpStatus: status,
                        recordCount,
                        payload: data,
                        fetchedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });

        } catch (error) {
            logger.error({ endpointKey, url: currentUrl, error: (error as Error).message }, 'Falha isolada na página. Prosseguindo para a próxima (se houver).');
            // O erro foi logado, mas o loop NÃO é interrompido (break).
            // Apenas incrementamos a página abaixo para continuar tentando o resto da fila.
        }

        currentPage++;
    }
}

export async function runPhase1() {
    logger.info("Iniciando Fase 1: Descoberta de Chaves (Parent Endpoints estáticos)");

    // Filtra endpoints raiz e garante que endpoints com parâmetros de rota não declarados ({...}) sejam ignorados nesta fase
    const parentEndpoints = await rawDb.query.ModuleApiData.findMany({
        where: (mod, { sql, and, notLike }) => and(
            sql`JSON_LENGTH(${mod.params}) = 0`,
            notLike(mod.apiUrl, '%{%')
        ),
    });

    const promises = parentEndpoints.map((ep) => ingestEndpoint(ep.apiUrl, ep.apiUrl));

    await Promise.allSettled(promises);
    logger.info("Fase 1 concluída com sucesso.");
}

export async function runPhase2() {
    logger.info("Iniciando Fase 2: Expansão Dinâmica (Child Endpoints)");

    const childEndpoints = await rawDb.query.ModuleApiData.findMany({
        where: (mod, { sql }) => sql`JSON_LENGTH(${mod.params}) > 0`,
    });

    for (const endpoint of childEndpoints) {
        const paramsReq = endpoint.params as { name: string; format: string }[] | null;

        if (!paramsReq || paramsReq.length === 0) continue;

        const firstParam = paramsReq[0];
        if (!firstParam) continue;

        const parameterName = firstParam.name.replace('*', '');
        const parentKeys = await fetchParentKeysFromSilverLayer(endpoint.apiUrl, parameterName);

        if (parentKeys.length === 0) {
            logger.warn({ parameterName, endpoint: endpoint.apiUrl }, "Nenhuma chave pai encontrada. Pulando endpoint.");
            continue;
        }

        const BATCH_SIZE = 15;

        for (let i = 0; i < parentKeys.length; i += BATCH_SIZE) {
            const batch = parentKeys.slice(i, i + BATCH_SIZE);

            const promises = batch.map((key) => {
                let populatedUrl = endpoint.apiUrl;

                paramsReq.forEach((param) => {
                    const pName = param.name.replace('*', '');
                    populatedUrl = populatedUrl.replace(`{${pName}}`, key);
                });

                return ingestEndpoint(endpoint.apiUrl, populatedUrl);
            });

            await Promise.allSettled(promises);
        }
    }

    logger.info("Fase 2 concluída com sucesso.");
}

async function fetchParentKeysFromSilverLayer(apiUrl: string, paramName: string): Promise<string[]> {
    if (apiUrl.includes('/malhas/regioes-intermediarias/') && paramName === 'id') {
        const records = await normalizedDb
            .select({ id: silverLocalidadesRegioesIntermediarias.id })
            .from(silverLocalidadesRegioesIntermediarias);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/metadados/pesquisas/') && paramName === 'pesquisa') {
        const records = await normalizedDb
            .select({ codigo: silverMetadadosPesquisas.codigo })
            .from(silverMetadadosPesquisas);

        return records.map((r) => String(r.codigo));
    }

    if (apiUrl.includes('/bdg/estado/') && paramName === 'sigla') {
        const records = await normalizedDb
            .select({ sigla: silverLocalidadesEstados.sigla })
            .from(silverLocalidadesEstados)
            .where(isNotNull(silverLocalidadesEstados.sigla));

        return records.map((r) => String(r.sigla));
    }

    return [];
}

/**
 * ORQUESTRADOR PRINCIPAL
 * Gerencia a execução sequencial das fases garantindo a integridade referencial.
 */
export async function runIngestionPipeline() {
    try {
        logger.info("Iniciando pipeline de ingestão ELT...");
        await runPhase1();
        await runSilverPhase1();
        await runPhase2();
        logger.info("Pipeline de ingestão finalizado com sucesso.");
    } catch (error) {
        logger.error({ error }, "Erro fatal na execução do pipeline de ingestão.");
        throw error;
    }
}

/* 
 * ============================================================================
 * PRÓXIMO PASSO NECESSÁRIO:
 * ============================================================================
 * Implementar a lógica real dentro de `fetchParentKeysFromBronzeLayer`.
 * Precisamos de um mapeamento (Dicionário/Map) estruturado que vincule o `paramName` 
 * (ex: "UF", "municipio", "agregado") à `apiUrl` raiz correspondente e defina 
 * o JSON Path/lógica de extração correta no `payload` salvo na tabela `RawRootResponses`.
 * ============================================================================
 */