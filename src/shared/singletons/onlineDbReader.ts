import Database from "better-sqlite3";
import { createLogger } from "../../utils/logger";
import SingletonBase from "./base";

const log = createLogger("onlineDbReader");

export interface OnlineTag {
    id: number;
    name: string;
}

export interface OnlineDbStatus {
    loaded: boolean;
    tagCount: number;
    lastUpdate: number;
}

const ONLINE_DB_BEATMAP_DEFAULTS = {
    osuStandardGrade: 0,
    numCircles: 0,
    numSliders: 0,
    numSpinners: 0,
    drainSeconds: 0,
    ar: 0,
    cs: 0,
    hp: 0,
    od: 0,
    sliderMultiplier: 0,
    stackLeniency: 0,
    mode: 0,
    unplayed: true,
    lastPlayedTime: 0,
    tags: "",
    source: "",
    srStd: 0,
    srTaiko: 0,
    srCtb: 0,
    srMania: 0,
} as const;

function parseOsuFilename(filename: string): {
    artist: string;
    title: string;
    creator: string;
    difficulty: string;
} {
    const name = filename.replace(/\.osu$/, "");
    const diffMatch = name.match(/\[([^\]]*)\]\s*$/);
    const difficulty = diffMatch?.[1] ?? "";
    const withoutDiff = diffMatch ? name.slice(0, diffMatch.index).trim() : name;
    const creatorMatch = withoutDiff.match(/\(([^)]*)\)\s*$/);
    const creator = creatorMatch?.[1] ?? "";
    const withoutCreator = creatorMatch ? withoutDiff.slice(0, creatorMatch.index).trim() : withoutDiff;
    const dashIndex = withoutCreator.indexOf(" - ");
    if (dashIndex >= 0) {
        return {
            artist: withoutCreator.slice(0, dashIndex).trim(),
            title: withoutCreator.slice(dashIndex + 3).trim(),
            creator,
            difficulty,
        };
    }
    return { artist: "", title: withoutCreator, creator, difficulty };
}

class OnlineDbReader extends SingletonBase {
    private _db: Database.Database | null = null;
    private _tagIndex: Map<number, string[]> = new Map();
    private _tagList: OnlineTag[] = [];

    open(dbPath: string): boolean {
        try {
            this.close();
            const db = new Database(dbPath, { readonly: true, fileMustExist: true });
            const row = db.prepare("SELECT number FROM schema_version LIMIT 1").get() as { number: number } | undefined;
            if (!row || row.number < 3) {
                db.close();
                log.warn(`online.db schema_version too old or missing: ${row?.number ?? "none"}`);
                return false;
            }
            this._db = db;
            this._buildTagIndex();
            return true;
        } catch (e) {
            log.error(`Failed to open online.db at ${dbPath}:`, e);
            return false;
        }
    }

    close(): void {
        if (this._db) {
            try {
                this._db.close();
            } catch {}
            this._db = null;
        }
        this._tagIndex.clear();
        this._tagList = [];
    }

    get isLoaded(): boolean {
        return this._db !== null;
    }

    get tagCount(): number {
        return this._tagList.length;
    }

    private _buildTagIndex(): void {
        if (!this._db) return;

        const tags = this._db.prepare("SELECT id, name FROM tags").all() as OnlineTag[];
        this._tagList = tags;

        const tagMap = new Map<number, string>(tags.map((t) => [t.id, t.name]));

        const rows = this._db.prepare("SELECT beatmap_id, tag_id FROM beatmap_tags").all() as {
            beatmap_id: number;
            tag_id: number;
        }[];

        for (const row of rows) {
            const name = tagMap.get(row.tag_id);
            if (!name) continue;
            const existing = this._tagIndex.get(row.beatmap_id);
            if (existing) {
                existing.push(name);
            } else {
                this._tagIndex.set(row.beatmap_id, [name]);
            }
        }
    }

    get_tags_for_beatmap(beatmapId: number): string[] {
        return this._tagIndex.get(beatmapId) ?? [];
    }

    get_beatmaps_by_tag(tagName: string): number[] {
        const lower = tagName.toLowerCase();
        const result: number[] = [];
        for (const [beatmapId, tags] of this._tagIndex) {
            if (tags.some((t) => t.toLowerCase().includes(lower))) {
                result.push(beatmapId);
            }
        }
        return result;
    }

    search_tags(query: string): OnlineTag[] {
        if (!this._db) return [];
        const lower = query.toLowerCase();
        return this._tagList.filter((t) => t.name.toLowerCase().includes(lower)).slice(0, 50);
    }

    get_all_tags(): OnlineTag[] {
        return this._tagList;
    }

    get_schema_version(): number {
        if (!this._db) return -1;
        const row = this._db.prepare("SELECT number FROM schema_version LIMIT 1").get() as
            | { number: number }
            | undefined;
        return row?.number ?? -1;
    }

    get_tag_index(): Map<number, string[]> {
        return this._tagIndex;
    }

    get_status(): OnlineDbStatus {
        return {
            loaded: this.isLoaded,
            tagCount: this.tagCount,
            lastUpdate: 0,
        };
    }

    get_all_beatmaps(
        offset = 0,
        limit = 500,
    ): {
        offset: number;
        next_offset: number;
        data: Array<Record<string, any>>;
        total: number;
        limit: number;
    } {
        if (!this._db) return { offset: 0, next_offset: 0, data: [], total: 0, limit: 0 };
        const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
        const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 500)));
        const total = (this._db.prepare("SELECT COUNT(*) AS count FROM osu_beatmaps").get() as { count: number }).count;
        const rows = this._db
            .prepare(`
                SELECT b.beatmap_id, b.beatmapset_id, b.checksum, b.filename, b.approved,
                       u.username
                FROM osu_beatmaps b
                LEFT JOIN users u ON b.user_id = u.user_id
                LIMIT ? OFFSET ?
            `)
            .all(safeLimit, safeOffset) as Array<{
            beatmap_id: number;
            beatmapset_id: number;
            checksum: string;
            filename: string;
            approved: number;
            username: string | null;
        }>;
        const result: Array<Record<string, any>> = new Array(rows.length);
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const parsed = parseOsuFilename(r.filename);
            result[i] = {
                beatmapId: r.beatmap_id,
                beatmapSetId: r.beatmapset_id,
                md5Hash: r.checksum,
                artist: parsed.artist,
                artistUnicode: parsed.artist,
                songTitle: parsed.title,
                songTitleUnicode: parsed.title,
                creatorName: r.username ?? parsed.creator ?? "",
                difficultyName: parsed.difficulty,
                rankedStatus: r.approved,
                ...ONLINE_DB_BEATMAP_DEFAULTS,
                _onlineOnly: true,
            };
        }
        return {
            offset: safeOffset,
            next_offset: Math.min(safeOffset + result.length, total),
            data: result,
            total,
            limit: safeLimit,
        };
    }
}

export default OnlineDbReader;
