import * as schema from './schema.js';

/**
 * Mapeamento das chaves de texto de cada endpoint para o respetivo
 * objeto de tabela do Drizzle ORM (MySQL).
 */
export const tableRegistry = {
  // 1. Agregados e Séries (SIDRA / Censos)
  ibge_agregados: schema.ibgeAgregados,
  ibge_agregados_metadados: schema.ibgeAgregadosMetadados,
  ibge_agregados_dados: schema.ibgeAgregadosDados,

  // 2. Banco de Dados Geodésicos (BDG)
  ibge_bdg_estacoes: schema.ibgeBdgEstacoes,
  ibge_bdg_locais: schema.ibgeBdgLocais,
  ibge_bdg_situacoes: schema.ibgeBdgSituacoes,
  ibge_bdg_tipos: schema.ibgeBdgTipos,

  // 3. Banco de Nomes Geográficos do Brasil (BNGB)
  ibge_bngb_nomes_geograficos: schema.ibgeBngbNomesGeograficos,
  ibge_bngb_categorias: schema.ibgeBngbCategorias,
  ibge_bngb_classes: schema.ibgeBngbClasses,

  // 4. Calendário de Divulgações
  ibge_calendario_divulgacoes: schema.ibgeCalendarioDivulgacoes,

  // 5. CNAE
  ibge_cnae_secoes: schema.ibgeCnaeSecoes,
  ibge_cnae_divisoes: schema.ibgeCnaeDivisoes,
  ibge_cnae_grupos: schema.ibgeCnaeGrupos,
  ibge_cnae_classes: schema.ibgeCnaeClasses,
  ibge_cnae_subclasses: schema.ibgeCnaeSubclasses,

  // 6. Localidades
  ibge_localidades_regioes: schema.ibgeLocalidadesRegioes,
  ibge_localidades_estados: schema.ibgeLocalidadesEstados,
  ibge_localidades_mesorregioes: schema.ibgeLocalidadesMesorregioes,
  ibge_localidades_microrregioes: schema.ibgeLocalidadesMicrorregioes,
  ibge_localidades_regioes_intermediarias: schema.ibgeLocalidadesRegioesIntermediarias,
  ibge_localidades_regioes_imediatas: schema.ibgeLocalidadesRegioesImediatas,
  ibge_localidades_municipios: schema.ibgeLocalidadesMunicipios,
  ibge_localidades_distritos: schema.ibgeLocalidadesDistritos,
  ibge_localidades_subdistritos: schema.ibgeLocalidadesSubdistritos,
  ibge_localidades_regioes_metropolitanas: schema.ibgeLocalidadesRegioesMetropolitanas,
  ibge_localidades_ride: schema.ibgeLocalidadesRide,
  ibge_localidades_aglomeracoes_urbanas: schema.ibgeLocalidadesAglomeracoesUrbanas,
  ibge_localidades_paises: schema.ibgeLocalidadesPaises,

  // 7. Malhas Geográficas (Apenas Metadados)
  ibge_malhas_metadados: schema.ibgeMalhasMetadados,

  // 8. Metadados de Pesquisas
  ibge_metadados_pesquisas: schema.ibgeMetadadosPesquisas,
  ibge_metadados_pesquisas_periodos: schema.ibgeMetadadosPesquisasPeriodos,

  // 9. Nomes / Censos
  ibge_censo_nomes_ranking: schema.ibgeCensoNomesRanking,

  // 10. Notícias
  ibge_noticias: schema.ibgeNoticias,

  // 11. Países
  ibge_paises_dados: schema.ibgePaisesDados,
  ibge_paises_indicadores: schema.ibgePaisesIndicadores,

  // 12. Pesquisas Estatísticas
  ibge_pesquisas: schema.ibgePesquisas,
  ibge_pesquisas_periodos: schema.ibgePesquisasPeriodos,
  ibge_pesquisas_indicadores: schema.ibgePesquisasIndicadores,
  ibge_pesquisas_rankings: schema.ibgePesquisasRankings,
  ibge_pesquisas_resultados: schema.ibgePesquisasResultados,

  // 13. Catálogo de Produtos
  ibge_produtos_catalogo: schema.ibgeProdutosCatalogo,
  ibge_produtos_estatisticas: schema.ibgeProdutosEstatisticas,
  ibge_produtos_geociencias: schema.ibgeProdutosGeociencias,

  // 14. RMPG (Rede Maregráfica Permanente)
  ibge_rmpg_maregrafos: schema.ibgeRmpgMaregrafos,
  ibge_rmpg_sensores: schema.ibgeRmpgSensores,
  ibge_rmpg_previsoes: schema.ibgeRmpgPrevisoes,
  ibge_rmpg_niveis: schema.ibgeRmpgNiveis,
  ibge_rmpg_meteorologia: schema.ibgeRmpgMeteorologia,
  ibge_rmpg_medicoes_customizadas: schema.ibgeRmpgMedicoesCustomizadas,
} as const;

/**
 * Tipo unificado com todos os nomes válidos de tabelas registadas
 */
export type RegisteredTableName = keyof typeof tableRegistry;

/**
 * Função utilitária para obter a tabela do Drizzle a partir do nome string
 */
export function getDrizzleTable(tableName: string) {
  if (tableName in tableRegistry) {
    return tableRegistry[tableName as RegisteredTableName];
  }
  return null;
}