import {defineConfig} from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
    dialect: 'mysql',
    dbCredentials: {
        url: process.env.RAW_DATABASE_URL || '',
    },
    out: "./src/db/raw/out",
    schema: "./src/db/raw/schema.ts"
})