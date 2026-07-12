---
name: annotations
description: >-
  The unified time-anchored annotation layer for Clips recordings — whole-video
  notes, point timestamps (needle markers), and sections, with semantic kinds
  (editor-note, b-roll, retake) and group tags. Use when creating or reading
  editorial intent on a recording, anchoring comments to markers/sections, or
  building timeline/marker UI on top of annotations.
---

# Annotations — Unified Time-Anchored Editorial Intent

## Why this exists

Clips is built around one-take recording: a creator records once and embeds
everything an editor (human or AI) needs *inside* the recording. Annotations
are where that intent lives. One entity covers all three anchor shapes, so the
agent, the UI, and edit synthesis all query a single surface instead of
stitching together comments, markers, and side channels.

## The model (`clips_annotations`)

| Anchor | Fields | Meaning |
| --- | --- | --- |
| Whole video | `startMs` and `endMs` both null | A note about the recording overall |
| Point (timestamp) | `startMs` set, `endMs` null | A needle marker at one moment |
| Section (range) | both set, `endMs > startMs` | A span — can be cut, extracted, exported, grouped |

Semantic `kind` (kebab-case, ≤32 chars) says what the marker *means*:

- `editor-note` — an instruction for whoever edits ("zoom in here").
- `b-roll` — b-roll footage is expected at/over this anchor.
- `retake` — fresh start; the take *before* this point is bad. Edit synthesis
  treats content between the previous retake (or start) and this marker as a
  likely cut.
- `generic` — plain marker, meaning comes from label/body/voice context.
- Custom kinds are allowed (kebab-case) for future shortcut types.

Other fields: `label` (short display text), `body` (longer text), `authorKind`
(`user` | `ai`), `source` (`manual` | `shortcut` | `voice` | `ai` | `import` —
`shortcut` = dropped by a recording hotkey, `voice` = derived from spoken
instructions), `groupsJson` (flat string[] of group tags — tag-like, NOT
hierarchical), `resolved`.

**Not annotations:** splits (edit boundaries live in `editsJson` / project
items) and chapters (viewer-facing navigation, own table). Annotations carry
*intent*; edits carry *state*.

## Actions

- `add-annotation` — create with any anchor shape. Viewer access suffices
  (same bar as commenting). Agent-authored annotations should pass
  `authorKind=ai` and `source=ai`.
- `list-annotations` (GET, read-only) — sorted whole-video-first then by
  `startMs`. **Also merges the recording's comments** into the same shape with
  `entity: "comment"` (kind `comment`, point anchor from `videoTimestampMs`,
  thread fields preserved) so one call returns everything anchored to the
  timeline. Filter with `kind`, `includeComments`, `includeResolved`.
- `update-annotation` — move anchors (`startMs`/`endMs`, `clearAnchor`,
  `clearEnd`), change kind/label/body/groups, set `resolved`. Authors edit
  their own; recording editors edit any.
- `delete-annotation` — same permission rule; comments that referenced the
  annotation survive with their `annotationId` cleared.

Comments attach to annotations via `add-comment --annotationId=<id>`; the
comment inherits the annotation's `startMs` unless `videoTimestampMs` is
passed explicitly. This is how sections "receive comments".

## Inline timecode references

Text bodies (comments, annotation bodies) may contain plain timecodes like
`12:44` or `1:02:33`. They are stored as plain text. UIs linkify them at
render time with the shared parser in `app/lib/timecodes.ts`
(`parseTimecodeRefs`, `formatTimecode`) — every surface must use that parser
so references behave identically everywhere.

## Context

`view-screen` includes up to 100 annotations (id, anchor, kind, label, body,
author, source, resolved) when the user is on a recording. For the full list
with comments merged, call `list-annotations`.

## Rules

- Access is always scoped through the parent recording (`assertAccess` /
  `resolveAccess`); never query `clips_annotations` without it.
- Keep annotation writes atomic — one action call per logical change; rely on
  the refresh-signal/polling path afterwards, no second sync mechanism.
- When synthesizing edits, read annotations together with the transcript: a
  marker's meaning is often completed by what the creator *said* around its
  timestamp (`source: "shortcut"` markers especially).
- Timeline/marker UI (needles, sections, context menus) builds on this layer —
  see the M3 milestone; do not invent parallel marker stores.
