# BodyKaLogic

**Fitness backed by data, not guesswork.**

A single-page, dependency-free web app that tracks your training, your food and your
body composition. It works your numbers out from your body and your goal, shows how it
got there, and tracks whether they are actually working.

No server. No account. No tracking. The only thing that ever touches the network is the
text-recognition engine, downloaded once from a CDN if you choose to import a training
plan from a photo — and even then the image is read on your own machine.

## Live

<https://omja-afk.github.io/bodykalogic/> — open it on your phone and your laptop,
sign in with the same email, and both show the same data.

## Where your data lives

Three layers, in order of authority:

| Layer | Role |
|---|---|
| **Your Supabase project** | The source of truth when you are signed in. One row per user, holding the whole state as JSON, protected by row-level security. |
| **`localStorage`** | An offline cache, not a second database. Every change lands here first and unconditionally; the cloud push is debounced and best-effort. A failed push marks the state dirty and reconnecting flushes it — so a gym with no signal costs you nothing. |
| **A folder you pick** | Optional third copy, as plain JSON with dated backups. Worth having: a free Supabase project pauses after about a week of inactivity. |

Without an account the app still works end to end; it just stays on one device.

## Setting up sync (once)

1. In your Supabase project, open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates one table and the row-level-security policies.
2. Open **Project Settings → API** and copy the **anon / publishable** key.
3. Paste it into `src/config.js` as `anonKey`.

The anon key is public by design — it ships inside every Supabase browser app and
is safe to commit **because** row-level security is on. It identifies the project,
not the person; every query is still checked against the signed-in user. The
`service_role` key is the opposite: it bypasses those policies, so it must never
appear in this repo or in any browser.

By default Supabase emails a confirmation link on sign-up. To skip that while
testing, turn off **Authentication → Sign In / Providers → Confirm email**.

## How the local backup works

On first load the app looks for a previously connected data folder. If it finds one it
reads `bodykalogic-data.json` out of it and you carry on where you left off. If it does not,
it treats you as a new user and runs the onboarding questionnaire.

Three storage tiers, picked automatically by what the browser supports:

| Tier | Requires | Behaviour |
|---|---|---|
| **Folder** | `showDirectoryPicker` (Chrome, Edge, Arc, Brave) | You pick a real folder once. Every change is written to `<folder>/bodykalogic-data.json`, plus a dated snapshot in `<folder>/backups/`. The folder handle is remembered in IndexedDB, so re-opening the site reconnects to the same path. |
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

- **Home** — the entrance. Opens on your dashboard: weight, BMI on a banded scale,
  protein against target, today's session, today's meals, and weight and BMI trends
  side by side. Before you have a profile it leads with a one-card setup instead, and
  the rest of the app stays reachable while you decide. A line from a library of 126
  quotes sits at the top, one a day.
- **Workout plan** — your split, with a gym / home-dumbbells / bodyweight switch at the
  top that re-equips the whole plan. Generated, imported, or written by hand.
- **Diet plan** — seven distinct days built to your calorie and protein targets, with
  diet and cuisine controls at the top and an alternative list on every meal.
- **Today's session** — log sets, reps, weight and RPE against the day's planned session.
- **Nutrition log** — tick off planned meals or log one from a photo and portions.
- **Strength maxes** — max weight and max reps per exercise, estimated one-rep max
  (Epley), full history, and strength curves. New bests are picked up automatically
  from any session you mark complete.
- **Body** — weight, body fat, and tape measurements, with BMI computed for you.
- **Progress** — weekly weight and BMI trends, training volume, calories against
  target, per-exercise strength curves and a 12-week consistency heatmap.
- **Profile & data** — your measurements, primary goal, training setup and food
  preferences, plus an **Energy** panel that shows how your targets are reached
  (BMR → activity → goal) and lets you overrule it: if you have tracked your own
  intake and know your maintenance is 2100 kcal, put that in and the equation steps
  aside. Also a free-text field for injuries or limitations, and folder connection,
  export, import and reset.

## The week

Training days are pinned to weekdays — a five-day plan runs Monday, Tuesday,
Wednesday, Friday, Saturday — so the plan tells you *which day* each session is, and
the days in between are rest days rather than a queue you have fallen behind on. Each
day's weekday is a dropdown, so move them to suit your week. Meal plan days are the
days of the week too: Day 1 is Monday, and today's card is marked.

Imported plans have no weekdays, so those fall back to a rotation: the next session is
the next one in the list, whenever you get to it.

## Setting up

There is no sign-up wall and no wizard standing in front of the app. Home asks for
nine things on a single card — sex, age, height, weight, goal, experience, days a week,
where you train, and what you eat — and builds your plan and week of meals from them.
It takes about twenty seconds, and everything stays editable afterwards in
**Profile & data**. A guided, step-by-step version is there from the same card for
anyone who prefers it.

## Importing an existing plan

Both the plan tabs accept:

- **A photo** — a snap of the sheet your trainer gave you. Text is pulled out with
  Tesseract.js (lazy-loaded from a CDN on first use only); the result lands in an
  editable box before it is parsed, so you can fix OCR mistakes.
- **A file** — `.json` (a BodyKaLogic export), or `.txt` / `.md` / `.csv` of roughly the shape
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

## Swapping anything the app suggests

Nothing it recommends is fixed.

**Every exercise** has a swap list, offered in three tiers — the same movement pattern
first, then the same muscle worked a different way, then the wider muscle group. The
library holds **488 movements**, so a slot in a full gym offers 60–120 alternatives and
a bodyweight-only slot still offers 40+. Switching the gym/home control re-equips the
whole plan in place, keeping the shape of the split.

**Every meal** has one too, drawn from **331 templates** — 79 to 86 per meal slot before
your preferences narrow them. Alternatives are sorted by how close they are to the
calories of the meal they would replace, so a swap does not blow up the day.

## Logging a meal

Three ways into the same editable list of what was on the plate:

- **A photo** — stored with the entry as a record of the meal.
- **Household portions** — tap "2 roti", "1 katori dal", "a palm of chicken". These are
  the units people actually measure in, mapped to grams.
- **Typed** — "2 roti, 1 katori dal, 150g paneer, 1 glass milk" is read directly,
  including Hindi names (dahi, anda, chawal, aloo).

Macros are computed from that list, and every quantity stays editable, so a custom
portion is one number change.

**The photo is a record, not a measurement.** Nothing here is sent anywhere, so there is
no model available to look at the picture and tell you what is on it — the protein and
calorie figures come from the portions you confirm. The quick-tap pills are built to
make that take a few seconds.

## Generated plans

If you have no plan, the app writes one from your answers (age, sex, height, weight,
goal, experience, days per week, available equipment, injuries).

- **Goals** — build muscle, lose fat, body recomposition, get stronger, endurance, or
  general fitness. Each one changes both the training prescription and the calorie
  adjustment.
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
index.html             markup and tab shells
assets/styles.css      all styling, dark by default
src/store.js           persistence: FS Access API, IndexedDB handle, localStorage mirror
src/plan.js            workout plan generation and swapping
src/diet.js            calorie/macro maths and 7-day menu generation
src/data-exercises.js  488 movements, with the swap tiers
src/data-foods.js      130 foods
src/data-meals.js      331 meal templates
src/mealphoto.js       meal photos, household portions, the typed-plate parser
src/parse.js           photo/file/text plan import
src/charts.js          hand-rolled SVG charts
src/ui.js              DOM helpers, toasts, modals
src/state.js           the data model and every mutation
src/views*.js          tab renderers
src/app.js             boot sequence, routing, onboarding
```

## Licence

MIT.
