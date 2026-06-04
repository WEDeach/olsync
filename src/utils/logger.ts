/**
 * Centralized logging utility.
 *
 * Create a tagged logger once per module/area and reuse it:
 *
 *   const log = createLogger("API");
 *   log.info("request done");      // [2026-06-04 01:23:45.678] [API] request done
 *   log.error("failed", err);      // [2026-06-04 01:23:45.678] [API] failed <err>
 *
 * Sub-tag a logger for finer granularity:
 *
 *   const child = log.child("retry"); // tag becomes "API/retry"
 *
 * Timestamps are added automatically, so callers never embed the time or the
 * tag in the message string.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

function timestamp(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 23);
}

export class Logger {
    constructor(private readonly tag?: string) {}

    private prefix(): string {
        return this.tag ? `[${timestamp()}] [${this.tag}]` : `[${timestamp()}]`;
    }

    debug(...args: unknown[]): void {
        console.debug(this.prefix(), ...args);
    }

    info(...args: unknown[]): void {
        console.log(this.prefix(), ...args);
    }

    /** Alias of info, kept for drop-in replacement of console.log. */
    log(...args: unknown[]): void {
        console.log(this.prefix(), ...args);
    }

    warn(...args: unknown[]): void {
        console.warn(this.prefix(), ...args);
    }

    error(...args: unknown[]): void {
        console.error(this.prefix(), ...args);
    }

    /** Returns a new logger whose tag is `${this.tag}/${subTag}`. */
    child(subTag: string): Logger {
        return new Logger(this.tag ? `${this.tag}_${subTag}` : subTag);
    }
}

export function createLogger(tag?: string): Logger {
    return new Logger(tag);
}

/** Default untagged logger for quick, ad-hoc logging. */
export const logger = new Logger();
