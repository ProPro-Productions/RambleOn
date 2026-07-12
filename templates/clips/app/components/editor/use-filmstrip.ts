import { useEffect, useRef } from "react";

import { canvasToBlob, captureFrames, idbGet, idbPut } from "./frame-store";

/**
 * Draws a filmstrip of video frames across the timeline width — the same
 * visual the full editor's track items have, so the clips editor's single
 * "track" reads identically.
 *
 * Frames come from the shared frame store: slots already captured on a
 * previous visit paint instantly from IndexedDB; missing slots are captured
 * by a small pool of offscreen <video> elements seeking in parallel and are
 * persisted for next time. Capture restarts when zoom changes the strip
 * width (cancelled flag guards against stale draws). Canvas width is capped
 * — at extreme zoom the strip is drawn at cap resolution and stretched by
 * CSS instead of allocating a multi-hundred-megabyte canvas.
 */

const MAX_CANVAS_WIDTH = 12_000;
const MAX_FRAMES = 60;

export function useFilmstrip({
  videoUrl,
  durationMs,
  totalWidth,
  height,
  enabled,
}: {
  videoUrl: string | null;
  durationMs: number;
  totalWidth: number;
  height: number;
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled || !videoUrl || durationMs <= 0 || totalWidth <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const canvasWidth = Math.min(Math.round(totalWidth), MAX_CANVAS_WIDTH);
    canvas.width = canvasWidth;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasWidth, height);

    const frameWidth = Math.ceil(height * (16 / 9));
    const frameCount = Math.min(
      MAX_FRAMES,
      Math.max(1, Math.ceil(canvasWidth / frameWidth)),
    );
    const sliceWidth = canvasWidth / frameCount;
    const sliceCssWidth = Math.ceil(sliceWidth);
    const durationSec = durationMs / 1000;

    const slotKey = (i: number) =>
      `${videoUrl}#strip:${i}/${frameCount}@${sliceCssWidth}x${height}`;
    const slotSeconds = (i: number) =>
      Math.min(((i + 0.5) / frameCount) * durationSec, durationSec - 0.05);

    const drawBitmap = (i: number, source: CanvasImageSource) => {
      ctx.drawImage(
        source,
        Math.round(i * sliceWidth),
        0,
        sliceCssWidth,
        height,
      );
    };

    const run = async () => {
      // Pass 1: paint every slot we already have.
      const missing: number[] = [];
      await Promise.all(
        Array.from({ length: frameCount }, (_, i) => i).map(async (i) => {
          const blob = await idbGet(slotKey(i));
          if (cancelled) return;
          if (!blob) {
            missing.push(i);
            return;
          }
          try {
            const bitmap = await createImageBitmap(blob);
            if (!cancelled) drawBitmap(i, bitmap);
          } catch {
            missing.push(i);
          }
        }),
      );
      if (cancelled || missing.length === 0) return;

      // Pass 2: capture missing slots with a parallel video pool.
      missing.sort((a, b) => a - b);

      await captureFrames({
        videoUrl,
        isCancelled: () => cancelled,
        tasks: missing.map((i) => ({
          seconds: Math.max(0, slotSeconds(i)),
          onFrame: async (video) => {
            // Per-frame scratch canvas: shards capture concurrently, so a
            // shared canvas would interleave frames across slots.
            const slice = document.createElement("canvas");
            slice.width = sliceCssWidth;
            slice.height = height;
            const sliceCtx = slice.getContext("2d");
            if (!sliceCtx) return;
            const videoAspect =
              video.videoWidth > 0 && video.videoHeight > 0
                ? video.videoWidth / video.videoHeight
                : 16 / 9;
            const sliceAspect = sliceCssWidth / height;
            let sx = 0;
            let sy = 0;
            let sw = video.videoWidth;
            let sh = video.videoHeight;
            if (videoAspect > sliceAspect) {
              sw = sh * sliceAspect;
              sx = (video.videoWidth - sw) / 2;
            } else {
              sh = sw / sliceAspect;
              sy = (video.videoHeight - sh) / 2;
            }
            sliceCtx.drawImage(
              video,
              sx,
              sy,
              sw,
              sh,
              0,
              0,
              sliceCssWidth,
              height,
            );
            if (cancelled) return;
            drawBitmap(i, slice);
            const blob = await canvasToBlob(slice);
            if (blob) void idbPut(slotKey(i), blob);
          },
        })),
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, videoUrl, durationMs, totalWidth, height]);

  return { canvasRef };
}
