// src/silver/bngbNomesGeograficos.ts
import { sql } from 'drizzle-orm';
import { normalizedDb } from '../db/normalized/connection.js';
import { silverBngbNomesGeograficos } from '../db/normalized/schema.js';
import { rawDb } from '../db/raw/connection.js';
import { logger } from '../logger.js';

interface RawFeature {
    type: string;
    geometry?: {
        type: string;
        coordinates?: unknown;
        [key: string]: unknown;
    };
    properties?: {
        idNomebngb?: number;
        nomeGeografico?: string;
        geocodigo?: string | null;
        termoGenerico?: string | null;
        termoEspecifico?: string | null;
        conectivo?: string | null;
        categoria?: string | null;
        classe?: string | null;
        escalaOcorrencia?: string | null;
        escalaOrigemGeometria?: string | null;
        statusValidacao?: string | null;
        nivelValidacao?: string | null;
        sustentacaoValidacao?: string | null;
        dataValidacao?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        latitudeGMS?: string | null;
        longitudeGMS?: string | null;
        dataPublicacao?: string | null;
        geometrytype?: string | null;
    };
}

interface RawGeoJsonPayload {
    type?: string;
    features?: RawFeature[];
}

export async function transformBngbNomesGeograficos() {
    const endpointPattern = 'https://servicodados.ibge.gov.br/api/v1/bngb/uf/%/nomesgeograficos';
    const endpointKey = 'https://servicodados.ibge.gov.br/api/v1/bngb/uf/{sigla}/nomesgeograficos';

    const rawData = await rawDb.query.RawRootResponses.findMany({
        where: (row, { or, eq, like }) => or(
            eq(row.endpointKey, endpointKey),
            like(row.endpointKey, endpointPattern),
            like(row.apiUrl, endpointPattern)
        ),
    });

    if (rawData.length === 0) {
        logger.warn({ endpointKey }, 'Sem dados brutos para processar em bngbNomesGeograficos.');
        return;
    }

    const recordsMap = new Map<number, typeof silverBngbNomesGeograficos.$inferInsert>();

    for (const row of rawData) {
        const payload = row.payload as RawGeoJsonPayload | RawFeature[];
        if (!payload) continue;

        const features = Array.isArray(payload)
            ? payload
            : Array.isArray(payload.features)
                ? payload.features
                : [];

        for (const feature of features) {
            const props = feature?.properties;
            if (!props || typeof props.idNomebngb !== 'number' || !props.nomeGeografico) continue;

            recordsMap.set(props.idNomebngb, {
                idNomeBngb: props.idNomebngb,
                nomeGeografico: String(props.nomeGeografico).trim(),
                geocodigo: props.geocodigo ? String(props.geocodigo).trim() : null,
                termoGenerico: props.termoGenerico ? String(props.termoGenerico).trim() : null,
                termoEspecifico: props.termoEspecifico ? String(props.termoEspecifico).trim() : null,
                conectivo: props.conectivo ? String(props.conectivo).trim() : null,
                categoria: props.categoria ? String(props.categoria).trim() : null,
                classe: props.classe ? String(props.classe).trim() : null,
                escalaOcorrencia: props.escalaOcorrencia ? String(props.escalaOcorrencia).trim() : null,
                escalaOrigemGeometria: props.escalaOrigemGeometria ? String(props.escalaOrigemGeometria).trim() : null,
                statusValidacao: props.statusValidacao ? String(props.statusValidacao).trim() : null,
                nivelValidacao: props.nivelValidacao ? String(props.nivelValidacao).trim() : null,
                sustentacaoValidacao: props.sustentacaoValidacao ? String(props.sustentacaoValidacao).trim() : null,
                dataValidacao: props.dataValidacao ? String(props.dataValidacao).trim() : null,
                latitude: typeof props.latitude === 'number' ? props.latitude : null,
                longitude: typeof props.longitude === 'number' ? props.longitude : null,
                latitudeGms: props.latitudeGMS ? String(props.latitudeGMS).trim() : null,
                longitudeGms: props.longitudeGMS ? String(props.longitudeGMS).trim() : null,
                dataPublicacao: props.dataPublicacao ? String(props.dataPublicacao).trim() : null,
                geometryType: props.geometrytype ? String(props.geometrytype).trim() : (feature.geometry?.type ? String(feature.geometry.type).trim() : null),
                geometry: feature.geometry ?? null,
            });
        }
    }

    const recordsToInsert = Array.from(recordsMap.values());

    if (recordsToInsert.length > 0) {
        const BATCH_SIZE = 1000;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);

            await normalizedDb.insert(silverBngbNomesGeograficos)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        nomeGeografico: sql`VALUES(nome_geografico)`,
                        geocodigo: sql`VALUES(geocodigo)`,
                        termoGenerico: sql`VALUES(termo_generico)`,
                        termoEspecifico: sql`VALUES(termo_especifico)`,
                        conectivo: sql`VALUES(conectivo)`,
                        categoria: sql`VALUES(categoria)`,
                        classe: sql`VALUES(classe)`,
                        escalaOcorrencia: sql`VALUES(escala_ocorrencia)`,
                        escalaOrigemGeometria: sql`VALUES(escala_origem_geometria)`,
                        statusValidacao: sql`VALUES(status_validacao)`,
                        nivelValidacao: sql`VALUES(nivel_validacao)`,
                        sustentacaoValidacao: sql`VALUES(sustentacao_validacao)`,
                        dataValidacao: sql`VALUES(data_validacao)`,
                        latitude: sql`VALUES(latitude)`,
                        longitude: sql`VALUES(longitude)`,
                        latitudeGms: sql`VALUES(latitude_gms)`,
                        longitudeGms: sql`VALUES(longitude_gms)`,
                        dataPublicacao: sql`VALUES(data_publicacao)`,
                        geometryType: sql`VALUES(geometry_type)`,
                        geometry: sql`VALUES(geometry)`,
                        transformedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
        }

        logger.info(`Fase 2 Silver: ${recordsToInsert.length} registros persistidos em silver_bngb_nomes_geograficos.`);
    }
}