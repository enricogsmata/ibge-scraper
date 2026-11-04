export interface ExclusionRule {
    category: string;
    reason: string;
    pattern: RegExp;
}

/**
 * Padrões que cobrem exatamente as 90 URLs excluídas para ingestão.
 */
export const EXCLUDED_ENDPOINT_RULES: ExclusionRule[] = [
    {
        category: "CALCULATOR_TOOL",
        reason: "Ferramenta de cálculo/conversão sob demanda que não armazena dataset (HGEOHNOR, PROGRID, PPP)",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v1\/(hgeohnor|progrid|ppp)(\/.*)?$/i
    },
    {
        category: "LOCALIDADES_SUBFILTER",
        reason: "Subfiltro territorial redundante (a base completa já é obtida nas rotas raiz /localidades/<entidade>)",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v1\/localidades\/[^\/]+\/.+$/i
    },
    {
        category: "CNAE_SUBFILTER",
        reason: "Subfiltro hierárquico CNAE redundante (as 5 rotas raiz /cnae/<entidade> trazem 100% da classificação)",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v2\/cnae\/[^\/]+\/.+$/i
    },
    {
        category: "BDG_SUBFILTER",
        reason: "Filtros por raio, município ou estação individual (a ingestão particionada ocorre por estado/{sigla}/estacoes)",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v1\/bdg\/(estacoes|municipio|proximidade|enquadramento)(\/.*)?$/i
    },
    {
        category: "BNGB_SUBFILTER",
        reason: "Filtros pontuais e territoriais redundantes (a extração completa ocorre por uf/{sigla}/nomesgeograficos)",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v1\/bngb\/(nomegeografico|padrao|municipio|proximidade|enquadramento|categoria|classe)(\/.*)?$/i
    },
    {
        category: "AGREGADOS_PARTIAL_METADATA",
        reason: "Recortes parciais de agregados já entregues integralmente pelo endpoint /metadados",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v3\/agregados\/[^\/]+\/(localidades|periodos|variaveis)(\/[^\/]+)?$/i
    },
    {
        category: "CALENDARIO_FILTER",
        reason: "Filtro por pesquisa avulsa (o endpoint raiz /calendario/ já traz o cronograma completo)",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v3\/calendario\/.+$/i
    },
    {
        category: "METADADOS_DETAIL",
        reason: "Filtro granular de metadados por data/ordem",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v2\/metadados\/[^\/]+\/[^\/]+\/[^\/]+\/.+$/i
    },
    {
        category: "NOMES_UNITARY_QUERY",
        reason: "Pesquisa unitária de um único prenome (apenas a rota /ranking é persistida)",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v2\/censos\/nomes\/(?!ranking$)[^\/]+$/i
    },
    {
        category: "PESQUISAS_REDUNDANT",
        reason: "Consulta unitária pontual redundante frente à listagem mestre /pesquisas",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v1\/pesquisas\/\{pesquisas\}\/?$/i
    }
];

/**
 * Verifica se a URL deve ser descartada da esteira de ingestão.
 * @param url URL da API a ser analisada
 * @returns true se o endpoint deve ser ignorado; false se for um endpoint de ingestão válido.
 */
export function isExcludedEndpoint(url: string): boolean {
    const cleanUrl = url.trim();
    return EXCLUDED_ENDPOINT_RULES.some(rule => rule.pattern.test(cleanUrl));
}

/**
 * Retorna os detalhes de descarte (categoria e motivo) caso a URL seja excluída.
 */
export function getExclusionDetails(url: string): { isExcluded: boolean; category?: string; reason?: string } {
    const cleanUrl = url.trim();
    const match = EXCLUDED_ENDPOINT_RULES.find(rule => rule.pattern.test(cleanUrl));

    if (match) {
        return {
            isExcluded: true,
            category: match.category,
            reason: match.reason
        };
    }

    return { isExcluded: false };
}

export interface RouteMapping {
    template: string;
    tableName: string;
    pattern: RegExp;
}

