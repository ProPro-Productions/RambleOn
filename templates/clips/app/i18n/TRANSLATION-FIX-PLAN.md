# Plan: Replace placeholder pseudo-translations in Clips locale files

## Problem

`templates/clips/app/i18n/` contains 10 non-English locale files. In 9 of them,
216 strings per file are **not translated** — they contain the English source
text with a language-specific placeholder marker appended, e.g. in `de-DE.ts`:

```ts
title: "Choose your recorder (Lokalisiert)",
```

Users on those locales see the raw English text plus the marker everywhere in
the recorder and video-editor UI. Additionally, `zh-TW.ts` has no markers but
is **missing the same set of keys entirely** (~55 lines shorter than
`en-US.ts`).

`en-US.ts` is the source of truth. `index.ts` is the locale registry. Neither
of these two files may be modified.

## Marker per file

| File     | Marker (appended to the English text) |
| -------- | ------------------------------------- |
| ar-SA.ts | ` (مترجم)`                            |
| de-DE.ts | ` (Lokalisiert)`                      |
| es-ES.ts | ` (Localizado)`                       |
| fr-FR.ts | ` (Localisé)`                         |
| hi-IN.ts | ` (स्थानीयकृत)`                       |
| ja-JP.ts | ` (ローカライズ済み)`                 |
| ko-KR.ts | ` (현지화됨)`                         |
| pt-BR.ts | ` (Localizado)`                       |
| zh-CN.ts | ` (已本地化)`                         |
| zh-TW.ts | no marker — keys are missing instead  |

## Task

For each of the 9 marker files: replace every marked value with a **proper
translation into that file's language** of the English text that precedes the
marker. For `zh-TW.ts`: add the missing keys (same key set) with proper
Traditional Chinese translations.

## Rules

1. **Translate the English text, drop the marker.** The English source is
   already in the value (everything before the marker), and identical text is
   at the same key path in `en-US.ts`.
2. **Preserve interpolation tokens exactly**: `{{query}}`, `{{name}}`,
   `{{count}}` etc. must appear unchanged in the translation. Example:
   `'No meetings match "{{query}}" (Lokalisiert)'` →
   `'Keine Meetings entsprechen "{{query}}"'`.
3. **Do not confuse UI hints with the marker.** Values like
   `"Split at playhead (S)"` contain a keyboard-shortcut hint `(S)` that MUST
   be kept: `"Am Abspielkopf teilen (S)"`. Only strip the exact marker string
   for that file, nothing else in parentheses.
4. **Quoting**: most values use double quotes; values that themselves contain
   `"` use single quotes (e.g. `de-DE.ts:1286`). Keep whichever quote style
   keeps the file valid TypeScript; follow the existing style of the line.
5. **Match each file's existing tone and terminology.** Read the already-
   translated parts of the same file first and reuse its vocabulary (e.g.
   de-DE uses informal du-form imperatives like "Aktualisiere Builder.io…",
   and established terms like "Aufnahme" for recording). Product names stay
   untranslated: Clips, Builder.io, Loom, Groq, Gemini, Chrome, Slack.
6. **Only touch marked values** (and, for zh-TW, the missing keys). Do not
   reformat, reorder, or "improve" anything else. Never modify `en-US.ts` or
   `index.ts`.
7. Work **one file per step/commit-sized chunk** and run the verification
   below after each file before moving on.

## How to find the work

List every marked line in a file (adjust marker):

```bash
cd templates/clips/app/i18n
grep -n "Lokalisiert" de-DE.ts
```

For zh-TW, diff leaf key paths against en-US with this script (also used for
verification):

```bash
node - <<'EOF'
const fs = require("fs");
function leafPaths(file) {
  const src = fs.readFileSync(file, "utf8");
  // Strip TS bits so it evals as an object literal.
  const body = src
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/const messages(:[^=]+)? = /, "module.exports = ")
    .replace(/\n(export .*|const .*|type .*)$/gms, "");
  const tmp = "/tmp/i18n-eval.js";
  fs.writeFileSync(tmp, body);
  delete require.cache[tmp];
  const obj = require(tmp);
  const out = [];
  (function walk(o, p) {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") walk(v, p ? `${p}.${k}` : k);
      else out.push(p ? `${p}.${k}` : k);
    }
  })(obj, "");
  return out;
}
const en = new Set(leafPaths("en-US.ts"));
for (const f of fs.readdirSync(".").filter((f) => f.endsWith(".ts") && !["en-US.ts", "index.ts"].includes(f))) {
  const loc = new Set(leafPaths(f));
  const missing = [...en].filter((k) => !loc.has(k));
  const extra = [...loc].filter((k) => !en.has(k));
  console.log(f, "missing:", missing.length, "extra:", extra.length);
  if (missing.length) console.log("  ", missing.join("\n   "));
}
EOF
```

(If the eval approach fails on a file, fall back to comparing sorted
`grep -oE '^\s+[A-Za-z0-9_]+:' ` output per section — but report that.)

## Verification (mandatory, per file and at the end)

1. Marker count is zero for every file:
   ```bash
   cd templates/clips/app/i18n
   grep -c "مترجم" ar-SA.ts; grep -c "Lokalisiert" de-DE.ts; \
   grep -c "Localizado" es-ES.ts pt-BR.ts; grep -c "Localisé" fr-FR.ts; \
   grep -c "स्थानीयकृत" hi-IN.ts; grep -c "ローカライズ済み" ja-JP.ts; \
   grep -c "현지화됨" ko-KR.ts; grep -c "已本地化" zh-CN.ts
   ```
   Every count must be 0. (Beware: `已本地化` must not match legitimate
   zh translations — check the remaining hits manually if nonzero.)
2. Key-path parity: the node script above prints `missing: 0 extra: 0` for
   every locale file.
3. Interpolation parity: for every changed key, the set of `{{token}}`
   occurrences equals the set in the `en-US.ts` value.
4. TypeScript still compiles: from `templates/clips` run
   `npx tsc --noEmit -p .` (ignore pre-existing errors unrelated to
   `app/i18n/*`; there should be none from these files).
5. Format the changed files: from the repo root run
   `npx oxfmt templates/clips/app/i18n/*.ts`.

## After all files pass

1. Record the user-facing fix (from `templates/clips`):
   ```bash
   npx agent-native changelog add "All app languages now show real translations in the recorder and editor instead of placeholder labels" --type fixed
   ```
2. Delete this plan file (`app/i18n/TRANSLATION-FIX-PLAN.md`).
3. Do not commit unless the user asks; stay on the current branch. Never add
   Co-Authored-By or agent attribution anywhere.
