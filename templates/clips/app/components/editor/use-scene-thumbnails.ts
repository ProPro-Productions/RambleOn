import { useEffect, useRef, useState } from "react";

/**
 * Captures one preview frame per scene/segment start time from an offscreen
 * <video>, for the Descript-style mini screenshots that lead each segment in
 * the transcript text. Returns a map of time (ms) → JPEG data URL that fills
 * in progressively as frames are captured.
 *
 * Captured frames are cached per videoUrl+ms across re-runs, so adding or
 * removing one split only captures the new frame instead of restarting.
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
  const cacheRef = useRef<Map<string, string>>(new Map());

  const timesKey = times
    .slice(0, MAX_THUMBS)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!enabled || !videoUrl || timesKey.length === 0) return;
    const wanted = timesKey.split(",").map(Number);
    const cache = cacheRef.current;

    // Serve everything already captured, then only capture what's missing.
    const cachedNow: Record<number, string> = {};
    const missing: number[] = [];
    for (const ms of wanted) {
      const hit = cache.get(`${videoUrl}#${ms}`);
      if (hit) cachedNow[ms] = hit;
      else missing.push(ms);
    }
    setThumbs(cachedNow);
    if (missing.length === 0) return;

    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = videoUrl;

    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
          reject(new Error("thumbnail seek failed"));
        };
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        video.currentTime = seconds;
      });

    const run = async () => {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), {
          once: true,
        });
        video.addEventListener(
          "error",
          () => reject(new Error("thumbnail video failed")),
          { once: true },
        );
      });
      if (cancelled) return;

      for (const ms of missing) {
        if (cancelled) return;
        try {
          // A hair past the boundary — the frame the viewer actually sees
          // when playback resumes there (and skips black first frames at 0).
          await seekTo(Math.max(ms, 150) / 1000);
        } catch {
          return;
        }
        if (cancelled) return;
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
        try {
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
          const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
          cache.set(`${videoUrl}#${ms}`, dataUrl);
          setThumbs((prev) => ({ ...prev, [ms]: dataUrl }));
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
  }, [enabled, videoUrl, timesKey]);

  return thumbs;
}
