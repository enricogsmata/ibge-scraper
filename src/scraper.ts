import puppeteer, { ElementHandle, Page } from "puppeteer";
import { logger } from "./logger.js";
import { rawDb } from "./db/raw/connection.js";
import { ModuleApiData, Modules } from "./db/raw/schema.js";
import { eq, sql } from "drizzle-orm";
import { TModule, TModuleApiDataRaw } from "./db/raw/types.js";
import { isExcludedEndpoint } from "./helpers.js";

const baseLogger = logger.forModule(import.meta.url);
const MAIN_URL: string = 'https://servicodados.ibge.gov.br/api/docs';

type RawModule = {
    name: string,
    description: string,
    link: string
}

async function getPersistedModules(): Promise<TModule[]> {
    const log = baseLogger.forMethod('getModulesIds');
    try {
        const modules = await rawDb
            .select()
            .from(Modules);

        return modules ?? [];
    } catch (error) {
        log.error({ error }, "Falha ao obter módulos persistidos.");
        return [];
    }
}

async function persisTModuleApiDataRaw(modulesApiData: TModuleApiDataRaw[]) {
    const log = baseLogger.forMethod('persisTModuleApiDataRaw');
    try {
        for (const moduleApiData of modulesApiData) {
            await rawDb
                .insert(ModuleApiData)
                .values({ ...moduleApiData })
                .onDuplicateKeyUpdate({
                    set: {
                        id: sql`VALUES(id)`,
                        apiUrl: sql`VALUES(api_url)`,
                        moduleId: sql`VALUES(module_id)`,
                        params: sql`VALUES(params)`
                    }
                })

        }
    } catch (error) {
        log.error({ data: error }, `Falha na persistência dos módulos encontrados!`);
    }
}

async function persistFoundModules(modules: RawModule[]) {
    const log = baseLogger.forMethod('persistFoundModules');
    try {
        await rawDb.delete(ModuleApiData);
        await rawDb.delete(Modules);

        await rawDb
            .insert(Modules)
            .values(modules)
            .onDuplicateKeyUpdate({
                set: {
                    link: sql`VALUES(link)`,
                    description: sql`VALUES(description)`,
                    name: sql`VALUES(name)`
                }
            })
    } catch (error) {
        log.error({ data: error }, `Falha na persistência dos módulos encontrados!`);
    }
}

async function scrapeMainPageModules(page: Page): Promise<RawModule[]> {
    const log = baseLogger.forMethod('scrapeMainPageModules');

    log.info('> Navegando para a página principal... <');
    await page.goto(MAIN_URL);

    await page.waitForSelector('.l-content-inner .c-wrapper', { timeout: 60000 });
    log.info('> Módulos encontrados! <');

    const modules: RawModule[] = await page.$$eval('.c-wrapper', (elements, mainUrl) => elements.map((element) => {
        const name = element.querySelector('.headline')?.textContent;
        const description = element.querySelector('.subhead')?.textContent;
        const link = element.querySelector('.headline')?.getAttribute('href') ?? '';

        return {
            name: name ? name.trim() : '',
            description: description ? description.trim() : '',
            link: link === '' ? link : new URL(link, mainUrl).toString()
        }
    }), MAIN_URL);

    log.info({ data: `Número de módulos encontrados: ${modules.length ?? 0}` }, '> Módulos extraídos!');
    return modules;
}

async function scrapeModuleApiPage(page: Page, module: TModule): Promise<TModuleApiDataRaw[]> {
    const foundModulesApiData = await page.$$eval('section[id^="api-"] div[id^="api-"]', (elements, currentModule) => elements.map((element) => {

        const apiUrl = element.querySelector('code > span.pln')?.textContent.trim() ?? '';
        const method = element.querySelector('pre.prettyprint')?.getAttribute('data-type') ?? '';
        const paramsTable = element.querySelector('table#methodsubtable');

        const params: { name: string, description: string, format: string }[] = []
        if (paramsTable) {
            const rows = paramsTable.querySelectorAll('tbody tr');

            for (const row of rows) {
                if (row.querySelector('div.required')) {
                    const tds = row.querySelectorAll('td');

                    if (!tds || tds && tds.length === 0) {
                        continue;
                    }

                    const name = tds[0]?.textContent.trim() ?? '';

                    const descriptionElement = tds[1]?.querySelector('.inner.description.marked');

                    const description = descriptionElement?.textContent?.trim() ?? '';

                    const format = tds[1]?.querySelector('span.type')?.textContent?.trim() ?? '';

                    params.push({
                        name,
                        description,
                        format
                    })
                }
            }
        }

        return {
            moduleId: currentModule.id,
            method,
            apiUrl,
            params,
        };
    }),
        module
    );

    return foundModulesApiData ?? [];
}

export async function runMainPageScraper() {
    const log = baseLogger.forMethod('mainPageScraperOrchestrator');
    log.info('> Iniciando scraping da página principal... <');

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    const modules: RawModule[] = await scrapeMainPageModules(page);
    log.info('> Persistindo módulos! <');
    await persistFoundModules(modules);
    const persistedModulesIds: TModule[] = await getPersistedModules();

    let modulesWithApiData: TModuleApiDataRaw[] = [];
    for (const module of persistedModulesIds) {
        log.info(`> Processando módulo ${module.name}`);

        if (!module.link) {
            log.error({}, "Módulo não possui link persistido.");
            continue;
        }

        const url = new URL(module.link, MAIN_URL);

        await page.goto(url.toString());
        const apiDataList: TModuleApiDataRaw[] = await scrapeModuleApiPage(page, module);
        const cleanApiDataList: TModuleApiDataRaw[] = apiDataList.filter((element) => {
            if (!isExcludedEndpoint(element.apiUrl))
                return element;
        }).filter(Boolean);

        if (apiDataList && apiDataList.length > 0) {
            modulesWithApiData.push(...cleanApiDataList);
        }
    }
    await browser.close();

    log.info('> Persistindo dados da API dos módulos! <');
    await persisTModuleApiDataRaw(modulesWithApiData);
    log.info('> Scraper finalizado! <');
}