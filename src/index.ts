import { runIngestionPipeline } from "./ingestion.js";
import { runMainPageScraper } from "./scraper.js";

async function main() {
    await runMainPageScraper();
    await runIngestionPipeline();
}

await main();