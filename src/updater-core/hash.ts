import { createHash } from "crypto";
import { canonicalJson } from "./canonicalJson";

export function sha256Buffer(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
}

export function sha256CanonicalJson(data: unknown): string {
    return sha256Buffer(Buffer.from(canonicalJson(data), "utf8"));
}

export function sha256FileData(data: Buffer): string {
    return sha256Buffer(data);
}