const RAW_MAPPINGS: Array<[string, string]> = [
    // 1. Agregados e Séries (SIDRA / Censos)
    ["https://servicodados.ibge.gov.br/api/v3/agregados", "ibge_agregados"],
    ["https://servicodados.ibge.gov.br/api/v3/agregados/{agregado}/metadados", "ibge_agregados_metadados"],
    ["https://servicodados.ibge.gov.br/api/v3/agregados/{agregado}/periodos/{periodos}/variaveis/{variavel}", "ibge_agregados_dados"],

    // 2. Banco de Dados Geodésicos (BDG)
    ["https://servicodados.ibge.gov.br/api/v1/bdg/estado/{sigla}/estacoes", "ibge_bdg_estacoes"],
    ["https://servicodados.ibge.gov.br/api/v1/bdg/local", "ibge_bdg_locais"],
    ["https://servicodados.ibge.gov.br/api/v1/bdg/situacao", "ibge_bdg_situacoes"],
    ["https://servicodados.ibge.gov.br/api/v1/bdg/tipo", "ibge_bdg_tipos"],

    // 3. Banco de Nomes Geográficos do Brasil (BNGB)
    ["https://servicodados.ibge.gov.br/api/v1/bngb/uf/{sigla}/nomesgeograficos", "ibge_bngb_nomes_geograficos"],
    ["https://servicodados.ibge.gov.br/api/v1/bngb/listacategoria", "ibge_bngb_categorias"],
    ["https://servicodados.ibge.gov.br/api/v1/bngb/listaclasse", "ibge_bngb_classes"],

    // 4. Calendário de Divulgações
    ["https://servicodados.ibge.gov.br/api/v3/calendario/", "ibge_calendario_divulgacoes"],

    // 5. CNAE (Rotas Mestres Completas)
    ["https://servicodados.ibge.gov.br/api/v2/cnae/secoes", "ibge_cnae_secoes"],
    ["https://servicodados.ibge.gov.br/api/v2/cnae/divisoes", "ibge_cnae_divisoes"],
    ["https://servicodados.ibge.gov.br/api/v2/cnae/grupos", "ibge_cnae_grupos"],
    ["https://servicodados.ibge.gov.br/api/v2/cnae/classes", "ibge_cnae_classes"],
    ["https://servicodados.ibge.gov.br/api/v2/cnae/subclasses", "ibge_cnae_subclasses"],

    // 6. Localidades (Bases Nacionais Completas)
    ["https://servicodados.ibge.gov.br/api/v1/localidades/regioes", "ibge_localidades_regioes"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/estados", "ibge_localidades_estados"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/mesorregioes", "ibge_localidades_mesorregioes"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/microrregioes", "ibge_localidades_microrregioes"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/regioes-intermediarias", "ibge_localidades_regioes_intermediarias"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/regioes-imediatas", "ibge_localidades_regioes_imediatas"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/municipios", "ibge_localidades_municipios"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/distritos", "ibge_localidades_distritos"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/subdistritos", "ibge_localidades_subdistritos"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/regioes-metropolitanas", "ibge_localidades_regioes_metropolitanas"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/regioes-integradas-de-desenvolvimento", "ibge_localidades_ride"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/aglomeracoes-urbanas", "ibge_localidades_aglomeracoes_urbanas"],
    ["https://servicodados.ibge.gov.br/api/v1/localidades/paises", "ibge_localidades_paises"],

    // 7. Metadados de Malhas Geográficas (imagens descartadas)
    ["https://servicodados.ibge.gov.br/api/v4/malhas/paises/{id}/metadados", "ibge_malhas_metadados"],
    ["https://servicodados.ibge.gov.br/api/v4/malhas/regioes/{id}/metadados", "ibge_malhas_metadados"],
    ["https://servicodados.ibge.gov.br/api/v4/malhas/estados/{id}/metadados", "ibge_malhas_metadados"],
    ["https://servicodados.ibge.gov.br/api/v4/malhas/municipios/{id}/metadados", "ibge_malhas_metadados"],
    ["https://servicodados.ibge.gov.br/api/v4/malhas/regioes-intermediarias/{id}/metadados", "ibge_malhas_metadados"],
    ["https://servicodados.ibge.gov.br/api/v4/malhas/regioes-imediatas/{id}/metadados", "ibge_malhas_metadados"],

    // 8. Metadados de Pesquisas
    ["http://servicodados.ibge.gov.br/api/v2/metadados/pesquisas", "ibge_metadados_pesquisas"],
    ["http://servicodados.ibge.gov.br/api/v2/metadados/pesquisas/{pesquisa}/periodos", "ibge_metadados_pesquisas_periodos"],

    // 9. Nomes / Censo
    ["https://servicodados.ibge.gov.br/api/v2/censos/nomes/ranking", "ibge_censo_nomes_ranking"],

    // 10. Notícias
    ["http://servicodados.ibge.gov.br/api/v3/noticias/", "ibge_noticias"],

    // 11. Países
    ["https://servicodados.ibge.gov.br/api/v1/paises/{paises}", "ibge_paises_dados"],
    ["https://servicodados.ibge.gov.br/api/v1/paises/indicadores/{indicadores}", "ibge_paises_indicadores"],
    ["https://servicodados.ibge.gov.br/api/v1/paises/{paises}/indicadores/{indicadores}", "ibge_paises_indicadores"],

    // 12. Pesquisas Estatísticas
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas", "ibge_pesquisas"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/periodos", "ibge_pesquisas_periodos"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/indicadores/{posicao}", "ibge_pesquisas_indicadores"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/periodos/{periodos}/indicadores/{posicao}", "ibge_pesquisas_indicadores"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/indicadores/{indicador}/ranking", "ibge_pesquisas_rankings"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/periodos/{periodos}/indicadores/{indicador}/ranking", "ibge_pesquisas_rankings"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/-/indicadores/{indicador}/resultados/{localidade}", "ibge_pesquisas_resultados"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/-/periodos/{periodos}/indicadores/{indicador}/resultados/{localidade}", "ibge_pesquisas_resultados"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/indicadores/{posicao}/resultados/{localidades}", "ibge_pesquisas_resultados"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/periodos/{periodos}/indicadores/{posicao}/resultados/{localidades}", "ibge_pesquisas_resultados"],
    ["https://servicodados.ibge.gov.br/api/v1/pesquisas/{pesquisa}/resultados/{localidades}", "ibge_pesquisas_resultados"],

    // 13. Catálogo de Produtos e Publicações
    ["https://servicodados.ibge.gov.br/api/v1/produtos/", "ibge_produtos_catalogo"],
    ["https://servicodados.ibge.gov.br/api/v1/produtos/estatisticas", "ibge_produtos_estatisticas"],
    ["https://servicodados.ibge.gov.br/api/v1/produtos/geociencias", "ibge_produtos_geociencias"],

    // 14. RBMC (Rede Brasileira de Monitoramento Contínuo)
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/relatorio/{estacao}", "downloads/docs/ibge_rbmc_relatorios/"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex2/{estacao}/{ano}/{dia}", "downloads/docs/ibge_rbmc_arquivos_rinex/"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex3/{estacao}/{ano}/{dia}", "downloads/docs/ibge_rbmc_arquivos_rinex/"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex3/1s/{estacao}/{ano}/{dia}/{hora}/{minuto}/{tipo}", "downloads/docs/ibge_rbmc_arquivos_rinex/"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex3/orbitas/{ano}/{dia}", "downloads/docs/ibge_rbmc_arquivos_rinex/"],

    // 15. RMPG (Rede Maregráfica Permanente)
    ["https://servicodados.ibge.gov.br/api/v1/rmpg/maregrafos", "ibge_rmpg_maregrafos"],
    ["https://servicodados.ibge.gov.br/api/v1/rmpg/sensores", "ibge_rmpg_sensores"],
    ["https://servicodados.ibge.gov.br/api/v1/rmpg/previsao/{maregrafo}", "ibge_rmpg_previsoes"],
    ["https://servicodados.ibge.gov.br/api/v1/rmpg/nivel/{maregrafo}", "ibge_rmpg_niveis"],
    ["https://servicodados.ibge.gov.br/api/v1/rmpg/meteorologia/{maregrafo}", "ibge_rmpg_meteorologia"],
    ["https://servicodados.ibge.gov.br/api/v1/rmpg/customizado/{maregrafos}/{sensores}", "ibge_rmpg_medicoes_customizadas"]
];

