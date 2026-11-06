import { runIngestionPipeline } from "./ingestion.js";
import { runMainPageScraper } from "./scraper.js";
import { runSilverPhase1 } from "./silver.js";

async function main() {
    await runMainPageScraper();
    await runIngestionPipeline();
}

await main();