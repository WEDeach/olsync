import * as fs from "fs";
import * as path from "path";
import APIException from "../../api/v2/types/exceptions";
import {
    COLLECTION_SYNC_SCHEMA_VERSION,
    CollectionMergeExecuteResponse,
    CollectionMergeExecuteResult,
    CollectionMergeHashInfo,
    CollectionMergePlan,
    CollectionMergeSelections,
    CollectionMergeState,
    CollectionSyncBaseline,
    CollectionSyncContent,
    CollectionSyncDeleteOutcome,
    CollectionSyncExecuteResponse,
    CollectionSyncExecuteResult,
    CollectionSyncImportSummary,
    CollectionSyncPlan,
    CollectionSyncResolution,
    CollectionSyncSettings,
    CollectionSyncState,
    CollectionSyncType,
    MissingBeatmapReport,
    MissingBeatmapSide,
} from "../../defines/collection_sync";
import { BeatmapCollection } from "../../defines/lazer_structs";
import { IOsuCollection } from "../../defines/types";
import { backupFileBySha256, pBackupData, pRoot, readJson, readJsonV2, saveJson, saveJsonV2 } from "../../utils/file";
import { createLogger } from "../../utils/logger";
import { readAllWithOffset } from "../../utils/reader";
import { sleep } from "../../utils/time";
import { ConfigKey } from "../../utils/typed/config";
import { ServiceCode, SpaceId } from "../../utils/typed/file";
import { buildCollectionMergePlan } from "../utils/collectionMerge";
import {
    buildBaselineFromPlan,
    buildCollectionSyncPlan,
    buildContentFromPlan,
    collectDeletionListHashes,
    collectMissingBeatmaps,
    contentToOverride,
    normalizeCollections,
    parseCollectionSyncBaseline,
    parseCollectionSyncContent,
    parseCollectionSyncSettings,
    sortHashes,
} from "../utils/collectionSync";
import Api from "./api";
import SingletonBase from "./base";
import Config from "./config";
import LazerReader from "./lazerReader";
import OnlineDbReader from "./onlineDbReader";
import StableReader from "./stable";
import StableIpcClient from "./stableIpc";

const log = createLogger("CollectionSync");

const PAGE_SIZE = 200;
const RESOLVE_BATCH = 300;

const API_LOOKUP_INTERVAL_MS = 1100;

const API_ERROR_LIMIT = 5;

const LOOKUP_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface LookupCacheEntry {
    setId: number | null;
    at: number;
}

type LookupCache = Record<string, LookupCacheEntry>;

function parse_lookup_cache(raw: unknown): LookupCache {
    const cache: LookupCache = {};
    if (!is_record(raw)) return cache;
    const now = Date.now();
    for (const [hash, value] of Object.entries(raw)) {
        if (typeof hash !== "string" || hash.length === 0 || !is_record(value)) continue;
        const at = typeof value.at === "number" && Number.isFinite(value.at) ? value.at : 0;
        if (value.setId === null) {
            if (now - at > LOOKUP_NOT_FOUND_TTL_MS) continue;
            cache[hash.toLowerCase()] = { setId: null, at };
            continue;
        }
        const setId = Number(value.setId);
        if (Number.isInteger(setId) && setId > 0) cache[hash.toLowerCase()] = { setId, at };
    }
    return cache;
}

interface CollectionSnapshot {
    stable: IOsuCollection[];
    lazer: IOsuCollection[];
    stableAvailable: boolean;
    lazerAvailable: boolean;
    stableError?: string;
    lazerError?: string;
}

interface ClientReadResult {
    collections: IOsuCollection[];
    available: boolean;
    error?: string;
}

interface ClientAvailability {
    stable: boolean;
    lazer: boolean;
}

interface HashResolution {
    installedStable: Set<string>;
    installedLazer: Set<string>;
    mapIdByHash: Map<string, number>;
    hashByMapId: Map<number, string>;

    setIdByHash: Map<string, number>;

    infoByHash: Map<string, CollectionMergeHashInfo>;
}

type ResolvedSetIds = Map<string, number> & {
    fromClients: number;
    fromOnlineDb: number;
    fromCache: number;

    notFound: Set<string>;
};

const SETTINGS_FILE = "settings.json";
const BASELINE_FILE = "baseline.json";
const LOOKUP_CACHE_FILE = "lookup_cache.json";

function legacy_sync_path(name: string): string {
    return path.join(pRoot, "collection_sync", name);
}

function read_sync_store(name: string) {
    return readJsonV2(ServiceCode.Data, SpaceId.CollectionSync, name);
}

function write_sync_store(name: string, data: unknown) {
    return saveJsonV2(ServiceCode.Data, SpaceId.CollectionSync, name, data);
}

