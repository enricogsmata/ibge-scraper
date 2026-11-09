import { sql, isNotNull } from 'drizzle-orm';
import { rawDb } from './db/raw/connection.js';
import { logger } from './logger.js';
import { runSilverPhase1, runSilverPhase2, runSilverBdgEstacoes } from './silver.js';
import { normalizedDb } from './db/normalized/connection.js';
import {
    silverAgregados,
    silverAgregadosMetadados,
    silverBdgEstacoes,
    silverLocalidadesEstados,
    silverLocalidadesMunicipios,
    silverLocalidadesPaises,
    silverLocalidadesRegioes,
    silverLocalidadesRegioesImediatas,
    silverLocalidadesRegioesIntermediarias,
    silverMetadadosPesquisas,
    silverPesquisas,
    silverPesquisasPeriodos,
    silverProdutos,
    silverRmpgMaregrafos,
    silverRmpgSensores
} from './db/normalized/schema.js';
import { RawRootResponses, ibgeIdentificadores } from './db/raw/schema.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ingestRbmcRinex31s(endpointApiUrl: string) {
    const stations = await normalizedDb
        .select({ codigoEstacao: silverBdgEstacoes.codigoEstacao })
        .from(silverBdgEstacoes);

    if (stations.length === 0) {
        logger.warn("Nenhuma estação encontrada em silverBdgEstacoes para ingestão de RBMC RINEX3 1s.");
        return;
    }

    const stationCodes = Array.from(
        new Set(
            stations
                .map((s) => String(s.codigoEstacao).trim().toLowerCase())
                .filter((s) => s.length === 4)
        )
    );

    const targetStations = stationCodes.length > 0
        ? stationCodes
        : Array.from(new Set(stations.map((s) => String(s.codigoEstacao).trim().toLowerCase())));

    const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInYear = (y: number) => (isLeapYear(y) ? 366 : 365);
    const validMinutes = [45, 30, 15, 0];
    const tipos = ['mo', 'mn'];
    const MAX_CONSECUTIVE_EMPTY = 30;
    const BATCH_SIZE = 15;

    for (const estacao of targetStations) {
        const now = new Date();
        let currentYear = now.getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const diffMs = now.getTime() - startOfYear.getTime();
        let currentDay = Math.min(Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1, daysInYear(currentYear));
        let currentHour = now.getHours();
        let currentMinute = validMinutes.find((m) => m <= now.getMinutes()) ?? 0;

        let consecutiveEmpty = 0;

        const decrementTime = (): boolean => {
            const minIndex = validMinutes.indexOf(currentMinute);
            if (minIndex < validMinutes.length - 1) {
                currentMinute = validMinutes[minIndex + 1]!;
                return true;
            }
            currentMinute = 45;
            currentHour--;
            if (currentHour >= 0) return true;

            currentHour = 23;
            currentDay--;
            if (currentDay >= 1) return true;

            currentYear--;
            if (currentYear < 1990) return false;

            currentDay = daysInYear(currentYear);
            return true;
        };

        while (currentYear >= 1990) {
            const batchTasks: { year: number; day: number; hour: number; minute: number; tipo: string }[] = [];

            while (batchTasks.length < BATCH_SIZE && currentYear >= 1990) {
                for (const tipo of tipos) {
                    batchTasks.push({
                        year: currentYear,
                        day: currentDay,
                        hour: currentHour,
                        minute: currentMinute,
                        tipo,
                    });
                }
                const hasNext = decrementTime();
                if (!hasNext) break;
            }

            if (batchTasks.length === 0) break;

            const results = await Promise.allSettled(
                batchTasks.map(({ year, day, hour, minute, tipo }) => {
                    const populatedUrl = endpointApiUrl
                        .replace('{estacao}', estacao)
                        .replace('{ano}', String(year))
                        .replace('{dia}', String(day))
                        .replace('{hora}', String(hour))
                        .replace('{minuto}', String(minute))
                        .replace('{tipo}', tipo);

                    return ingestEndpoint(endpointApiUrl, populatedUrl);
                })
            );

            let shouldStop = false;
            for (const res of results) {
                const hasData = res.status === 'fulfilled' && res.value;
                if (hasData) {
                    consecutiveEmpty = 0;
                } else {
                    consecutiveEmpty++;
                    if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
                        shouldStop = true;
                        break;
                    }
                }
            }

            if (shouldStop) {
                logger.info({ estacao }, `Limite de ${MAX_CONSECUTIVE_EMPTY} requisições consecutivas sem dados atingido. Finalizando estação.`);
                break;
            }
        }
    }
}

async function ingestPesquisasPeriodosIndicadoresResultados(endpointApiUrl: string) {
    const pesquisas = await normalizedDb
        .select({ id: silverPesquisas.id, nome: silverPesquisas.nome })
        .from(silverPesquisas);

    const estados = await normalizedDb
        .select({ id: silverLocalidadesEstados.id })
        .from(silverLocalidadesEstados);

    const controlLocalidades = ['0', '1', '2', '3', '4', '5', ...estados.map((e) => String(e.id))].join('|');

    const municipios = await normalizedDb
        .select({ id: silverLocalidadesMunicipios.id, ufId: silverLocalidadesMunicipios.ufId })
        .from(silverLocalidadesMunicipios);

    const municipiosByUf = new Map<number, string[]>();
    for (const m of municipios) {
        if (!m.ufId) continue;
        if (!municipiosByUf.has(m.ufId)) municipiosByUf.set(m.ufId, []);
        municipiosByUf.get(m.ufId)!.push(String(m.id));
    }

    const MUNICIPIO_CHUNK_SIZE = 120;
    const BATCH_SIZE = 15;

    for (const pesquisa of pesquisas) {
        const periodRecords = await normalizedDb
            .select({
                periodo: silverPesquisasPeriodos.periodo,
                versao: silverPesquisasPeriodos.versao,
            })
            .from(silverPesquisasPeriodos)
            .where(sql`${silverPesquisasPeriodos.pesquisaId} = ${pesquisa.id}`);

        const versionMap = new Map<number, string[]>();
        for (const p of periodRecords) {
            const v = p.versao ?? 0;
            if (!versionMap.has(v)) versionMap.set(v, []);
            versionMap.get(v)!.push(p.periodo);
        }

        const periodQueries = versionMap.size > 0
            ? Array.from(versionMap.values()).map((list) => list.join('|'))
            : [];

        if (periodQueries.length === 0) continue;

        const localityChunks: string[] = [controlLocalidades];

        const coversMunicipios = await checkPesquisaCoversMunicipios(pesquisa.id, pesquisa.nome, periodQueries[0]);
        if (coversMunicipios) {
            for (const munList of municipiosByUf.values()) {
                for (let i = 0; i < munList.length; i += MUNICIPIO_CHUNK_SIZE) {
                    localityChunks.push(munList.slice(i, i + MUNICIPIO_CHUNK_SIZE).join('|'));
                }
            }
        }

        for (const periodPipe of periodQueries) {
            for (let j = 0; j < localityChunks.length; j += BATCH_SIZE) {
                const batchLocalities = localityChunks.slice(j, j + BATCH_SIZE);
                const promises = batchLocalities.map((loc) => {
                    const populatedUrl = endpointApiUrl
                        .replace('{pesquisa}', String(pesquisa.id))
                        .replace('{periodos}', periodPipe)
                        .replace('{posicao}', '0')
                        .replace('{localidades}', loc);

                    return ingestEndpoint(endpointApiUrl, populatedUrl);
                });

                await Promise.allSettled(promises);
            }
        }
    }
}

