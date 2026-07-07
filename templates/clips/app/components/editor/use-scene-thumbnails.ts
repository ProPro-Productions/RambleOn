import { useEffect, useRef, useState } from "react";

import { canvasToBlob, captureFrames, idbGet, idbPut } from "./frame-store";

/**
 * Captures one preview frame per scene/segment start time from an offscreen
 * <video>, for the Descript-style mini screenshots that lead each segment in
 * the transcript text. Returns a map of time (ms) → object URL that fills
 * in progressively as frames arrive.
 *
 * Frames come from the shared frame store: previously captured times paint
 * instantly from IndexedDB, only new times hit the video — so adding or
 * removing one split never recaptures the rest, and reopening a recording
 * shows thumbnails immediately.
 */

const MAX_THUMBS = 48;
const CAPTURE_WIDTH = 144;
const CAPTURE_HEIGHT = 82;

export function useSceneThumbnails({
  videoUrl,
  times,
  enabled,
}: {
  videoUrl: string | null;
  times: number[];
  enabled: boolean;
}): Record<number, string> {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const urlCacheRef = useRef<Map<string, string>>(new Map());

  const timesKey = times
    .slice(0, MAX_THUMBS)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!enabled || !videoUrl || timesKey.length === 0) return;
    const wanted = timesKey.split(",").map(Number);
    const urls = urlCacheRef.current;
    const keyFor = (ms: number) =>
      `${videoUrl}#thumb:${ms}@${CAPTURE_WIDTH}x${CAPTURE_HEIGHT}`;

    let cancelled = false;
    const present: Record<number, string> = {};

    const run = async () => {
      // Session/IndexedDB hits first.
      const missing: number[] = [];
      await Promise.all(
        wanted.map(async (ms) => {
          const key = keyFor(ms);
          const sessionHit = urls.get(key);
          if (sessionHit) {
            present[ms] = sessionHit;
            return;
          }
          const blob = await idbGet(key);
          if (blob) {
            const url = URL.createObjectURL(blob);
            urls.set(key, url);
            present[ms] = url;
            return;
          }
          missing.push(ms);
        }),
      );
      if (cancelled) return;
      setThumbs({ ...present });
      if (missing.length === 0) return;

      await captureFrames({
        videoUrl,
        parallelism: 2,
        isCancelled: () => cancelled,
        tasks: missing.map((ms) => ({
          // A hair past the boundary — the frame the viewer actually sees
          // when playback resumes there (and skips black first frames at 0).
          seconds: Math.max(ms, 150) / 1000,
          onFrame: async (video) => {
            const canvas = document.createElement("canvas");
            canvas.width = CAPTURE_WIDTH;
            canvas.height = CAPTURE_HEIGHT;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const aspect =
              video.videoWidth > 0 && video.videoHeight > 0
                ? video.videoWidth / video.videoHeight
                : 16 / 9;
            const targetAspect = CAPTURE_WIDTH / CAPTURE_HEIGHT;
            let sx = 0;
            let sy = 0;
            let sw = video.videoWidth;
            let sh = video.videoHeight;
            if (aspect > targetAspect) {
              sw = sh * targetAspect;
              sx = (video.videoWidth - sw) / 2;
            } else {
              sh = sw / targetAspect;
              sy = (video.videoHeight - sh) / 2;
            }
            ctx.drawImage(
              video,
              sx,
              sy,
              sw,
              sh,
              0,
              0,
              CAPTURE_WIDTH,
              CAPTURE_HEIGHT,
            );
            const blob = await canvasToBlob(canvas);
            if (!blob || cancelled) return;
            const key = keyFor(ms);
            void idbPut(key, blob);
            const url = URL.createObjectURL(blob);
            urls.set(key, url);
            setThumbs((prev) => ({ ...prev, [ms]: url }));
          },
        })),
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, videoUrl, timesKey]);

  return thumbs;
}
