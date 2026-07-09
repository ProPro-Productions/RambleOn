# Clips Onboarding Flow Experiments

Design spec for A/B-testable onboarding flows, synthesized from five source
videos (July 2026 research pass) plus an audit of the current first-run
experience. Each variant is specified screen-by-screen so it can be built and
assigned independently.

Sources:

1. **Aakash Gupta × Kate Syuma** (ex-Head of Growth Design, Miro) — "25 Product
   Designs That Will Make You Jealous" — Loom signup/profiling/invite/trial UI,
   Riverside upgrade panel, forked paths, personalization as multiplier.
2. **Aivars Meijers × Screensdesign** — "How to Build an App Onboarding Flow
   That Converts Like Crazy" — category-analog flows (a $150K/mo voice-recorder
   app), interactive in-onboarding tests, deferred identity capture, funnel-level
   measurement.
3. **Bolt.new workshop w/ Gary Liu** — "Designing a Polished SaaS Onboarding UI"
   — wizard mechanics (one job per screen, many small steps), the non-blocking
   "Finish setup" pill, Doherty-threshold processing states, peak-end effects.
4. **Loom (official)** — Chrome extension capture walkthrough — the 3-click
   capture flow, progressive disclosure in the recorder, post-record share page.
5. **Daniel Andor / Durran** — "Why new SaaS users don't become paying
   customers" — activation audit framework, friction litmus tests, checklist
   discipline, 7-day email arc.

## Current state (baseline / control)

There is **no onboarding layer today**. First-run reduces to:

- `/` redirects to `/library` (`app/routes/_index.tsx`); empty state shows a
  Record CTA (`app/components/library/empty-state.tsx`).
- Framework setup checklist in the agent sidebar; one required step: connect
  storage (`server/plugins/onboarding.ts`), optional AI/OAuth secrets
  (`server/register-secrets.ts`).
- `/record` pre-record panel (`app/components/recorder/pre-record-panel.tsx`):
  mode picker (Screen+Camera default), source, mic/camera, 3-2-1 countdown.
  Storage gates recording start via `StorageSetupCard`.
- Post-record: navigate to `/r/:id`; sharing is a manual button
  (`ShareRecordingPopover`), no celebration, no share prompt.
- **No experiment/assignment mechanism exists** — variant infra is greenfield.

This baseline is the control arm. It is already close to a "no-questions"
flow; the variants below test whether adding structure (guidance,
personalization, deferral surfaces) beats pure absence of structure.

## Activation definition and metrics

Per the Andor framework, activation must be an *experienced output*, not a
completed setup. Instrument two candidate activation events and let cohort
divergence decide which predicts retention:

- **Solo aha:** first recording reaches `ready` with a visible transcript.
- **Team aha:** first share link viewed by someone else.

Funnel events to instrument for every variant (all greenfield):

```txt
signup → recorder_opened → capture_started → capture_completed
       → recording_ready (transcript done) → link_shared → link_viewed
```

Primary metric: **signup → link_viewed within 7 days**. Secondary:
time-from-signup-to-first-ready-recording, D7 return rate, per-step wizard
drop-off (diagnostic only — judge variants on the end-to-end funnel, never on
individual screen conversion; a longer flow that raises aggregate activation
wins).

## Cross-cutting rule: route by entry intent, not one global flow

(Screensdesign finding: urgent-problem arrivals need zero quiz; cold arrivals
tolerate/benefit from personalization.)

- Arrivals via **Chrome extension, `/bug-report`, or a `/record` deep link**
  always get the Express path (Variant A behavior) regardless of assigned
  variant — they came to do a job.
- Cold signups (homepage → `/library`) get their assigned variant.

## Variant A — Express (friction floor)