async function ingestPesquisasIndicadoresResultados(endpointApiUrl: string) {
    const pesquisas = await normalizedDb
        .select({ id: silverPesquisas.id, nome: silverPesquisas.nome })
        .from(silverPesquisas);

    const estados = await normalizedDb
        .select({ id: silverLocalidadesEstados.id })
        .from(silverLocalidadesEstados);

    const controlLocalidades = ['0', '1', '2', '3', '4', '5', ...estados.map((e) => String(e.id))].join('|');

    const municipios = await normalizedDb
        .select({ id: silverLocalidadesMunicipios.id, ufId: silverLocalidadesMunicipios.ufId })
        .from(silverLocalidadesMunicipios);

    const municipiosByUf = new Map<number, string[]>();
    for (const m of municipios) {
        if (!m.ufId) continue;
        if (!municipiosByUf.has(m.ufId)) municipiosByUf.set(m.ufId, []);
        municipiosByUf.get(m.ufId)!.push(String(m.id));
    }

    const MUNICIPIO_CHUNK_SIZE = 120;
    const BATCH_SIZE = 15;

    for (const pesquisa of pesquisas) {
        const periodRecords = await normalizedDb
            .select({
                periodo: silverPesquisasPeriodos.periodo,
                versao: silverPesquisasPeriodos.versao,
            })
            .from(silverPesquisasPeriodos)
            .where(sql`${silverPesquisasPeriodos.pesquisaId} = ${pesquisa.id}`);

        const versionMap = new Map<number, string[]>();
        for (const p of periodRecords) {
            const v = p.versao ?? 0;
            if (!versionMap.has(v)) versionMap.set(v, []);
            versionMap.get(v)!.push(p.periodo);
        }

        const periodQueries = versionMap.size > 0
            ? Array.from(versionMap.values()).map((list) => list.join('|'))
            : [''];

        const localityChunks: string[] = [controlLocalidades];

        const coversMunicipios = await checkPesquisaCoversMunicipios(pesquisa.id, pesquisa.nome, periodQueries[0]);
        if (coversMunicipios) {
            for (const munList of municipiosByUf.values()) {
                for (let i = 0; i < munList.length; i += MUNICIPIO_CHUNK_SIZE) {
                    localityChunks.push(munList.slice(i, i + MUNICIPIO_CHUNK_SIZE).join('|'));
                }
            }
        }

        for (const period of periodQueries) {
            for (let j = 0; j < localityChunks.length; j += BATCH_SIZE) {
                const batchLocalities = localityChunks.slice(j, j + BATCH_SIZE);
                const promises = batchLocalities.map((loc) => {
                    const urlObj = new URL(
                        endpointApiUrl
                            .replace('{pesquisa}', String(pesquisa.id))
                            .replace('{posicao}', '0')
                            .replace('{localidades}', loc)
                    );
                    if (period) {
                        urlObj.searchParams.set('periodo', period);
                    }
                    return ingestEndpoint(endpointApiUrl, urlObj.toString());
                });

                await Promise.allSettled(promises);
            }
        }
    }
}

async function ingestPesquisasPeriodosRankings(endpointApiUrl: string) {
    const pesquisas = await normalizedDb
        .select({ id: silverPesquisas.id })
        .from(silverPesquisas);

    for (const pesquisa of pesquisas) {
        const periodRecords = await normalizedDb
            .select({
                periodo: silverPesquisasPeriodos.periodo,
                versao: silverPesquisasPeriodos.versao,
            })
            .from(silverPesquisasPeriodos)
            .where(sql`${silverPesquisasPeriodos.pesquisaId} = ${pesquisa.id}`);

        const versionMap = new Map<number, string[]>();
        for (const p of periodRecords) {
            const v = p.versao ?? 0;
            if (!versionMap.has(v)) versionMap.set(v, []);
            versionMap.get(v)!.push(p.periodo);
        }

        const periodQueries = versionMap.size > 0
            ? Array.from(versionMap.values()).map((list) => list.join('|'))
            : [];

        if (periodQueries.length === 0) continue;

        let indicatorsData: any = null;

        const rawResponse = await rawDb.query.RawRootResponses.findFirst({
            where: (row, { like }) => like(row.apiUrl, `%servicodados.ibge.gov.br/api/v1/pesquisas/${pesquisa.id}/indicadores%`),
        });

        if (rawResponse && rawResponse.payload) {
            indicatorsData = rawResponse.payload;
        } else {
            try {
                const res = await fetchWithBackoff(`https://servicodados.ibge.gov.br/api/v1/pesquisas/${pesquisa.id}/indicadores`);
                indicatorsData = res.data;
            } catch {
                continue;
            }
        }

        if (!indicatorsData || !Array.isArray(indicatorsData)) continue;

        const ids: string[] = [];
        const traverse = (node: any) => {
            if (!node) return;
            if (node.id) ids.push(String(node.id));
            if (Array.isArray(node.children)) {
                for (const child of node.children) {
                    traverse(child);
                }
            }
        };

        for (const item of indicatorsData) {
            traverse(item);
        }

        if (ids.length === 0) continue;

        const CHUNK_SIZE = 20;
        const chunks: string[] = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            chunks.push(ids.slice(i, i + CHUNK_SIZE).join('|'));
        }

        const tasks: { periodPipe: string; indicatorChunk: string }[] = [];
        for (const periodPipe of periodQueries) {
            for (const chunk of chunks) {
                tasks.push({ periodPipe, indicatorChunk: chunk });
            }
        }

        const BATCH_SIZE = 15;
        for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
            const batch = tasks.slice(i, i + BATCH_SIZE);
            const promises = batch.map(({ periodPipe, indicatorChunk }) => {
                const populatedUrl = endpointApiUrl
                    .replace('{pesquisa}', String(pesquisa.id))
                    .replace('{periodos}', periodPipe)
                    .replace('{indicador}', indicatorChunk);

                return ingestEndpoint(endpointApiUrl, populatedUrl);
            });

            await Promise.allSettled(promises);
        }
    }
}

