# BodyKaLogic

**Fitness backed by data, not guesswork.**

A single-page, dependency-free web app that tracks your training, your food and your
body composition. It works your numbers out from your body and your goal, shows how it
got there, and tracks whether they are actually working.

Sign in with an email and password and your plan, logs and records follow you to every
device. It works offline too: changes are saved on the device and sync when you reconnect.
No tracking. Photos you import are read on your own machine; the only other thing fetched
from a CDN is the text-recognition engine, once, if you import a plan from a photo.

## The logo

A vintage stamp badge: barbell, circular motto, `EST. 2026`. Black ink rather than
the warm brown alternative, because the UI's accents are cool blues and violets and
a neutral mark inverts cleanly for the dark theme instead of going muddy.

It ships as two files for a reason. The badge carries circular micro-text and a
distressed speckle, and a 16px browser tab keeps none of it — reduced to favicon
size only about 18% of its pixels carry any ink, and the result is a smudge. So the
tab icon is a separate mark drawn from what *does* survive a reduction: the badge's
silhouette, a ringed disc with a barbell struck through it. The disc is filled
rather than outlined so it holds up against a dark tab strip as well as a light one.

`assets/src/badge-master.png` is the full-resolution artwork the two inked PNGs are
generated from.

## Live

<https://omja-afk.github.io/bodykalogic/> — open it on your phone and your laptop,
sign in with the same email, and both show the same data.

## Where your data lives

Three layers, in order of authority:

| Layer | Role |
|---|---|
| **Your Supabase project** | The source of truth. One row per user, holding the whole state as JSON, protected by row-level security. |
| **`localStorage`** | An offline cache, not a second database. Every change lands here first; the push to the account is debounced, retried with backoff, and flushed on reconnect and when the tab is hidden. |
| **An exported file** | Optional copy you keep yourself, via **Export backup**. Worth taking now and again: a free Supabase project pauses after about a week of inactivity. |

The app requires an account when sync is configured. Which copy opens at boot needs no
question in the normal cases: if this device has nothing unsent, the account's copy wins;
if the account has not moved since the device last agreed with it, the device's copy wins.
Only when both changed is the user asked.

## Deploying a change

```bash
./bump-version.sh && git add -A && git commit -m "..." && git push
```

The script stamps every local script and stylesheet in `index.html` with a fresh
`?v=`. GitHub Pages sends `max-age=600` on both the HTML and the assets, and their
ages drift apart — a freshly served page can pair with scripts that are most of
the way through their own window. Stamping ties each asset to the HTML that asked
for it, so that mismatch cannot happen.

It does not shorten the ten minutes. For the first ten minutes after a push you
may still be served the previous build — all of it, consistently. Hard-refresh
(⇧⌘R / Ctrl-F5) if you need the change immediately.

## Setting up sync (once)

1. In your Supabase project, open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates one table and the row-level-security policies.
2. Open **Project Settings → API** and copy the **anon / publishable** key.
3. Paste it into `src/config.js` as `anonKey`.
4. For password-reset links to come back to the app, add its URL under
   **Authentication → URL Configuration → Redirect URLs**.

The anon key is public by design — it ships inside every Supabase browser app and
is safe to commit **because** row-level security is on. It identifies the project,
not the person; every query is still checked against the signed-in user. The
`service_role` key is the opposite: it bypasses those policies, so it must never
appear in this repo or in any browser.

By default Supabase emails a confirmation link on sign-up; the sign-in screen handles
that case. To skip it while testing, turn off **Authentication → Sign In / Providers →
Confirm email**. Passwords must be at least 8 characters.

## Tabs

- **Home** — the entrance. Opens on your dashboard: weight, BMI on a banded scale,
  protein against target, today's session, today's meals, and weight and BMI trends
  side by side. Before you have a profile it leads with a one-card setup instead, and
  the rest of the app stays reachable while you decide. A line from a library of 161
  quotes — training and life positivity — sits at the top, a new one on every visit.
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
- **Profile** — account (sync, change password, sign out), your measurements, primary goal, training setup and food
  preferences, plus an **Energy** panel that shows how your targets are reached
  (BMR → activity → goal) and lets you overrule it: if you have tracked your own
  intake and know your maintenance is 2100 kcal, put that in and the equation steps
  aside. Also a free-text field for injuries or limitations, backup export and
  restore, and deleting your data.

## The week

Training days are pinned to weekdays — a five-day plan runs Monday, Tuesday,
Wednesday, Friday, Saturday — so the plan tells you *which day* each session is, and
the days in between are rest days rather than a queue you have fallen behind on. Each
day's weekday is a dropdown, so move them to suit your week. Meal plan days are the
days of the week too: Day 1 is Monday, and today's card is marked.

Imported plans have no weekdays, so those fall back to a rotation: the next session is
the next one in the list, whenever you get to it.

## Setting up

After signing in there is no wizard standing in front of the app. Home asks for
nine things on a single card — sex, age, height, weight, goal, experience, days a week,
where you train, and what you eat — and builds your plan and week of meals from them.
It takes about twenty seconds, and everything stays editable afterwards in
**Profile**. A guided, step-by-step version is there from the same card for
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
assets/icon-<hash>.ico   tab icon — the badge cropped to its stamp, at 16/32/48/64.
assets/icon-touch-<hash>.png  the same at 180, for an iOS home screen.
assets/src/make-icons.py      rebuilds both from badge-master.png. Each name carries
                       the file's content hash, so a changed icon is a new URL and
                       no cache can hold the old one.
assets/wordmark-*.png  the full badge, light ink and dark ink
src/store.js           local cache: localStorage, export and import
src/auth.js            the signed-out screen: sign in, create account, reset password
src/sync.js            accounts and cross-device sync over Supabase's REST API
src/config.js          project URL and publishable key
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
