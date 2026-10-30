import { timestamp } from 'drizzle-orm/mysql-core';
import { mysqlTable, text } from 'drizzle-orm/mysql-core';

export const Logs = mysqlTable('logs', {
    message: text(),
    level: text(),
    module: text(),
    context: text(),
    timestamp: timestamp(),
})