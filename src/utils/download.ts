import { EnqueueRequest } from "../defines/download_types";
import { HostType } from "../defines/types";
import g from "../renderer/state";
import __ from "./i18n";
import { LogError } from "./log";
import { createLogger } from "./logger";
import { sleep } from "./time";
import { ConfigKey } from "./typed/config";
import { I18nStrings } from "./typed/i18n";

const log = createLogger("uDownload");

type TCallback = () => Promise<any[]>;

export const GetDelayMs = () => Number(g.config?.[ConfigKey.DL_DELAY_MS]) || 10000;

export const GetDLOptionByRows = (data_fetcher: TCallback) => {
    return {
        label: __(I18nStrings.BTN_DL_BY_ROWS),
        callback: async () => {
            try {
                g.setLoading(true, `${__(I18nStrings.MAIN_DL_FETCHING)}...`);
                const rows = await data_fetcher();
                g.setLoading(false);

                if (!rows) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_DL_NODATA),
                        severity: "warning",
                    });
                    return;
                }

                await navigator.clipboard.writeText(rows.join("\n"));
                g.setNotify({
                    message: __(I18nStrings.MAIN_DL_TO_CLIPBOARD, { count: rows.length }),
                    severity: "success",
                });
            } catch (error) {
                LogError(error);
            } finally {
                g.setLoading(false);
            }
        },
    };
};

export const GetDLOptionByFDM = (data_fetcher: TCallback) => {
    return {
        label: __(I18nStrings.BTN_DL_BY_FDM),
        callback: async () => {
            try {
                g.setLoading(true, `${__(I18nStrings.MAIN_DL_FETCHING)}...`);
                const rows = await data_fetcher();
                g.setLoading(false);

                if (!rows) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_DL_NODATA),
                        severity: "warning",
                    });
                    return;
                }
                const result = await window.olsCore.initDL(HostType.FDM);
                if (result) {
                    g.setNotify({
                        message: "Free Download Manager has been initialized",
                        severity: "success",
                    });
                    await window.olsCore.sendMessage4DL(0, {
                        id: "1",
                        type: "create_downloads",
                        create_downloads: {
                            downloads: rows.map((v) => ({ url: v })),
                        },
                    });
                } else {
                    g.setNotify({
                        message: "Failed to initialize Free Download Manager",
                        severity: "error",
                    });
                }
            } catch (error) {
                LogError(error);
            } finally {
                g.setLoading(false);
            }
        },
    };
};

export const GetDLOptionByDirect = (mapIds: number[]) => {
    return {
        label: __(I18nStrings.BTN_DL_BY_DIRECT),
        callback: async () => {
            try {
                if (confirm(__(I18nStrings.BTN_DL_BY_DIRECT_CONFIRM))) {
                    const aborter = new AbortController();
                    g.setLoading(true, __(I18nStrings.MAIN_DL_PROGRESS, { current: 0, total: mapIds.length }), aborter);

                    let successCount = 0;
                    let failCount = 0;
                    const failedIds: number[] = [];
                    for (let i = 0; i < mapIds.length; i++) {
                        if (aborter.signal.aborted) {
                            g.setNotify({
                                message: __(I18nStrings.MAIN_DL_ABORTED, {
                                    success: successCount,
                                    failed: failCount,
                                    total: mapIds.length,
                                }),
                                severity: "warning",
                            });
                            break;
                        }
                        const map_id = mapIds[i];
                        const link = `osu://s/${map_id}`;
                        // TODO: link by set id and map id
                        g.setLoading(
                            true,
                            __(I18nStrings.MAIN_DL_PROGRESS, {
                                current: i + 1,
                                total: mapIds.length,
                            }),
                            aborter,
                        );

                        try {
                            await window.olsCore.openExternal(link);
                            successCount++;
                        } catch (error) {
                            log.error(`Failed to open link (sid: ${map_id}):`, error);
                            failCount++;
                            failedIds.push(map_id);
                        }

                        if (i < mapIds.length - 1) {
                            await sleep(GetDelayMs(), aborter.signal);
                        }
                    }
                    g.setLoading(false);
                    if (!aborter.signal.aborted) {
                        g.setNotify({
                            message: __(I18nStrings.MAIN_DL_SUCCESS, { count: successCount }),
                            severity: "success",
                        });
                    }
                }
            } catch (error) {
                LogError(error);
            } finally {
                g.setLoading(false);
            }
        },
    };
};

type BuiltinItem =
    | { source: "pack"; url: string; filename: string }
    | { source: "osu-official"; beatmapsetId: number }
    | { source: "mirror"; beatmapsetId: number };

export const GetDLOptionByBuiltin = (items: BuiltinItem[]) => {
    return {
        label: __(I18nStrings.MAIN_DL_BUILTIN_LABEL),
        callback: async () => {
            try {
                const OSU_DL_BASE = "https://osu.ppy.sh/beatmapsets";
                const reqs: EnqueueRequest[] = items.map((item) => {
                    if (item.source === "pack") {
                        return { source: "pack" as const, url: item.url, filename: item.filename };
                    }
                    const setId = item.beatmapsetId;
                    const url = `${OSU_DL_BASE}/${setId}/download`;
                    return {
                        source: item.source,
                        url,
                        filename: `${setId}.osz`,
                        beatmapsetId: setId,
                    };
                });

                // Use batch enqueue to check for duplicates first
                const results = await window.olsCore.dlBatchEnqueue(reqs);

                // Check if there are any duplicates or existing files
                const duplicates = results.filter((r) => r.type === "duplicate" || r.type === "exists");
                const newItems = results.filter((r) => r.type === "enqueued");

                let retriedCount = 0;
                if (duplicates.length > 0) {
                    // Show MUI dialog for duplicates
                    const confirmed = await g.showDuplicateConfirm(
                        duplicates.map((d) => ({ filename: d.filename || "unknown", task: d.task, req: d.req })),
                    );

                    if (confirmed) {
                        retriedCount = duplicates.length;
                        // Retry duplicates by re-enqueueing
                        for (const dup of duplicates) {
                            // Cancel the old task if it's active
                            if (dup.task && ["queued", "downloading", "held"].includes(dup.task.status)) {
                                await window.olsCore.dlCancel(dup.task.id);
                            }
                            // Re-enqueue
                            await window.olsCore.dlEnqueue(dup.req);
                        }
                    }
                }

                const totalEnqueued = newItems.length + retriedCount;
                const skippedCount = duplicates.length - retriedCount;
                g.setNotify({
                    message: __(I18nStrings.MAIN_DL_ENQUEUED_NOTIFY, {
                        count: totalEnqueued,
                        skipPart: skippedCount > 0 ? `，${__(I18nStrings.BTN_SKIP)} ${skippedCount}` : "",
                    }),
                    severity: "success",
                });
            } catch (error) {
                LogError(error);
            }
        },
    };
};
