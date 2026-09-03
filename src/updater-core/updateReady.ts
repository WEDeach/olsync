/**
 * Describes the marker written by a relaunched app after its first renderer load.
 */
export interface UpdateReadyMarker {
    schemaVersion: 1;
    sessionId: string;
    readyAt: string;
}

/**
 * Creates the readiness marker exchanged by the updater worker and the relaunched app.
 *
 * @param sessionId The update session identifier that the worker is waiting for.
 * @param readyAt An ISO timestamp used for diagnostics; defaults to the current time.
 * @returns A versioned readiness marker suitable for JSON serialization.
 * @example
 * createUpdateReadyMarker("session-1", "2026-08-01T00:00:00.000Z");
 */
export function createUpdateReadyMarker(sessionId: string, readyAt = new Date().toISOString()): UpdateReadyMarker {
    return { schemaVersion: 1, sessionId, readyAt };
}

/**
 * Validates that an unknown JSON value is the readiness marker for a specific update session.
 *
 * @param value The parsed JSON value to validate.
 * @param sessionId The session identifier expected by the worker.
 * @returns Whether the value is a valid marker for the requested session.
 * @example
 * isUpdateReadyMarker(JSON.parse(text), "session-1");
 */
export function isUpdateReadyMarker(value: unknown, sessionId: string): value is UpdateReadyMarker {
    if (!value || typeof value !== "object") return false;
    const marker = value as Record<string, unknown>;
    return marker.schemaVersion === 1 && marker.sessionId === sessionId && typeof marker.readyAt === "string";
}
