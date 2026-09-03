/**
 * Pure `.osu` file reader used by the lazer selected-detail path. No I/O, no
 * renderer imports — it only turns file text into hit-object counts.
 *
 * Object type precedence follows osu!lazer `ConvertHitObjectParser.Parse`
 * (Circle -> Slider -> Spinner -> Hold, after masking the NewCombo and
 * ComboOffset bits), so counts agree with what lazer itself reports. Mania hold
 * notes are recognised but counted as none of the three, matching `rosu-pp`
 * which exposes them separately as `nHolds`.
 */

export interface OsuFileObjectCounts {
    circles: number;
    sliders: number;
    spinners: number;
    /** `[General] StackLeniency`, absent when the file does not declare it. */
    stackLeniency?: number;
}

const TYPE_CIRCLE = 1;
const TYPE_SLIDER = 2;
const TYPE_SPINNER = 8;
const TYPE_HOLD = 128;
/** NewCombo (4) and ComboOffset (16 | 32 | 64) are colour hints, not object types. */
const COMBO_BITS = 4 | 16 | 32 | 64;

const SECTION_GENERAL = "general";
const SECTION_HITOBJECTS = "hitobjects";

function sectionName(line: string): string | undefined {
    if (!line.startsWith("[")) return undefined;
    const end = line.indexOf("]");
    return end > 1 ? line.slice(1, end).trim().toLowerCase() : undefined;
}

function stackLeniencyOf(line: string): number | undefined {
    const sep = line.indexOf(":");
    if (sep <= 0) return undefined;
    if (line.slice(0, sep).trim().toLowerCase() !== "stackleniency") return undefined;
    const value = Number.parseFloat(line.slice(sep + 1).trim());
    return Number.isFinite(value) ? value : undefined;
}

/**
 * Counts circles / sliders / spinners in a `.osu` file body.
 *
 * Returns `null` for empty, malformed or hit-object-less content so callers can
 * mark the counts unavailable instead of reporting fabricated zeros.
 */
export function parseOsuObjectCounts(content: string): OsuFileObjectCounts | null {
    if (typeof content !== "string" || content.length === 0) return null;

    let section = "";
    let stackLeniency: number | undefined;
    let circles = 0;
    let sliders = 0;
    let spinners = 0;
    let objects = 0;

    for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith("//")) continue;

        const nextSection = sectionName(line);
        if (nextSection !== undefined) {
            // `[HitObjects]` is the last section of interest; anything after it ends the scan.
            if (section === SECTION_HITOBJECTS) break;
            section = nextSection;
            continue;
        }

        if (section === SECTION_GENERAL) {
            const value = stackLeniencyOf(line);
            if (value !== undefined) stackLeniency = value;
            continue;
        }
        if (section !== SECTION_HITOBJECTS) continue;

        const fields = line.split(",");
        if (fields.length < 4) continue;
        const type = Number.parseInt(fields[3].trim(), 10);
        if (!Number.isFinite(type) || type < 0) continue;

        const baseType = type & ~COMBO_BITS;
        if ((baseType & TYPE_CIRCLE) !== 0) circles++;
        else if ((baseType & TYPE_SLIDER) !== 0) sliders++;
        else if ((baseType & TYPE_SPINNER) !== 0) spinners++;
        else if ((baseType & TYPE_HOLD) === 0) continue;
        objects++;
    }

    if (objects === 0) return null;
    return stackLeniency === undefined ? { circles, sliders, spinners } : { circles, sliders, spinners, stackLeniency };
}
