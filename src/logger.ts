// src/logger.ts
import pino, { Logger as PinoInstance, TransportTargetOptions } from 'pino';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

// Configuração dos transports (Terminal + Banco MySQL)
const targets: TransportTargetOptions[] = [
    {
        target: isDev ? 'pino-pretty' : 'pino/file',
        options: isDev
            ? {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            }
            : { destination: 1 },
        level: process.env.LOG_LEVEL || 'info',
    },
    {
        target: fileURLToPath(new URL('./db-transport.js', import.meta.url)),
        options: {},
        level: 'info',
    },
];

const transport = pino.transport({ targets });

export class AppLogger {
    private pino: PinoInstance;

    constructor(instance?: PinoInstance) {
        this.pino = instance || pino(transport);
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