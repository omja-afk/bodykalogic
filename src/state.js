/* state.js — the data model, and every mutation that touches it.
 *
 * One object, serialised to JSON. Views read it and call these helpers to change
 * it; nothing else writes. Every mutation ends in save(), which writes the local
 * copy immediately and schedules the push to the account.
 */
(function (global) {
  'use strict';

  var UI = global.UI, DG = global.DietGen;
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
      w.entries.forEach(function (e) { if (!Array.isArray(e.sets)) e.sets = []; });
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
             targetSets: slot.sets, targetReps: slot.reps, sets: [] };
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
        if (entry.pattern === 'cardio') return;
        var sets = entry.sets.filter(function (s) { return Number(s.reps) > 0; });
        if (!sets.length) return;
        var key = liftKey(entry);
        var lift = lifts[key] || (lifts[key] = { key: key, exId: entry.exId || null, name: entry.name, days: [] });
        lift.name = entry.name || lift.name;

        var day = { date: date, best: null, e1rm: 0, topWeight: 0, maxReps: 0, volume: 0, sets: sets.length };
        sets.forEach(function (s) {
          var w = Number(s.weight) || 0, r = Number(s.reps) || 0;
          var est = e1rm(w, r) || 0;
          if (est > day.e1rm) { day.e1rm = est; day.best = { weight: w, reps: r }; }
          if (w > day.topWeight) day.topWeight = w;
          if (r > day.maxReps) day.maxReps = r;
          day.volume += w * r;
        });
        // A bodyweight movement has no weight to rank by; its best set is the
        // one with the most reps.
        if (!day.best) {
          var top = sets.reduce(function (a, s) { return Number(s.reps) > Number(a.reps) ? s : a; });
          day.best = { weight: 0, reps: Number(top.reps) };
        }
        lift.days.push(day);
      });
    });

    return Object.keys(lifts).map(function (k) {
      var lift = lifts[k];
      var weighted = lift.days.some(function (d) { return d.topWeight > 0; });
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
      if (e.pattern === 'cardio') return false;
      var best = Math.max.apply(null, [0].concat(e.sets.map(function (s) { return e1rm(s.weight, s.reps) || 0; })));
      var k = liftKey(e);
      return best > 0 && k in before && best > before[k];
    }).map(function (e) { return e.name; });
  }

  function sessionVolume(session) {
    return session.entries.reduce(function (total, e) {
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
    nutritionTotals: nutritionTotals,
    streak: streak
  };

}(window));
