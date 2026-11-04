import { mysqlTable, serial, text, varchar, int, json, timestamp, bigint, double, primaryKey, boolean, uniqueIndex } from 'drizzle-orm/mysql-core';
import { relations, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// Tabela principal: Module
export const Modules = mysqlTable('module', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  link: text('link'),
});

// Tipagem dos parâmetros da API
export type ApiParam = {
  name: string;
  description: string;
  format: string;
};

// Tabela relacionada: ModuleApiData
export const ModuleApiData = mysqlTable('module_api_data', {
  id: serial('id').primaryKey(),
  moduleId: bigint('module_id', { mode: 'number', unsigned: true })
    .notNull()
    .references(() => Modules.id, { onDelete: 'cascade' }),
  apiUrl: text('api_url').notNull(),
  method: varchar('method', { length: 4 }).notNull(),
  params: json('params').$type<ApiParam[]>().notNull(),
});

// Definição das relações (útil para consultas com db.query)
export const ModulesRelations = relations(Modules, ({ many }) => ({
  apiData: many(ModuleApiData),
}));

export const ModuleApiDataRelations = relations(ModuleApiData, ({ one }) => ({
  module: one(Modules, {
    fields: [ModuleApiData.moduleId],
    references: [Modules.id],
  }),
}));

/**
 * Resposta bruta (sem transformação de chaves) dos endpoints raiz (sem parâmetros de rota).
 * Uma linha por (endpoint, página). Endpoints não paginados usam sempre page = 1.
 * Reexecuções fazem upsert pela chave única (api_url, page).
 */
export const RawRootResponses = mysqlTable('raw_root_responses', {
  id: serial('id').primaryKey(),
  endpointKey: varchar('endpoint_key', { length: 150 }).notNull(),
  apiUrl: varchar('api_url', { length: 400 }).notNull(),
  page: int('page').notNull().default(1),
  totalPages: int('total_pages'),
  httpStatus: int('http_status').notNull(),
  recordCount: int('record_count').notNull(),
  payload: json('payload').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_raw_root_url_page').on(table.apiUrl, table.page),
]);

export const Logs = mysqlTable('logs', {
  message: text(),
  level: text(),
  module: text(),
  context: text(),
  timestamp: timestamp(),
});

export interface AgregadoItem {
  id: string;
  nome: string;
}