async function ingestRbmcRinex3(endpointApiUrl: string) {
    const stations = await normalizedDb
        .select({ codigoEstacao: silverBdgEstacoes.codigoEstacao })
        .from(silverBdgEstacoes);

    if (stations.length === 0) {
        logger.warn("Nenhuma estação encontrada em silverBdgEstacoes para ingestão de RBMC RINEX3.");
        return;
    }

    const stationCodes = Array.from(
        new Set(
            stations
                .map((s) => String(s.codigoEstacao).trim().toLowerCase())
                .filter((s) => s.length === 4)
        )
    );

    const targetStations = stationCodes.length > 0
        ? stationCodes
        : Array.from(new Set(stations.map((s) => String(s.codigoEstacao).trim().toLowerCase())));

    const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInYear = (y: number) => (isLeapYear(y) ? 366 : 365);
    const MAX_CONSECUTIVE_EMPTY = 30;
    const BATCH_SIZE = 15;

    for (const estacao of targetStations) {
        const now = new Date();
        let currentYear = now.getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const diffMs = now.getTime() - startOfYear.getTime();
        let currentDay = Math.min(Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1, daysInYear(currentYear));

        let consecutiveEmpty = 0;

        while (currentYear >= 1990) {
            const batchPairs: { year: number; day: number }[] = [];

            for (let i = 0; i < BATCH_SIZE; i++) {
                batchPairs.push({ year: currentYear, day: currentDay });
                currentDay--;
                if (currentDay < 1) {
                    currentYear--;
                    if (currentYear < 1990) break;
                    currentDay = daysInYear(currentYear);
                }
            }

            if (batchPairs.length === 0) break;

            const results = await Promise.allSettled(
                batchPairs.map(({ year, day }) => {
                    const populatedUrl = endpointApiUrl
                        .replace('{estacao}', estacao)
                        .replace('{ano}', String(year))
                        .replace('{dia}', String(day));

                    return ingestEndpoint(endpointApiUrl, populatedUrl);
                })
            );

            let shouldStop = false;
            for (const res of results) {
                const hasData = res.status === 'fulfilled' && res.value;
                if (hasData) {
                    consecutiveEmpty = 0;
                } else {
                    consecutiveEmpty++;
                    if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
                        shouldStop = true;
                        break;
                    }
                }
            }

            if (shouldStop) {
                logger.info({ estacao }, `Limite de ${MAX_CONSECUTIVE_EMPTY} dias consecutivos sem dados atingido. Finalizando estação.`);
                break;
            }
        }
    }
}

async function ingestRbmcRinex2(endpointApiUrl: string) {
    const stations = await normalizedDb
        .select({ codigoEstacao: silverBdgEstacoes.codigoEstacao })
        .from(silverBdgEstacoes);

    if (stations.length === 0) {
        logger.warn("Nenhuma estação encontrada em silverBdgEstacoes para ingestão de RBMC RINEX2.");
        return;
    }

    const stationCodes = Array.from(
        new Set(
            stations
                .map((s) => String(s.codigoEstacao).trim().toLowerCase())
                .filter((s) => s.length === 4)
        )
    );

    const targetStations = stationCodes.length > 0
        ? stationCodes
        : Array.from(new Set(stations.map((s) => String(s.codigoEstacao).trim().toLowerCase())));

    const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInYear = (y: number) => (isLeapYear(y) ? 366 : 365);
    const MAX_CONSECUTIVE_EMPTY = 30;
    const BATCH_SIZE = 15;

    for (const estacao of targetStations) {
        const now = new Date();
        let currentYear = now.getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const diffMs = now.getTime() - startOfYear.getTime();
        let currentDay = Math.min(Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1, daysInYear(currentYear));

        let consecutiveEmpty = 0;

        while (currentYear >= 1990) {
            const batchPairs: { year: number; day: number }[] = [];

            for (let i = 0; i < BATCH_SIZE; i++) {
                batchPairs.push({ year: currentYear, day: currentDay });
                currentDay--;
                if (currentDay < 1) {
                    currentYear--;
                    if (currentYear < 1990) break;
                    currentDay = daysInYear(currentYear);
                }
            }

            if (batchPairs.length === 0) break;

            const results = await Promise.allSettled(
                batchPairs.map(({ year, day }) => {
                    const populatedUrl = endpointApiUrl
                        .replace('{estacao}', estacao)
                        .replace('{ano}', String(year))
                        .replace('{dia}', String(day));

                    return ingestEndpoint(endpointApiUrl, populatedUrl);
                })
            );

            let shouldStop = false;
            for (const res of results) {
                const hasData = res.status === 'fulfilled' && res.value;
                if (hasData) {
                    consecutiveEmpty = 0;
                } else {
                    consecutiveEmpty++;
                    if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
                        shouldStop = true;
                        break;
                    }
                }
            }

            if (shouldStop) {
                logger.info({ estacao }, `Limite de ${MAX_CONSECUTIVE_EMPTY} dias consecutivos sem dados atingido. Finalizando estação.`);
                break;
            }
        }
    }
}

async function ingestAgregadosPeriodosVariaveis(endpointApiUrl: string) {
    const metadados = await normalizedDb
        .select({
            id: silverAgregadosMetadados.id,
            periodoInicio: silverAgregadosMetadados.periodoInicio,
            periodoFim: silverAgregadosMetadados.periodoFim,
            nivelTerritorial: silverAgregadosMetadados.nivelTerritorial,
        })
        .from(silverAgregadosMetadados);

    const agregadosList = await normalizedDb
        .select({ id: silverAgregados.id })
        .from(silverAgregados);

    const metaMap = new Map<string, (typeof metadados)[0]>();
    for (const m of metadados) {
        metaMap.set(String(m.id), m);
    }

    const agregadoIds = agregadosList.length > 0
        ? agregadosList.map((a) => String(a.id))
        : metadados.map((m) => String(m.id));

    if (agregadoIds.length === 0) {
        logger.warn("Nenhum agregado encontrado para ingestão de variáveis por período.");
        return;
    }

    const BATCH_SIZE = 15;
    for (let i = 0; i < agregadoIds.length; i += BATCH_SIZE) {
        const batch = agregadoIds.slice(i, i + BATCH_SIZE);
        const promises = batch.map((agregadoId) => {
            const meta = metaMap.get(agregadoId);

            let period = '-1';
            if (meta?.periodoInicio && meta?.periodoFim) {
                period = meta.periodoInicio === meta.periodoFim
                    ? String(meta.periodoInicio)
                    : `${meta.periodoInicio}-${meta.periodoFim}`;
            } else if (meta?.periodoFim) {
                period = String(meta.periodoFim);
            }

            let localidade = 'BR';
            if (meta?.nivelTerritorial && typeof meta.nivelTerritorial === 'object') {
                const levels = Object.keys(meta.nivelTerritorial);
                if (!levels.includes('N1') && levels.length > 0 && levels[0]) {
                    localidade = levels[0];
                }
            }

            const populatedUrl = endpointApiUrl
                .replace('{agregado}', agregadoId)
                .replace('{periodos}', period)
                .replace('{variavel}', 'all');

            const urlObj = new URL(populatedUrl);
            if (!urlObj.searchParams.has('localidades')) {
                urlObj.searchParams.set('localidades', localidade);
            }

            return ingestEndpoint(endpointApiUrl, urlObj.toString());
        });

        await Promise.allSettled(promises);
    }
}