function run_stamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function same_snapshot(a: IOsuCollection[], b: IOsuCollection[]): boolean {
    return JSON.stringify(normalizeCollections(a)) === JSON.stringify(normalizeCollections(b));
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export default class CollectionSync extends SingletonBase {
    private _settings: CollectionSyncSettings = {
        schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION,
        collections: {},
    };
    private _baseline: CollectionSyncBaseline | null = null;
    private _override: Record<string, string[]> | null = null;
    private _initialized = false;
    private _plan: CollectionSyncPlan | null = null;
    private _planSource: { stable: IOsuCollection[]; lazer: IOsuCollection[] } | null = null;
    private _planResolutions: CollectionSyncResolution[] = [];
    private _lookupCache: LookupCache = {};
    private _notFoundHashes = new Set<string>();
    private _excludeNotFound = false;
    private _mergePlan: CollectionMergePlan | null = null;
    private _mergePlanSource: { stable: IOsuCollection[]; lazer: IOsuCollection[] } | null = null;
    private _mergeSelections: CollectionMergeSelections = {};

    async init(): Promise<void> {
        if (this._initialized) return;
        await (Config.getInstance as Config).init();
        this._settings = await this.read_store(SETTINGS_FILE, parseCollectionSyncSettings);
        this._baseline = await this.read_store(BASELINE_FILE, parseCollectionSyncBaseline);
        this._lookupCache = await this.read_store(LOOKUP_CACHE_FILE, parse_lookup_cache);
        // The legacy folder may now be empty; remove it so only data/cs remains.
        await fs.promises.rmdir(path.join(pRoot, "collection_sync")).catch(() => undefined);
        this._initialized = true;
        log.info(
            `Collection sync settings loaded: ${Object.keys(this._settings.collections).length} typed collections, ${Object.keys(this._lookupCache).length} cached lookups`,
        );
    }

    private async read_store<T>(name: string, parse: (raw: unknown) => T): Promise<T> {
        const stored = await read_sync_store(name);
        if (stored !== null) return parse(stored);

        const legacyPath = legacy_sync_path(name);
        const legacy = await readJson(legacyPath);
        if (legacy === null) return parse(null);

        const parsed = parse(legacy);
        try {
            await write_sync_store(name, parsed);
            await fs.promises.rm(legacyPath, { force: true });
            log.info(`Migrated collection sync store ${name} from collection_sync/ to data/cs`);
        } catch (error) {
            log.warn(`Could not migrate collection sync store ${name}: ${String(error)}`);
        }
        return parsed;
    }

    async save_settings(settings: CollectionSyncSettings): Promise<CollectionSyncSettings> {
        const parsed = parseCollectionSyncSettings(settings);
        this._settings = parsed;
        this.invalidate_plan();
        await write_sync_store(SETTINGS_FILE, parsed);
        return parsed;
    }

    async set_collection_type(name: string, type: CollectionSyncType): Promise<CollectionSyncSettings> {
        const trimmed = name.trim();
        if (trimmed.length === 0) return this._settings;
        const collections = { ...this._settings.collections };
        if (type === "default") delete collections[trimmed];
        else collections[trimmed] = type;
        return await this.save_settings({ schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION, collections });
    }

    async set_exclude_not_found(enabled: boolean): Promise<CollectionSyncState> {
        await this.init();
        if (this._excludeNotFound !== enabled) {
            this._excludeNotFound = enabled;
            this.invalidate_plan();
        }
        return await this.get_state();
    }

    async get_merge_state(): Promise<CollectionMergeState> {
        await this.init();
        const [snapshot, runningStable] = await Promise.all([this.read_collections(), this.stable_is_running()]);
        const state: CollectionMergeState = {
            hasStable: snapshot.stableAvailable,
            hasLazer: snapshot.lazerAvailable,
            runningStable,
            stable: normalizeCollections(snapshot.stable),
            lazer: normalizeCollections(snapshot.lazer),
        };
        if (snapshot.stableError !== undefined) state.stableError = snapshot.stableError;
        if (snapshot.lazerError !== undefined) state.lazerError = snapshot.lazerError;
        return state;
    }

    async build_merge_plan(selections: CollectionMergeSelections = {}): Promise<CollectionMergePlan> {
        await this.init();
        const snapshot = await this.read_collections();
        this.assert_both_clients(snapshot);

        const allHashes: string[] = [];
        for (const entry of [...snapshot.stable, ...snapshot.lazer]) {
            for (const hash of entry.maps) allHashes.push(hash);
        }
        const resolution = await this.resolve_hashes(allHashes, {
            stable: snapshot.stableAvailable,
            lazer: snapshot.lazerAvailable,
        });

        const plan = buildCollectionMergePlan({
            stable: snapshot.stable,
            lazer: snapshot.lazer,
            selections,
            detailsByHash: resolution.infoByHash,
        });

        this._mergePlan = plan;
        this._mergePlanSource = { stable: snapshot.stable, lazer: snapshot.lazer };
        this._mergeSelections = { ...selections };
        return plan;
    }

    invalidate_merge_plan(): void {
        this._mergePlan = null;
        this._mergePlanSource = null;
    }

    async execute_merge(): Promise<CollectionMergeExecuteResponse> {
        const plan = this._mergePlan;
        const source = this._mergePlanSource;
        if (!plan || !source) throw new Error("No collection merge preview has been built.");

        const current = await this.read_collections();
        this.assert_both_clients(current);
        if (!same_snapshot(source.stable, current.stable) || !same_snapshot(source.lazer, current.lazer)) {
            const rebuilt = await this.build_merge_plan(this._mergeSelections);
            return { stale: true, plan: rebuilt };
        }

        const backupRoot = path.join(pBackupData, SpaceId.CollectionSync, `${run_stamp()}-merge`);
        const result: CollectionMergeExecuteResult = {
            stableWritten: false,
            errors: [],
            backupPaths: [backupRoot],
        };

        // stable特性, 退出時會重寫資料庫檔案, 不過實際測試發現收藏夾沒啥影響 :p
        if (await this.stable_is_running()) {
            result.blocked = "stable_running";
            log.warn("Merge refused: osu!stable is running");
            return { stale: false, result };
        }

        try {
            const stablePath = this.config_path(Config.getInstance as Config, ConfigKey.PATH_STABLE_DIR);
            if (stablePath !== undefined) {
                const collectionDb = path.join(stablePath, "collection.db");
                if (fs.existsSync(collectionDb)) {
                    result.backupPaths.push(backupFileBySha256(collectionDb, path.join(backupRoot, "collection.db")));
                } else {
                    log.info(`No collection.db to back up at ${collectionDb}`);
                }
            }
        } catch (error) {
            result.errors.push(`backup: ${error instanceof Error ? error.message : String(error)}`);
            log.error(`Merge aborted before any change: backup failed (${String(error)})`);
            return { stale: false, result };
        }

        try {
            await (StableReader.getInstance as StableReader).set_collections(plan.stablePayload, {
                backup: false,
            });
            result.stableWritten = true;
        } catch (error) {
            result.errors.push(`stable: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (result.errors.length === 0 && result.stableWritten) {
            this._mergePlan = null;
            this._mergePlanSource = null;
        } else {
            log.warn(`Merge kept its preview: errors=${result.errors.length}`);
        }

        return { stale: false, result };
    }

    async reset_baseline(): Promise<CollectionSyncBaseline> {
        const cleared: CollectionSyncBaseline = {
            schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION,
            syncedAt: 0,
            collections: {},
        };
        this._baseline = cleared;
        this.invalidate_plan();
        await write_sync_store(BASELINE_FILE, cleared);
        return cleared;
    }

    async read_collections(): Promise<CollectionSnapshot> {
        const [stableResult, lazerResult] = await Promise.all([
            this.read_stable_collections(),
            this.read_lazer_collections(),
        ]);
        const snapshot: CollectionSnapshot = {
            stable: stableResult.collections,
            lazer: lazerResult.collections,
            stableAvailable: stableResult.available,
            lazerAvailable: lazerResult.available,
        };
        if (stableResult.error !== undefined) snapshot.stableError = stableResult.error;
        if (lazerResult.error !== undefined) snapshot.lazerError = lazerResult.error;
        return snapshot;
    }

    private config_path(config: Config, key: ConfigKey): string | undefined {
        let value: unknown;
        try {
            value = config.get(key);
        } catch (error) {
            log.warn(`Could not read ${key}: ${String(error)}`);
            return undefined;
        }
        return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
    }

    private has_client_path(key: ConfigKey): boolean {
        return this.config_path(Config.getInstance as Config, key) !== undefined;
    }

    private async backup_run(
        backupRoot: string,
        plan: CollectionSyncPlan,
    ): Promise<{ paths: string[]; files: Array<{ hash: string; relative: string }> }> {
        const config = Config.getInstance as Config;
        const paths: string[] = [];

        const stablePath = this.config_path(config, ConfigKey.PATH_STABLE_DIR);
        if (stablePath !== undefined) {
            const collectionDb = path.join(stablePath, "collection.db");
            if (fs.existsSync(collectionDb)) {
                paths.push(backupFileBySha256(collectionDb, path.join(backupRoot, "collection.db")));
            } else {
                log.info(`No collection.db to back up at ${collectionDb}`);
            }
        }

        const lazerPath = this.config_path(config, ConfigKey.PATH_LAZER_REALM);
        if (lazerPath !== undefined) {
            if (!fs.existsSync(lazerPath)) {
                throw new Error(`Lazer Realm file not found: ${lazerPath}`);
            }
            paths.push(backupFileBySha256(lazerPath, path.join(backupRoot, "client.realm")));
        }

        const files: Array<{ hash: string; relative: string }> = [];
        const stableTargets = plan.deletions.filter((item) => item.installedStable);
        if (stablePath !== undefined && stableTargets.length > 0) {
            const outcomes = await (StableReader.getInstance as StableReader).backup_beatmap_files(
                stableTargets.map((item) => item.hash),
                path.join(backupRoot, "stable_songs"),
            );
            for (const outcome of outcomes) {
                if (outcome.ok && typeof outcome.relative === "string" && outcome.relative.length > 0) {
                    files.push({ hash: outcome.hash, relative: outcome.relative });
                } else {
                    log.warn(`Could not back up beatmap file ${outcome.hash}: ${outcome.reason ?? "unknown"}`);
                }
            }
        }

        return { paths, files };
    }

    private async stable_is_running(): Promise<boolean> {
        if (process.platform !== "win32") return false;
        if (this.config_path(Config.getInstance as Config, ConfigKey.PATH_STABLE_DIR) === undefined) return false;
        try {
            const data = await (StableIpcClient.getInstance as StableIpcClient).get_client_data();
            return data.Connected === true;
        } catch (error) {
            log.warn(`Stable running probe failed: ${String(error)}`);
            return false;
        }
    }

    private async read_stable_collections(): Promise<ClientReadResult> {
        const stablePath = this.config_path(Config.getInstance as Config, ConfigKey.PATH_STABLE_DIR);
        if (stablePath === undefined) return { collections: [], available: false };
        const reader = StableReader.getInstance as StableReader;
        try {
            if (!reader.is_ready() || reader.get_base_path() !== stablePath) await reader.init(stablePath);
            const first = await reader.collections(0, PAGE_SIZE);
            const all = await readAllWithOffset((offset, limit) => reader.collections(offset, limit), first);
            return {
                available: true,
                collections: all.data.map((entry: any) => ({
                    name: typeof entry?.name === "string" ? entry.name : "",
                    maps: Array.isArray(entry?.maps)
                        ? entry.maps
                              .map((map: any) => map?.checksum)
                              .filter((hash: unknown): hash is string => typeof hash === "string")
                        : [],
                })),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.warn(`Could not read stable collections: ${message}`);
            return { collections: [], available: false, error: message };
        }
    }

    private async read_lazer_collections(): Promise<ClientReadResult> {
        const lazerPath = this.config_path(Config.getInstance as Config, ConfigKey.PATH_LAZER_REALM);
        if (lazerPath === undefined) return { collections: [], available: false };
        const reader = LazerReader.getInstance as LazerReader;
        try {
            if (!reader.is_ready() || reader.get_init_path() !== lazerPath) await reader.init(lazerPath);
            const first = await reader.get_collections(0, PAGE_SIZE);
            const all = await readAllWithOffset((offset, limit) => reader.get_collections(offset, limit), first);
            return {
                available: true,
                collections: all.data.map((entry: BeatmapCollection) => ({
                    name: typeof entry?.Name === "string" ? entry.Name : "",
                    maps: Array.isArray(entry?.BeatmapMD5Hashes) ? entry.BeatmapMD5Hashes : [],
                })),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.warn(`Could not read lazer collections: ${message}`);
            return { collections: [], available: false, error: message };
        }
    }

    private async resolve_hashes(hashes: string[], availability: ClientAvailability): Promise<HashResolution> {
        const unique = sortHashes(hashes);
        const resolution: HashResolution = {
            installedStable: new Set<string>(),
            installedLazer: new Set<string>(),
            mapIdByHash: new Map<string, number>(),
            hashByMapId: new Map<number, string>(),
            setIdByHash: new Map<string, number>(),
            infoByHash: new Map<string, CollectionMergeHashInfo>(),
        };

        for (let index = 0; index < unique.length; index += RESOLVE_BATCH) {
            const batch = unique.slice(index, index + RESOLVE_BATCH);
            await this.resolve_hash_batch(batch, resolution, availability);
        }
        return resolution;
    }

    private async resolve_hash_batch(
        batch: string[],
        resolution: HashResolution,
        availability: ClientAvailability,
    ): Promise<void> {
        if (availability.stable) {
            try {
                const stable = await (StableReader.getInstance as StableReader).query_beatmaps(
                    { includedHashes: batch },
                    0,
                    0,
                );
                for (const entry of stable?.data ?? []) {
                    const hash = typeof entry?.md5Hash === "string" ? entry.md5Hash.toLowerCase() : "";
                    if (hash.length === 0) continue;
                    resolution.installedStable.add(hash);
                    this.remember_map_id(entry?.beatmapId, hash, resolution);
                    this.remember_set_id(entry?.beatmapSetId, hash, resolution);
                    this.remember_hash_info(hash, entry?.artist, entry?.songTitle, entry?.difficultyName, resolution);
                }
            } catch (error) {
                log.warn(`Stable hash resolution failed: ${String(error)}`);
            }
        }

        if (availability.lazer) {
            try {
                const lazer = await (LazerReader.getInstance as LazerReader).query_beatmaps(
                    { includedHashes: batch },
                    0,
                    batch.length,
                );
                for (const entry of lazer?.data ?? []) {
                    const hash = typeof entry?.MD5Hash === "string" ? entry.MD5Hash.toLowerCase() : "";
                    if (hash.length === 0) continue;
                    resolution.installedLazer.add(hash);
                    this.remember_map_id(entry?.OnlineID, hash, resolution);
                    this.remember_set_id(entry?.BeatmapSet?.OnlineID, hash, resolution);
                    this.remember_hash_info(
                        hash,
                        entry?.Metadata?.Artist,
                        entry?.Metadata?.Title,
                        entry?.DifficultyName,
                        resolution,
                    );
                }
            } catch (error) {
                log.warn(`Lazer hash resolution failed: ${String(error)}`);
            }
        }
    }

    private remember_hash_info(
        hash: string,
        artist: unknown,
        title: unknown,
        difficulty: unknown,
        resolution: HashResolution,
    ): void {
        if (resolution.infoByHash.has(hash)) return;
        resolution.infoByHash.set(hash, {
            artist: typeof artist === "string" ? artist : "",
            title: typeof title === "string" ? title : "",
            difficulty: typeof difficulty === "string" ? difficulty : "",
        });
    }

    private remember_set_id(setId: unknown, hash: string, resolution: HashResolution): void {
        const id = Number(setId);
        if (!Number.isInteger(id) || id <= 0) return;
        if (!resolution.setIdByHash.has(hash)) resolution.setIdByHash.set(hash, id);
    }

    private remember_map_id(mapId: unknown, hash: string, resolution: HashResolution): void {
        const id = Number(mapId);
        if (!Number.isInteger(id) || id <= 0) return;
        if (!resolution.mapIdByHash.has(hash)) resolution.mapIdByHash.set(hash, id);
        if (!resolution.hashByMapId.has(id)) resolution.hashByMapId.set(id, hash);
    }

    private async resolve_map_ids(ids: number[]): Promise<Map<number, string>> {
        const unique = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
        const hashByMapId = new Map<number, string>();

        for (let index = 0; index < unique.length; index += RESOLVE_BATCH) {
            const batch = unique.slice(index, index + RESOLVE_BATCH);
            if (this.has_client_path(ConfigKey.PATH_STABLE_DIR)) {
                try {
                    const stable = await (StableReader.getInstance as StableReader).query_beatmaps(
                        { includedIds: batch },
                        0,
                        0,
                    );
                    for (const entry of stable?.data ?? []) {
                        const hash = typeof entry?.md5Hash === "string" ? entry.md5Hash.toLowerCase() : "";
                        const id = Number(entry?.beatmapId);
                        if (hash.length > 0 && Number.isInteger(id) && id > 0 && !hashByMapId.has(id)) {
                            hashByMapId.set(id, hash);
                        }
                    }
                } catch (error) {
                    log.warn(`Stable id resolution failed: ${String(error)}`);
                }
            }

            if (this.has_client_path(ConfigKey.PATH_LAZER_REALM)) {
                try {
                    const lazer = await (LazerReader.getInstance as LazerReader).query_beatmaps(
                        { beatmapIds: batch },
                        0,
                        batch.length,
                    );
                    for (const entry of lazer?.data ?? []) {
                        const hash = typeof entry?.MD5Hash === "string" ? entry.MD5Hash.toLowerCase() : "";
                        const id = Number(entry?.OnlineID);
                        if (hash.length > 0 && Number.isInteger(id) && id > 0 && !hashByMapId.has(id)) {
                            hashByMapId.set(id, hash);
                        }
                    }
                } catch (error) {
                    log.warn(`Lazer id resolution failed: ${String(error)}`);
                }
            }
        }
        return hashByMapId;
    }

    async get_state(): Promise<CollectionSyncState> {
        await this.init();
        const [snapshot, runningStable] = await Promise.all([this.read_collections(), this.stable_is_running()]);
        const state: CollectionSyncState = {
            hasStable: snapshot.stableAvailable,
            hasLazer: snapshot.lazerAvailable,
            hasContentOverride: this._override !== null,
            runningStable,
            settings: this._settings,
            baseline: this._baseline,
            notFoundHashes: sortHashes(this._notFoundHashes),
            excludeNotFound: this._excludeNotFound,
            stable: normalizeCollections(snapshot.stable),
            lazer: normalizeCollections(snapshot.lazer),
        };
        if (snapshot.stableError !== undefined) state.stableError = snapshot.stableError;
        if (snapshot.lazerError !== undefined) state.lazerError = snapshot.lazerError;
        return state;
    }

    async build_plan(resolutions: CollectionSyncResolution[] = []): Promise<CollectionSyncPlan> {
        await this.init();
        const snapshot = await this.read_collections();
        this.assert_both_clients(snapshot);
        const deletionHashes = collectDeletionListHashes(snapshot.stable, snapshot.lazer, this._settings);
        const resolution = await this.resolve_hashes(deletionHashes, {
            stable: snapshot.stableAvailable,
            lazer: snapshot.lazerAvailable,
        });

        const plan = buildCollectionSyncPlan({
            stable: snapshot.stable,
            lazer: snapshot.lazer,
            settings: this._settings,
            baseline: this._baseline,
            resolutions,
            contentOverride: this._override ?? undefined,
            excludeHashes: this._excludeNotFound ? this._notFoundHashes : undefined,
            installedStable: resolution.installedStable,
            installedLazer: resolution.installedLazer,
            mapIdByHash: resolution.mapIdByHash,
        });

        this._plan = plan;
        this._planSource = { stable: snapshot.stable, lazer: snapshot.lazer };
        this._planResolutions = resolutions;
        return plan;
    }

    private assert_both_clients(snapshot: CollectionSnapshot): void {
        if (!snapshot.stableAvailable || !snapshot.lazerAvailable) {
            const missing: string[] = [];
            if (!snapshot.stableAvailable) missing.push("Stable");
            if (!snapshot.lazerAvailable) missing.push("Lazer");
            throw new Error(`Collection sync needs both clients. Unavailable: ${missing.join(", ")}`);
        }
    }

    async execute(): Promise<CollectionSyncExecuteResponse> {
        const plan = this._plan;
        const source = this._planSource;
        if (!plan || !source) throw new Error("No collection sync preview has been built.");

        const current = await this.read_collections();
        this.assert_both_clients(current);
        if (!same_snapshot(source.stable, current.stable) || !same_snapshot(source.lazer, current.lazer)) {
            const rebuilt = await this.build_plan(this._planResolutions);
            return { stale: true, plan: rebuilt };
        }

        const backupRoot = path.join(pBackupData, SpaceId.CollectionSync, run_stamp());
        const result: CollectionSyncExecuteResult = {
            stableWritten: false,
            lazerWritten: false,
            deletions: [],
            errors: [],
            backupPaths: [backupRoot],
            stableRescanRequired: false,
        };

        if (await this.stable_is_running()) {
            result.blocked = "stable_running";
            log.warn("Sync refused: osu!stable is running");
            return { stale: false, result };
        }

        let backedUpFiles: Array<{ hash: string; relative: string }> = [];
        try {
            const backup = await this.backup_run(backupRoot, plan);
            result.backupPaths.push(...backup.paths);
            backedUpFiles = backup.files;
        } catch (error) {
            result.errors.push(`backup: ${error instanceof Error ? error.message : String(error)}`);
            log.error(`Sync aborted before any change: backup failed (${String(error)})`);
            return { stale: false, result };
        }

        if (current.stableAvailable) {
            try {
                await (StableReader.getInstance as StableReader).set_collections(plan.stablePayload, {
                    backup: false,
                });
                result.stableWritten = true;
            } catch (error) {
                result.errors.push(`stable: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        if (current.lazerAvailable) {
            try {
                await (LazerReader.getInstance as LazerReader).set_collections(plan.lazerPayload);
                result.lazerWritten = true;
            } catch (error) {
                result.errors.push(`lazer: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        const stableTargets = plan.deletions.filter((item) => item.installedStable);
        if (current.stableAvailable && stableTargets.length > 0) {
            const removable = backedUpFiles;
            const notBackedUp = stableTargets.filter((item) => !removable.some((entry) => entry.hash === item.hash));
            for (const item of notBackedUp) {
                result.deletions.push({
                    hash: item.hash,
                    mapId: item.mapId,
                    client: "stable",
                    ok: false,
                    reason: "backup_failed",
                });
            }
            if (removable.length > 0) {
                try {
                    const outcomes = await (StableReader.getInstance as StableReader).remove_beatmap_files(removable);
                    for (const outcome of outcomes) {
                        result.deletions.push(this.to_delete_outcome(outcome, "stable", plan));
                    }
                    result.stableRescanRequired = outcomes.some((outcome) => outcome.ok);
                } catch (error) {
                    result.errors.push(`stable delete: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }

        const lazerTargets = plan.deletions.filter((item) => item.installedLazer);
        if (current.lazerAvailable && lazerTargets.length > 0) {
            try {
                const outcomes = await (LazerReader.getInstance as LazerReader).delete_beatmap_difficulties(
                    lazerTargets.map((item) => item.hash),
                );
                for (const outcome of outcomes) {
                    result.deletions.push(this.to_delete_outcome(outcome, "lazer", plan));
                }
            } catch (error) {
                result.errors.push(`lazer delete: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        const allWritesSucceeded = result.errors.length === 0 && result.stableWritten && result.lazerWritten;

        if (allWritesSucceeded) {
            const next = buildBaselineFromPlan(plan, this._baseline, Date.now());
            this._baseline = next;
            await write_sync_store(BASELINE_FILE, next);
            this._override = null;
            this._plan = null;
            this._planSource = null;
        } else {
            log.warn(`Baseline kept: errors=${result.errors.length}`);
        }

        return { stale: false, result };
    }

    private to_delete_outcome(
        outcome: { hash: string; ok: boolean; mode?: "difficulty" | "set"; reason?: string },
        client: "stable" | "lazer",
        plan: CollectionSyncPlan,
    ): CollectionSyncDeleteOutcome {
        const item = plan.deletions.find((entry) => entry.hash === outcome.hash);
        const result: CollectionSyncDeleteOutcome = {
            hash: outcome.hash,
            mapId: item?.mapId ?? null,
            client,
            ok: outcome.ok === true,
        };
        if (outcome.mode !== undefined) result.mode = outcome.mode;
        if (outcome.reason !== undefined) result.reason = outcome.reason;
        return result;
    }

    async check_missing_beatmaps(
        onProgress?: (resolved: number, total: number) => void,
    ): Promise<MissingBeatmapReport> {
        await this.init();
        const snapshot = await this.read_collections();

        const allHashes: string[] = [];
        for (const entry of [...snapshot.stable, ...snapshot.lazer]) {
            for (const hash of entry.maps) allHashes.push(hash);
        }
        const resolution = await this.resolve_hashes(allHashes, {
            stable: snapshot.stableAvailable,
            lazer: snapshot.lazerAvailable,
        });

        const missing = collectMissingBeatmaps({
            stable: snapshot.stable,
            lazer: snapshot.lazer,
            installedStable: resolution.installedStable,
            installedLazer: resolution.installedLazer,
            settings: this._settings,
        });

        const missingList = sortHashes(missing.sideByHash.keys());
        const resolved = await this.resolve_set_ids(missingList, resolution.setIdByHash, onProgress);
        const nextNotFound = new Set(resolved.notFound);
        const notFoundChanged =
            nextNotFound.size !== this._notFoundHashes.size ||
            Array.from(nextNotFound).some((hash) => !this._notFoundHashes.has(hash));
        this._notFoundHashes = nextNotFound;
        if (notFoundChanged && this._excludeNotFound) this.invalidate_plan();

        const sideBySet = new Map<number, MissingBeatmapSide>();
        for (const [hash, setId] of resolved) {
            const side = missing.sideByHash.get(hash) ?? "common";
            const existing = sideBySet.get(setId);
            if (existing === undefined) sideBySet.set(setId, side);
            else if (existing !== side) sideBySet.set(setId, "common");
        }

        return {
            collections: missing.collections,
            missingHashes: missingList.length,
            missingStableHashes: missing.missingStableHashes.size,
            missingLazerHashes: missing.missingLazerHashes.size,
            downloads: Array.from(sideBySet, ([beatmapsetId, missingSource]) => ({ beatmapsetId, missingSource })).sort(
                (a, b) => a.beatmapsetId - b.beatmapsetId,
            ),
            unresolvedHashes: missingList.filter((hash) => !resolved.has(hash)),
            notFoundHashes: sortHashes(resolved.notFound),
            resolvedFromClients: resolved.fromClients,
            resolvedFromOnlineDb: resolved.fromOnlineDb,
            resolvedFromCache: resolved.fromCache,
        };
    }

    private async resolve_set_ids(
        hashes: string[],
        knownSetIds: ReadonlyMap<string, number>,
        onProgress?: (processed: number, total: number) => void,
    ): Promise<ResolvedSetIds> {
        const resolved = new Map<string, number>() as ResolvedSetIds;
        resolved.fromClients = 0;
        resolved.fromOnlineDb = 0;
        resolved.fromCache = 0;
        resolved.notFound = new Set<string>();
        if (hashes.length === 0) return resolved;

        for (const hash of hashes) {
            const setId = knownSetIds.get(hash);
            if (setId === undefined) continue;
            resolved.set(hash, setId);
            resolved.fromClients += 1;
        }
        onProgress?.(resolved.size, hashes.length);

        const afterClients = hashes.filter((hash) => !resolved.has(hash));
        if (afterClients.length === 0) return resolved;

        const online = (OnlineDbReader.getInstance as OnlineDbReader).get_set_ids_by_checksums(afterClients);
        for (const [hash, setId] of online) {
            resolved.set(hash, setId);
            resolved.fromOnlineDb += 1;
        }
        onProgress?.(resolved.size, hashes.length);

        const remaining = afterClients.filter((hash) => !resolved.has(hash));
        if (remaining.length === 0) return resolved;

        let cacheDirty = false;
        const now = Date.now();
        for (const hash of remaining) {
            const entry = this._lookupCache[hash];
            if (entry === undefined) continue;
            if (entry.setId === null) {
                if (now - entry.at > LOOKUP_NOT_FOUND_TTL_MS) {
                    delete this._lookupCache[hash];
                    cacheDirty = true;
                    continue;
                }
                resolved.notFound.add(hash);
                continue;
            }
            resolved.set(hash, entry.setId);
            resolved.fromCache += 1;
        }
        onProgress?.(resolved.size + resolved.notFound.size, hashes.length);

        const toQuery = remaining.filter((hash) => !resolved.has(hash) && !resolved.notFound.has(hash));
        if (toQuery.length > 0 && !(await this.ensure_api())) {
            log.warn(
                `Missing beatmap check: ${toQuery.length} hashes need the osu! API, but no credentials are configured`,
            );
        } else if (toQuery.length > 0) {
            const api = Api.getInstance as Api;
            const processedBase = resolved.size + resolved.notFound.size;
            let processed = 0;
            let consecutiveErrors = 0;
            for (const hash of toQuery) {
                try {
                    const beatmap = await api.lookup_beatmap_by_checksum(hash);
                    const setId = Number(beatmap?.beatmapset_id);
                    if (Number.isInteger(setId) && setId > 0) {
                        resolved.set(hash, setId);
                        this._lookupCache[hash] = { setId, at: Date.now() };
                        cacheDirty = true;
                    }
                    consecutiveErrors = 0;
                } catch (error) {
                    // A 404 is the API's normal answer for a checksum it does not
                    // know (deleted or never-submitted map), not a service failure,
                    // so it must not trip the error breaker. Cache it so the next
                    // check does not ask about the same dead hash again.
                    if (error instanceof APIException && error.status === 404) {
                        resolved.notFound.add(hash);
                        this._lookupCache[hash] = { setId: null, at: Date.now() };
                        cacheDirty = true;
                        consecutiveErrors = 0;
                    } else {
                        consecutiveErrors += 1;
                        log.warn(`Could not resolve beatmapset for ${hash}: ${String(error)}`);
                        // A rejected key or a dead network would otherwise spin
                        // through every remaining hash, one paced request at a time.
                        if (consecutiveErrors >= API_ERROR_LIMIT) {
                            log.warn(`Missing beatmap check stopped after ${API_ERROR_LIMIT} consecutive API errors`);
                            break;
                        }
                    }
                }
                processed += 1;
                onProgress?.(processedBase + processed, hashes.length);
                await sleep(API_LOOKUP_INTERVAL_MS);
            }
        }

        if (cacheDirty) await this.save_lookup_cache();
        if (resolved.notFound.size > 0) {
            log.info(`Missing beatmap check: ${resolved.notFound.size} hashes have no beatmap on the osu! API`);
        }
        return resolved;
    }

    private async save_lookup_cache(): Promise<void> {
        try {
            await write_sync_store(LOOKUP_CACHE_FILE, this._lookupCache);
        } catch (error) {
            log.warn(`Could not save the lookup cache: ${String(error)}`);
        }
    }

    private async ensure_api(): Promise<boolean> {
        const api = Api.getInstance as Api;
        if (api.is_ready()) return true;

        const config = Config.getInstance as Config;
        const clientId = this.config_path(config, ConfigKey.API_CLIENT_ID);
        const clientSecret = this.config_path(config, ConfigKey.API_CLIENT_SECRET);
        if (clientId === undefined || clientSecret === undefined) return false;

        try {
            await api.init(clientId, clientSecret);
            return true;
        } catch (error) {
            log.warn(`Could not initialise the API client: ${String(error)}`);
            return false;
        }
    }

    async export_settings(filePath: string): Promise<void> {
        await this.init();
        await saveJson(filePath, {
            schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION,
            collections: this._settings.collections,
        });
    }

    async import_settings(filePath: string): Promise<CollectionSyncSettings> {
        await this.init();
        const raw = await readJson(filePath);
        if (!is_record(raw) || !is_record(raw.collections)) {
            throw new Error("Invalid collection sync settings file.");
        }
        return await this.save_settings(parseCollectionSyncSettings(raw));
    }

    async export_content(filePath: string): Promise<CollectionSyncContent> {
        await this.init();
        const plan = this._plan ?? (await this.build_plan(this._planResolutions));
        const hashes: string[] = [];
        for (const entry of plan.collections) {
            for (const hash of entry.target ?? []) hashes.push(hash);
        }
        const resolution = await this.resolve_hashes(hashes, {
            stable: this.has_client_path(ConfigKey.PATH_STABLE_DIR),
            lazer: this.has_client_path(ConfigKey.PATH_LAZER_REALM),
        });
        const content = buildContentFromPlan(plan, resolution.mapIdByHash, Date.now());
        await saveJson(filePath, content);
        return content;
    }

    async import_content(filePath: string): Promise<CollectionSyncImportSummary> {
        await this.init();
        const raw = await readJson(filePath);
        if (!is_record(raw) || !Array.isArray(raw.collections)) {
            throw new Error("Invalid collection sync content file.");
        }
        const content = parseCollectionSyncContent(raw);
        const ids = content.collections.flatMap((entry) => entry.mapIds);
        const hashByMapId = await this.resolve_map_ids(ids);
        this._override = contentToOverride(content, hashByMapId);
        this.invalidate_plan();

        const unresolvedIds = ids.filter((id) => !hashByMapId.has(id)).length;
        log.info(
            `Imported sync content: collections=${content.collections.length} resolved=${ids.length - unresolvedIds} unresolved=${unresolvedIds}`,
        );
        return {
            collectionCount: content.collections.length,
            resolvedIds: ids.length - unresolvedIds,
            unresolvedIds,
        };
    }

    has_content_override(): boolean {
        return this._override !== null;
    }

    invalidate_plan(): void {
        this._plan = null;
        this._planSource = null;
    }
}
