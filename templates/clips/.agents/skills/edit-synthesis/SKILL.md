---
name: edit-synthesis
description: >-
  How the agent synthesizes an edit plan for a recording from its annotations
  (markers, sections, notes), transcript, and comments — then executes the
  low-risk phase as a proposed edit version and routes the rest to the user
  or a human editor. Use when asked to "edit this", "clean this up", "make
  the cut", or after a one-take recording lands with markers.
---

# Edit Synthesis — From One Take To A Plan

## The goal

Clips creators record once and embed editorial intent in the recording:
marker hotkeys (retake / b-roll / editor-note), spoken instructions, sections,
comments. Your job is to read all of it and give them back time — either a
finished low-risk cut, a crisp phased plan, or a clean hand-off to a human
editor. Never require them to re-explain what is already in the recording.

## Inputs — gather in this order

1. `list-annotations` with `includeTranscriptContext=true` — every marker,
   section, note, and comment, each with what was said around it.
2. `get-recording-player-data` — full transcript segments, current
   `editsJson`, duration, chapters.
3. `list-edit-versions` — do not re-propose work that is already pending
   review.

## Interpreting markers

- `retake` at time T: the creator restarted. The cut candidate runs from the
  previous retake marker (or the start of the current attempt — infer the
  restart point from the transcript, e.g. repeated sentences) up to T.
  Repeated-phrase detection in the transcript confirms where the failed take
  began; prefer cutting to just before the repeated phrase's second delivery.
- `b-roll` at T: footage is expected over this moment. Do not cut here;
  record it in the plan with the spoken description (`transcriptContext`).
- `editor-note` at T: an instruction. Read `transcriptContext` — it usually
  IS the instruction ("zoom in here", "speed this part up").
- `generic` at T: meaning comes from context; quote the transcript around it
  in the plan and classify it yourself.
- Sections (`startMs`+`endMs`): treat the label/body/groups as the intent for
  that whole span (e.g. a section grouped "cut-candidate").

## The phased plan

Produce a plan with three phases, each item carrying its anchor timecodes:

1. **Done by me (low risk)** — cuts of retake-marked failed takes, dead air
   and long silences, filler-word removal, obvious false starts. Execute
   these as ONE `propose-edit-version` (title like "Tightened cut",
   `authorKind=ai`, note summarizing every change with timecodes). Never
   mutate `recordings.edits_json` directly for this — the owner accepts or
   rejects the version. Trivial single-trim requests made explicitly in chat
   may use `trim-recording` directly instead.
2. **Needs your call** — ambiguous cuts, tone/pacing choices, script
   incoherence, delivery that sounds unsure enough to re-record. Ask the
   user concise questions, one per item, quoting the transcript. It is fine
   to recommend re-recording a specific span when the material is weak —
   cite why (incoherent structure, hesitant delivery) and give the exact
   range.
3. **For a human editor** — b-roll sourcing/insertion, motion design
   (suggest a video project via `add-recording-to-video-project` for
   multi-source work), color/sound work, anything taste-heavy. Write this
   phase so an editor who has never spoken to the creator can act on it.

Store the plan on the recording as a whole-video annotation:
`add-annotation` with `kind=edit-plan`, `authorKind=ai`, `source=ai`,
`label` = short plan title, `body` = the full markdown plan. Update the same
annotation (`update-annotation`) as phases complete instead of stacking new
plans; resolve it when the work is done.

## Rules

- One proposal, not many micro-edits: batch all low-risk changes into a
  single `propose-edit-version` call so review is one watch-through.
- Quote timecodes as `m:ss` in plan text — they linkify everywhere.
- If markers exist but transcript status is pending, wait/retry before
  synthesizing; the spoken context is most of the signal.
- If the user asked for a full edit but there are no markers and no notes,
  synthesize from transcript alone (silences, fillers, repeated takes) and
  say so in the plan.
- Respect pending review state: if a proposed version already covers a
  change, reference it instead of duplicating it.
