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
    },
    {
        category: "MALHAS_SVG_IMAGE",
        reason: "Download direto de imagem vetorial/binária (SVG) de malha, persistir apenas metadados",
        pattern: /^https?:\/\/servicodados\.ibge\.gov\.br\/api\/v4\/malhas\/(paises|regioes|estados|municipios|regioes-intermediarias|regioes-imediatas)\/\{[^}]+\}\/?$/i
    },
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
    ["https://servicodados.ibge.gov.br/api/v1/publicacoes/{produto}", "ibge_publicacoes"],

    // 14. RBMC (Rede Brasileira de Monitoramento Contínuo)
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/relatorio/{estacao}", "ibge_rbmc_relatorios"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex2/{estacao}/{ano}/{dia}", "ibge_rbmc_arquivos_rinex"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex3/{estacao}/{ano}/{dia}", "ibge_rbmc_arquivos_rinex"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex3/1s/{estacao}/{ano}/{dia}/{hora}/{minuto}/{tipo}", "ibge_rbmc_arquivos_rinex"],
    ["https://servicodados.ibge.gov.br/api/v1/rbmc/rinex3/orbitas/{ano}/{dia}", "ibge_rbmc_orbitas_rinex"],

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