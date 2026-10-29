import { useEffect, useState } from "react";
import { dateRangeBounds } from "../../../shared/utils/beatmapFilterRules";
import { createLogger } from "../../../utils/logger";

const log = createLogger("StableRankedDateFilter");

export interface RankedDateQueryFailure {
    requestId: number;
    from: string;
    to: string;
}

export interface StableRankedDateFilterResult {
    ids: Set<number> | null;
    status: "inactive" | "loading" | "ready" | "error";
    failure: RankedDateQueryFailure | null;
}

interface RankedDateResult {
    key: string;
    ids: Set<number>;
    status: "loading" | "ready" | "error";
    failure: RankedDateQueryFailure | null;
}

const EMPTY_IDS = new Set<number>();

let failureSeq = 0;

export function useStableRankedDateFilter(
    source: "stable" | "lazer",
    from: string,
    to: string,
    contextKey = "",
): StableRankedDateFilterResult {
    const active = source === "stable" && (from !== "" || to !== "");
    const key = JSON.stringify([source, contextKey, from, to]);
    const [result, setResult] = useState<RankedDateResult | null>(null);

    useEffect(() => {
        if (!active || !dateRangeBounds(from, to)) {
            // Inactive, or an invalid/inverted range that fails closed locally
            // with no IPC (the existing invalid-date UI marks the fields).
            setResult(null);
            return;
        }
        let cancelled = false;
        setResult({ key, ids: EMPTY_IDS, status: "loading", failure: null });
        void (async () => {
            try {
                const bounds = dateRangeBounds(from, to);
                if (!bounds) return;
                const ids = await window.olsCore.getBeatmapSetIdsByApprovedDate(bounds.since, bounds.until);
                if (cancelled) return;
                if (!Array.isArray(ids) || ids.some((id) => !Number.isFinite(id))) {
                    log.error("malformed approved-date id list", ids);
                    setResult({
                        key,
                        ids: EMPTY_IDS,
                        status: "error",
                        failure: { requestId: ++failureSeq, from, to },
                    });
                    return;
                }
                setResult({ key, ids: new Set(ids), status: "ready", failure: null });
            } catch (error) {
                if (cancelled) return;
                log.error(error);
                setResult({
                    key,
                    ids: EMPTY_IDS,
                    status: "error",
                    failure: { requestId: ++failureSeq, from, to },
                });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [active, key, from, to]);

    if (!active) return { ids: null, status: "inactive", failure: null };
    // Invalid or inverted bounds match nothing and never reach online.db;
    // report ready+empty immediately rather than a transient "querying".
    if (!dateRangeBounds(from, to)) return { ids: EMPTY_IDS, status: "ready", failure: null };
    if (result && result.key === key) {
        return { ids: result.ids, status: result.status, failure: result.failure };
    }
    // New criteria not yet resolved - empty until this query finishes.
    return { ids: EMPTY_IDS, status: "loading", failure: null };
}
