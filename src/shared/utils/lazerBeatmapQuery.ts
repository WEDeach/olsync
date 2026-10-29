export function q(value: unknown): string {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function finiteNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

export function numberList(values: unknown): number[] {
    if (!Array.isArray(values)) return [];
    return values.map((v) => finiteNumber(v)).filter((v): v is number => v !== undefined);
}

export function stringList(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    return values.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function rangeClauses(field: string, range: unknown): string[] {
    const bounds = range as { min?: unknown; max?: unknown } | undefined;
    const min = finiteNumber(bounds?.min);
    const max = finiteNumber(bounds?.max);
    return [...(min !== undefined ? [`${field} >= ${min}`] : []), ...(max !== undefined ? [`${field} <= ${max}`] : [])];
}

export interface LazerRealmQuery {
    query: string;
    params: Date[];
}

function dateParam(value: unknown): Date | undefined {
    const ms = finiteNumber(value);
    if (ms === undefined) return undefined;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date : undefined;
}

export function buildLazerBeatmapQuery(
    spec: Record<string, unknown>,
    collectionHashesForNames: (names: string[]) => string[],
): LazerRealmQuery {
    const parts: string[] = ["Hidden == false"];
    const params: Date[] = [];
    if (spec.title) parts.push(`Metadata.Title CONTAINS[c] ${q(spec.title)}`);
    if (spec.artist) {
        parts.push(
            `(Metadata.Artist CONTAINS[c] ${q(spec.artist)} OR Metadata.ArtistUnicode CONTAINS[c] ${q(spec.artist)})`,
        );
    }
    if (spec.creator) parts.push(`Metadata.Author.Username CONTAINS[c] ${q(spec.creator)}`);
    if (spec.difficultyName) parts.push(`DifficultyName CONTAINS[c] ${q(spec.difficultyName)}`);
    if (typeof spec.source === "string" && spec.source.trim()) {
        parts.push(`Metadata.Source CONTAINS[c] ${q(spec.source.trim())}`);
    }
    const srMin = finiteNumber(spec.srMin ?? spec.starRatingMin);
    const srMax = finiteNumber(spec.srMax ?? spec.starRatingMax);
    if (srMin !== undefined) parts.push(`StarRating >= ${srMin}`);
    if (srMax !== undefined) parts.push(`StarRating <= ${srMax}`);
    // drainMin / drainMax are seconds; lazer's Length is milliseconds.
    const drainMin = finiteNumber(spec.drainMin);
    const drainMax = finiteNumber(spec.drainMax);
    if (drainMin !== undefined) parts.push(`Length >= ${drainMin * 1000}`);
    if (drainMax !== undefined) parts.push(`Length <= ${drainMax * 1000}`);
    const modes = numberList(spec.modes);
    if (modes.length > 0) {
        const modeList = modes.join(",");
        parts.push(`Ruleset.OnlineID IN {${modeList}}`);
    }
    const rankStatuses = numberList(spec.rankStatuses);
    if (rankStatuses.length > 0) parts.push(`Status IN {${rankStatuses.join(",")}}`);
    const rankedDates = spec.rankedDates as { since?: unknown; until?: unknown } | undefined;
    if (rankedDates) {
        const since = dateParam(rankedDates.since);
        const until = dateParam(rankedDates.until);
        const invalid =
            (rankedDates.since !== undefined && since === undefined) ||
            (rankedDates.until !== undefined && until === undefined) ||
            (since !== undefined && until !== undefined && since.getTime() > until.getTime());
        if (invalid) {
            parts.push("FALSEPREDICATE");
        } else {
            if (since) {
                parts.push(`BeatmapSet.DateRanked >= $${params.length}`);
                params.push(since);
            }
            if (until) {
                parts.push(`BeatmapSet.DateRanked <= $${params.length}`);
                params.push(until);
            }
        }
    }
    parts.push(
        ...rangeClauses("Difficulty.ApproachRate", spec.ar),
        ...rangeClauses("Difficulty.CircleSize", spec.cs),
        ...rangeClauses("Difficulty.DrainRate", spec.hp),
        ...rangeClauses("Difficulty.OverallDifficulty", spec.od),
        ...rangeClauses("Difficulty.SliderMultiplier", spec.sv),
    );
    if (spec.unplayed === true) parts.push("LastPlayed == nil");
    if (spec.unplayed === false) parts.push("LastPlayed != nil");
    const includedHashes = stringList(spec.includedHashes);
    if (includedHashes.length > 0) {
        const hashList = includedHashes.map(q).join(",");
        parts.push(`MD5Hash IN {${hashList}}`);
    }
    const excludedHashes = stringList(spec.excludeHashes ?? spec.excludedHashes);
    if (excludedHashes.length > 0) {
        const hashList = excludedHashes.map(q).join(",");
        parts.push(`NOT (MD5Hash IN {${hashList}})`);
    }
    const setIds = numberList(spec.beatmapSetIds);
    if (setIds.length > 0) {
        const setList = setIds.join(",");
        parts.push(`BeatmapSet.OnlineID IN {${setList}}`);
    }
    const beatmapIds = numberList(spec.beatmapIds);
    if (beatmapIds.length > 0) {
        const idList = beatmapIds.join(",");
        parts.push(`OnlineID IN {${idList}}`);
    }
    if (Array.isArray(spec.playerTagBeatmapIds)) {
        const playerTagBeatmapIds = numberList(spec.playerTagBeatmapIds);
        parts.push(
            playerTagBeatmapIds.length > 0 ? `OnlineID IN {${playerTagBeatmapIds.join(",")}}` : "FALSEPREDICATE",
        );
    }
    const includedCollectionNames = stringList(spec.includedCollectionNames);
    if (includedCollectionNames.length > 0) {
        const hashList = collectionHashesForNames(includedCollectionNames).map(q);
        if (hashList.length > 0) parts.push(`MD5Hash IN {${hashList.join(",")}}`);
        else parts.push("FALSEPREDICATE");
    }
    const excludedCollectionNames = stringList(spec.excludedCollectionNames);
    if (excludedCollectionNames.length > 0) {
        const hashList = collectionHashesForNames(excludedCollectionNames).map(q);
        if (hashList.length > 0) parts.push(`NOT (MD5Hash IN {${hashList.join(",")}})`);
    }
    return { query: parts.join(" AND "), params };
}
