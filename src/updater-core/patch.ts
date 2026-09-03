import { createHash } from "crypto";

const BLOCK_SIZE = 4096;

function calculateBufferHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
}

function computeBlockHashes(buffer: Buffer): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i + BLOCK_SIZE <= buffer.length; i += BLOCK_SIZE) {
        const block = buffer.subarray(i, i + BLOCK_SIZE);
        map.set(calculateBufferHash(block), i);
    }
    return map;
}

export function createBinaryPatch(oldBuffer: Buffer, newBuffer: Buffer): Buffer {
    const oldHashes = computeBlockHashes(oldBuffer);
    const chunks: Buffer[] = [];
    let pos = 0;

    while (pos < newBuffer.length) {
        const end = Math.min(pos + BLOCK_SIZE, newBuffer.length);
        const block = newBuffer.subarray(pos, end);
        const hash = calculateBufferHash(block);

        if (oldHashes.has(hash) && block.length === BLOCK_SIZE) {
            const refOffset = oldHashes.get(hash) ?? 0;
            const refLen = Buffer.alloc(4);
            refLen.writeUInt32LE(BLOCK_SIZE, 0);
            const refOff = Buffer.alloc(4);
            refOff.writeUInt32LE(refOffset, 0);
            chunks.push(Buffer.from([0x01]), refOff, refLen);
            pos += BLOCK_SIZE;
        } else {
            const rawLen = Math.min(BLOCK_SIZE, newBuffer.length - pos);
            const lenBuf = Buffer.alloc(4);
            lenBuf.writeUInt32LE(rawLen, 0);
            chunks.push(Buffer.from([0x00]), lenBuf, newBuffer.subarray(pos, pos + rawLen));
            pos += rawLen;
        }
    }

    return Buffer.concat(chunks);
}

export function applyBinaryPatch(oldBuffer: Buffer, patch: Buffer): Buffer {
    const chunks: Buffer[] = [];
    let pos = 0;

    while (pos < patch.length) {
        const cmd = patch[pos];
        pos += 1;

        if (cmd === 0x00) {
            const len = patch.readUInt32LE(pos);
            pos += 4;
            chunks.push(patch.subarray(pos, pos + len));
            pos += len;
        } else if (cmd === 0x01) {
            const refOffset = patch.readUInt32LE(pos);
            pos += 4;
            const refLen = patch.readUInt32LE(pos);
            pos += 4;
            chunks.push(oldBuffer.subarray(refOffset, refOffset + refLen));
        } else {
            throw new Error(`Unknown patch command: ${cmd}`);
        }
    }

    return Buffer.concat(chunks);
}
