/**
 * Capture-time timestamp markers for desktop recordings.
 *
 * While a recording is active, Rust registers global ⌥⇧M/E/B/N shortcuts
 * (shortcuts.rs) and emits `clips:marker` { kind } on each press — these
 * work regardless of which app has focus, unlike the web recorder's
 * hotkeys. This module runs in the popover webview and:
 *
 *   1. tracks the recorder's elapsed time by listening to the same
 *      `clips:recorder-state` { paused, elapsedMs } ticks the toolbar uses
 *      (500ms cadence, pause-adjusted, emitted by every session type —
 *      MediaRecorder, local-export, and native fullscreen), and
 *   2. buffers `clips:marker` presses with a drift-corrected elapsed time,
 *      re-emitting `clips:marker-added` { count, kind, atMs } so the
 *      recording toolbar can flash a confirmation.
 *
 * On stop, `saveCapturedMarkers` persists the buffer in one batch through
 * the `save-recording-markers` action (same one the web recorder uses).
 * Markers are session-scoped: cancel/local-only paths just discard.
 */

import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface CapturedMarker {
  atMs: number;
  kind: string;
}

const MARKER_KINDS = new Set(["generic", "editor-note", "b-roll", "retake"]);

let markers: CapturedMarker[] = [];
let unlistens: UnlistenFn[] = [];
let lastState = { elapsedMs: 0, paused: false, at: 0 };

async function stopListening(): Promise<void> {
  const current = unlistens;
  unlistens = [];
  for (const unlisten of current) {
    try {
      unlisten();
    } catch {
      // best-effort
    }
  }
}

/** Reset the buffer and start listening. Call when the recording flow starts. */
export async function startMarkerCapture(): Promise<void> {
  await stopListening();
  markers = [];
  lastState = { elapsedMs: 0, paused: false, at: Date.now() };
  unlistens = await Promise.all([
    listen<{ paused: boolean; elapsedMs: number }>(
      "clips:recorder-state",
      (event) => {
        lastState = {
          elapsedMs: Math.max(0, event.payload.elapsedMs ?? 0),
          paused: Boolean(event.payload.paused),
          at: Date.now(),
        };
      },
    ),
    listen<{ kind?: string }>("clips:marker", (event) => {
      // State ticks arrive every 500ms; correct for the time since the
      // last tick unless paused (elapsed is frozen then).
      const drift = lastState.paused ? 0 : Date.now() - lastState.at;
      const atMs = Math.max(0, Math.round(lastState.elapsedMs + drift));
      const rawKind = event.payload?.kind ?? "generic";
      const kind = MARKER_KINDS.has(rawKind) ? rawKind : "generic";
      markers.push({ atMs, kind });
      emit("clips:marker-added", {
        count: markers.length,
        kind,
        atMs,
      }).catch(() => {});
    }),
  ]);
}

/** Take the buffered markers and stop listening. Empties the buffer. */
export function takeCapturedMarkers(): CapturedMarker[] {
  const taken = markers;
  markers = [];
  void stopListening();
  return taken;
}

/** Discard the buffer (cancelled / local-only recordings). */
export function discardCapturedMarkers(): void {
  markers = [];
  void stopListening();
}

/**
 * Persist markers for a finished recording in one batch. Best-effort: a
 * failed save logs a warning and never blocks the recording hand-off.
 */
export async function saveCapturedMarkers(input: {
  serverUrl: string;
  recordingId: string;
  markers: CapturedMarker[];
  authToken?: string;
}): Promise<void> {
  if (input.markers.length === 0) return;
  const url = `${input.serverUrl.replace(/\/+$/, "")}/_agent-native/actions/save-recording-markers`;
  try {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    const token = input.authToken?.trim();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        recordingId: input.recordingId,
        markers: input.markers,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        "[clips-recorder] marker save failed:",
        res.status,
        body.slice(0, 200),
      );
    }
  } catch (err) {
    console.warn("[clips-recorder] marker save failed:", err);
  }
}
