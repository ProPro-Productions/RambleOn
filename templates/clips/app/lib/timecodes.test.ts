import { describe, expect, it } from "vitest";

import { formatTimecode, parseTimecodeRefs } from "./timecodes";

describe("parseTimecodeRefs", () => {
  it("finds m:ss and h:mm:ss references with positions", () => {
    const refs = parseTimecodeRefs("intro 0:42, then 12:44 and 1:02:33 outro");
    expect(refs).toEqual([
      { index: 6, raw: "0:42", ms: 42_000 },
      { index: 17, raw: "12:44", ms: 764_000 },
      { index: 27, raw: "1:02:33", ms: 3_753_000 },
    ]);
  });

  it("rejects malformed or version-like strings", () => {
    expect(parseTimecodeRefs("v1.2.3 or 12:445 or 1:2:3:4 or 3:7")).toEqual(
      [],
    );
  });

  it("requires two-digit 00-59 seconds", () => {
    expect(parseTimecodeRefs("ratio 3:70")).toEqual([]);
    expect(parseTimecodeRefs("at 3:59")).toEqual([
      { index: 3, raw: "3:59", ms: 239_000 },
    ]);
  });

  it("rejects hour-form refs with minutes above 59", () => {
    expect(parseTimecodeRefs("odd 1:73:10")).toEqual([]);
  });

  it("handles large minute-form refs", () => {
    expect(parseTimecodeRefs("marathon 99:59")).toEqual([
      { index: 9, raw: "99:59", ms: 5_999_000 },
    ]);
  });
});

describe("formatTimecode", () => {
  it("formats sub-hour as m:ss", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(42_000)).toBe("0:42");
    expect(formatTimecode(764_000)).toBe("12:44");
  });

  it("formats hour-plus as h:mm:ss", () => {
    expect(formatTimecode(3_753_000)).toBe("1:02:33");
  });

  it("clamps negatives to zero", () => {
    expect(formatTimecode(-5_000)).toBe("0:00");
  });

  it("round-trips through the parser", () => {
    for (const ms of [42_000, 764_000, 3_753_000, 5_999_000]) {
      const refs = parseTimecodeRefs(`at ${formatTimecode(ms)} here`);
      expect(refs).toHaveLength(1);
      expect(refs[0].ms).toBe(ms);
    }
  });
});
