import fs from "fs";
import path from "path";
import { GetLocalConfig, SaveLocalConfig } from "../../utils/config";
import { pRoot, readJson, readJsonV2, saveJson, saveJsonV2 } from "../../utils/file";
import { SyncState } from "../../utils/typed/config";
import { ServiceCode, SpaceId } from "../../utils/typed/file";
import SingletonBase from "./base";

export default class Config extends SingletonBase {
    _config?: { [key: string]: any };
    _syncStates?: SyncState[];

    async init() {
        if (this._config === undefined) {
            this._config = await GetLocalConfig();
            await this.migrate_picker_legacy();
        }
    }

    get(k: string) {
        if (this._config === undefined) {
            throw new Error("Config has not been initialized.");
        }
        return this._config[k];
    }

    get_all() {
        if (this._config === undefined) {
            throw new Error("Config has not been initialized.");
        }
        return this._config;
    }

    async save(k: string, v: any) {
        if (this._config === undefined) {
            throw new Error("Config has not been initialized.");
        }
        console.log(`save config for ${k}: ${v}`);
        this._config[k] = v;
        await SaveLocalConfig(this._config);
    }

    async init_sync_state() {
        if (this._syncStates !== undefined) {
            throw new Error("The sync state has already been initialized.");
        }
        this._syncStates = [];
        const ss_data = await readJsonV2<SyncState[]>(ServiceCode.Data, SpaceId.SyncState, "1.json");
        if (ss_data !== null) {
            this._syncStates = ss_data;
        }
    }

    async save_sync_state(player_id: number, last_count: number, last_offset: number, last_updated: number) {
        if (this._syncStates === undefined) {
            await this.init_sync_state();
        }
        if (this._syncStates) {
            const index = this._syncStates.findIndex((s) => s.player_id === player_id);
            const newState: SyncState = {
                player_id,
                last_count,
                last_offset,
                last_updated,
            };
            if (index !== -1) {
                this._syncStates[index] = newState;
            } else {
                this._syncStates.push(newState);
            }
            await saveJsonV2(ServiceCode.Data, SpaceId.SyncState, "1.json", this._syncStates);
        }
    }

    async get_sync_state(player_id: number) {
        if (this._syncStates === undefined) {
            await this.init_sync_state();
        }
        if (this._syncStates) {
            return this._syncStates.find((s) => s.player_id === player_id);
        }
        return undefined;
    }

    async get_picker_profile(profileId: string): Promise<any> {
        const p = path.join(pRoot, ServiceCode.PickerProfile, `${profileId}.json`);
        return readJson(p);
    }

    async save_picker_profile(profileId: string, data: any): Promise<void> {
        const p = path.join(pRoot, ServiceCode.PickerProfile, `${profileId}.json`);
        await saveJson(p, data);
    }

    async delete_picker_profile(profileId: string): Promise<void> {
        const p = path.join(pRoot, ServiceCode.PickerProfile, `${profileId}.json`);
        try {
            await fs.promises.unlink(p);
        } catch {}
    }

    async list_picker_profiles(): Promise<string[]> {
        const dir = path.join(pRoot, ServiceCode.PickerProfile);
        try {
            const files = await fs.promises.readdir(dir);
            return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
        } catch {
            return [];
        }
    }

    async get_picker_log(profileId: string): Promise<any[]> {
        const data = await readJsonV2<any[]>(ServiceCode.Data, SpaceId.PickerLog, `${profileId}.json`);
        return data ?? [];
    }

    async save_picker_log(profileId: string, data: any[]): Promise<void> {
        await saveJsonV2(ServiceCode.Data, SpaceId.PickerLog, `${profileId}.json`, data);
    }

    private async migrate_picker_legacy(): Promise<void> {
        if (!this._config) return;
        const config = this._config;
        const LEGACY_PREFIXES = ["picker", "bpk"];
        const OLD_SUFFIXES = [
            "general_filter",
            "included_collections",
            "excluded_collections",
            "advanced",
            "history",
            "profiles",
        ];

        const hasLegacy = LEGACY_PREFIXES.some((prefix) =>
            OLD_SUFFIXES.some((suffix) => config[`${prefix}:${suffix}`] !== undefined),
        );
        if (!hasLegacy) return;

        const getLegacy = <T>(suffix: string, def: T): T => {
            for (const prefix of LEGACY_PREFIXES) {
                const value = config[`${prefix}:${suffix}`];
                if (value !== undefined) return value as T;
            }
            return def;
        };

        const generalFilter = getLegacy("general_filter", {});
        const includedCollections = getLegacy<string[]>("included_collections", []);
        const excludedCollections = getLegacy<string[]>("excluded_collections", []);
        const advancedSettings = getLegacy<unknown>("advanced", { weights: [], wishlist: [] }) as any;

        const defaultProfilePath = path.join(pRoot, ServiceCode.PickerProfile, "default.json");
        if (!fs.existsSync(defaultProfilePath)) {
            await saveJson(defaultProfilePath, {
                name: "default",
                generalFilter,
                includedCollections,
                excludedCollections,
                advancedSettings,
            });
        }

        const history: any[] = getLegacy<any[]>("history", []);
        if (history.length > 0) {
            await saveJsonV2(ServiceCode.Data, SpaceId.PickerLog, "default.json", history);
        }

        const legacyProfiles: any[] = getLegacy<any[]>("profiles", []);
        for (const profile of legacyProfiles) {
            if (!profile?.name) continue;
            const profilePath = path.join(pRoot, ServiceCode.PickerProfile, `${profile.name}.json`);
            if (!fs.existsSync(profilePath)) {
                await saveJson(profilePath, profile);
            }
        }

        for (const prefix of LEGACY_PREFIXES) {
            for (const suffix of OLD_SUFFIXES) {
                delete config[`${prefix}:${suffix}`];
            }
        }
        if (config["picker:active_profile"] === undefined && config["bpk:active_profile"] === undefined) {
            config["picker:active_profile"] = "default";
        }
        if (config["picker:active_profile"] === undefined && config["bpk:active_profile"] !== undefined) {
            config["picker:active_profile"] = config["bpk:active_profile"];
            delete config["bpk:active_profile"];
        }
        await SaveLocalConfig(config);
    }
}
