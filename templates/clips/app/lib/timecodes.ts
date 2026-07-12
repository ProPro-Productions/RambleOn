/**
 * Inline timecode references in comment/annotation text.
 *
 * Timecodes like `12:44`, `1:02:33`, or `0:05` written in a text body are
 * plain text in storage; UIs linkify them at render time (click → seek).
 * This is the one shared parser so every surface (comments panel, annotation
 * list, transcript panel) finds the same references.
 */

export interface TimecodeRef {
  /** Character offset of the match in the input text. */
  index: number;
  /** The matched text, e.g. "12:44" or "1:02:33". */
  raw: string;
  /** Position in the video, in milliseconds. */
  ms: number;
}

// m:ss, mm:ss, h:mm:ss, hh:mm:ss — seconds (and minutes when hours are
// present) must be two digits 00–59. Word boundaries keep "12:445" and
// version-like strings ("1:2:3:4") from matching.
const TIMECODE_PATTERN =
  /(?<![\d:])(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)(?![\d:])/g;

export function parseTimecodeRefs(text: string): TimecodeRef[] {
  const refs: TimecodeRef[] = [];
  for (const match of text.matchAll(TIMECODE_PATTERN)) {
    const [raw, hours, minutes, seconds] = match;
    const h = hours ? Number.parseInt(hours, 10) : 0;
    const m = Number.parseInt(minutes, 10);
    const s = Number.parseInt(seconds, 10);
    // With an hours part, minutes must be a valid 0–59 value.
    if (hours && m > 59) continue;
    refs.push({
      index: match.index,
      raw,
      ms: ((h * 60 + m) * 60 + s) * 1000,
    });
  }
  return refs;
}

/** Format milliseconds as a timecode string ("m:ss" or "h:mm:ss"). */
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}