async function ingestPesquisasPeriodosIndicadores(endpointApiUrl: string) {
    const pesquisas = await normalizedDb
        .select({ id: silverPesquisas.id })
        .from(silverPesquisas);

    for (const pesquisa of pesquisas) {
        const periodRecords = await normalizedDb
            .select({
                periodo: silverPesquisasPeriodos.periodo,
                versao: silverPesquisasPeriodos.versao,
            })
            .from(silverPesquisasPeriodos)
            .where(sql`${silverPesquisasPeriodos.pesquisaId} = ${pesquisa.id}`);

        const versionMap = new Map<number, string[]>();
        for (const p of periodRecords) {
            const v = p.versao ?? 0;
            if (!versionMap.has(v)) versionMap.set(v, []);
            versionMap.get(v)!.push(p.periodo);
        }

        const periodQueries = versionMap.size > 0
            ? Array.from(versionMap.values()).map((list) => list.join('|'))
            : [];

        if (periodQueries.length === 0) continue;

        const promises = periodQueries.map((periodPipe) => {
            const populatedUrl = endpointApiUrl
                .replace('{pesquisa}', String(pesquisa.id))
                .replace('{periodos}', periodPipe)
                .replace('{posicao}', '0');

            return ingestEndpoint(endpointApiUrl, populatedUrl);
        });

        await Promise.allSettled(promises);
    }
}

