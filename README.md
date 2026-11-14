# Forge — gym & diet tracker

A single-page, dependency-free web app that tracks your training, your food and your
body composition, and keeps **all of the data on your own machine** — in a real folder
you choose, as plain JSON you can read, back up, sync or delete yourself.

No server. No account. No network calls. Open `index.html` over `http://localhost` and
it works.

## How the "info path" works

On first load the app looks for a previously connected data folder. If it finds one it
reads `gymtrack-data.json` out of it and you carry on where you left off. If it does not,
it treats you as a new user and runs the onboarding questionnaire.

Three storage tiers, picked automatically by what the browser supports:

| Tier | Requires | Behaviour |
|---|---|---|
| **Folder** | `showDirectoryPicker` (Chrome, Edge, Arc, Brave) | You pick a real folder once. Every change is written to `<folder>/gymtrack-data.json`, plus a dated snapshot in `<folder>/backups/`. The folder handle is remembered in IndexedDB, so re-opening the site reconnects to the same path. |
| **File** | `showSaveFilePicker` (some Safari builds) | Same, but a single JSON file instead of a folder. |
| **Browser** | always | Falls back to `localStorage`. Still persistent, but scoped to the browser — use Export regularly. |

Whichever tier is active, a mirror copy is always kept in `localStorage`, so a revoked
permission or a moved folder never loses your history. Export and Import (JSON) are
always available from the **Profile & Data** tab.

Because the File System Access API needs a secure context, serve the folder rather than
double-clicking the file:

```bash
python3 -m http.server 8080
```

then open <http://localhost:8080>.

## Tabs

- **Dashboard** — today's session, today's meals, current weight/BMI, streak, quick log.
- **Workout Plan** — your split. Generated from your answers, or imported from a photo
  or a file, or written by hand. Editable exercise by exercise.
- **Diet Plan** — a 7-day rotating meal plan built to hit your calorie and protein
  targets, with a different menu each day. Same import flexibility.
- **Today's Log** — log sets, reps, weight and RPE against the day's planned session.
- **Nutrition Log** — tick off planned meals, add anything extra, watch the protein and
  calorie totals against target.
- **Body** — weight, body fat, and tape measurements, with BMI computed for you.
- **Progress** — weekly weight/BMI trend, training volume, per-exercise strength curves,
  personal records and a 12-week consistency heatmap.
- **Profile & Data** — your measurements and goals, plus folder connection, export,
  import and reset.

## Importing an existing plan

Both the plan tabs accept:

- **A photo** — a snap of the sheet your trainer gave you. Text is pulled out with
  Tesseract.js (lazy-loaded from a CDN on first use only); the result lands in an
  editable box before it is parsed, so you can fix OCR mistakes.
- **A file** — `.json` (a Forge export), or `.txt` / `.md` / `.csv` of roughly the shape
  below.
- **Typed text** — paste or type it straight in.

The parser is forgiving about layout. It understands day headers and set notation:

```
Day 1 — Push
Bench Press 4x8 60kg
Incline DB Press 3 x 10 @ 22.5
Overhead Press 4x6
Lateral Raise 3x15 10kg

Day 2 — Pull
Deadlift 4x5 100kg
...
```

Anything it cannot parse is kept as a free-text note on the day rather than dropped.

## Generated plans

If you have no plan, the app writes one from your answers (age, sex, height, weight,
goal, experience, days per week, available equipment, injuries).

- **Training** — full-body A/B/C at 2–3 days, upper/lower at 4, push/pull/legs at 5–6.
  Rep ranges follow the goal: 4–6 for strength, 8–12 for hypertrophy, 12–15 plus
  conditioning for fat loss. Exercises are filtered to the equipment you have and any
  movement you flagged as off-limits.
- **Diet** — Mifflin-St Jeor BMR, scaled by activity level, then adjusted for the goal
  (−20% cutting, +10% lean bulk). Protein is set at 1.8–2.2 g per kg of bodyweight and
  the menu is built to actually reach it; fat is held at ~25% of calories and carbs take
  the remainder. Respects vegetarian, eggetarian, vegan and non-vegetarian preferences,
  and Indian, global or mixed cuisine.

Numbers come from standard equations and are a starting point for a healthy adult, not
medical advice. If you are pregnant, managing a condition, or coming back from an injury,
take the plan to a professional first.

## Layout

```
index.html          markup and tab shells
assets/styles.css   all styling, light + dark
src/store.js        persistence: FS Access API, IndexedDB handle, localStorage mirror
src/data.js         exercise library and food library
src/plan.js         workout plan generation
src/diet.js         calorie/macro maths and 7-day menu generation
src/parse.js        photo/file/text import parsing
src/charts.js       hand-rolled SVG charts
src/ui.js           DOM helpers, toasts, modals
src/views.js        tab renderers
src/app.js          boot sequence, routing, onboarding
```

## Licence

MIT.
