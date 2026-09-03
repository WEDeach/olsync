import { useEffect, useRef, useState } from "react";
import { DownloadTask } from "../defines/download_types";

export interface UseDownloadTasksOptions {
    loadAll?: boolean;
}

export interface DownloadTasksResult {
    tasks: DownloadTask[];
    setTasks: React.Dispatch<React.SetStateAction<DownloadTask[]>>;
    loading: boolean;
    newTaskIds: Set<string>;
    authRequired: { show: boolean; hostname?: string };
    loginResult: { success: boolean } | null;
    clearAuthRequired: () => void;
    clearNewTaskIds: () => void;
}

export function useDownloadTasks(options: UseDownloadTasksOptions = {}): DownloadTasksResult {
    const { loadAll = true } = options;
    const [tasks, setTasks] = useState<DownloadTask[]>([]);
    const [loading, setLoading] = useState(loadAll);
    const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
    const [authRequired, setAuthRequired] = useState<{ show: boolean; hostname?: string }>({ show: false });
    const [loginResult, setLoginResult] = useState<{ success: boolean } | null>(null);
    const seenIds = useRef<Set<string>>(new Set());
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (loadAll) {
            setLoading(true);
            window.olsCore
                .dlGetAllTasks()
                .then((all) => {
                    if (!mounted.current) return;
                    const list = all ?? [];
                    setTasks(list);
                    for (const t of list) seenIds.current.add(t.id);
                })
                .catch(() => {
                    /* ignore fetch errors */
                })
                .finally(() => {
                    if (mounted.current) setLoading(false);
                });
        }

        const onTask = (_e: Electron.IpcRendererEvent, task: DownloadTask) => {
            if (!mounted.current) return;
            const isNew = !seenIds.current.has(task.id);
            if (isNew) {
                seenIds.current.add(task.id);
                setNewTaskIds((prev) => {
                    const next = new Set(prev);
                    next.add(task.id);
                    return next;
                });
            }
            setTasks((prev) => {
                const idx = prev.findIndex((t) => t.id === task.id);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = task;
                    return next;
                }
                if (!isNew && !loadAll) return prev;
                return [task, ...prev];
            });
        };

        const onTaskRemoved = (_e: Electron.IpcRendererEvent, payload: { id: string }) => {
            if (!mounted.current) return;
            seenIds.current.delete(payload.id);
            setTasks((prev) => prev.filter((t) => t.id !== payload.id));
            setNewTaskIds((prev) => {
                if (!prev.has(payload.id)) return prev;
                const next = new Set(prev);
                next.delete(payload.id);
                return next;
            });
        };

        const onAuthRequired = (_e: Electron.IpcRendererEvent, payload: { hostname: string }) => {
            if (!mounted.current) return;
            setAuthRequired({ show: true, hostname: payload.hostname });
        };

        const onLoginResult = (_e: Electron.IpcRendererEvent, payload: { success: boolean }) => {
            if (!mounted.current) return;
            setLoginResult(payload);
            if (payload.success) setAuthRequired({ show: false });
        };

        window.olsCore.dlOnTaskUpdated(onTask);
        window.olsCore.dlOnTaskRemoved(onTaskRemoved);
        window.olsCore.dlOnAuthRequired(onAuthRequired);
        window.olsCore.dlOnLoginResult(onLoginResult);

        return () => {
            window.olsCore.dlOffTaskUpdated(onTask);
            window.olsCore.dlOffTaskRemoved(onTaskRemoved);
            window.olsCore.dlOffAuthRequired(onAuthRequired);
            window.olsCore.dlOffLoginResult(onLoginResult);
        };
    }, [loadAll]);

    return {
        tasks,
        setTasks,
        loading,
        newTaskIds,
        authRequired,
        loginResult,
        clearAuthRequired: () => setAuthRequired({ show: false }),
        clearNewTaskIds: () => {
            setNewTaskIds(new Set());
            if (!loadAll) setTasks([]);
        },
    };
}
