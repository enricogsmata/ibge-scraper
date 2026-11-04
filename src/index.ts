import { runIngestion } from "./fetcher.js";
import { runMainPageScraper } from "./scraper.js";

async function main() {
    //await runMainPageScraper();
    await runIngestion({ debugIndex: undefined, sampleOnly: true });
}

await main();