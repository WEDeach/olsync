import { verify } from "crypto";
import { PUBLIC_KEY_PEM } from "./constants";

export function verifyRsaSignature(payload: string, signatureBase64: string): boolean {
    try {
        return verify(
            "sha256",
            Buffer.from(payload, "utf8"),
            { key: PUBLIC_KEY_PEM, format: "pem", type: "pkcs1" },
            Buffer.from(signatureBase64.trim(), "base64"),
        );
    } catch {
        return false;
    }
}
