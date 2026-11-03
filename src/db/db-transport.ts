import build from 'pino-abstract-transport';
import { rawDb } from './raw/connection.js';
import { Logs } from './raw/schema.js';

// Mapeamento dos níveis numéricos do Pino para texto
const LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export default async function () {
  return build(async function (source) {
    for await (const obj of source) {
      try {
        const levelName = LEVEL_NAMES[obj.level as number] || String(obj.level);

        // Prepara os dados respeitando os tipos do schema
        const logObj: typeof Logs.$inferInsert = {
          message: obj.msg || '',
          level: levelName,
          module: obj.module || null,
          // Se context for objeto, converte para JSON; se for string, mantém; se não existir, null
          context: typeof obj.context === 'object' 
            ? JSON.stringify(obj.context) 
            : obj.context || null,
          timestamp: new Date(obj.time),
        };

        await rawDb.insert(Logs).values(logObj);
      } catch (err) {
        // Usa console.error para evitar recursão infinita se o banco falhar
        console.error('Erro ao persistir log no MySQL via Drizzle:', err);
      }
    }
  });
}