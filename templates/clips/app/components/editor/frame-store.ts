/**
 * Shared frame store for the clips editor's preview surfaces (timeline
 * filmstrip, transcript scene thumbnails).
 *
 * Two jobs:
 *  - `idbGet`/`idbPut`: persist captured frames in IndexedDB so reopening a
 *    recording paints previews instantly instead of re-seeking the video.
 *  - `captureFrames`: capture missing frames by seeking a small pool of
 *    offscreen <video> elements in parallel (sequential seeking on a single
 *    element is the reason previews used to trickle in one by one).
 *
 * Deliberately independent of the vendored full editor's frame cache: the
 * vendored tree is licensed/gitignored, so committed code must not import
 * from it. The concepts converge; the code stays separate.
 */

const DB_NAME = "clips-editor-frames";
const STORE = "frames";
/** Rough cap; oldest entries are evicted once exceeded. */
const MAX_ENTRIES = 600;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const open = (retried: boolean) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("at", "at");
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Self-heal a database created without the store (e.g. by an
        // unrelated version-less open): delete and recreate once.
        if (!db.objectStoreNames.contains(STORE) && !retried) {
          db.close();
          const del = indexedDB.deleteDatabase(DB_NAME);
          del.onsuccess = del.onerror = () => open(true);
          return;
        }
        resolve(db.objectStoreNames.contains(STORE) ? db : null);
      };
      req.onerror = () => resolve(null);
    };
    open(false);
  });
  return dbPromise;
}

export async function idbGet(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () =>
        resolve((req.result as { blob?: Blob } | undefined)?.blob ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbPut(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key, blob, at: Date.now() });
  } catch {
    // best effort
  }
  void evictIfNeeded(db);
}

let evicting = false;
async function evictIfNeeded(db: IDBDatabase): Promise<void> {
  if (evicting) return;
  evicting = true;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const excess = countReq.result - MAX_ENTRIES;
        if (excess <= 0) {
          resolve();
          return;
        }
        let removed = 0;
        const cursorReq = store.index("at").openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || removed >= excess) {
            resolve();
            return;
          }
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
        cursorReq.onerror = () => resolve();
      };
      countReq.onerror = () => resolve();
    });
  } finally {
    evicting = false;
  }
}

export interface CaptureTask {
  seconds: number;
  /** Called with the seeked video; draw synchronously before returning. */
  onFrame: (video: HTMLVideoElement) => void | Promise<void>;
}

/**
 * Hidden tabs defer media loading entirely (seeks never complete) and a
 * pool of stalled <video> elements only burdens the renderer — wait until
 * the tab is visible before touching video at all.
 */
function whenVisible(): Promise<void> {
  if (
    typeof document === "undefined" ||
    document.visibilityState === "visible"
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onChange);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

/**
 * Seek a pool of offscreen videos through `tasks` in parallel. Tasks are
 * distributed round-robin so progress fills evenly across the strip rather
 * than strictly left-to-right.
 */
export async function captureFrames({
  videoUrl,
  tasks,
  parallelism = 3,
  isCancelled = () => false,
}: {
  videoUrl: string;
  tasks: CaptureTask[];
  parallelism?: number;
  isCancelled?: () => boolean;
}): Promise<void> {
  if (tasks.length === 0) return;
  await whenVisible();
  if (isCancelled()) return;
  const poolSize = Math.max(1, Math.min(parallelism, tasks.length));
  const shards: CaptureTask[][] = Array.from({ length: poolSize }, () => []);
  tasks.forEach((task, i) => shards[i % poolSize].push(task));

  await Promise.all(
    shards.map(async (shard) => {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadedmetadata", () => resolve(), {
            once: true,
          });
          video.addEventListener(
            "error",
            () => reject(new Error("frame capture video failed")),
            { once: true },
          );
        });
        for (const task of shard) {
          if (isCancelled()) return;
          await new Promise<void>((resolve, reject) => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              video.removeEventListener("error", onError);
              resolve();
            };
            const onError = () => {
              video.removeEventListener("seeked", onSeeked);
              video.removeEventListener("error", onError);
              reject(new Error("frame capture seek failed"));
            };
            video.addEventListener("seeked", onSeeked);
            video.addEventListener("error", onError);
            video.currentTime = task.seconds;
          });
          if (isCancelled()) return;
          await task.onFrame(video);
        }
      } catch {
        // A failed shard leaves its slots empty; the strip stays partial
        // rather than erroring the editor.
      } finally {
        video.removeAttribute("src");
        video.load();
      }
    }),
  );
}

/** Canvas → JPEG blob, null on failure (e.g. tainted canvas). */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.72,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });
}
