/* state.js — the data model, and every mutation that touches it.
 *
 * One object, serialised to JSON. Views read it and call these helpers to change
 * it; nothing else writes. Every mutation ends in save(), which writes the local
 * copy immediately and schedules the push to the account.
 */
(function (global) {
  'use strict';

  var UI = global.UI, DG = global.DietGen, EXD = global.ExerciseData;
  var SCHEMA = 1;

  var state = null;

  function blank() {
    return {
      schema: SCHEMA,
      createdAt: Date.now(),
      profile: {
        name: '', sex: 'male', age: null, heightCm: null, weightKg: null,
        activity: 'moderate', goal: 'muscle', experience: 'beginner',
        daysPerWeek: 4, equipment: 'gym', avoid: [],
        dietPref: 'veg', cuisine: 'indian', dislikes: [],
        targetWeightKg: null,
        tdeeOverride: null,      // your own maintenance figure, if you know it
        healthNotes: ''          // a note to yourself; nothing reads it
      },
      plan: null,
      diet: null,
      workouts: {},     // dateKey -> session
      nutrition: {},    // dateKey -> { meals: [] }
      body: {},         // dateKey -> measurements
      maxes: {},        // no longer written; kept so older data is not dropped
      settings: { onboarded: false }
    };
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /* A session somebody actually used: a set logged, a note written, or marked
   * done. Opening a day used to store an empty one, which then counted as a
   * session and froze that day to the plan as it stood at that moment. */
  function sessionUsed(s) {
    return !!(s.completed || (s.notes && String(s.notes).trim()) ||
              s.entries.some(function (e) { return e.sets && e.sets.length; }));
  }

  /* Conditioning used to be logged in the reps column, which the log filled in
   * from the plan's "12 min" — so a figure there was minutes all along. It now
   * has fields of its own: minutes, and kilometres where there is a distance. */
  function cardioSet(s) {
    if (!isObj(s) || s.minutes !== undefined) return;
    s.minutes = Number(s.reps) > 0 ? Number(s.reps) : '';
    s.km = '';
    delete s.reps;
    delete s.weight;
  }

  /* Bring any older, partial or hand-edited file up to the current shape. A file
   * written by a future version keeps its unknown keys — merging rather than
   * replacing means opening an old build never silently drops data it does not
   * understand. What it does drop is anything in a known slot with the wrong
   * shape, because a view that trusts `plan.days` to be an array would rather
   * have no plan than crash on a broken one. */
  function normalise(raw) {
    var s = blank();
    if (!isObj(raw)) return s;
    var out = Object.assign({}, raw);
    out.schema = SCHEMA;
    out.profile = Object.assign({}, s.profile, isObj(raw.profile) ? raw.profile : {});
    if (!Array.isArray(out.profile.avoid)) out.profile.avoid = [];
    if (!Array.isArray(out.profile.dislikes)) out.profile.dislikes = [];
    out.settings = Object.assign({}, s.settings, isObj(raw.settings) ? raw.settings : {});
    out.createdAt = raw.createdAt || Date.now();

    out.plan = (isObj(raw.plan) && Array.isArray(raw.plan.days)) ? raw.plan : null;
    if (out.plan) {
      out.plan.days = out.plan.days.filter(isObj);
      out.plan.days.forEach(function (d) { if (!Array.isArray(d.slots)) d.slots = []; });
    }
    out.diet = (isObj(raw.diet) && Array.isArray(raw.diet.days) && raw.diet.days.length &&
                raw.diet.days.every(function (d) { return isObj(d) && Array.isArray(d.meals) && isObj(d.totals); }))
      ? raw.diet : null;

    out.workouts = {};
    Object.keys(isObj(raw.workouts) ? raw.workouts : {}).forEach(function (k) {
      var w = raw.workouts[k];
      if (!isObj(w) || !Array.isArray(w.entries)) return;
      w.entries = w.entries.filter(isObj);
      w.entries.forEach(function (e) {
        if (!Array.isArray(e.sets)) e.sets = [];
        if (EXD.kindOf(e).measure === 'cardio') e.sets.forEach(cardioSet);
      });
      if (sessionUsed(w)) out.workouts[k] = w;
    });

    out.nutrition = {};
    Object.keys(isObj(raw.nutrition) ? raw.nutrition : {}).forEach(function (k) {
      var n = raw.nutrition[k];
      if (!isObj(n) || !Array.isArray(n.meals)) return;
      n.meals = n.meals.filter(function (m) { return isObj(m) && isObj(m.macros); });
      n.meals.forEach(function (m) { if (!Array.isArray(m.items)) m.items = []; });
      if (n.meals.length) out.nutrition[k] = n;
    });

    out.body = {};
    Object.keys(isObj(raw.body) ? raw.body : {}).forEach(function (k) {
      if (isObj(raw.body[k]) && /^\d{4}-\d{2}-\d{2}$/.test(k)) out.body[k] = raw.body[k];
    });

    out.maxes = {};
    Object.keys(isObj(raw.maxes) ? raw.maxes : {}).forEach(function (k) {
      var m = raw.maxes[k];
      if (!isObj(m) || !Array.isArray(m.records)) return;
      m.records = m.records.filter(function (r) { return isObj(r) && r.date; });
      if (m.records.length) out.maxes[k] = m;
    });
    return out;
  }

  /* Does this copy hold anything a person would mind losing? */
  function hasContent(d) {
    if (!isObj(d)) return false;
    return !!(d.settings && d.settings.onboarded) || !!d.plan || !!d.diet ||
           Object.keys(d.workouts || {}).length > 0 ||
           Object.keys(d.nutrition || {}).length > 0 ||
           Object.keys(d.body || {}).length > 0;
  }

  function save() {
    if (!state) return;
    state.updatedAt = Date.now();
    global.Store.save(state);                           // local, immediate, always
    if (global.Sync) global.Sync.schedulePush();        // account, debounced, best-effort
  }

  /* ----------------------------------------------------------- validation */

  /* The three numbers everything else is derived from. Returns what is wrong
   * with them in words, or null when they are usable. */
  function vitalsProblem(age, heightCm, weightKg) {
    if (!age || !heightCm || !weightKg) return 'Age, height and weight are all needed to work out your targets.';
    if (age < 13 || age > 100) return 'Enter an age between 13 and 100.';
    if (heightCm < 100 || heightCm > 230) return 'Enter your height in centimetres, between 100 and 230.';
    if (weightKg < 25 || weightKg > 300) return 'Enter your weight in kilograms, between 25 and 300.';
    return null;
  }

  /* ----------------------------------------------------------- derivations */

  function weighInKeys() {
    return Object.keys(state.body).filter(function (k) { return Number(state.body[k].weightKg) > 0; }).sort();
  }

  function currentWeight() {
    var keys = weighInKeys();
    if (keys.length) return Number(state.body[keys[keys.length - 1]].weightKg);
    return Number(state.profile.weightKg) || null;
  }

  function currentBMI() {
    var w = currentWeight(), h = state.profile.heightCm;
    return (w && h) ? DG.bmi(w, h) : null;
  }

  /* What you weighed on a given day: the last weigh-in up to then, or failing
   * that the earliest one on record, or the weight in the profile. */
  function weightOn(dateKey) {
    var keys = weighInKeys();
    var upTo = keys.filter(function (k) { return k <= dateKey; }).pop() || keys[0];
    if (upTo) return Number(state.body[upTo].weightKg);
    return Number(state.profile.weightKg) || null;
  }

  /* Record a weight against a date, keeping whatever else was measured then. */
  function logWeight(dateKey, kg, notes) {
    var entry = Object.assign({}, state.body[dateKey] || {}, { weightKg: Number(kg) });
    if (notes && !entry.notes) entry.notes = notes;
    state.body[dateKey] = entry;
  }

  /* Targets follow the latest weighing, not the weight typed at sign-up. */
  function targets() {
    var p = Object.assign({}, state.profile);
    var w = currentWeight();
    if (w) p.weightKg = w;
    return DG.targets(p);
  }

  /* Which planned session belongs to a date.
   *
   * Generated plans pin each training day to a weekday, so Tuesday is Pull and
   * the rest days fall where they were designed to. Imported plans have no
   * weekdays, so those fall back to a rotation: day N is the Nth training day
   * since the plan started, which means a missed session shifts the rotation
   * rather than being skipped.
   */
  function plannedDayFor(dateKey) {
    if (!state.plan || !state.plan.days.length) return null;

    var existing = state.workouts[dateKey];
    if (existing && existing.dayIndex != null && state.plan.days[existing.dayIndex]) {
      return { index: existing.dayIndex, day: state.plan.days[existing.dayIndex], rest: false };
    }

    var scheduled = state.plan.days.some(function (d) { return d.weekday != null; });
    if (scheduled) {
      var dow = UI.parseKey(dateKey).getDay();
      for (var i = 0; i < state.plan.days.length; i++) {
        if (state.plan.days[i].weekday === dow) {
          return { index: i, day: state.plan.days[i], rest: false };
        }
      }
      return { index: null, day: null, rest: true };
    }

    var done = Object.keys(state.workouts)
      .filter(function (k) { return k < dateKey && state.workouts[k].completed; })
      .length;
    var idx = done % state.plan.days.length;
    return { index: idx, day: state.plan.days[idx], rest: false };
  }

  /* Which of the seven generated meal days belongs to a date. Day 1 is Monday,
   * so the plan lines up with the week rather than with whenever you signed up. */
  function dietDayIndexFor(dateKey) {
    var dow = UI.parseKey(dateKey).getDay();   // 0 = Sunday
    return (dow + 6) % 7;                      // 0 = Monday
  }

  function dietDayFor(dateKey) {
    if (!state.diet || !state.diet.days.length) return null;
    var i = dietDayIndexFor(dateKey);
    return state.diet.days[i % state.diet.days.length] || null;
  }

  function entryFor(slot) {
    return { exId: slot.exId, name: slot.name, pattern: slot.pattern,
             targetSets: slot.sets, targetReps: slot.reps, rest: slot.rest, sets: [] };
  }

  /* The session for a date: the stored one if there is one, otherwise a fresh
   * one laid out from the plan. A fresh one is NOT stored — looking at a day
   * should not create a record of it. The caller keeps it with keepSession()
   * the first time something is actually logged. */
  function sessionFor(dateKey) {
    var s = state.workouts[dateKey];
    if (s) return s;
    var planned = plannedDayFor(dateKey);
    var pday = planned && planned.day ? planned.day : null;
    return {
      date: dateKey,
      dayIndex: pday ? planned.index : null,
      dayName: pday ? pday.name : 'Rest day',
      entries: pday ? pday.slots.map(entryFor) : [],
      notes: '', completed: false
    };
  }

  function keepSession(session) { state.workouts[session.date] = session; }

  /* The food log for a date, on the same terms: a fresh one is not stored until
   * a meal goes into it, and an emptied one is dropped again. */
  function nutritionFor(dateKey) {
    return state.nutrition[dateKey] || { date: dateKey, meals: [] };
  }

  function keepNutrition(day) {
    if (day.meals.length) state.nutrition[day.date] = day;
    else delete state.nutrition[day.date];
  }

  /* Estimated one-rep max (Epley): the heaviest weight you could probably
   * lift once, worked out from a set of several reps. Accurate enough under
   * about 10 reps. Inputs arrive as whatever a form field held, so they are
   * coerced first — a "1" that is still a string must count as a single. */
  function e1rm(weight, reps) {
    weight = Number(weight); reps = Number(reps);
    if (!(weight > 0) || !(reps > 0)) return null;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
  }

  /* An exercise is the same exercise across sessions if it is the same
   * library movement, or — for one the library does not know — the same name. */
  function liftKey(entry) {
    return entry.exId ? entry.exId : 'name:' + String(entry.name || '').trim().toLowerCase();
  }

  /* Everything the Strength tab shows, worked out from the sets logged in the
   * workout log. Nothing is stored: edit or delete a set on any day and every
   * best and every chart follows.
   *
   * Returns one record per exercise, each with a list of the days it was
   * logged (oldest first) and its all-time bests. */
  function strength() {
    var lifts = {};
    Object.keys(state.workouts).sort().forEach(function (date) {
      state.workouts[date].entries.forEach(function (entry) {
        var kind = EXD.kindOf(entry);
        if (kind.measure === 'cardio') return;
        var sets = entry.sets.filter(function (s) { return Number(s.reps) > 0; });
        if (!sets.length) return;
        // Only a loaded movement counted in reps has a one-rep max. Everything
        // else is ranked by reps, or by seconds for a hold.
        var byLoad = kind.load === 'weight' && !kind.timed;
        var key = liftKey(entry);
        var lift = lifts[key] || (lifts[key] = { key: key, exId: entry.exId || null, name: entry.name, days: [],
                                                 timed: kind.timed, load: kind.load, byLoad: byLoad });
        lift.name = entry.name || lift.name;

        var day = { date: date, best: null, e1rm: 0, topWeight: 0, maxReps: 0, volume: 0, sets: sets.length };
        sets.forEach(function (s) {
          var w = Number(s.weight) || 0, r = Number(s.reps) || 0;
          var est = byLoad ? (e1rm(w, r) || 0) : 0;
          if (est > day.e1rm) { day.e1rm = est; day.best = { weight: w, reps: r }; }
          if (w > day.topWeight) day.topWeight = w;
          if (r > day.maxReps) day.maxReps = r;
          day.volume += w * r;
        });
        // A bodyweight movement has no weight to rank by; its best set is the
        // one with the most reps.
        if (!day.best) {
          var top = sets.reduce(function (a, s) { return Number(s.reps) > Number(a.reps) ? s : a; });
          day.best = { weight: Number(top.weight) || 0, reps: Number(top.reps) };
        }
        lift.days.push(day);
      });
    });

    return Object.keys(lifts).map(function (k) {
      var lift = lifts[k];
      var weighted = lift.byLoad && lift.days.some(function (d) { return d.topWeight > 0; });
      var bestDay = lift.days.reduce(function (a, d) {
        return (weighted ? d.e1rm > a.e1rm : d.maxReps > a.maxReps) ? d : a;
      });
      lift.weighted = weighted;
      lift.e1rm = bestDay.e1rm;
      lift.best = bestDay.best;
      lift.bestDate = bestDay.date;
      lift.topWeight = Math.max.apply(null, lift.days.map(function (d) { return d.topWeight; }));
      lift.maxReps = Math.max.apply(null, lift.days.map(function (d) { return d.maxReps; }));
      lift.lastDate = lift.days[lift.days.length - 1].date;
      return lift;
    });
  }

  /* The all-time best for one plan slot, or null if it has never been logged. */
  function bestFor(slot) {
    var key = liftKey(slot);
    return strength().filter(function (l) { return l.key === key; })[0] || null;
  }

  /* Which exercises in this session beat every earlier day's best. */
  function newRecords(session) {
    var before = {};
    Object.keys(state.workouts).forEach(function (date) {
      if (date >= session.date) return;
      state.workouts[date].entries.forEach(function (e) {
        var k = liftKey(e);
        e.sets.forEach(function (s) {
          before[k] = Math.max(before[k] || 0, e1rm(s.weight, s.reps) || 0);
        });
      });
    });
    return session.entries.filter(function (e) {
      var kind = EXD.kindOf(e);
      if (kind.measure !== 'reps' || kind.load !== 'weight') return false;
      var best = Math.max.apply(null, [0].concat(e.sets.map(function (s) { return e1rm(s.weight, s.reps) || 0; })));
      var k = liftKey(e);
      return best > 0 && k in before && best > before[k];
    }).map(function (e) { return e.name; });
  }

  /* "80 kg × 8", "+10 kg × 6", "12 reps", "45 s". */
  function describeSet(set, timed) {
    var w = Number(set.weight) || 0, r = Number(set.reps) || 0;
    var count = timed ? r + ' s' : (w ? String(r) : r + ' reps');
    return w ? (w % 1 ? w.toFixed(1) : w) + ' kg × ' + count : count;
  }

  /* "6:15 /km" on foot, "24.0 km/h" on a bike or rower. Null until there is
   * both a time and a distance to work it out from. */
  function paceText(minutes, km, dist) {
    minutes = Number(minutes); km = Number(km);
    if (!(minutes > 0) || !(km > 0)) return null;
    if (dist === 'speed') return (km / (minutes / 60)).toFixed(1) + ' km/h';
    var secs = Math.round(minutes * 60 / km);
    return Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2) + ' /km';
  }

  /* "20 min", "25 min · 3.2 km · 7:49 /km". */
  function describeCardio(set, dist) {
    var min = Number(set.minutes) || 0, km = Number(set.km) || 0;
    var pace = paceText(min, km, dist);
    return (min % 1 ? min.toFixed(1) : min) + ' min' + (km ? ' · ' + km + ' km' : '') + (pace ? ' · ' + pace : '');
  }

  /* -------------------------------------------------------- energy burnt */

  /* An estimate of what a session cost, from what was logged in it.
   *
   *   kcal = MET × bodyweight (kg) × hours
   *
   * the standard form, where a MET is the activity's energy cost as a multiple
   * of resting. It is the gross figure — it includes what you would have burnt
   * sitting still for that time — which is how exercise calories are normally
   * quoted, and why Home does not add it back onto the day's food target.
   *
   * Conditioning brings its own minutes and its own MET (by pace, on foot).
   * Lifting has no clock in the log, so its time is rebuilt from the sets: each
   * one is its reps at about three seconds apiece, or the seconds it was held,
   * plus the rest the plan prescribes. A session length typed in by hand
   * replaces that guess. Its MET is 3.5 — the Compendium's figure for ordinary
   * resistance training, rests included — rising towards its 6.0 for vigorous
   * work as the logged RPE climbs above 6.
   *
   * It is good to within about a fifth either way, and says so wherever it is
   * shown. Nothing here is stored except the hand-typed length. */
  var REP_SECONDS = 3;
  var REST_DEFAULT = 90;

  function restFor(session, entry) {
    var rest = entry.rest;
    if (rest == null) {
      // A session laid out before entries carried their rest: ask the plan.
      var day = state.plan && session.dayIndex != null ? state.plan.days[session.dayIndex] : null;
      var slot = day ? day.slots.filter(function (s) { return s.name === entry.name; })[0] : null;
      rest = slot && slot.rest != null ? slot.rest : REST_DEFAULT;
    }
    return Math.min(300, Math.max(0, Number(rest) || 0));
  }

  function sessionBurn(session) {
    var kg = weightOn(session.date);
    var cardioMin = 0, cardioMetMin = 0, liftSec = 0, sets = 0, rpeSum = 0, rpeN = 0;

    session.entries.forEach(function (entry) {
      var kind = EXD.kindOf(entry);
      var rest = restFor(session, entry);
      entry.sets.forEach(function (set) {
        if (kind.measure === 'cardio') {
          var min = Number(set.minutes) || 0;
          if (!(min > 0)) return;
          cardioMin += min;
          cardioMetMin += EXD.cardioMet(entry, min, set.km) * min;
          return;
        }
        var n = Number(set.reps) || 0;
        if (!(n > 0)) return;
        sets++;
        liftSec += (kind.timed ? n : Math.min(120, Math.max(10, n * REP_SECONDS))) + rest;
        if (Number(set.rpe) > 0) { rpeSum += Number(set.rpe); rpeN++; }
      });
    });

    // A typed-in length is the whole session; what is not conditioning is lifting.
    var typed = Number(session.durationMin) > 0 ? Number(session.durationMin) : null;
    var entered = typed != null && sets > 0;
    var liftMin = entered ? Math.max(0, typed - cardioMin) : liftSec / 60;
    var liftMet = rpeN ? Math.min(6, Math.max(3, 3.5 + (rpeSum / rpeN - 6) * 0.75)) : 3.5;
    var metMin = cardioMetMin + liftMet * liftMin;

    return {
      minutes: Math.round(cardioMin + liftMin),
      cardioMinutes: Math.round(cardioMin),
      sets: sets,
      entered: entered,            // the length was typed in, not estimated
      short: entered && typed < cardioMin,   // ...and is less than the conditioning alone
      logged: sets > 0 || cardioMin > 0,
      kcal: kg ? Math.round(kg * metMin / 60) : null,
      weightKg: kg
    };
  }

  /* One conditioning entry on its own, for the figure beside it in the log. */
  function cardioKcal(session, entry, set) {
    var kg = weightOn(session.date), min = Number(set.minutes) || 0;
    if (!kg || !(min > 0)) return null;
    return Math.round(kg * EXD.cardioMet(entry, min, set.km) * min / 60);
  }

  /* Calories burnt in whatever was logged on a day; 0 for a day with nothing. */
  function burnOn(dateKey) {
    var s = state.workouts[dateKey];
    return s ? (sessionBurn(s).kcal || 0) : 0;
  }

  /* The same, added up over the `days` days ending on `dateKey`. */
  function burnOver(dateKey, days) {
    var total = 0;
    for (var i = 0; i < days; i++) total += burnOn(UI.addDays(dateKey, -i));
    return total;
  }

  /* Weight × reps, for loaded movements only. Seconds of a plank or kilos of
   * added bodyweight are not tonnage. */
  function sessionVolume(session) {
    return session.entries.reduce(function (total, e) {
      var kind = EXD.kindOf(e);
      if (kind.measure !== 'reps' || kind.load !== 'weight') return total;
      return total + e.sets.reduce(function (t, s) {
        return t + ((Number(s.weight) || 0) * (Number(s.reps) || 0));
      }, 0);
    }, 0);
  }

  function nutritionTotals(dateKey) {
    var n = state.nutrition[dateKey];
    if (!n) return { kcal: 0, p: 0, c: 0, f: 0 };
    return DG.roundMacros(n.meals.reduce(function (a, m) {
      a.kcal += Number(m.macros.kcal) || 0; a.p += Number(m.macros.p) || 0;
      a.c += Number(m.macros.c) || 0; a.f += Number(m.macros.f) || 0;
      return a;
    }, { kcal: 0, p: 0, c: 0, f: 0 }));
  }

  /* Consecutive days back from today with either a completed session or a
   * logged meal — a streak should survive a rest day that was still tracked.
   * Today not being logged yet does not break it. */
  function streak() {
    var key = UI.todayKey(), n = 0;
    for (var i = 0; i < 400; i++) {
      var w = state.workouts[key], f = state.nutrition[key];
      var active = (w && w.completed) || (f && f.meals.length);
      if (!active) { if (i === 0) { key = UI.addDays(key, -1); continue; } break; }
      n++;
      key = UI.addDays(key, -1);
    }
    return n;
  }

  global.State = {
    blank: blank,
    normalise: normalise,
    hasContent: hasContent,
    get: function () { return state; },
    set: function (s) { state = s; },
    save: save,
    vitalsProblem: vitalsProblem,
    weighInKeys: weighInKeys,
    currentWeight: currentWeight,
    currentBMI: currentBMI,
    weightOn: weightOn,
    logWeight: logWeight,
    targets: targets,
    plannedDayFor: plannedDayFor,
    dietDayIndexFor: dietDayIndexFor,
    dietDayFor: dietDayFor,
    entryFor: entryFor,
    sessionFor: sessionFor,
    keepSession: keepSession,
    nutritionFor: nutritionFor,
    keepNutrition: keepNutrition,
    e1rm: e1rm,
    strength: strength,
    bestFor: bestFor,
    newRecords: newRecords,
    sessionVolume: sessionVolume,
    describeSet: describeSet,
    describeCardio: describeCardio,
    paceText: paceText,
    sessionBurn: sessionBurn,
    cardioKcal: cardioKcal,
    burnOn: burnOn,
    burnOver: burnOver,
    nutritionTotals: nutritionTotals,
    streak: streak
  };

}(window));
