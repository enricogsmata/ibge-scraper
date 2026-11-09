// src/silver/bdgEstacoes.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverBdgEstacoes } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

export async function transformBdgEstacoes() {
    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { like }) => like(row.endpointKey, 'https://servicodados.ibge.gov.br/api/v1/bdg/estado/%/estacoes'),
    });

    if (rawData.length === 0) {
        logger.warn('Sem dados brutos para processar em estações BDG.');
        return;
    }

    const recordsToInsert = [];

    for (const row of rawData) {
        const payload = row.payload;
        if (!Array.isArray(payload)) continue;

        for (const item of payload as any[]) {
            if (!item.codigoEstacao) continue;

            const mun = item.municipio || {};
            const uf = mun.uf || {};

            recordsToInsert.push({
                codigoEstacao: String(item.codigoEstacao).trim(),
                tipoEstacao: item.tipoEstacao ? String(item.tipoEstacao).trim() : null,
                tema: item.tema ? String(item.tema).trim() : null,
                nomeEstacao: item.nomeEstacao ? String(item.nomeEstacao).trim() : null,
                codigoEstacaoMaterializada: item.codigoEstacaoMaterializada ? String(item.codigoEstacaoMaterializada).trim() : null,
                inscricaoChapa: item.inscricaoChapa ? String(item.inscricaoChapa).trim() : null,
                dataVisita: item.dataVisita ? String(item.dataVisita).trim() : null,
                situacao: item.situacao ? String(item.situacao).trim() : null,
                descricaoEstacao: item.descricaoEstacao ? String(item.descricaoEstacao).trim() : null,
                latitude: item.latitude !== undefined && item.latitude !== null && item.latitude !== '' ? Number(item.latitude) : null,
                longitude: item.longitude !== undefined && item.longitude !== null && item.longitude !== '' ? Number(item.longitude) : null,
                latitudeGms: item.latitudeGMS ? String(item.latitudeGMS).trim() : null,
                longitudeGms: item.longitudeGMS ? String(item.longitudeGMS).trim() : null,
                sigmaLatitude: item.sigmaLatitude ? String(item.sigmaLatitude).trim() : null,
                sigmaLongitude: item.sigmaLongitude ? String(item.sigmaLongitude).trim() : null,
                fonteCoordenada: item.fonteCoordenada ? String(item.fonteCoordenada).trim() : null,
                dataMedicaoCoordenada: item.dataMedicaoCoordenada ? String(item.dataMedicaoCoordenada).trim() : null,
                dataCalculoCoordenada: item.dataCalculoCoordenada ? String(item.dataCalculoCoordenada).trim() : null,
                sistemaReferenciaCoordenada: item.sistemaReferenciaCoordenada ? String(item.sistemaReferenciaCoordenada).trim() : null,
                altitudeGeometrica: item.altitudeGeometrica ? String(item.altitudeGeometrica).trim() : null,
                sigmaAltitudeGeometrica: item.sigmaAltitudeGeometrica ? String(item.sigmaAltitudeGeometrica).trim() : null,
                fonteAltitudeGeometrica: item.fonteAltitudeGeometrica ? String(item.fonteAltitudeGeometrica).trim() : null,
                altitudeOrtometrica: item.altitudeOrtometrica ? String(item.altitudeOrtometrica).trim() : null,
                altitudeNormal: item.altitudeNormal ? String(item.altitudeNormal).trim() : null,
                fonteAltitude: item.fonteAltitude ? String(item.fonteAltitude).trim() : null,
                dataMedicaoAltitude: item.dataMedicaoAltitude ? String(item.dataMedicaoAltitude).trim() : null,
                dataCalculoAltitude: item.dataCalculoAltitude ? String(item.dataCalculoAltitude).trim() : null,
                datumAltitude: item.datumAltitude ? String(item.datumAltitude).trim() : null,
                sigmaAltitude: item.sigmaAltitude ? String(item.sigmaAltitude).trim() : null,
                numeroGeopotencial: item.numeroGeopotencial ? String(item.numeroGeopotencial).trim() : null,
                valorGravidade: item.valorGravidade ? String(item.valorGravidade).trim() : null,
                datumGravidade: item.datumGravidade ? String(item.datumGravidade).trim() : null,
                dataMedicaoGravidade: item.dataMedicaoGravidade ? String(item.dataMedicaoGravidade).trim() : null,
                dataCalculoGravidade: item.dataCalculoGravidade ? String(item.dataCalculoGravidade).trim() : null,
                idAjusteRn: item.idAjusteRN ? String(item.idAjusteRN).trim() : null,
                notaAjusteRn: item.notaAjusteRN ? String(item.notaAjusteRN).trim() : null,
                localizacao: item.localizacao ? String(item.localizacao).trim() : null,
                itinerario: item.itinerario ? String(item.itinerario).trim() : null,
                observacao: item.observacao ? String(item.observacao).trim() : null,
                tipoLocal: item.tipoLocal ? String(item.tipoLocal).trim() : null,
                municipioNome: mun.nomeMunicipio ? String(mun.nomeMunicipio).trim() : null,
                municipioGeocodigo: mun.geocodigo ? String(mun.geocodigo).trim() : null,
                ufSigla: uf.sigla ? String(uf.sigla).trim() : null,
                ufNome: uf.nomeUF ? String(uf.nomeUF).trim() : null,
            });
        }
    }

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverBdgEstacoes)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        tipoEstacao: sql`VALUES(tipo_estacao)`,
                        tema: sql`VALUES(tema)`,
                        nomeEstacao: sql`VALUES(nome_estacao)`,
                        codigoEstacaoMaterializada: sql`VALUES(codigo_estacao_materializada)`,
                        inscricaoChapa: sql`VALUES(inscricao_chapa)`,
                        dataVisita: sql`VALUES(data_visita)`,
                        situacao: sql`VALUES(situacao)`,
                        descricaoEstacao: sql`VALUES(descricao_estacao)`,
                        latitude: sql`VALUES(latitude)`,
                        longitude: sql`VALUES(longitude)`,
                        latitudeGms: sql`VALUES(latitude_gms)`,
                        longitudeGms: sql`VALUES(longitude_gms)`,
                        sigmaLatitude: sql`VALUES(sigma_latitude)`,
                        sigmaLongitude: sql`VALUES(sigma_longitude)`,
                        fonteCoordenada: sql`VALUES(fonte_coordenada)`,
                        dataMedicaoCoordenada: sql`VALUES(data_medicao_coordenada)`,
                        dataCalculoCoordenada: sql`VALUES(data_calculo_coordenada)`,
                        sistemaReferenciaCoordenada: sql`VALUES(sistema_referencia_coordenada)`,
                        altitudeGeometrica: sql`VALUES(altitude_geometrica)`,
                        sigmaAltitudeGeometrica: sql`VALUES(sigma_altitude_geometrica)`,
                        fonteAltitudeGeometrica: sql`VALUES(fonte_altitude_geometrica)`,
                        altitudeOrtometrica: sql`VALUES(altitude_ortometrica)`,
                        altitudeNormal: sql`VALUES(altitude_normal)`,
                        fonteAltitude: sql`VALUES(fonte_altitude)`,
                        dataMedicaoAltitude: sql`VALUES(data_medicao_altitude)`,
                        dataCalculoAltitude: sql`VALUES(data_calculo_altitude)`,
                        datumAltitude: sql`VALUES(datum_altitude)`,
                        sigmaAltitude: sql`VALUES(sigma_altitude)`,
                        numeroGeopotencial: sql`VALUES(numero_geopotencial)`,
                        valorGravidade: sql`VALUES(valor_gravidade)`,
                        datumGravidade: sql`VALUES(datum_gravidade)`,
                        dataMedicaoGravidade: sql`VALUES(data_medicao_gravidade)`,
                        dataCalculoGravidade: sql`VALUES(data_calculo_gravidade)`,
                        idAjusteRn: sql`VALUES(id_ajuste_rn)`,
                        notaAjusteRn: sql`VALUES(nota_ajuste_rn)`,
                        localizacao: sql`VALUES(localizacao)`,
                        itinerario: sql`VALUES(itinerario)`,
                        observacao: sql`VALUES(observacao)`,
                        tipoLocal: sql`VALUES(tipo_local)`,
                        municipioNome: sql`VALUES(municipio_nome)`,
                        municipioGeocodigo: sql`VALUES(municipio_geocodigo)`,
                        ufSigla: sql`VALUES(uf_sigla)`,
                        ufNome: sql`VALUES(uf_nome)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    }
                });
        }

        logger.info(`Fase 2 Silver: ${recordsToInsert.length} registros persistidos em silver_bdg_estacoes.`);
    }
}