export const ibgeAgregados = mysqlTable("ibge_agregados", {
  id: varchar("id", { length: 50 }).primaryKey(),
  nome: text("nome").notNull(),
  agregados: json("agregados").$type<AgregadoItem[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeAgregadosMetadados = mysqlTable("ibge_agregados_metadados", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  url: text("url"),
  pesquisa: text("pesquisa"),
  assunto: text("assunto"),
  periodicidade: json("periodicidade"),
  nivelTerritorial: json("nivel_territorial"),
  variaveis: json("variaveis"),
  classificacoes: json("classificacoes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeAgregadosDados = mysqlTable("ibge_agregados_dados", {
  id: varchar("id", { length: 50 }).primaryKey(),
  variavel: text("variavel").notNull(),
  unidade: varchar("unidade", { length: 50 }),
  resultados: json("resultados").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeBdgEstacoes = mysqlTable("ibge_bdg_estacoes", {
  codigoEstacao: varchar("codigo_estacao", { length: 50 }).primaryKey(),
  tipoEstacao: varchar("tipo_estacao", { length: 100 }),
  tema: varchar("tema", { length: 20 }),
  nomeEstacao: varchar("nome_estacao", { length: 255 }),
  codigoEstacaoMaterializada: varchar("codigo_estacao_materializada", { length: 100 }),
  inscricaoChapa: varchar("inscricao_chapa", { length: 255 }),
  dataVisita: varchar("data_visita", { length: 20 }),
  situacao: varchar("situacao", { length: 100 }),
  descricaoEstacao: text("descricao_estacao"),

  latitude: double("latitude"),
  longitude: double("longitude"),
  latitudeGms: varchar("latitude_gms", { length: 50 }),
  longitudeGms: varchar("longitude_gms", { length: 50 }),
  sigmaLatitude: varchar("sigma_latitude", { length: 50 }),
  sigmaLongitude: varchar("sigma_longitude", { length: 50 }),
  fonteCoordenada: varchar("fonte_coordenada", { length: 255 }),
  dataMedicaoCoordenada: varchar("data_medicao_coordenada", { length: 20 }),
  dataCalculoCoordenada: varchar("data_calculo_coordenada", { length: 20 }),
  sistemaReferenciaCoordenada: varchar("sistema_referencia_coordenada", { length: 100 }),

  altitudeGeometrica: varchar("altitude_geometrica", { length: 50 }),
  sigmaAltitudeGeometrica: varchar("sigma_altitude_geometrica", { length: 50 }),
  fonteAltitudeGeometrica: varchar("fonte_altitude_geometrica", { length: 255 }),
  altitudeOrtometrica: varchar("altitude_ortometrica", { length: 50 }),
  altitudeNormal: varchar("altitude_normal", { length: 50 }),
  fonteAltitude: varchar("fonte_altitude", { length: 255 }),
  dataMedicaoAltitude: varchar("data_medicao_altitude", { length: 20 }),
  dataCalculoAltitude: varchar("data_calculo_altitude", { length: 20 }),
  datumAltitude: varchar("datum_altitude", { length: 100 }),
  sigmaAltitude: varchar("sigma_altitude", { length: 50 }),

  numeroGeopotencial: varchar("numero_geopotencial", { length: 50 }),
  valorGravidade: varchar("valor_gravidade", { length: 50 }),
  datumGravidade: varchar("datum_gravidade", { length: 50 }),
  dataMedicaoGravidade: varchar("data_medicao_gravidade", { length: 20 }),
  dataCalculoGravidade: varchar("data_calculo_gravidade", { length: 20 }),

  idAjusteRn: varchar("id_ajuste_rn", { length: 50 }),
  notaAjusteRn: text("nota_ajuste_rn"),
  localizacao: text("localizacao"),
  itinerario: text("itinerario"),
  observacao: text("observacao"),
  tipoLocal: varchar("tipo_local", { length: 100 }),

  municipio: json("municipio"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeBdgLocais = mysqlTable("ibge_bdg_locais", {
  codigoTipoLocal: varchar("codigo_tipo_local", { length: 50 }).primaryKey(),
  descricaoTipoLocal: varchar("descricao_tipo_local", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeBdgSituacoes = mysqlTable("ibge_bdg_situacoes", {
  codigoSituacao: varchar("codigo_situacao", { length: 50 }).primaryKey(),
  descricaoSituacao: varchar("descricao_situacao", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeBdgTipos = mysqlTable("ibge_bdg_tipos", {
  codigoTipoEstacao: varchar("codigo_tipo_estacao", { length: 50 }).primaryKey(),
  siglaTipoEstacao: varchar("sigla_tipo_estacao", { length: 20 }),
  descricaoTipoEstacao: varchar("descricao_tipo_estacao", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeBngbNomesGeograficos = mysqlTable("ibge_bngb_nomes_geograficos", {
  idNomeBngb: int("id_nome_bngb").primaryKey(),
  nomeGeografico: text("nome_geografico").notNull(),
  geocodigo: varchar("geocodigo", { length: 50 }),
  termoGenerico: json("termo_generico"),
  termoEspecifico: json("termo_especifico"),
  conectivo: json("conectivo"),
  categoria: varchar("categoria", { length: 100 }),
  classe: json("classe"),
  escalaOcorrencia: json("escala_ocorrencia"),
  escalaOrigemGeometria: varchar("escala_origem_geometria", { length: 50 }),
  statusValidacao: varchar("status_validacao", { length: 10 }),
  nivelValidacao: varchar("nivel_validacao", { length: 50 }),
  sustentacaoValidacao: text("sustentacao_validacao"),
  dataValidacao: varchar("data_validacao", { length: 20 }),
  latitude: double("latitude"),
  longitude: double("longitude"),
  latitudeGms: varchar("latitude_gms", { length: 50 }),
  longitudeGms: varchar("longitude_gms", { length: 50 }),
  dataPublicacao: varchar("data_publicacao", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeBngbCategorias = mysqlTable("ibge_bngb_categorias", {
  categoria: varchar("categoria", { length: 150 }).primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeBngbClasses = mysqlTable("ibge_bngb_classes", {
  classe: varchar("classe", { length: 150 }).primaryKey(),
  descricao: text("descricao"),
  categoria: varchar("categoria", { length: 150 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeCalendarioDivulgacoes = mysqlTable("ibge_calendario_divulgacoes", {
  id: int("id").primaryKey(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  dataDivulgacao: varchar("data_divulgacao", { length: 50 }),
  produtoId: int("produto_id"),
  nomeProduto: varchar("nome_produto", { length: 255 }),
  aliasProduto: varchar("alias_produto", { length: 255 }),
  descricaoProduto: text("descricao_produto"),
  anoReferenciaInicio: int("ano_referencia_inicio"),
  mesReferenciaInicio: int("mes_referencia_inicio"),
  anoReferenciaFim: int("ano_referencia_fim"),
  mesReferenciaFim: int("mes_referencia_fim"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeCnaeSecoes = mysqlTable("ibge_cnae_secoes", {
  id: varchar("id", { length: 10 }).primaryKey(),
  descricao: text("descricao").notNull(),
  observacoes: json("observacoes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeCnaeDivisoes = mysqlTable("ibge_cnae_divisoes", {
  id: varchar("id", { length: 10 }).primaryKey(),
  descricao: text("descricao").notNull(),
  observacoes: json("observacoes"),
  secao: json("secao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeCnaeGrupos = mysqlTable("ibge_cnae_grupos", {
  id: varchar("id", { length: 20 }).primaryKey(),
  descricao: text("descricao").notNull(),
  observacoes: json("observacoes"),
  divisao: json("divisao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeCnaeClasses = mysqlTable("ibge_cnae_classes", {
  id: varchar("id", { length: 20 }).primaryKey(),
  descricao: text("descricao").notNull(),
  observacoes: json("observacoes"),
  grupo: json("grupo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeCnaeSubclasses = mysqlTable("ibge_cnae_subclasses", {
  id: varchar("id", { length: 20 }).primaryKey(),
  descricao: text("descricao").notNull(),
  observacoes: json("observacoes"),
  atividades: json("atividades"),
  classe: json("classe"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesRegioes = mysqlTable("ibge_localidades_regioes", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  sigla: varchar("sigla", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesEstados = mysqlTable("ibge_localidades_estados", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  sigla: varchar("sigla", { length: 10 }).notNull(),
  regiao: json("regiao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesMesorregioes = mysqlTable("ibge_localidades_mesorregioes", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  uf: json("uf"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesMicrorregioes = mysqlTable("ibge_localidades_microrregioes", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  mesorregiao: json("mesorregiao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesRegioesIntermediarias = mysqlTable("ibge_localidades_regioes_intermediarias", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  uf: json("uf"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesRegioesImediatas = mysqlTable("ibge_localidades_regioes_imediatas", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  regiaoIntermediaria: json("regiao_intermediaria"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesMunicipios = mysqlTable("ibge_localidades_municipios", {
  id: int("id").primaryKey(),
  nome: text("nome").notNull(),
  microrregiao: json("microrregiao"),
  regiaoImediata: json("regiao_imediata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesDistritos = mysqlTable("ibge_localidades_distritos", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  nome: text("nome").notNull(),
  municipio: json("municipio"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesSubdistritos = mysqlTable("ibge_localidades_subdistritos", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  nome: text("nome").notNull(),
  distrito: json("distrito"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesRegioesMetropolitanas = mysqlTable("ibge_localidades_regioes_metropolitanas", {
  id: varchar("id", { length: 50 }).primaryKey(),
  nome: text("nome").notNull(),
  uf: json("uf"),
  subRegioesMetropolitanas: json("sub_regioes_metropolitanas"),
  municipios: json("municipios"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesRide = mysqlTable("ibge_localidades_ride", {
  id: varchar("id", { length: 50 }).primaryKey(),
  nome: text("nome").notNull(),
  municipios: json("municipios"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesAglomeracoesUrbanas = mysqlTable("ibge_localidades_aglomeracoes_urbanas", {
  id: varchar("id", { length: 50 }).primaryKey(),
  nome: text("nome").notNull(),
  municipios: json("municipios"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeLocalidadesPaises = mysqlTable("ibge_localidades_paises", {
  id: json("id").notNull(),
  nome: text("nome").notNull(),
  regiaoIntermediaria: json("regiao_intermediaria"),
  subRegiao: json("sub_regiao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeMalhasMetadados = mysqlTable("ibge_malhas_metadados", {
  id: varchar("id", { length: 50 }).primaryKey(),
  nivelGeografico: varchar("nivel_geografico", { length: 100 }),
  centroide: json("centroide"),
  regiaoLimitrofe: json("regiao_limitrofe"),
  area: json("area"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeMetadadosPesquisas = mysqlTable("ibge_metadados_pesquisas", {
  codigo: varchar("codigo", { length: 50 }).primaryKey(),
  nome: text("nome").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeMetadadosPesquisasPeriodos = mysqlTable("ibge_metadados_pesquisas_periodos", {
  ano: int("ano").notNull(),
  mes: varchar("mes", { length: 10 }).notNull(),
  ordem: varchar("ordem", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.ano, table.mes, table.ordem] }),
]);

export const ibgeCensoNomesRanking = mysqlTable("ibge_censo_nomes_ranking", {
  id: serial("id").primaryKey(),
  localidade: varchar("localidade", { length: 50 }),
  sexo: varchar("sexo", { length: 10 }),
  res: json("res"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeNoticias = mysqlTable("ibge_noticias", {
  id: int("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }),
  titulo: text("titulo").notNull(),
  introducao: text("introducao"),
  dataPublicacao: varchar("data_publicacao", { length: 50 }),
  produtoId: int("produto_id"),
  produtos: text("produtos"),
  editorias: text("editorias"),
  imagens: text("imagens"),
  produtosRelacionados: text("produtos_relacionados"),
  destaque: boolean("destaque"),
  link: text("link"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgePaisesDados = mysqlTable("ibge_paises_dados", {
  id: serial("id").primaryKey(),
  identificador: json("identificador").notNull(),
  nome: json("nome").notNull(),
  area: json("area"),
  localizacao: json("localizacao"),
  linguas: json("linguas"),
  governo: json("governo"),
  unidadesMonetarias: json("unidades_monetarias"),
  historico: text("historico"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgePaisesIndicadores = mysqlTable("ibge_paises_indicadores", {
  id: int("id").primaryKey(),
  indicador: text("indicador").notNull(),
  unidade: json("unidade"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgePesquisas = mysqlTable("ibge_pesquisas", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  descricao: text("descricao").notNull(),
  contexto: varchar("contexto", { length: 50 }),
  observacao: text("observacao"),
  periodos: json("periodos"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgePesquisasPeriodos = mysqlTable("ibge_pesquisas_periodos", {
  id: serial("id").primaryKey(),
  periodo: varchar("periodo", { length: 50 }).notNull(),
  publicacao: varchar("publicacao", { length: 30 }),
  versao: int("versao"),
  fonte: json("fonte"),
  nota: json("nota"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgePesquisasIndicadores = mysqlTable("ibge_pesquisas_indicadores", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  posicao: varchar("posicao", { length: 50 }),
  classe: varchar("classe", { length: 10 }),
  children: json("children"),
  nota: json("nota"),
  indicador: text("indicador").notNull(),
  unidade: json("unidade"),
  metadado: json("metadado"),
  res: json("res"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgePesquisasRankings = mysqlTable("ibge_pesquisas_rankings", {
  id: serial("id").primaryKey(),
  indicadorId: bigint("indicador_id", { mode: "number" }).notNull(),
  periodo: varchar("periodo", { length: 50 }).notNull(),
  contexto: varchar("contexto", { length: 100 }),
  unidade: json("unidade"),
  res: json("res"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgePesquisasResultados = mysqlTable("ibge_pesquisas_resultados", {
  id: serial("id").primaryKey(),
  localidade: varchar("localidade", { length: 50 }).notNull(),
  res: json("res"),
  notas: json("notas"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeProdutosCatalogo = mysqlTable("ibge_produtos_catalogo", {
  id: int("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }),
  titulo: text("titulo").notNull(),
  alias: varchar("alias", { length: 150 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeProdutosEstatisticas = mysqlTable("ibge_produtos_estatisticas", {
  id: int("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }),
  titulo: text("titulo").notNull(),
  alias: varchar("alias", { length: 150 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeProdutosGeociencias = mysqlTable("ibge_produtos_geociencias", {
  id: int("id").primaryKey(),
  tipo: varchar("tipo", { length: 50 }),
  titulo: text("titulo").notNull(),
  alias: varchar("alias", { length: 150 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeRmpgMaregrafos = mysqlTable("ibge_rmpg_maregrafos", {
  siglaMaregrafo: varchar("sigla_maregrafo", { length: 20 }).primaryKey(),
  nomeMaregrafo: text("nome_maregrafo").notNull(),
  local: text("local"),
  siglaUf: varchar("sigla_uf", { length: 2 }),
  dataInicialOperacao: varchar("data_inicial_operacao", { length: 10 }),
  urlRelatorio: text("url_relatorio"),
  lat: double("lat"),
  lon: double("lon"),
  idGloss: int("id_gloss"),
  idUhslc: int("id_uhslc"),
  idPsmsl: int("id_psmsl"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeRmpgSensores = mysqlTable("ibge_rmpg_sensores", {
  codigoSensor: int("codigo_sensor").primaryKey(),
  nomeSensor: text("nome_sensor").notNull(),
  descricaoSensor: text("descricao_sensor"),
  unidadeMedida: varchar("unidade_medida", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeRmpgPrevisoes = mysqlTable("ibge_rmpg_previsoes", {
  id: serial("id").primaryKey(),
  dtHrLeitura: varchar("dt_hr_leitura", { length: 30 }).notNull(),
  previsao: double("previsao").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeRmpgNiveis = mysqlTable("ibge_rmpg_niveis", {
  id: serial("id").primaryKey(),
  dtHrLeitura: varchar("dt_hr_leitura", { length: 30 }).notNull(),
  radar: double("radar"),
  encoder: double("encoder"),
  previsao: double("previsao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeRmpgMeteorologia = mysqlTable("ibge_rmpg_meteorologia", {
  id: serial("id").primaryKey(),
  dtHrLeitura: varchar("dt_hr_leitura", { length: 30 }).notNull(),
  pressaoAtm: double("pressao_atm"),
  temperaturaExt: double("temperatura_ext"),
  umidadeExt: double("umidade_ext"),
  direcaoVento: double("direcao_vento"),
  velocidadeVento: double("velocidade_vento"),
  precipitacao: double("precipitacao"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const ibgeRmpgMedicoesCustomizadas = mysqlTable("ibge_rmpg_medicoes_customizadas", {
  id: serial("id").primaryKey(),
  siglaMaregrafo: varchar("sigla_maregrafo", { length: 20 }).notNull(),
  dados: json("dados"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});