function formatRmpgDate(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}-${hh}-${min}`;
}

async function ingestRmpgCustomizado(endpointApiUrl: string) {
    const maregrafos = await normalizedDb
        .select({ siglaMaregrafo: silverRmpgMaregrafos.siglaMaregrafo })
        .from(silverRmpgMaregrafos);

    const sensores = await normalizedDb
        .select({ codigoSensor: silverRmpgSensores.codigoSensor })
        .from(silverRmpgSensores);

    if (maregrafos.length === 0 || sensores.length === 0) {
        logger.warn("Nenhum marégrafo ou sensor encontrado para ingestão de RMPG customizado.");
        return;
    }

    const sensorIds = sensores.map((s) => String(s.codigoSensor));
    const SENSOR_CHUNK_SIZE = 2;
    const sensorChunks: string[] = [];
    for (let i = 0; i < sensorIds.length; i += SENSOR_CHUNK_SIZE) {
        sensorChunks.push(sensorIds.slice(i, i + SENSOR_CHUNK_SIZE).join('|'));
    }

    const now = new Date();
    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const momentoInicial = formatRmpgDate(pastDate);
    const momentoFinal = formatRmpgDate(now);

    const tasks: { maregrafo: string; sensorPipe: string }[] = [];
    for (const m of maregrafos) {
        for (const sChunk of sensorChunks) {
            tasks.push({ maregrafo: m.siglaMaregrafo, sensorPipe: sChunk });
        }
    }

    const BATCH_SIZE = 15;
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
        const batch = tasks.slice(i, i + BATCH_SIZE);
        const promises = batch.map(({ maregrafo, sensorPipe }) => {
            const urlObj = new URL(
                endpointApiUrl
                    .replace('{maregrafos}', maregrafo)
                    .replace('{sensores}', sensorPipe)
            );
            urlObj.searchParams.set('momentoInicial', momentoInicial);
            urlObj.searchParams.set('momentoFinal', momentoFinal);

            return ingestEndpoint(endpointApiUrl, urlObj.toString());
        });

        await Promise.allSettled(promises);
    }
}

async function ingestPesquisasGlobalResultados(endpointApiUrl: string) {
    const rawResponses = await rawDb.query.RawRootResponses.findMany({
        where: (row, { like }) => like(row.apiUrl, '%/pesquisas/%/indicadores%'),
    });

    const indicatorIdsSet = new Set<string>();

    const traverse = (node: any) => {
        if (!node) return;
        if (node.id) indicatorIdsSet.add(String(node.id));
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    };

    for (const r of rawResponses) {
        if (Array.isArray(r.payload)) {
            for (const item of r.payload) {
                traverse(item);
            }
        }
    }

    if (indicatorIdsSet.size === 0) {
        logger.warn("Nenhum indicador encontrado em respostas brutas para ingestão global.");
        return;
    }

    const indicatorIds = Array.from(indicatorIdsSet);
    const INDICATOR_CHUNK_SIZE = 8;
    const indicatorChunks: string[] = [];
    for (let i = 0; i < indicatorIds.length; i += INDICATOR_CHUNK_SIZE) {
        indicatorChunks.push(indicatorIds.slice(i, i + INDICATOR_CHUNK_SIZE).join('|'));
    }

    const estados = await normalizedDb
        .select({ id: silverLocalidadesEstados.id })
        .from(silverLocalidadesEstados);

    const controlLocalidades = ['1', ...estados.map((e) => String(e.id))].join('|');

    const municipios = await normalizedDb
        .select({ id: silverLocalidadesMunicipios.id, ufId: silverLocalidadesMunicipios.ufId })
        .from(silverLocalidadesMunicipios);

    const municipiosByUf = new Map<number, string[]>();
    for (const m of municipios) {
        if (!m.ufId) continue;
        if (!municipiosByUf.has(m.ufId)) municipiosByUf.set(m.ufId, []);
        municipiosByUf.get(m.ufId)!.push(String(m.id));
    }

    const MUNICIPIO_CHUNK_SIZE = 120;
    const localityChunks: string[] = [controlLocalidades];

    for (const munList of municipiosByUf.values()) {
        for (let i = 0; i < munList.length; i += MUNICIPIO_CHUNK_SIZE) {
            localityChunks.push(munList.slice(i, i + MUNICIPIO_CHUNK_SIZE).join('|'));
        }
    }

    const BATCH_SIZE = 15;
    for (const indChunk of indicatorChunks) {
        for (let j = 0; j < localityChunks.length; j += BATCH_SIZE) {
            const batchLocalities = localityChunks.slice(j, j + BATCH_SIZE);
            const promises = batchLocalities.map((locChunk) => {
                const populatedUrl = endpointApiUrl
                    .replace('{indicador}', indChunk)
                    .replace('{localidade}', locChunk);

                return ingestEndpoint(endpointApiUrl, populatedUrl);
            });

            await Promise.allSettled(promises);
        }
    }
}

async function ingestRbmcOrbitas(endpointApiUrl: string) {
    const now = new Date();
    let currentYear = now.getFullYear();
    const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInYear = (y: number) => (isLeapYear(y) ? 366 : 365);

    const startOfYear = new Date(currentYear, 0, 1);
    const diffMs = now.getTime() - startOfYear.getTime();
    let currentDay = Math.min(Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1, daysInYear(currentYear));

    const MAX_CONSECUTIVE_EMPTY = 30;
    let consecutiveEmpty = 0;
    const BATCH_SIZE = 15;

    while (currentYear >= 1990) {
        const batchPairs: { year: number; day: number }[] = [];

        for (let i = 0; i < BATCH_SIZE; i++) {
            batchPairs.push({ year: currentYear, day: currentDay });
            currentDay--;
            if (currentDay < 1) {
                currentYear--;
                if (currentYear < 1990) break;
                currentDay = daysInYear(currentYear);
            }
        }

        if (batchPairs.length === 0) break;

        const results = await Promise.allSettled(
            batchPairs.map(({ year, day }) => {
                const populatedUrl = endpointApiUrl
                    .replace('{ano}', String(year))
                    .replace('{dia}', String(day));

                return ingestEndpoint(endpointApiUrl, populatedUrl);
            })
        );

        let shouldStop = false;
        for (const res of results) {
            const hasData = res.status === 'fulfilled' && res.value;
            if (hasData) {
                consecutiveEmpty = 0;
            } else {
                consecutiveEmpty++;
                if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
                    shouldStop = true;
                    break;
                }
            }
        }

        if (shouldStop) {
            logger.info(`Limite de ${MAX_CONSECUTIVE_EMPTY} dias consecutivos sem dados atingido. Finalizando ingestão de órbitas RBMC.`);
            break;
        }
    }
}

async function ingestPesquisasRankings(endpointApiUrl: string) {
    const pesquisas = await normalizedDb
        .select({ id: silverPesquisas.id })
        .from(silverPesquisas);

    for (const pesquisa of pesquisas) {
        let indicatorsData: any = null;

        const rawResponse = await rawDb.query.RawRootResponses.findFirst({
            where: (row, { like }) => like(row.apiUrl, `%servicodados.ibge.gov.br/api/v1/pesquisas/${pesquisa.id}/indicadores%`),
        });

        if (rawResponse && rawResponse.payload) {
            indicatorsData = rawResponse.payload;
        } else {
            try {
                const res = await fetchWithBackoff(`https://servicodados.ibge.gov.br/api/v1/pesquisas/${pesquisa.id}/indicadores`);
                indicatorsData = res.data;
            } catch {
                continue;
            }
        }

        if (!indicatorsData || !Array.isArray(indicatorsData)) continue;

        const ids: string[] = [];
        const traverse = (node: any) => {
            if (!node) return;
            if (node.id) ids.push(String(node.id));
            if (Array.isArray(node.children)) {
                for (const child of node.children) {
                    traverse(child);
                }
            }
        };

        for (const item of indicatorsData) {
            traverse(item);
        }

        if (ids.length === 0) continue;

        const CHUNK_SIZE = 20;
        const chunks: string[] = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            chunks.push(ids.slice(i, i + CHUNK_SIZE).join('|'));
        }

        const BATCH_SIZE = 15;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const promises = batch.map((chunk) => {
                const populatedUrl = endpointApiUrl
                    .replace('{pesquisa}', String(pesquisa.id))
                    .replace('{indicador}', chunk);

                return ingestEndpoint(endpointApiUrl, populatedUrl);
            });

            await Promise.allSettled(promises);
        }
    }
}

async function ingestPaisesIndicadores(endpointApiUrl: string) {
    const countries = await normalizedDb
        .select({ isoAlpha2: silverLocalidadesPaises.isoAlpha2 })
        .from(silverLocalidadesPaises)
        .where(isNotNull(silverLocalidadesPaises.isoAlpha2));

    const indicators = await rawDb
        .select({ id: ibgeIdentificadores.id })
        .from(ibgeIdentificadores);

    if (countries.length === 0 || indicators.length === 0) {
        logger.warn("Nenhum país ou indicador encontrado para ingestão de países/indicadores.");
        return;
    }

    const countryCodes = countries.map((c) => String(c.isoAlpha2));
    const indicatorIds = indicators.map((i) => String(i.id));

    const COUNTRY_CHUNK_SIZE = 20;
    const INDICATOR_CHUNK_SIZE = 10;

    const countryChunks: string[] = [];
    for (let i = 0; i < countryCodes.length; i += COUNTRY_CHUNK_SIZE) {
        countryChunks.push(countryCodes.slice(i, i + COUNTRY_CHUNK_SIZE).join('|'));
    }

    const indicatorChunks: string[] = [];
    for (let j = 0; j < indicatorIds.length; j += INDICATOR_CHUNK_SIZE) {
        indicatorChunks.push(indicatorIds.slice(j, j + INDICATOR_CHUNK_SIZE).join('|'));
    }

    const tasks: { countryPipe: string; indicatorPipe: string }[] = [];
    for (const cChunk of countryChunks) {
        for (const iChunk of indicatorChunks) {
            tasks.push({ countryPipe: cChunk, indicatorPipe: iChunk });
        }
    }

    const BATCH_SIZE = 15;
    for (let k = 0; k < tasks.length; k += BATCH_SIZE) {
        const batch = tasks.slice(k, k + BATCH_SIZE);
        const promises = batch.map(({ countryPipe, indicatorPipe }) => {
            const populatedUrl = endpointApiUrl
                .replace('{paises}', countryPipe)
                .replace('{indicadores}', indicatorPipe);

            return ingestEndpoint(endpointApiUrl, populatedUrl);
        });

        await Promise.allSettled(promises);
    }
}

