import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
    dialect: "mysql",
    schema: "./src/db/normalized/schema.ts",
    out: "./src/db/normalized/out",
    dbCredentials: {
        url: process.env.DATABASE_URL || ''
    }
})