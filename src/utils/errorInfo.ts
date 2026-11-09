// src/utils/errorInfo.ts
export function describeError(err: unknown) {
    const e = err as any;
    const cause = e?.cause ?? e;
    return {
        name: e?.name,
        code: cause?.code,
        errno: cause?.errno,
        sqlState: cause?.sqlState,
        sqlMessage: cause?.sqlMessage ?? cause?.message,
        message: String(e?.message ?? '').split('\nparams:')[0]?.slice(0, 500),
    };
}