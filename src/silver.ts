// src/silver.ts
import { logger } from './logger.js';
import { transformMetadadosPesquisas } from './silver/pesquisas.js';
import { transformNoticias } from './silver/noticias.js';
import { transformBdgLocal } from './silver/bdgLocal.js';
import { transformBdgSituacao } from './silver/bdgSituacao.js';
import { transformBdgTipo } from './silver/bdgTipo.js';
import { transformBngbCategoria } from './silver/bngbCategoria.js';
import { transformBngbClasse } from './silver/bngbClasse.js';
import { transformLocalidadesAglomeracoesUrbanas } from './silver/localidadesAglomeracoesUrbanas.js';
import { transformLocalidadesDistritos } from './silver/localidadesDistritos.js';
import { transformLocalidadesEstados } from './silver/localidadesEstados.js';
import { transformLocalidadesMesorregioes } from './silver/localidadesMesorregioes.js';
import { transformLocalidadesMicrorregioes } from './silver/localidadesMicrorregioes.js';
import { transformLocalidadesMunicipios } from './silver/localidadesMunicipios.js';
import { transformLocalidadesPaises } from './silver/localidadesPaises.js';
import { transformLocalidadesRegioes } from './silver/localidadesRegioes.js';
import { transformLocalidadesRegioesImediatas } from './silver/localidadesRegioesImediatas.js';
import { transformLocalidadesRide } from './silver/localidadesRide.js';
import { transformLocalidadesRegioesIntermediarias } from './silver/localidadesRegioesIntermediarias.js';
import { transformLocalidadesRegioesMetropolitanas } from './silver/localidadesRegioesMetropolitanas.js';
import { transformLocalidadesSubdistritos } from './silver/localidadesSubdistritos.js';
import { transformPesquisasGerais } from './silver/pesquisasGerais.js';
import { transformProdutos } from './silver/produtos.js';
import { transformProdutosEstatisticas } from './silver/produtosEstatisticas.js';
import { transformProdutosGeociencias } from './silver/produtosGeociencias.js';
import { transformRmpgMaregrafos } from './silver/rmpgMaregrafos.js';
import { transformRmpgSensores } from './silver/rmpgSensores.js';
import { transformCensosNomesRanking } from './silver/censosNomesRanking.js';
import { transformCnaeClasses } from './silver/cnaeClasses.js';
import { transformCnaeDivisoes } from './silver/cnaeDivisoes.js';
import { transformCnaeGrupos } from './silver/cnaeGrupos.js';
import { transformCnaeSecoes } from './silver/cnaeSecoes.js';
import { transformCnaeSubclasses } from './silver/cnaeSubclasses.js';
import { transformAgregados } from './silver/agregados.js';
import { transformAgregadosMetadados } from './silver/agregadosMetadados.js';
import { transformCalendario } from './silver/calendario.js';
import { transformBdgEstacoes } from './silver/bdgEstacoes.js';
import { transformMetadadosPesquisasPeriodos } from './silver/metadadosPesquisasPeriodos.js';
import { transformPublicacoes } from './silver/publicacoes.js';
import { transformBngbNomesGeograficos } from './silver/bngbNomesGeograficos.js';
import { transformPesquisasPeriodos } from './silver/pesquisasPeriodos.js';
import { transformPesquisasResultados } from './silver/pesquisasResultados.js';
import { transformMalhasMunicipiosMetadados } from './silver/malhasMunicipiosMetadados.js';
import { transformMalhasPaisesMetadados } from './silver/malhasPaisesMetadados.js';
import { transformMalhasRegioesImediatasMetadados } from './silver/malhasRegioesImediatasMetadados.js';
import { transformMalhasRegioesIntermediariasMetadados } from './silver/malhasRegioesIntermediariasMetadados.js';
import { transformMalhasRegioesMetadados } from './silver/malhasRegioesMetadados.js';

/**
 * ORQUESTRADOR DA CAMADA SILVER (FASE 1)
 * Itera processando e normalizando os dados de cada endpoint pai.
 */
export async function runSilverPhase1() {
    logger.info("Iniciando processamento da camada Silver (Fase 1 - Pais)");

    try {
        await transformMetadadosPesquisas();
        await transformAgregados();
        await transformAgregadosMetadados();
        await transformNoticias();
        await transformBdgLocal();
        await transformBdgSituacao();
        await transformBdgTipo();
        await transformBngbCategoria();
        await transformBngbClasse();
        await transformLocalidadesAglomeracoesUrbanas();
        await transformLocalidadesDistritos();
        await transformLocalidadesEstados();
        await transformLocalidadesMesorregioes();
        await transformLocalidadesMicrorregioes();
        await transformLocalidadesMunicipios();
        await transformLocalidadesPaises();
        await transformLocalidadesRegioes();
        await transformLocalidadesRegioesImediatas();
        await transformLocalidadesRegioesIntermediarias();
        await transformLocalidadesRegioesMetropolitanas();
        await transformLocalidadesRide();
        await transformLocalidadesSubdistritos();
        await transformPesquisasGerais();
        await transformProdutos();
        await transformProdutosEstatisticas();
        await transformProdutosGeociencias();
        await transformRmpgMaregrafos();
        await transformRmpgSensores();
        await transformCensosNomesRanking();
        await transformCnaeClasses();
        await transformCnaeDivisoes();
        await transformCnaeGrupos();
        await transformCnaeSecoes();
        await transformCnaeSubclasses();
        await transformCalendario();

        logger.info("Processamento da camada Silver (Fase 1) concluído.");
    } catch (error) {
        logger.error({ error: (error as Error).message }, "Falha durante o processamento da camada Silver.");
        throw error;
    }
}

export async function runSilverBdgEstacoes() {
    logger.info("Iniciando processamento Silver específico: bdgEstacoes");

    try {
        await transformBdgEstacoes();
        logger.info("Processamento Silver de bdgEstacoes concluído.");
    } catch (error) {
        logger.error({ error: (error as Error).message }, "Falha durante o processamento Silver de bdgEstacoes.");
        throw error;
    }
}

export async function runSilverPhase2() {
    logger.info("Iniciando processamento da camada Silver (Fase 2 - Geral)");

    try {
        await transformMetadadosPesquisasPeriodos();
        await transformPublicacoes();
        await transformBngbNomesGeograficos();
        await transformPesquisasPeriodos();
        await transformPesquisasResultados();
        await transformAgregadosMetadados();
        await transformLocalidadesMesorregioes();
        await transformMalhasMunicipiosMetadados();
        await transformMalhasPaisesMetadados();
        await transformMalhasRegioesImediatasMetadados();
        await transformMalhasRegioesIntermediariasMetadados();
        await transformMalhasRegioesMetadados();
        logger.info("Processamento da camada Silver (Fase 2 - Geral) concluído.");
    } catch (error) {
        logger.error({ error: (error as Error).message }, "Falha durante o processamento da camada Silver (Fase 2 - Geral).");
        throw error;
    }
}