async function ingestPesquisasIndicadores(endpointApiUrl: string) {
    const pesquisas = await normalizedDb
        .select({ id: silverPesquisas.id })
        .from(silverPesquisas);

    const BATCH_SIZE = 15;

    for (let i = 0; i < pesquisas.length; i += BATCH_SIZE) {
        const batch = pesquisas.slice(i, i + BATCH_SIZE);

        const promises = batch.map((p) => {
            const populatedUrl = endpointApiUrl
                .replace('{pesquisa}', String(p.id))
                .replace('{posicao}', '0');

            return ingestEndpoint(endpointApiUrl, populatedUrl);
        });

        await Promise.allSettled(promises);
    }
}

async function checkPesquisaCoversMunicipios(pesquisaId: number, pesquisaNome: string, samplePeriod?: string): Promise<boolean> {
    const agregados = await normalizedDb
        .select({ nivelTerritorial: silverAgregadosMetadados.nivelTerritorial })
        .from(silverAgregadosMetadados)
        .where(sql`LOWER(${silverAgregadosMetadados.pesquisa}) = LOWER(${pesquisaNome})`);

    if (agregados.length > 0) {
        return agregados.some((a) => JSON.stringify(a.nivelTerritorial ?? '').includes('N6'));
    }

    try {
        const probeUrl = `https://servicodados.ibge.gov.br/api/v1/pesquisas/${pesquisaId}/resultados/3550308${samplePeriod ? `?periodo=${samplePeriod}` : ''}`;
        const { data } = await fetchWithBackoff(probeUrl, 2, 500);
        if (Array.isArray(data) && data.length > 0) {
            return data.some((item: any) => {
                if (!item?.res || !Array.isArray(item.res)) return false;
                return item.res.some((r: any) => r?.res && Object.values(r.res).some((val) => val !== null && val !== ''));
            });
        }
    } catch {
        return false;
    }

    return false;
}

async function ingestPesquisasResultados(endpointApiUrl: string) {
    const pesquisas = await normalizedDb
        .select({ id: silverPesquisas.id, nome: silverPesquisas.nome })
        .from(silverPesquisas);

    const estados = await normalizedDb
        .select({ id: silverLocalidadesEstados.id })
        .from(silverLocalidadesEstados);

    const municipios = await normalizedDb
        .select({ id: silverLocalidadesMunicipios.id, ufId: silverLocalidadesMunicipios.ufId })
        .from(silverLocalidadesMunicipios);

    const controlLocalidades = ['0', '1', '2', '3', '4', '5', ...estados.map((e) => String(e.id))].join('|');

    const municipiosByUf = new Map<number, string[]>();
    for (const m of municipios) {
        if (!m.ufId) continue;
        if (!municipiosByUf.has(m.ufId)) municipiosByUf.set(m.ufId, []);
        municipiosByUf.get(m.ufId)!.push(String(m.id));
    }

    for (const pesquisa of pesquisas) {
        const periodRecords = await normalizedDb
            .select({
                periodo: silverPesquisasPeriodos.periodo,
                versao: silverPesquisasPeriodos.versao,
            })
            .from(silverPesquisasPeriodos)
            .where(sql`${silverPesquisasPeriodos.pesquisaId} = ${pesquisa.id}`);

        const versionMap = new Map<number, string[]>();
        for (const p of periodRecords) {
            const v = p.versao ?? 0;
            if (!versionMap.has(v)) versionMap.set(v, []);
            versionMap.get(v)!.push(p.periodo);
        }

        const periodQueries = versionMap.size > 0
            ? Array.from(versionMap.values()).map((list) => list.join('|'))
            : [''];

        for (const period of periodQueries) {
            const urlObj = new URL(
                endpointApiUrl
                    .replace('{pesquisa}', String(pesquisa.id))
                    .replace('{localidades}', controlLocalidades)
            );
            if (period) {
                urlObj.searchParams.set('periodo', period);
            }
            await ingestEndpoint(endpointApiUrl, urlObj.toString());
        }

        const coversMunicipios = await checkPesquisaCoversMunicipios(pesquisa.id, pesquisa.nome, periodQueries[0]);
        if (coversMunicipios) {
            const ufBatches = Array.from(municipiosByUf.entries());
            const BATCH_SIZE = 15;

            for (let i = 0; i < ufBatches.length; i += BATCH_SIZE) {
                const batch = ufBatches.slice(i, i + BATCH_SIZE);
                const promises = batch.flatMap(([_, munIds]) => {
                    const munPipe = munIds.join('|');
                    return periodQueries.map((period) => {
                        const urlObj = new URL(
                            endpointApiUrl
                                .replace('{pesquisa}', String(pesquisa.id))
                                .replace('{localidades}', munPipe)
                        );
                        if (period) {
                            urlObj.searchParams.set('periodo', period);
                        }
                        return ingestEndpoint(endpointApiUrl, urlObj.toString());
                    });
                });
                await Promise.allSettled(promises);
            }
        }
    }
}

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