function compileTemplateToRegex(template: string): RegExp {
    const clean = template.trim().replace(/\/+$/, "");
    let pattern = clean.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    pattern = pattern.replace(/\\\{[^}]+\\\}/g, "[^/]+");
    // Ancora no início e aceita http/https (a regex anterior nunca casava, pois '/' não é escapado acima)
    pattern = pattern.replace(/^https?:\/\//, "^https?:\\/\\/");
    return new RegExp(`${pattern}\\/?$`);
}

export const tableRoutes: RouteMapping[] = RAW_MAPPINGS.map(([template, tableName]) => ({
    template,
    tableName,
    pattern: compileTemplateToRegex(template)
}));

/**
 * Endpoints raiz (Entidades-Mãe / Dimensões): carga direta, sem parâmetros de rota ({...}).
 */
export function hasRouteParams(url: string): boolean {
    return /\{[^}]+\}/.test(url);
}

/**
 * Um endpoint é "raiz" quando não possui parâmetros de rota e não está nas regras de exclusão.
 * Cobre, entre outros: agregados, bdg/{local,situacao,tipo}, bngb/{listacategoria,listaclasse},
 * calendario, cnae/*, localidades/* (bases nacionais), metadados/pesquisas, censos/nomes/ranking,
 * noticias, pesquisas, produtos/*, rmpg/{maregrafos,sensores}.
 */
