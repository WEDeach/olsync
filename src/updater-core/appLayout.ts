import * as path from "path";

export interface AppInstallLayout {
    appRoot: string;
    resourcesDir: string;
    appAsarPath: string;
}

/**
 * Resolves the installed app layout from Electron's app path.
 *
 * @param appPath The value returned by Electron's app.getAppPath().
 * @param platform The target platform used for unpacked development fallbacks.
 * @returns The app root, resources directory, and app.asar path.
 */
export function resolveAppInstallLayout(
    appPath: string,
    platform: NodeJS.Platform = process.platform,
): AppInstallLayout {
    const resolvedAppPath = path.resolve(appPath);
    if (resolvedAppPath.toLowerCase().endsWith(".asar")) {
        const resourcesDir = path.dirname(resolvedAppPath);
        return {
            appRoot: path.dirname(resourcesDir),
            resourcesDir,
            appAsarPath: resolvedAppPath,
        };
    }

    const resourcesDir = path.join(resolvedAppPath, platform === "darwin" ? "Resources" : "resources");
    return {
        appRoot: resolvedAppPath,
        resourcesDir,
        appAsarPath: path.join(resourcesDir, "app.asar"),
    };
}

/**
 * Resolves the layout expected beside a running Electron executable.
 *
 * @param executablePath The Electron or packaged application executable path.
 * @param platform The platform of the running application.
 * @returns The expected app root, resources directory, and app.asar path.
 */
export function resolveExpectedAppInstallLayout(
    executablePath: string,
    platform: NodeJS.Platform = process.platform,
): AppInstallLayout {
    const executableDir = path.dirname(path.resolve(executablePath));
    const appRoot = platform === "darwin" ? path.dirname(executableDir) : executableDir;
    const resourcesDir = path.join(appRoot, platform === "darwin" ? "Resources" : "resources");
    return {
        appRoot,
        resourcesDir,
        appAsarPath: path.join(resourcesDir, "app.asar"),
    };
}

/**
 * Resolves a manifest-relative path against the installed app layout.
 *
 * @param relativePath A normalized updater manifest path.
 * @param layout The resolved app installation layout.
 * @returns The absolute installed target path.
 */
export function resolveInstallTargetPath(relativePath: string, layout: AppInstallLayout): string {
    const normalized = relativePath.replace(/\\/g, "/");
    if (normalized === "resources/app.asar") return layout.appAsarPath;
    if (normalized.startsWith("resources/")) {
        return path.join(layout.resourcesDir, ...normalized.slice("resources/".length).split("/"));
    }
    return path.join(layout.appRoot, ...normalized.split("/"));
}

/**
 * Compares absolute paths using the case rules of the target platform.
 *
 * @param left The first path.
 * @param right The second path.
 * @param platform The platform whose path rules should be applied.
 * @returns Whether both paths identify the same location.
 */
export function sameInstallPath(left: string, right: string, platform: NodeJS.Platform = process.platform): boolean {
    const resolvedLeft = path.resolve(left);
    const resolvedRight = path.resolve(right);
    return platform === "win32"
        ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
        : resolvedLeft === resolvedRight;
}
