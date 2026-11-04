// src/logger.ts
import pino, { Logger as PinoInstance } from 'pino';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Writable } from 'node:stream';
import { rawDb } from './db/raw/connection.js';
import { Logs } from './db/raw/schema.js';
import pinoPretty from 'pino-pretty';

const isDev = process.env.NODE_ENV !== 'production';

type LogPayload = {
    data?: unknown;
    [key: string]: unknown;
};

function serializeData(data: unknown): unknown {
    if (data === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(data));
    } catch {
        return String(data);
    }
}

function resolveModuleName(moduleInput: string): string {
    if (moduleInput.startsWith('file://')) {
        const filePath = fileURLToPath(moduleInput);
        return path.relative(process.cwd(), filePath);
    }
    return moduleInput;
}

const LEVEL_NAMES: Record<number, string> = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal',
};

// Stream direto no banco via Drizzle
const dbStream = new Writable({
    async write(chunk, _encoding, callback) {
        try {
            const obj = JSON.parse(chunk.toString());
            const levelName = LEVEL_NAMES[obj.level] || String(obj.level);
            const msg = obj.msg ? obj.msg.slice(0, 65535) : '';

            await rawDb.insert(Logs).values({
                message: msg,
                level: levelName,
                module: obj.module || null,
                context: typeof obj.context === 'object' ? JSON.stringify(obj.context) : obj.context || null,
                timestamp: new Date(obj.time),
            });
        } catch (err) {
            console.error('Erro ao salvar log no banco:', err);
        } finally {
            callback();
        }
    },
});

// Configura stream do console com pino-pretty em dev
const consoleStream = isDev
    ? pinoPretty({
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
      })
    : process.stdout;

// Combina terminal formatado com stream do banco
const streams = [
    { stream: consoleStream },
    { stream: dbStream, level: 'info' as const },
];

const pinoBase = pino(
    {
        level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    },
    pino.multistream(streams)
);

export class AppLogger {
    private pino: PinoInstance;

    constructor(instance?: PinoInstance) {
        this.pino = instance || pinoBase;
    }

    forModule(moduleMetaUrlOrName: string): AppLogger {
        const moduleName = resolveModuleName(moduleMetaUrlOrName);
        return new AppLogger(this.pino.child({ module: moduleName }));
    }

    forMethod(methodName: string): AppLogger {
        return new AppLogger(this.pino.child({ context: methodName }));
    }

    private formatPayload(payloadOrMsg: LogPayload | string, message?: string) {
        if (typeof payloadOrMsg === 'string') {
            return { payload: undefined, msg: payloadOrMsg };
        }

        const { data, ...rest } = payloadOrMsg;
        const formattedPayload: Record<string, unknown> = { ...rest };

        if (data !== undefined) {
            formattedPayload.data = serializeData(data);
        }

        return { payload: formattedPayload, msg: message };
    }

    info(message: string): void;
    info(payload: LogPayload, message: string): void;
    info(payloadOrMsg: LogPayload | string, message?: string): void {
        const { payload, msg } = this.formatPayload(payloadOrMsg, message);
        payload ? this.pino.info(payload, msg) : this.pino.info(msg!);
    }

    warn(message: string): void;
    warn(payload: LogPayload, message: string): void;
    warn(payloadOrMsg: LogPayload | string, message?: string): void {
        const { payload, msg } = this.formatPayload(payloadOrMsg, message);
        payload ? this.pino.warn(payload, msg) : this.pino.warn(msg!);
    }

    error(error: Error | LogPayload, message?: string): void {
        if (error instanceof Error) {
            this.pino.error(error, message || error.message);
            return;
        }
        const { payload, msg } = this.formatPayload(error, message);
        payload ? this.pino.error(payload, msg) : this.pino.error(msg!);
    }

    debug(message: string): void;
    debug(payload: LogPayload, message: string): void;
    debug(payloadOrMsg: LogPayload | string, message?: string): void {
        const { payload, msg } = this.formatPayload(payloadOrMsg, message);
        payload ? this.pino.debug(payload, msg) : this.pino.debug(msg!);
    }
}

export const logger = new AppLogger();