export function isRootEndpoint(url: string): boolean {
    const clean = url.trim();
    return !hasRouteParams(clean) && !isExcludedEndpoint(clean);
}

/**
 * Endpoints cujo corpo é um envelope paginado ({ count, page, totalPages, items: [...] }).
 */
export const PAGINATED_ROOT_PATTERNS: RegExp[] = [
    /\/api\/v3\/calendario\/?$/i,
    /\/api\/v3\/noticias\/?$/i,
];

export function isPaginatedEndpoint(url: string): boolean {
    const clean = url.trim();
    return PAGINATED_ROOT_PATTERNS.some(p => p.test(clean));
}

/**
 * Chave lógica do dataset bruto. Usa o mapeamento existente; se a URL não estiver
 * mapeada, deriva um slug do caminho (ex.: /api/v1/produtos -> ibge_v1_produtos).
 */
export function getRootEndpointKey(url: string): string {
    try {
        return getTableNameFromUrl(url);
    } catch {
        const path = new URL(url.trim()).pathname
            .replace(/^\/api\//, '')
            .replace(/^\/+|\/+$/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .toLowerCase();
        return `ibge_${path}`;
    }
}

export function getTableNameFromUrl(url: string): string {
    const cleanUrl = url.trim();
    const match = tableRoutes.find(r => r.pattern.test(cleanUrl));
    if (!match) {
        throw new Error(`Nenhuma tabela mapeada para a URL: ${url}`);
    }
    return match.tableName;
}

// ---------------------------------------------------------------------------
// Ordenação por dependência: mãe (nível 0) -> filho (1) -> neto (2) ...
// ---------------------------------------------------------------------------

const API_BASE = 'https://servicodados.ibge.gov.br/api';

/**
 * Chave canônica de um endpoint/template: http -> https, placeholders {qualquer} -> {p},
 * sem barra final e sem query string. Permite casar URLs do banco com os templates abaixo
 * mesmo que o nome do placeholder varie.
 */
export function normalizeEndpointKey(url: string): string {
    return url
        .trim()
        .replace(/\?.*$/, '')
        .replace(/^http:/i, 'https:')
        .replace(/\{[^}]+\}/g, '{p}')
        .replace(/\/+$/, '');
}

export function countRouteParams(url: string): number {
    return (url.match(/\{[^}]+\}/g) ?? []).length;
}

/**
 * Grafo de dependências (filho -> pais): quais endpoints fornecem os valores usados
 * nos parâmetros de rota do filho. Caminhos relativos a /api. Endpoints sem parâmetros
 * são mães (nível 0) e não precisam constar aqui.
 */
