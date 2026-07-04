# Full Editor Integration Plan — Remotion Editor Starter → Clips "Video Projects"

Status: implemented (2026-07-04). Verified: template typecheck, production
build, migration v45, all six actions exercised end-to-end via CLI (including
kept-range import + caption remapping against a seeded trimmed recording),
i18n catalogs in all 11 locales. Not yet possible: rendering/export and
Whisper captioning (deliberately disabled — see Opportunities #3).

## Goal

Clips gets a second, "full" editor: multi-source **video projects** built on the
Remotion Editor Starter (multi-track timeline, canvas, text/solid/image/audio/
caption items, crop, snapping, undo/redo). The existing simple per-recording
editor stays the fast path; a new **"Open in video project"** button lets the
user promote a recording into a new or existing project as one source among
many (more recordings, b-roll, music, captions, text).

## Source codebase

`ProPro_Productions/editor-starter` (Remotion Editor Starter, paid license):

- `<Editor/>` is a self-contained React 19 component (`src/editor/editor.tsx`),
  ~25 nested contexts around a single `useState<EditorState>`, pure reducer
  functions, 50-step undo history. **All imports are relative** — vendoring is
  mechanical.
- Project state = `UndoableState`: `{ tracks[], items{}, assets{}, fps,
  compositionWidth, compositionHeight, deletedAssets[] }`. Persisted (upstream)
  to localStorage; we replace that with SQL.
- Assets carry `remoteUrl` as a first-class field — a Clips recording can be
  injected by URL without re-uploading bytes.
- Upstream backend routes (React Router 7 resource routes): S3 presigned
  upload, OpenAI Whisper captions, Remotion Lambda render/progress, Google
  Fonts info. These do not exist in Clips and are replaced (see below).

## Decisions

| Area | Upstream | In Clips |
| --- | --- | --- |
| Location | `src/editor`, `src/remotion` | `app/video-editor/editor`, `app/video-editor/remotion` (vendored, modified in place) |
| Persistence | localStorage | `clips_video_projects.state_json` via actions; debounced autosave + Cmd+S |
| Asset upload | S3 presigned PUT via `/api/upload` | `POST /api/editor-assets` Nitro route → `uploadFile()` (Builder.io Connect / S3 provider) |
| Recording as source | n/a | Asset `remoteUrl = /api/video/:recordingId` (authed, Range-capable proxy); metadata (duration/width/height/hasAudio) comes from the `recordings` row, no probing |
| Captions | OpenAI Whisper (`/api/captions`) | `FEATURE_CAPTIONING=false`. Captions imported from `recording_transcripts.segments_json` → `CaptionAsset` at import time. (Clips rule: cloud transcription is Builder/Gemini/Groq, never OpenAI.) |
| Rendering/export | Remotion Lambda only | `FEATURE_RENDERING=false` for now (needs a deployed Remotion site + Lambda — an ops project of its own). See Opportunities. |
| Fonts route | `/api/fonts/:name` RR7 loader | `GET /api/editor-fonts/:name` Nitro route serving the vendored fonts DB |
| CSS | own `@import 'tailwindcss'` + `@theme` | strip the tailwind import (Clips already builds Tailwind v4 from `app/global.css`); keep the `editor-starter-*` `@theme` tokens + `@utility` classes in a file imported from `global.css` |
| Root sizing | `h-screen w-screen` | `h-full w-full` inside a full-screen route shell |
| Toaster | own sonner `<Toaster>` | removed — Clips root already mounts sonner |

Dependency happy accidents: Clips already has zod ^4.3.6, sonner ^2, and the
exact Radix packages (`select`, `popover`, `context-menu`) the editor uses.
New deps (pinned to what the vendored code was written against):
`remotion@4.0.463` + `@remotion/{player,media,captions,google-fonts,gif,layout-utils,shapes,rounded-text-box}@4.0.463`,
`mediabunny@1.37.0`, `@tanstack/react-virtual`.

## Data model (additive, migration v45)

```
clips_video_projects
  id TEXT PK, workspace_id, title, state_json TEXT ("{}"),
  pending_imports_json TEXT ("[]"), source_recording_ids TEXT ("[]"),
  duration_ms, created_at, updated_at,
  + ownableColumns() (owner_email, org_id, visibility)
clips_video_project_shares = createSharesTable(...)
```

Registered with `registerShareableResource({ type: "video-project", ... })` so
the framework share dialog/actions work unchanged.

`pending_imports_json` is the server→client handoff: the
`add-recording-to-video-project` action appends a compact descriptor
`{ recordingId, title, videoUrl, durationMs, width, height, hasAudio,
keptRanges?, captions? }`; the editor consumes it on load, builds proper
timeline items with the vendored client-side helpers (`makeVideoItem` etc. own
the item shape — we do not duplicate that logic on the server), then clears it
on the next save.

## Actions

- `create-video-project` — new empty project (ownable insert).
- `list-video-projects` (GET) — `accessFilter`-scoped, column-projected list.
- `get-video-project` (GET) — full state for the editor; `assertAccess` viewer.
- `update-video-project` — title/state/pending-import clearing; `assertAccess` editor.
- `delete-video-project` — `assertAccess` admin.
- `add-recording-to-video-project` — the button's backend: creates the project
  when no `projectId` given, resolves the recording's playable URL + metadata +
  (optionally) transcript captions and kept ranges from `edits_json`, appends a
  pending import. Returns `{ projectId }` for navigation.

## UI

- `app/routes/_app.video-projects._index.tsx` — projects list under the app shell.
- `app/routes/video-projects.$projectId.tsx` — full-screen editor (same
  standalone pattern as `r.$recordingId`), client-only dynamic import of the
  vendored editor, header with back/title/save-state/Share.
- "Open in video project" in `r.$recordingId.tsx` header + the editor
  toolbar's Edit menu → shadcn dialog: pick existing project or create new →
  `add-recording-to-video-project` → navigate.

## Agent parity (four-area checklist)

- Actions above are the agent surface; `state_json` is documented in the new
  `video-projects` skill so the agent can read/patch compositions (`db-patch`
  for surgical JSON edits; `update-video-project` for full saves).
- `use-navigation-state.ts`: `ClipsView` += `video-projects` / `video-project`,
  `projectId` field, path regexes both directions.
- `view-screen`: reports open project id/title/source count.
- `useDbSync` queryKeys += `video-projects`.
- `AGENTS.md` + `.agents/skills/video-projects/SKILL.md`.

## Suggestions & opportunities (not all in this pass)

1. **Respect simple-editor edits on import** *(done in this pass via
   `keptRanges`)* — a recording trimmed in the simple editor imports as its
   kept segments laid sequentially, not the raw full clip.
2. **Transcript → captions** *(done, opt-in at import)* — Clips transcripts map
   1:1 onto `@remotion/captions` `Caption[]`; no Whisper needed.
3. **Export pipeline** — the big one. Options, in effort order:
   a. ffmpeg.wasm single-track flatten (only works for simple compositions);
   b. server-side `@remotion/renderer` on a worker (needs headless Chrome —
      fine for desktop/self-hosted, hard on serverless);
   c. Remotion Lambda (upstream path): deploy site + function, port
      `/api/render` + `/api/progress`, store `REMOTION_AWS_*` via the secrets
      skill. Recommended eventual default for hosted.
   Export should land back as a **new `recordings` row** (like stitching does)
   so sharing/embeds/comments/transcription all work on the result for free.
4. **Agent-driven timeline editing** — the project JSON is pure data and the
   reducers are pure functions; expose a `edit-video-project-timeline` action
   (add text overlay, reorder, retime) so chat can do "add a title card" —
   true agent parity beyond load/save.
5. **B-roll library** — a `media_assets` table (image/audio/video, ownable)
   reusing `uploadFile`, surfaced in the editor's asset panel and to the agent;
   Screen Memory exports and meeting recordings become b-roll sources.
6. **Project templates / brand kits** — intro/outro, lower-thirds, brand
   colors+fonts as seed `state_json`; pairs well with agent generation.
7. **Captions styling presets** — the caption item already supports pages,
   highlight color, strokes; ship 2–3 Clips-branded presets.
8. **Simple-editor improvements** (user's "more on that later"): the vendored
   timeline/waveform components are reusable; longer term the simple editor
   could become a preset "single-clip mode" of the full editor, eliminating
   the second edit model.
9. **Live collaboration** — `real-time-collab` skill (Yjs) fits the project
   JSON; multi-user timeline editing later.
10. **Rendering license** — Remotion itself needs a company license for
    commercial use, and the Editor Starter is per-project licensed source that
    must not be redistributed. **Do not push the vendored `app/video-editor/`
    source to a public repository** — if RambleOn's remote is public, this
    needs a private repo or a submodule/private-package split first.

## Verification

`pnpm typecheck` (template), dev-server boot, manual flow: record → open clip
→ "Open in video project" → new project opens with the clip on the timeline →
edit → autosave → reload → state persists → agent `view-screen` sees it.
