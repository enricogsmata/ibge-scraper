import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import "dotenv/config";

const pool = await mysql.createPool(process.env.RAW_DATABASE_URL!);
export const rawDb = await drizzle(pool);