const LOC = 'v1/localidades';
const PESQ = 'v1/pesquisas';
const DEPENDENCY_EDGES: Array<[string, string[]]> = [
    // Agregados (SIDRA)
    ['v3/agregados/{a}/metadados', ['v3/agregados']],
    ['v3/agregados/{a}/periodos/{p}/variaveis/{v}', ['v3/agregados/{a}/metadados']],

    // Geodésia / nomes geográficos (siglas de UF vêm de localidades/estados)
    ['v1/bdg/estado/{s}/estacoes', [`${LOC}/estados`]],
    ['v1/bngb/uf/{s}/nomesgeograficos', [`${LOC}/estados`]],

    // Malhas (metadados por entidade territorial)
    ['v4/malhas/paises/{i}/metadados', [`${LOC}/paises`]],
    ['v4/malhas/regioes/{i}/metadados', [`${LOC}/regioes`]],
    ['v4/malhas/estados/{i}/metadados', [`${LOC}/estados`]],
    ['v4/malhas/municipios/{i}/metadados', [`${LOC}/municipios`]],
    ['v4/malhas/regioes-intermediarias/{i}/metadados', [`${LOC}/regioes-intermediarias`]],
    ['v4/malhas/regioes-imediatas/{i}/metadados', [`${LOC}/regioes-imediatas`]],

    // Metadados de pesquisas
    ['v2/metadados/pesquisas/{p}/periodos', ['v2/metadados/pesquisas']],

    // Países
    ['v1/paises/{p}', [`${LOC}/paises`]],
    ['v1/paises/{p}/indicadores/{i}', ['v1/paises/{p}', 'v1/paises/indicadores/{i}']],

    // Pesquisas estatísticas
    [`${PESQ}/{p}/periodos`, [PESQ]],
    [`${PESQ}/{p}/indicadores/{i}`, [PESQ]],
    [`${PESQ}/{p}/periodos/{x}/indicadores/{i}`, [`${PESQ}/{p}/periodos`]],
    [`${PESQ}/{p}/indicadores/{i}/ranking`, [`${PESQ}/{p}/indicadores/{i}`]],
    [`${PESQ}/{p}/periodos/{x}/indicadores/{i}/ranking`, [`${PESQ}/{p}/periodos/{x}/indicadores/{i}`]],
    [`${PESQ}/-/indicadores/{i}/resultados/{l}`, [`${PESQ}/{p}/indicadores/{i}`, `${LOC}/municipios`]],
    [`${PESQ}/-/periodos/{x}/indicadores/{i}/resultados/{l}`, [`${PESQ}/{p}/periodos/{x}/indicadores/{i}`, `${LOC}/municipios`]],
    [`${PESQ}/{p}/indicadores/{i}/resultados/{l}`, [`${PESQ}/{p}/indicadores/{i}`, `${LOC}/municipios`]],
    [`${PESQ}/{p}/periodos/{x}/indicadores/{i}/resultados/{l}`, [`${PESQ}/{p}/periodos/{x}/indicadores/{i}`, `${LOC}/municipios`]],
    [`${PESQ}/{p}/resultados/{l}`, [PESQ, `${LOC}/municipios`]],

    // RMPG (marégrafos e sensores)
    ['v1/rmpg/previsao/{m}', ['v1/rmpg/maregrafos']],
    ['v1/rmpg/nivel/{m}', ['v1/rmpg/maregrafos']],
    ['v1/rmpg/meteorologia/{m}', ['v1/rmpg/maregrafos']],
    ['v1/rmpg/customizado/{m}/{s}', ['v1/rmpg/maregrafos', 'v1/rmpg/sensores']],
];

const DEPENDENCY_PARENTS = new Map<string, string[]>(
    DEPENDENCY_EDGES.map(([child, parents]) => [
        normalizeEndpointKey(`${API_BASE}/${child}`),
        parents.map(p => normalizeEndpointKey(`${API_BASE}/${p}`)),
    ])
);

/** Pais declarados (chaves canônicas) de um endpoint; vazio se mãe ou sem dependência declarada. */
export function getDependencyParents(url: string): string[] {
    return DEPENDENCY_PARENTS.get(normalizeEndpointKey(url)) ?? [];
}

/**
 * Nível de dependência:
 *  - 0: mãe (sem parâmetros de rota);
 *  - 1 + maior nível entre os pais, quando há dependência declarada (filho = 1, neto = 2, ...);
 *  - fallback para endpoints com parâmetros sem dependência declarada (ex.: RBMC): nº de parâmetros.
 */
export function getEndpointLevel(url: string, stack: string[] = []): number {
    if (!hasRouteParams(url)) return 0;

    const key = normalizeEndpointKey(url);
    const parents = DEPENDENCY_PARENTS.get(key);
    if (!parents || parents.length === 0) return countRouteParams(url);

    if (stack.includes(key)) {
        throw new Error(`Ciclo de dependência entre endpoints: ${[...stack, key].join(' -> ')}`);
    }
    return 1 + Math.max(...parents.map(p => getEndpointLevel(p, [...stack, key])));
}

export type OrderedEndpoint<T> = T & { level: number; originalIndex: number };

/**
 * Ordena endpoints por nível (mães primeiro). Dentro do mesmo nível mantém a ordem original.
 * `originalIndex` preserva a posição em ModuleApiData (usada pelo debugIndex).
 */
export function sortEndpointsByDependency<T extends { apiUrl: string }>(items: T[]): OrderedEndpoint<T>[] {
    return items
        .map((item, originalIndex) => ({ ...item, level: getEndpointLevel(item.apiUrl), originalIndex }))
        .sort((a, b) => a.level - b.level || a.originalIndex - b.originalIndex);
}