*Hypothesis: the shortest possible path to a shared recording maximizes
activation. Everything not earning its place between signup and first value is
cut.* (Andor steps 5–7; Loom's 3-click capture.)

1. Signup = SSO/email only. No name, role, team-size, or use-case questions.
2. Post-signup lands directly on **`/record`**, not `/library`. Pre-record
   panel pre-decided: Screen+Camera, default mic/cam, source tabs visible but
   defaulted. One saturated "Start recording" button; device pickers quiet;
   advanced toggles behind an expander (already partially true).
3. If storage is unconfigured, do **not** gate recording start where
   avoidable: record to local scratch first, surface Builder.io Connect at
   *share* time ("Connect storage to get your link") — friction moved after
   value. Where the hosted runtime genuinely requires storage first, keep the
   existing `StorageSetupCard` but with a single primary Connect CTA.
4. Stop → land on `/r/:id` with a **share-first card** (see Modifier M1).
5. No wizard, no checklist, no tour. The agent sidebar checklist remains as-is.

Cheapest to build; also serves as the express path for intent arrivals.

## Variant B — Forked-path personalization (Loom/Miro style)

*Hypothesis: light profiling that visibly personalizes the product lifts
activation more than its step-cost. Personalization was "the multiplier" at
Miro — but only when answers actually change the experience (no white lies).*

Wizard (3 steps max, Hick's Law ≤3 options per step, progress indicator,
static Clips product preview — screen + camera bubble — on the right half of
each step, because Clips is category-explaining):

1. **"How will you use Clips?"** — Work / Education / Personal. Selecting Work
   expands an inline role dropdown (Engineering, Design, Support, Sales, PM)
   in the same step — Loom's contextual combination pattern.
2. **"What will you record most?"** — selectable cards with miniature inline
   SVG mocks (Bolt.new aesthetic-usability): Bug reports & QA / Tutorials &
   demos / Async updates & standups / Meetings.
3. **Land in a personalized library**: empty state seeded per answer — a
   sample clip relevant to the persona, 3–4 in-context starter suggestions
   (FigJam pattern: in-surface strip, hover preview, not a popup checklist),
   and a Record CTA phrased for the use case ("Record your first bug repro").

Answers are written to `application_state` and the agent's voiceContext /
AGENTS.md preferences so AI titles, summaries, and agent behavior genuinely
use them. Every question carries a one-line justification ("used to tailor
your summaries") — the Screensdesign rule; asking the user's *name* on an
early screen cost one measured app ~20% of users.

## Variant C — Guided first recording (activation inside onboarding)

*Hypothesis: making the first recording part of onboarding itself — doing, not
reading — produces the aha before the user can bounce.* (Breath-hold-test /
Momenzo pattern; Gary Liu wizard mechanics; "doing beats watching".)

One-job-per-screen wizard, each screen: eyebrow step counter, one bold
question, one helper line, one filled CTA, Back/Skip as quiet text links:

1. **Account** ("Takes about 30 seconds.")
2. **Name your workspace** (auto-suggested, logo optional).
3. **Permission priming** — one explainer screen with illustration before the
   native screen/mic prompt fires ("Clips needs to see your screen — Chrome
   will ask next"), Enable / Not now. Never fire the OS prompt cold.
4. **Record a 10-second test clip** — embedded recorder, pausable 3-2-1
   countdown, live camera bubble as framing check.
5. **Watch the transcript appear** — Doherty-threshold processing state
   (spinner + typewriter "Transcribing your first clip…"); if >10s, say it
   continues in background. Native transcript first — never block on cleanup.
6. **Done** — personalized ("You're all set, {firstName}!"), confetti
   (peak-end), single CTA "Copy your first link" → share card.

Halfway encouragement pill above the progress bar, absolutely positioned
(zero layout shift). Skipped steps feed the Variant D pill if both ship.

## Variant D — Deferred everything + "Finish setup" pill (Zeigarnik)

*Hypothesis: collecting setup and profiling after activation, through a
visible-but-non-blocking completion surface, beats any up-front wizard.*

1. Signup → straight to `/record` (as Variant A).
2. A **circular-progress pill in the library header** ("Finish setup · 1/5")
   opens an anchored popover with accordion rows. Items complete only via
   their **real action** (no fake-tickable checkboxes), get a green check +
   strikethrough, fill a progress bar, and the pill **removes itself at
   100%** (closure):
   - Install the Chrome extension
   - Connect storage (if still pending) — Builder.io Connect primary
   - Connect your calendar (meetings)
   - Invite a teammate
   - One deferred profiling question ("What will you record most?" — feeds
     personalization late)
3. Checklist discipline (Andor): 3–5 items max, all derived from the
   activation pattern or genuinely-required setup. Slack/Gemini/Groq keys and
   other credentials stay in the agent-sidebar checklist, not here.

This is a second surfacing of the existing framework onboarding-step registry
(`server/plugins/onboarding.ts` pattern) — same data, new UI.

## Modifiers (orthogonal experiments, testable on top of any variant)

**M1 — Share trigger timing.** When the first recording reaches `ready`,
auto-open a share-first card on `/r/:id` (Airbnb-timing: prompt immediately
after value creation; on dismiss, a one-time tooltip points at the persistent
Share button). Card = Loom's post-record hierarchy: dominant **Copy link**
button that morphs to "Link copied!", secondary "Share to space", access
controls (password/expiry) second, editing last. Versus control: manual Share
button only.

**M2 — Share dialog default depth.** Linear's "simple first, then powerful":
variant where the share popover opens with only Copy link + visibility label,
everything else behind "More options". Link invites were the only invite
method that ever performed well at Miro.

**M3 — Invite-in-signup.** Optional skippable "Invite your teammates" step
(emails + copy-link in one screen). Success metric is **team activation of
inviters** and later-invite awareness — not step conversion, which will be
low by design. Never ask before first share in Variants A/C/D.

**M4 — Dogfooded video welcome.** The library empty state plays a short
Clips-recorded welcome clip (camera bubble + screen), per persona when
Variant B data exists. Miro's human-guide experiment only moved activation
once personalized; Kate Syuma explicitly said she'd revisit it now that the
videos can be generated per-persona — Clips can record its own.

**M5 — 7-day activation emails.** Behavior-branched sequence: never-recorded →
deep link into `/record`; recorded-never-shared → "send your first link";
plus one value-framing email, one "stuck? reply" email, one success story.
Four beats, seven days, keyed off funnel events.

## What to build first (infrastructure)

1. **Funnel events** (above) — no variant is interpretable without them.
   Server-side tracking via the framework `tracking` provider pattern.
2. **Assignment**: per-user variant assignment persisted in SQL (an
   `onboarding_experiment` application-state key or a user-settings column so
   the agent can read it), exposure-logged on first onboarding surface render.
   The framework `observability`/experiments skill exists at repo level but is
   not wired into Clips — wire it rather than inventing a parallel mechanism.
3. **Order of building** given effort: A (mostly deletion + landing change) →
   M1/M2 (share triggers, small) → D (pill, reuses onboarding registry) →
   B (wizard + personalization plumbing) → C (largest: embedded recorder step)
   → M3/M4/M5.

## Friction litmus tests (apply to every screen in every variant)

- "Can I collect this later, after the user felt the value?" — usually yes.
- Never ask for invites before the first share exists.
- Never fire a native permission prompt without a priming screen.
- One saturated CTA per screen; escapes are text links.
- Keep deliberate friction only when you can say why you're asking.
- Empty surfaces always point at the next value action, never at features.
