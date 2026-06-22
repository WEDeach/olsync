import { useEffect, useRef, useState } from "react";
import { DownloadTask } from "../defines/download_types";

export interface DownloadTasksResult {
    tasks: DownloadTask[];
    newTaskIds: Set<string>;
    authRequired: { show: boolean; hostname?: string };
    loginResult: { success: boolean } | null;
    clearAuthRequired: () => void;
    clearNewTaskIds: () => void;
}

export function useDownloadTasks(): DownloadTasksResult {
    const [tasks, setTasks] = useState<DownloadTask[]>([]);
    const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
    const [authRequired, setAuthRequired] = useState<{ show: boolean; hostname?: string }>({ show: false });
    const [loginResult, setLoginResult] = useState<{ success: boolean } | null>(null);
    const seenIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        window.olsCore.dlGetAllTasks().then((all) => {
            const list = all ?? [];
            setTasks(list);
            for (const t of list) seenIds.current.add(t.id);
        });

        const onTask = (_e: Electron.IpcRendererEvent, task: DownloadTask) => {
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
                return [task, ...prev];
            });
        };

        const onAuthRequired = (_e: Electron.IpcRendererEvent, payload: { hostname: string }) => {
            setAuthRequired({ show: true, hostname: payload.hostname });
        };

        const onLoginResult = (_e: Electron.IpcRendererEvent, payload: { success: boolean }) => {
            setLoginResult(payload);
            if (payload.success) setAuthRequired({ show: false });
        };

        window.olsCore.dlOnTaskUpdated(onTask);
        window.olsCore.dlOnAuthRequired(onAuthRequired);
        window.olsCore.dlOnLoginResult(onLoginResult);

        return () => {
            window.olsCore.dlOffTaskUpdated(onTask);
            window.olsCore.dlOffAuthRequired(onAuthRequired);
            window.olsCore.dlOffLoginResult(onLoginResult);
        };
    }, []);

    return {
        tasks,
        newTaskIds,
        authRequired,
        loginResult,
        clearAuthRequired: () => setAuthRequired({ show: false }),
        clearNewTaskIds: () => setNewTaskIds(new Set()),
    };
}
