import { useEffect, useRef } from "react";

/**
 * Draws a filmstrip of video frames across the timeline width — the same
 * visual the full editor's track items have, so the clips editor's single
 * "track" reads identically.
 *
 * Frames are captured by seeking an offscreen <video> and drawn
 * progressively left-to-right, so the strip fills in while capture runs.
 * Capture restarts when zoom changes the strip width (cancelled flag guards
 * against stale draws). Canvas width is capped — at extreme zoom the strip
 * is drawn at cap resolution and stretched by CSS instead of allocating a
 * multi-hundred-megabyte canvas.
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

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;

    const seekTo = (seconds: number) =>
      new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          reject(new Error("filmstrip seek failed"));
        };
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        video.currentTime = seconds;
      });

    const run = async () => {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => resolve();
        const onError = () => reject(new Error("filmstrip video failed"));
        video.addEventListener("loadedmetadata", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
      });
      if (cancelled) return;

      const durationSec = Math.min(
        durationMs / 1000,
        Number.isFinite(video.duration) ? video.duration : durationMs / 1000,
      );
      const videoAspect =
        video.videoWidth > 0 && video.videoHeight > 0
          ? video.videoWidth / video.videoHeight
          : 16 / 9;

      for (let i = 0; i < frameCount; i++) {
        if (cancelled) return;
        const timeSec = ((i + 0.5) / frameCount) * durationSec;
        try {
          await seekTo(Math.min(timeSec, Math.max(0, durationSec - 0.05)));
        } catch {
          return;
        }
        if (cancelled) return;
        // Cover-fit the frame into its slice.
        const sliceAspect = sliceWidth / height;
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
        try {
          ctx.drawImage(
            video,
            sx,
            sy,
            sw,
            sh,
            Math.round(i * sliceWidth),
            0,
            Math.ceil(sliceWidth),
            height,
          );
        } catch {
          return;
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [enabled, videoUrl, durationMs, totalWidth, height]);

  return { canvasRef };
}
