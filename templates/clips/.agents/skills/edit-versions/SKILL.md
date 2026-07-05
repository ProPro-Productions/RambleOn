---
name: edit-versions
description: >-
  Proposed edit versions for Clips recordings — alternative non-destructive
  editsJson sets that live beside the original until the owner accepts or
  rejects them. Use when AI edit synthesis or a human editor hands back a cut
  for review, when applying an accepted version, or when building version
  review UI.
---

# Edit Versions — Propose, Review, Apply

## Why this exists

The one-take workflow ends with someone else (the AI or a human editor)
doing the edit. They must never overwrite the creator's recording state
directly: work comes back as a **version** the owner can watch, compare, and
accept or reject. Accepting is also non-destructive — the previous edits are
archived automatically.

## The model (`clips_edit_versions`)

A version is a complete `editsJson` set (same shape as
`recordings.edits_json`) plus review metadata: `title`, `note` (what changed
and why), `authorEmail`/`authorKind` (`user` | `ai`), `status`, reviewer
stamps. `target_kind` is `recording-edits` today; a video-project composition
variant will extend this table additively later.

Status lifecycle: `proposed` → `accepted` | `rejected`; `superseded` marks
automatic snapshots of the edits that an accepted version replaced.

## Actions

- `propose-edit-version` — editor access; stores the editsJson normalized
  through the same parser playback uses. AI passes `authorKind=ai`.
- `list-edit-versions` (GET) — metadata only, newest first, `status` filter.
- `get-edit-version` (GET) — one version's full editsJson plus the
  recording's `currentEditsJson` for diffing.
- `review-edit-version` — owner/admin only. `decision=accept` applies the
  version to the recording and archives the previous non-empty edits as a
  `superseded` version (so accept is reversible by re-accepting the
  snapshot); `decision=reject` flips status only.

## Rules

- Only `proposed` versions are reviewable; the review records who and when.
- Rejection feedback travels through comments/annotations on the recording
  (optionally anchored to the timestamps in question), not through the
  version row.
- AI edit synthesis (M5) must land its output as a proposed version whenever
  the change is more than trivial — never by mutating `recordings.edits_json`
  directly.
- UI for version review is still to come; until then the agent chat is the
  review surface (list → get → watch via player with proposed edits → review).
