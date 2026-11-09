// src/db/normalized/schema.ts
import { mysqlTable, varchar, text, json, timestamp, uniqueIndex, serial, int, boolean, foreignKey, bigint, double } from 'drizzle-orm/mysql-core';

export const silverMetadadosPesquisas = mysqlTable('silver_metadados_pesquisas', {
    codigo: varchar('codigo', { length: 50 }).primaryKey(),
    nome: text('nome').notNull(),
    situacao: varchar('situacao', { length: 100 }),
    categoria: varchar('categoria', { length: 100 }),
    nomeIngles: text('nome_ingles'),
    periodicidadeColeta: varchar('periodicidade_coleta', { length: 100 }),
    periodicidadeDivulgacao: varchar('periodicidade_divulgacao', { length: 100 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverMetadadosPesquisasClassificacoes = mysqlTable('silver_metadados_pesquisas_classificacoes', {
    id: serial('id').primaryKey(),
    pesquisaCodigo: varchar('pesquisa_codigo', { length: 50 }).notNull(),
    nome: varchar('nome', { length: 255 }).notNull(),
    dominio: varchar('dominio', { length: 255 }),
    descricao: text('descricao'),
    nomeIngles: varchar('nome_ingles', { length: 255 }),
    dominioIngles: varchar('dominio_ingles', { length: 255 }),
    descricaoIngles: text('descricao_ingles'),
}, (table) => [
    foreignKey({
        name: 'fk_silver_pesquisas_classif_cod',
        columns: [table.pesquisaCodigo],
        foreignColumns: [silverMetadadosPesquisas.codigo]
    }).onDelete('cascade'),
    uniqueIndex('uq_pesquisa_classificacao').on(table.pesquisaCodigo, table.nome)
]);

export const silverNoticias = mysqlTable('silver_noticias', {
    id: serial('id').primaryKey(),
    tipo: varchar('tipo', { length: 100 }),
    titulo: text('titulo').notNull(),
    introducao: text('introducao'),
    dataPublicacao: varchar('data_publicacao', { length: 50 }),
    produtoId: int('produto_id'),
    produtos: text('produtos'),
    editorias: text('editorias'),
    imagens: text('imagens'),
    produtosRelacionados: text('produtos_relacionados'),
    destaque: boolean('destaque'),
    link: text('link'),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverBdgLocal = mysqlTable('silver_bdg_local', {
    codigoTipoLocal: varchar('codigo_tipo_local', { length: 50 }).primaryKey(),
    descricaoTipoLocal: text('descricao_tipo_local').notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverBdgSituacao = mysqlTable('silver_bdg_situacao', {
    codigoSituacao: varchar('codigo_situacao', { length: 50 }).primaryKey(),
    descricaoSituacao: text('descricao_situacao').notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverBdgTipo = mysqlTable('silver_bdg_tipo', {
    codigoTipoEstacao: varchar('codigo_tipo_estacao', { length: 50 }).primaryKey(),
    siglaTipoEstacao: varchar('sigla_tipo_estacao', { length: 50 }),
    descricaoTipoEstacao: text('descricao_tipo_estacao').notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverBngbCategoria = mysqlTable('silver_bngb_categoria', {
    categoria: varchar('categoria', { length: 150 }).primaryKey(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverBngbClasse = mysqlTable('silver_bngb_classe', {
    classe: varchar('classe', { length: 150 }).primaryKey(),
    categoria: varchar('categoria', { length: 150 }).notNull(),
    descricaoEdgv: text('descricao_edgv'),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
}, (table) => [
    foreignKey({
        name: 'fk_silver_bngb_cls_cat',
        columns: [table.categoria],
        foreignColumns: [silverBngbCategoria.categoria]
    }).onDelete('cascade')
]);

export const silverLocalidadesAglomeracoesUrbanas = mysqlTable('silver_localidades_aglomeracoes_urbanas', {
    id: varchar('id', { length: 50 }).primaryKey(),
    nome: text('nome').notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesAglomeracoesUrbanasMunicipios = mysqlTable('silver_localidades_aglomeracoes_urbanas_municipios', {
    id: int('id').primaryKey(),
    aglomeracaoUrbanaId: varchar('aglomeracao_urbana_id', { length: 50 }).notNull(),
    nome: text('nome').notNull(),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
}, (table) => [
    foreignKey({
        name: 'fk_silver_aglo_urb_mun_id',
        columns: [table.aglomeracaoUrbanaId],
        foreignColumns: [silverLocalidadesAglomeracoesUrbanas.id]
    }).onDelete('cascade')
]);

export const silverLocalidadesDistritos = mysqlTable('silver_localidades_distritos', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    municipioId: int('municipio_id'),
    municipioNome: text('municipio_nome'),
    microrregiaoId: int('microrregiao_id'),
    microrregiaoNome: text('microrregiao_nome'),
    mesorregiaoId: int('mesorregiao_id'),
    mesorregiaoNome: text('mesorregiao_nome'),
    regiaoImediataId: int('regiao_imediata_id'),
    regiaoImediataNome: text('regiao_imediata_nome'),
    regiaoIntermediariaId: int('regiao_intermediaria_id'),
    regiaoIntermediariaNome: text('regiao_intermediaria_nome'),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesEstados = mysqlTable('silver_localidades_estados', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    sigla: varchar('sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesMesorregioes = mysqlTable('silver_localidades_mesorregioes', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesMicrorregioes = mysqlTable('silver_localidades_microrregioes', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    mesorregiaoId: int('mesorregiao_id'),
    mesorregiaoNome: text('mesorregiao_nome'),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesMunicipios = mysqlTable('silver_localidades_municipios', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    microrregiaoId: int('microrregiao_id'),
    microrregiaoNome: text('microrregiao_nome'),
    mesorregiaoId: int('mesorregiao_id'),
    mesorregiaoNome: text('mesorregiao_nome'),
    regiaoImediataId: int('regiao_imediata_id'),
    regiaoImediataNome: text('regiao_imediata_nome'),
    regiaoIntermediariaId: int('regiao_intermediaria_id'),
    regiaoIntermediariaNome: text('regiao_intermediaria_nome'),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesPaises = mysqlTable('silver_localidades_paises', {
    m49: int('m49').primaryKey(),
    isoAlpha2: varchar('iso_alpha_2', { length: 2 }),
    isoAlpha3: varchar('iso_alpha_3', { length: 3 }),
    nome: text('nome').notNull(),
    subRegiaoM49: int('sub_regiao_m49'),
    subRegiaoNome: text('sub_regiao_nome'),
    regiaoM49: int('regiao_m49'),
    regiaoNome: text('regiao_nome'),
    regiaoIntermediariaM49: int('regiao_intermediaria_m49'),
    regiaoIntermediariaNome: text('regiao_intermediaria_nome'),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesRegioes = mysqlTable('silver_localidades_regioes', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    sigla: varchar('sigla', { length: 10 }).notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesRegioesImediatas = mysqlTable('silver_localidades_regioes_imediatas', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    regiaoIntermediariaId: int('regiao_intermediaria_id'),
    regiaoIntermediariaNome: text('regiao_intermediaria_nome'),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesRide = mysqlTable('silver_localidades_ride', {
    id: varchar('id', { length: 50 }).primaryKey(),
    nome: text('nome').notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesRideMunicipios = mysqlTable('silver_localidades_ride_municipios', {
    id: int('id').primaryKey(),
    rideId: varchar('ride_id', { length: 50 }).notNull(),
    nome: text('nome').notNull(),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
}, (table) => [
    foreignKey({
        name: 'fk_silver_loc_ride_mun_id',
        columns: [table.rideId],
        foreignColumns: [silverLocalidadesRide.id]
    }).onDelete('cascade')
]);

export const silverLocalidadesRegioesIntermediarias = mysqlTable('silver_localidades_regioes_intermediarias', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesRegioesMetropolitanas = mysqlTable('silver_localidades_regioes_metropolitanas', {
    id: varchar('id', { length: 50 }).primaryKey(),
    nome: text('nome').notNull(),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverLocalidadesRegioesMetropolitanasMunicipios = mysqlTable('silver_localidades_regioes_metropolitanas_municipios', {
    id: int('id').primaryKey(),
    regiaoMetropolitanaId: varchar('regiao_metropolitana_id', { length: 50 }).notNull(),
    nome: text('nome').notNull(),
}, (table) => [
    foreignKey({
        name: 'fk_silver_loc_rm_mun_id',
        columns: [table.regiaoMetropolitanaId],
        foreignColumns: [silverLocalidadesRegioesMetropolitanas.id]
    }).onDelete('cascade')
]);

export const silverLocalidadesSubdistritos = mysqlTable('silver_localidades_subdistritos', {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    nome: text('nome').notNull(),
    distritoId: int('distrito_id'),
    distritoNome: text('distrito_nome'),
    municipioId: int('municipio_id'),
    municipioNome: text('municipio_nome'),
    microrregiaoId: int('microrregiao_id'),
    microrregiaoNome: text('microrregiao_nome'),
    mesorregiaoId: int('mesorregiao_id'),
    mesorregiaoNome: text('mesorregiao_nome'),
    regiaoImediataId: int('regiao_imediata_id'),
    regiaoImediataNome: text('regiao_imediata_nome'),
    regiaoIntermediariaId: int('regiao_intermediaria_id'),
    regiaoIntermediariaNome: text('regiao_intermediaria_nome'),
    ufId: int('uf_id'),
    ufNome: text('uf_nome'),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    regiaoId: int('regiao_id'),
    regiaoNome: text('regiao_nome'),
    regiaoSigla: varchar('regiao_sigla', { length: 10 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverPesquisas = mysqlTable('silver_pesquisas', {
    id: int('id').primaryKey(),
    nome: text('nome').notNull(),
    descricao: text('descricao'),
    observacao: text('observacao'),
    contexto: varchar('contexto', { length: 50 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverPesquisasPeriodos = mysqlTable('silver_pesquisas_periodos', {
    id: serial('id').primaryKey(),
    pesquisaId: int('pesquisa_id').notNull(),
    periodo: varchar('periodo', { length: 50 }).notNull(),
    versao: int('versao'),
    publicacao: varchar('publicacao', { length: 50 }),
    fonte: json('fonte').$type<string[]>(),
    nota: json('nota').$type<string[]>(),
}, (table) => [
    foreignKey({
        name: 'fk_silver_pesq_per_id',
        columns: [table.pesquisaId],
        foreignColumns: [silverPesquisas.id]
    }).onDelete('cascade'),
    uniqueIndex('uq_pesq_periodo_versao').on(table.pesquisaId, table.periodo, table.versao)
]);

export const silverProdutos = mysqlTable('silver_produtos', {
    id: int('id').primaryKey(),
    path: text('path'),
    tipo: varchar('tipo', { length: 100 }),
    alias: varchar('alias', { length: 150 }),
    catId: int('cat_id'),
    sigla: varchar('sigla', { length: 50 }),
    titulo: text('titulo').notNull(),
    catTitle: text('cat_title'),
    parentCatId: int('parent_cat_id'),
    parentCatTitle: text('parent_cat_title'),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverRmpgMaregrafos = mysqlTable('silver_rmpg_maregrafos', {
    siglaMaregrafo: varchar('sigla_maregrafo', { length: 20 }).primaryKey(),
    nomeMaregrafo: varchar('nome_maregrafo', { length: 150 }).notNull(),
    local: text('local'),
    siglaUf: varchar('sigla_uf', { length: 10 }),
    lat: double('lat'),
    lon: double('lon'),
    idGloss: int('id_gloss'),
    idPsmsl: int('id_psmsl'),
    idUhslc: int('id_uhslc'),
    urlRelatorio: text('url_relatorio'),
    dataInicialOperacao: varchar('data_inicial_operacao', { length: 30 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverRmpgSensores = mysqlTable('silver_rmpg_sensores', {
    codigoSensor: varchar('codigo_sensor', { length: 50 }).primaryKey(),
    nomeSensor: varchar('nome_sensor', { length: 100 }),
    descricaoSensor: text('descricao_sensor').notNull(),
    unidadeMedida: varchar('unidade_medida', { length: 20 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverCensosNomesRanking = mysqlTable('silver_censos_nomes_ranking', {
    id: serial('id').primaryKey(),
    localidade: varchar('localidade', { length: 50 }).notNull(),
    sexo: varchar('sexo', { length: 10 }),
    ranking: int('ranking').notNull(),
    nome: varchar('nome', { length: 100 }).notNull(),
    frequencia: bigint('frequencia', { mode: 'number' }).notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
}, (table) => [
    uniqueIndex('uq_nomes_rank_loc_sex_pos').on(table.localidade, table.sexo, table.ranking)
]);

export const silverCnaeClasses = mysqlTable('silver_cnae_classes', {
    id: varchar('id', { length: 20 }).primaryKey(),
    descricao: text('descricao').notNull(),
    grupoId: varchar('grupo_id', { length: 20 }),
    grupoDescricao: text('grupo_descricao'),
    divisaoId: varchar('divisao_id', { length: 20 }),
    divisaoDescricao: text('divisao_descricao'),
    secaoId: varchar('secao_id', { length: 10 }),
    secaoDescricao: text('secao_descricao'),
    observacoes: json('observacoes').$type<string[]>(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverCnaeDivisoes = mysqlTable('silver_cnae_divisoes', {
    id: varchar('id', { length: 20 }).primaryKey(),
    descricao: text('descricao').notNull(),
    secaoId: varchar('secao_id', { length: 10 }),
    secaoDescricao: text('secao_descricao'),
    observacoes: json('observacoes').$type<string[]>(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverCnaeGrupos = mysqlTable('silver_cnae_grupos', {
    id: varchar('id', { length: 20 }).primaryKey(),
    descricao: text('descricao').notNull(),
    divisaoId: varchar('divisao_id', { length: 20 }),
    divisaoDescricao: text('divisao_descricao'),
    secaoId: varchar('secao_id', { length: 10 }),
    secaoDescricao: text('secao_descricao'),
    observacoes: json('observacoes').$type<string[]>(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverCnaeSecoes = mysqlTable('silver_cnae_secoes', {
    id: varchar('id', { length: 10 }).primaryKey(),
    descricao: text('descricao').notNull(),
    observacoes: json('observacoes').$type<string[]>(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverCnaeSubclasses = mysqlTable('silver_cnae_subclasses', {
    id: varchar('id', { length: 20 }).primaryKey(),
    descricao: text('descricao').notNull(),
    classeId: varchar('classe_id', { length: 20 }),
    classeDescricao: text('classe_descricao'),
    grupoId: varchar('grupo_id', { length: 20 }),
    grupoDescricao: text('grupo_descricao'),
    divisaoId: varchar('divisao_id', { length: 20 }),
    divisaoDescricao: text('divisao_descricao'),
    secaoId: varchar('secao_id', { length: 10 }),
    secaoDescricao: text('secao_descricao'),
    atividades: json('atividades').$type<string[]>(),
    observacoes: json('observacoes').$type<string[]>(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverAgregadosGrupos = mysqlTable('silver_agregados_grupos', {
    id: varchar('id', { length: 50 }).primaryKey(),
    nome: text('nome').notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverAgregados = mysqlTable('silver_agregados', {
    id: varchar('id', { length: 50 }).primaryKey(),
    grupoId: varchar('grupo_id', { length: 50 }).notNull(),
    nome: text('nome').notNull(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
}, (table) => [
    foreignKey({
        name: 'fk_silver_agr_grp_id',
        columns: [table.grupoId],
        foreignColumns: [silverAgregadosGrupos.id]
    }).onDelete('cascade')
]);

export const silverAgregadosMetadados = mysqlTable('silver_agregados_metadados', {
    id: int('id').primaryKey(),
    url: text('url'),
    nome: text('nome').notNull(),
    assunto: text('assunto'),
    pesquisa: text('pesquisa'),
    periodoInicio: int('periodo_inicio'),
    periodoFim: int('periodo_fim'),
    periodicidadeFreq: varchar('periodicidade_freq', { length: 50 }),
    nivelTerritorial: json('nivel_territorial').$type<Record<string, unknown>>(),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverAgregadosMetadadosVariaveis = mysqlTable('silver_agregados_metadados_variaveis', {
    id: int('id').notNull(),
    agregadoId: int('agregado_id').notNull(),
    nome: text('nome').notNull(),
    unidade: text('unidade'),
    sumarizacao: json('sumarizacao').$type<string[]>(),
}, (table) => [
    foreignKey({
        name: 'fk_silver_agr_meta_var_id',
        columns: [table.agregadoId],
        foreignColumns: [silverAgregadosMetadados.id]
    }).onDelete('cascade'),
    uniqueIndex('uq_agr_meta_var_agr_id').on(table.agregadoId, table.id)
]);

export const silverAgregadosMetadadosClassificacoes = mysqlTable('silver_agregados_metadados_classificacoes', {
    id: int('id').notNull(),
    agregadoId: int('agregado_id').notNull(),
    nome: text('nome').notNull(),
    sumarizacao: json('sumarizacao').$type<Record<string, unknown>>(),
}, (table) => [
    foreignKey({
        name: 'fk_silver_agr_meta_cls_id',
        columns: [table.agregadoId],
        foreignColumns: [silverAgregadosMetadados.id]
    }).onDelete('cascade'),
    uniqueIndex('uq_agr_meta_cls_agr_id').on(table.agregadoId, table.id)
]);

export const silverAgregadosMetadadosCategorias = mysqlTable('silver_agregados_metadados_categorias', {
    id: int('id').notNull(),
    agregadoId: int('agregado_id').notNull(),
    classificacaoId: int('classificacao_id').notNull(),
    nome: text('nome').notNull(),
    nivel: int('nivel'),
    unidade: text('unidade'),
}, (table) => [
    foreignKey({
        name: 'fk_silver_agr_meta_cat_agr_id',
        columns: [table.agregadoId],
        foreignColumns: [silverAgregadosMetadados.id]
    }).onDelete('cascade'),
    uniqueIndex('uq_agr_meta_cat_cls_id').on(table.agregadoId, table.classificacaoId, table.id)
]);

export const silverCalendario = mysqlTable('silver_calendario', {
    id: int('id').primaryKey(),
    tipoId: int('tipo_id'),
    tipo: varchar('tipo', { length: 150 }),
    titulo: text('titulo').notNull(),
    link: text('link'),
    descricao: text('descricao'),
    produtoId: int('produto_id'),
    nomeProduto: text('nome_produto'),
    aliasProduto: varchar('alias_produto', { length: 255 }),
    descricaoProduto: text('descricao_produto'),
    dataDivulgacao: varchar('data_divulgacao', { length: 50 }),
    anoRefInicio: int('ano_ref_inicio'),
    mesRefInicio: int('mes_ref_inicio'),
    anoRefFim: int('ano_ref_fim'),
    mesRefFim: int('mes_ref_fim'),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});

export const silverBdgEstacoes = mysqlTable('silver_bdg_estacoes', {
    codigoEstacao: varchar('codigo_estacao', { length: 50 }).primaryKey(),
    tipoEstacao: varchar('tipo_estacao', { length: 100 }),
    tema: varchar('tema', { length: 20 }),
    nomeEstacao: varchar('nome_estacao', { length: 255 }),
    codigoEstacaoMaterializada: varchar('codigo_estacao_materializada', { length: 100 }),
    inscricaoChapa: varchar('inscricao_chapa', { length: 255 }),
    dataVisita: varchar('data_visita', { length: 20 }),
    situacao: varchar('situacao', { length: 100 }),
    descricaoEstacao: text('descricao_estacao'),
    latitude: double('latitude'),
    longitude: double('longitude'),
    latitudeGms: varchar('latitude_gms', { length: 50 }),
    longitudeGms: varchar('longitude_gms', { length: 50 }),
    sigmaLatitude: varchar('sigma_latitude', { length: 50 }),
    sigmaLongitude: varchar('sigma_longitude', { length: 50 }),
    fonteCoordenada: varchar('fonte_coordenada', { length: 255 }),
    dataMedicaoCoordenada: varchar('data_medicao_coordenada', { length: 20 }),
    dataCalculoCoordenada: varchar('data_calculo_coordenada', { length: 20 }),
    sistemaReferenciaCoordenada: varchar('sistema_referencia_coordenada', { length: 100 }),
    altitudeGeometrica: varchar('altitude_geometrica', { length: 50 }),
    sigmaAltitudeGeometrica: varchar('sigma_altitude_geometrica', { length: 50 }),
    fonteAltitudeGeometrica: varchar('fonte_altitude_geometrica', { length: 255 }),
    altitudeOrtometrica: varchar('altitude_ortometrica', { length: 50 }),
    altitudeNormal: varchar('altitude_normal', { length: 50 }),
    fonteAltitude: varchar('fonte_altitude', { length: 255 }),
    dataMedicaoAltitude: varchar('data_medicao_altitude', { length: 20 }),
    dataCalculoAltitude: varchar('data_calculo_altitude', { length: 20 }),
    datumAltitude: varchar('datum_altitude', { length: 100 }),
    sigmaAltitude: varchar('sigma_altitude', { length: 50 }),
    numeroGeopotencial: varchar('numero_geopotencial', { length: 50 }),
    valorGravidade: varchar('valor_gravidade', { length: 50 }),
    datumGravidade: varchar('datum_gravidade', { length: 50 }),
    dataMedicaoGravidade: varchar('data_medicao_gravidade', { length: 20 }),
    dataCalculoGravidade: varchar('data_calculo_gravidade', { length: 20 }),
    idAjusteRn: varchar('id_ajuste_rn', { length: 50 }),
    notaAjusteRn: text('nota_ajuste_rn'),
    localizacao: text('localizacao'),
    itinerario: text('itinerario'),
    observacao: text('observacao'),
    tipoLocal: varchar('tipo_local', { length: 100 }),
    municipioNome: varchar('municipio_nome', { length: 255 }),
    municipioGeocodigo: varchar('municipio_geocodigo', { length: 50 }),
    ufSigla: varchar('uf_sigla', { length: 10 }),
    ufNome: varchar('uf_nome', { length: 100 }),
    transformedAt: timestamp('transformed_at').defaultNow().notNull(),
});