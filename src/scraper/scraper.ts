import puppeteer, { ElementHandle, Page } from "puppeteer";
import { logger } from "../logger.js";
import { describe } from "node:test";
import { rawDb } from "../db/raw/connection.js";
import { ModuleApiData, Modules } from "../db/raw/schema.js";
import { eq, sql } from "drizzle-orm";

const baseLogger = logger.forModule(import.meta.url);
const MAIN_URL: string = 'https://servicodados.ibge.gov.br/api/docs';

type Module = {
    name: string,
    description: string,
    link: string
}

type ModuleWithApiData = {
    module: Module,
    apiUrl: string,
    params: {
        name: string,
        description: string,
        format: string
    }[]
}

async function persistFoundModules(modules: Module[], modulesWithApiData: ModuleWithApiData[]) {
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

        for (const moduleWithApiData of modulesWithApiData) {
            const [moduleId] = await rawDb
                .select()
                .from(Modules)
                .where(eq(Modules.link, moduleWithApiData.module.link));

            if (moduleId) {
                await rawDb
                    .insert(ModuleApiData)
                    .values({
                        apiUrl: moduleWithApiData.apiUrl,
                        moduleId: moduleId.id,
                        params: moduleWithApiData.params
                    })
            } else {
                log.error({}, `Não foi possível inserir os dados da API do módulo.`);
            }
        }
    } catch (error) {
        log.error({ data: error }, `Falha na persistência dos módulos encontrados!`);
    }
}

async function scrapeMainPageModules(page: Page): Promise<Module[]> {
    const log = baseLogger.forMethod('scrapeMainPageModules');

    log.info('> Navegando para a página principal... <');
    await page.goto(MAIN_URL);

    await page.waitForSelector('.l-content-inner .c-wrapper', { timeout: 60000 });
    log.info('> Módulos encontrados! <');

    const modules: Module[] = await page.$$eval('.c-wrapper', (elements, mainUrl) => elements.map((element) => {
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

async function scrapeModuleApiPage(page: Page, module: Module): Promise<ModuleWithApiData[]> {
    const foundModulesApiData = await page.$$eval('section[id^="api-"] div[id^="api-"]', (elements, currentModule) => elements.map((element) => {

        const apiUrl = element.querySelector('code > span.pln')?.textContent.trim() ?? '';
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
                    const description = tds[0]?.querySelector('.description > p')?.textContent.trim() ?? '';
                    const format = tds[1]?.querySelector('span.type')?.textContent.trim() ?? ''

                    params.push({
                        name,
                        description,
                        format
                    })
                }
            }
        }

        return {
            module: currentModule,
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

    const modules: Module[] = await scrapeMainPageModules(page);

    let modulesWithApiData: ModuleWithApiData[] = [];
    for (const module of modules) {
        log.info(`> Processando módulo ${module.name}`);
        const url = new URL(module.link, MAIN_URL);

        await page.goto(url.toString());
        const apiDataList: ModuleWithApiData[] = await scrapeModuleApiPage(page, module);

        if (apiDataList && apiDataList.length > 0) {
            modulesWithApiData.push(...apiDataList);
        }
    }
    await browser.close();

    log.info('> Persistindo módulos! <');
    await persistFoundModules(modules, modulesWithApiData);
    log.info('> Scraper finalizado! <');
}