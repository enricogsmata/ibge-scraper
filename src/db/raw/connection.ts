import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema.js';
import "dotenv/config";

const pool = mysql.createPool(process.env.RAW_DATABASE_URL!);
export const rawDb = drizzle(pool, { schema, mode: 'default' });