async function ingestEndpoint(endpointKey: string, baseUrl: string): Promise<boolean> {
    let currentPage = 1;
    let totalPages = 1; // Será atualizado dinamicamente na primeira resposta bem-sucedida
    let isPaginated = false;
    let hasInserted = false;

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

            hasInserted = true;
        } catch (error) {
            logger.error({ endpointKey, url: currentUrl, error: (error as Error).message }, 'Falha isolada na página. Prosseguindo para a próxima (se houver).');
            // O erro foi logado, mas o loop NÃO é interrompido (break).
            // Apenas incrementamos a página abaixo para continuar tentando o resto da fila.
        }

        currentPage++;
    }

    return hasInserted;
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

    const isDependentOnEstacoes = (url: string) => url.includes('/rbmc/relatorio/');
    const isPesquisasGlobalResultados = (url: string) => url.includes('/pesquisas/-/') && url.includes('/indicadores/') && url.includes('/resultados/');
    const isPesquisasPeriodosIndicadoresResultados = (url: string) => url.includes('/pesquisas/') && url.includes('/periodos/') && url.includes('/indicadores/') && url.includes('/resultados/');
    const isPesquisasIndicadoresResultados = (url: string) => url.includes('/pesquisas/') && url.includes('/indicadores/') && url.includes('/resultados/') && !url.includes('/pesquisas/-/') && !url.includes('/periodos/');
    const isPesquisasResultados = (url: string) => url.includes('/pesquisas/') && url.includes('/resultados/') && !url.includes('/indicadores/') && !url.includes('/pesquisas/-/');
    const isPesquisasPeriodosIndicadores = (url: string) => url.includes('/pesquisas/') && url.includes('/periodos/') && url.includes('/indicadores/') && !url.includes('/ranking') && !url.includes('/resultados/');
    const isPesquisasPeriodosRankings = (url: string) => url.includes('/pesquisas/') && url.includes('/periodos/') && url.includes('/ranking');
    const isPesquisasIndicadores = (url: string) => url.includes('/pesquisas/') && url.includes('/indicadores/') && !url.includes('/ranking') && !url.includes('/resultados/') && !url.includes('/periodos/');
    const isPesquisasRankings = (url: string) => url.includes('/pesquisas/') && url.includes('/ranking') && !url.includes('/periodos/');
    const isPaisesIndicadores = (url: string) => url.includes('/paises/') && url.includes('{paises}') && url.includes('/indicadores/');
    const isRbmcOrbitas = (url: string) => url.includes('/rbmc/') && url.includes('/orbitas/');
    const isRbmcRinex2 = (url: string) => url.includes('/rbmc/') && url.includes('/rinex2/');
    const isRbmcRinex31s = (url: string) => url.includes('/rbmc/') && url.includes('/rinex3/1s/');
    const isRbmcRinex3 = (url: string) => url.includes('/rbmc/') && url.includes('/rinex3/') && !url.includes('/orbitas/') && !url.includes('/rinex3/1s/');
    const isRmpgCustomizado = (url: string) => url.includes('/rmpg/customizado/');
    const isAgregadosPeriodosVariaveis = (url: string) => url.includes('/agregados/') && url.includes('/periodos/') && url.includes('/variaveis');
    const tier1Endpoints = childEndpoints.filter((ep) =>
        !isDependentOnEstacoes(ep.apiUrl) &&
        !isPesquisasGlobalResultados(ep.apiUrl) &&
        !isPesquisasPeriodosIndicadoresResultados(ep.apiUrl) &&
        !isPesquisasIndicadoresResultados(ep.apiUrl) &&
        !isPesquisasResultados(ep.apiUrl) &&
        !isPesquisasPeriodosIndicadores(ep.apiUrl) &&
        !isPesquisasPeriodosRankings(ep.apiUrl) &&
        !isPesquisasIndicadores(ep.apiUrl) &&
        !isPesquisasRankings(ep.apiUrl) &&
        !isPaisesIndicadores(ep.apiUrl) &&
        !isRbmcOrbitas(ep.apiUrl) &&
        !isRbmcRinex2(ep.apiUrl) &&
        !isRbmcRinex3(ep.apiUrl) &&
        !isRbmcRinex31s(ep.apiUrl) &&
        !isRmpgCustomizado(ep.apiUrl) &&
        !isAgregadosPeriodosVariaveis(ep.apiUrl)
    );
    const tier2Endpoints = childEndpoints.filter((ep) => isDependentOnEstacoes(ep.apiUrl));
    const pesquisasGlobalResultadosEndpoints = childEndpoints.filter((ep) => isPesquisasGlobalResultados(ep.apiUrl));
    const pesquisasPeriodosIndicadoresResultadosEndpoints = childEndpoints.filter((ep) => isPesquisasPeriodosIndicadoresResultados(ep.apiUrl));
    const pesquisasIndicadoresResultadosEndpoints = childEndpoints.filter((ep) => isPesquisasIndicadoresResultados(ep.apiUrl));
    const pesquisasResultadosEndpoints = childEndpoints.filter((ep) => isPesquisasResultados(ep.apiUrl));
    const pesquisasPeriodosIndicadoresEndpoints = childEndpoints.filter((ep) => isPesquisasPeriodosIndicadores(ep.apiUrl));
    const pesquisasPeriodosRankingsEndpoints = childEndpoints.filter((ep) => isPesquisasPeriodosRankings(ep.apiUrl));
    const pesquisasIndicadoresEndpoints = childEndpoints.filter((ep) => isPesquisasIndicadores(ep.apiUrl));
    const pesquisasRankingsEndpoints = childEndpoints.filter((ep) => isPesquisasRankings(ep.apiUrl));
    const paisesIndicadoresEndpoints = childEndpoints.filter((ep) => isPaisesIndicadores(ep.apiUrl));
    const rbmcOrbitasEndpoints = childEndpoints.filter((ep) => isRbmcOrbitas(ep.apiUrl));
    const rbmcRinex2Endpoints = childEndpoints.filter((ep) => isRbmcRinex2(ep.apiUrl));
    const rbmcRinex3Endpoints = childEndpoints.filter((ep) => isRbmcRinex3(ep.apiUrl));
    const rbmcRinex31sEndpoints = childEndpoints.filter((ep) => isRbmcRinex31s(ep.apiUrl));
    const rmpgCustomizadoEndpoints = childEndpoints.filter((ep) => isRmpgCustomizado(ep.apiUrl));
    const agregadosPeriodosVariaveisEndpoints = childEndpoints.filter((ep) => isAgregadosPeriodosVariaveis(ep.apiUrl));

    for (const endpoint of tier1Endpoints) {
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

    for (const endpoint of pesquisasResultadosEndpoints) {
        await ingestPesquisasResultados(endpoint.apiUrl);
    }

    for (const endpoint of pesquisasIndicadoresResultadosEndpoints) {
        await ingestPesquisasIndicadoresResultados(endpoint.apiUrl);
    }

    for (const endpoint of pesquisasPeriodosIndicadoresResultadosEndpoints) {
        await ingestPesquisasPeriodosIndicadoresResultados(endpoint.apiUrl);
    }

    for (const endpoint of pesquisasPeriodosIndicadoresEndpoints) {
        await ingestPesquisasPeriodosIndicadores(endpoint.apiUrl);
    }

    for (const endpoint of pesquisasIndicadoresEndpoints) {
        await ingestPesquisasIndicadores(endpoint.apiUrl);
    }

    for (const endpoint of pesquisasRankingsEndpoints) {
        await ingestPesquisasRankings(endpoint.apiUrl);
    }

    for (const endpoint of pesquisasPeriodosRankingsEndpoints) {
        await ingestPesquisasPeriodosRankings(endpoint.apiUrl);
    }

    for (const endpoint of pesquisasGlobalResultadosEndpoints) {
        await ingestPesquisasGlobalResultados(endpoint.apiUrl);
    }

    for (const endpoint of paisesIndicadoresEndpoints) {
        await ingestPaisesIndicadores(endpoint.apiUrl);
    }

    for (const endpoint of rbmcOrbitasEndpoints) {
        await ingestRbmcOrbitas(endpoint.apiUrl);
    }

    for (const endpoint of rmpgCustomizadoEndpoints) {
        await ingestRmpgCustomizado(endpoint.apiUrl);
    }

    for (const endpoint of agregadosPeriodosVariaveisEndpoints) {
        await ingestAgregadosPeriodosVariaveis(endpoint.apiUrl);
    }

    await runSilverBdgEstacoes();

    for (const endpoint of rbmcRinex2Endpoints) {
        await ingestRbmcRinex2(endpoint.apiUrl);
    }

    for (const endpoint of rbmcRinex3Endpoints) {
        await ingestRbmcRinex3(endpoint.apiUrl);
    }

    for (const endpoint of rbmcRinex31sEndpoints) {
        await ingestRbmcRinex31s(endpoint.apiUrl);
    }

    for (const endpoint of tier2Endpoints) {
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
    if (apiUrl.includes('/malhas/regioes/') && paramName === 'id') {
        const records = await normalizedDb
            .select({ id: silverLocalidadesRegioes.id })
            .from(silverLocalidadesRegioes);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/malhas/regioes-imediatas/') && paramName === 'id') {
        const records = await normalizedDb
            .select({ id: silverLocalidadesRegioesImediatas.id })
            .from(silverLocalidadesRegioesImediatas);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/malhas/regioes-intermediarias/') && paramName === 'id') {
        const records = await normalizedDb
            .select({ id: silverLocalidadesRegioesIntermediarias.id })
            .from(silverLocalidadesRegioesIntermediarias);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/malhas/estados/') && paramName === 'id') {
        const records = await normalizedDb
            .select({ id: silverLocalidadesEstados.id })
            .from(silverLocalidadesEstados);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/malhas/municipios/') && paramName === 'id') {
        const records = await normalizedDb
            .select({ id: silverLocalidadesMunicipios.id })
            .from(silverLocalidadesMunicipios);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/malhas/paises/') && paramName === 'id') {
        const records = await normalizedDb
            .select({ isoAlpha2: silverLocalidadesPaises.isoAlpha2 })
            .from(silverLocalidadesPaises)
            .where(isNotNull(silverLocalidadesPaises.isoAlpha2));

        return records.map((r) => String(r.isoAlpha2));
    }

    if (apiUrl.includes('/metadados/pesquisas/') && paramName === 'pesquisa') {
        const records = await normalizedDb
            .select({ codigo: silverMetadadosPesquisas.codigo })
            .from(silverMetadadosPesquisas);

        return records.map((r) => String(r.codigo));
    }

    if (apiUrl.includes('/paises/indicadores/') && paramName === 'indicadores') {
        const records = await rawDb
            .select({ id: ibgeIdentificadores.id })
            .from(ibgeIdentificadores);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/paises/') && paramName === 'paises') {
        const records = await normalizedDb
            .select({ isoAlpha2: silverLocalidadesPaises.isoAlpha2 })
            .from(silverLocalidadesPaises)
            .where(isNotNull(silverLocalidadesPaises.isoAlpha2));

        return records.map((r) => String(r.isoAlpha2));
    }

    if (apiUrl.includes('/v1/pesquisas/') && paramName === 'pesquisa') {
        const records = await normalizedDb
            .select({ id: silverPesquisas.id })
            .from(silverPesquisas);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/pesquisas/') && apiUrl.includes('/periodos/') && paramName === 'periodos') {
        const records = await normalizedDb
            .select({ periodo: silverPesquisasPeriodos.periodo })
            .from(silverPesquisasPeriodos);

        return records.map((r) => String(r.periodo));
    }

    if (apiUrl.includes('/pesquisas/') && apiUrl.includes('/indicadores/') && paramName === 'posicao') {
        return ['0'];
    }

    if (apiUrl.includes('/publicacoes/') && paramName === 'produto') {
        const records = await normalizedDb
            .select({ id: silverProdutos.id })
            .from(silverProdutos);

        return records.map((r) => String(r.id));
    }

    if ((apiUrl.includes('/bdg/estado/') || apiUrl.includes('/bngb/uf/')) && paramName === 'sigla') {
        const records = await normalizedDb
            .select({ sigla: silverLocalidadesEstados.sigla })
            .from(silverLocalidadesEstados)
            .where(isNotNull(silverLocalidadesEstados.sigla));

        return records.map((r) => String(r.sigla));
    }

    if (apiUrl.includes('/rbmc/relatorio/') && paramName === 'estacao') {
        const records = await normalizedDb
            .select({ codigoEstacao: silverBdgEstacoes.codigoEstacao })
            .from(silverBdgEstacoes);

        return records.map((r) => String(r.codigoEstacao));
    }

    if ((apiUrl.includes('/rbmc/rinex2/') || apiUrl.includes('/rbmc/rinex3/')) && paramName === 'estacao') {
        const records = await normalizedDb
            .select({ codigoEstacao: silverBdgEstacoes.codigoEstacao })
            .from(silverBdgEstacoes);

        return records.map((r) => String(r.codigoEstacao).trim().toLowerCase());
    }

    if ((apiUrl.includes('/rmpg/previsao/') || apiUrl.includes('/rmpg/nivel/') || apiUrl.includes('/rmpg/meteorologia/')) && paramName === 'maregrafo') {
        const records = await normalizedDb
            .select({ siglaMaregrafo: silverRmpgMaregrafos.siglaMaregrafo })
            .from(silverRmpgMaregrafos);

        return records.map((r) => String(r.siglaMaregrafo));
    }

    if (apiUrl.includes('/rmpg/customizado/') && paramName === 'maregrafos') {
        const records = await normalizedDb
            .select({ siglaMaregrafo: silverRmpgMaregrafos.siglaMaregrafo })
            .from(silverRmpgMaregrafos);

        return records.map((r) => String(r.siglaMaregrafo));
    }

    if (apiUrl.includes('/rmpg/customizado/') && paramName === 'sensores') {
        const records = await normalizedDb
            .select({ codigoSensor: silverRmpgSensores.codigoSensor })
            .from(silverRmpgSensores);

        return records.map((r) => String(r.codigoSensor));
    }

    if (apiUrl.includes('/agregados/') && paramName === 'agregado') {
        const records = await normalizedDb
            .select({ id: silverAgregados.id })
            .from(silverAgregados);

        return records.map((r) => String(r.id));
    }

    if (apiUrl.includes('/indicadores/') && paramName === 'indicadores') {
        const records = await rawDb
            .select({ id: ibgeIdentificadores.id })
            .from(ibgeIdentificadores);

        return records.map((r) => String(r.id));
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
        await runSilverPhase2();
        logger.info("Pipeline de ingestão finalizado com sucesso.");
    } catch (error) {
        logger.error({ error }, "Erro fatal na execução do pipeline de ingestão.");
        throw error;
    }
}