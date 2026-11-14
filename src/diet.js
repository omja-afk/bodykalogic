/* diet.js — energy maths, 7-day menu generation, meal swapping, and macro
 * calculation for freely-logged food.
 *
 * Targets come from Mifflin-St Jeor BMR, scaled by an activity factor, then
 * adjusted for the goal. Protein is set per kg of bodyweight and the menu is
 * built to actually reach it rather than landing wherever the template falls.
 */
(function (global) {
  'use strict';

  var FD = global.FoodData;

  var ACTIVITY = [
    { id: 'sedentary', label: 'Desk job, little movement',        factor: 1.2 },
    { id: 'light',     label: 'Light — walks, 1–2 sessions/week', factor: 1.375 },
    { id: 'moderate',  label: 'Moderate — training 3–4×/week',    factor: 1.55 },
    { id: 'high',      label: 'High — training 5–6×/week',        factor: 1.725 },
    { id: 'athlete',   label: 'Very high — physical job or 2-a-days', factor: 1.9 }
  ];

  // kcal adjustment and protein g/kg by goal
  var GOAL_ADJ = {
    fat_loss:  { pct: -0.20, protein: 2.2, fatPct: 0.25 },
    muscle:    { pct:  0.10, protein: 2.0, fatPct: 0.25 },
    strength:  { pct:  0.08, protein: 2.0, fatPct: 0.28 },
    endurance: { pct:  0.00, protein: 1.6, fatPct: 0.25 },
    maintain:  { pct:  0.00, protein: 1.8, fatPct: 0.28 }
  };

  // Share of the day's calories per slot.
  var SLOT_SHARE = { breakfast: 0.25, lunch: 0.33, snack: 0.14, dinner: 0.28 };

  function activityFactor(id) {
    var a = ACTIVITY.filter(function (x) { return x.id === id; })[0];
    return a ? a.factor : 1.375;
  }

  /* Mifflin-St Jeor. height in cm, weight in kg. */
  function bmr(profile) {
    var w = Number(profile.weightKg) || 70;
    var h = Number(profile.heightCm) || 170;
    var age = Number(profile.age) || 30;
    var base = (10 * w) + (6.25 * h) - (5 * age);
    return Math.round(profile.sex === 'female' ? base - 161 : base + 5);
  }

  function targets(profile) {
    var b = bmr(profile);
    var tdee = Math.round(b * activityFactor(profile.activity));
    var adj = GOAL_ADJ[profile.goal] || GOAL_ADJ.maintain;
    var kcal = Math.round(tdee * (1 + adj.pct));

    var w = Number(profile.weightKg) || 70;
    var protein = Math.round(adj.protein * w);

    // g/kg and total calories can disagree. 2.2 g/kg on a 68 kg woman eating 1500
    // kcal is 40% of the day's energy from protein — a figure no ordinary meal plan
    // reaches, so the generator would miss it every time and the number would just
    // sit there being wrong. Cap it at 35% of calories, with a 1.4 g/kg floor so
    // the cap can never push protein down to something useless on a hard cut.
    var proteinCap = Math.floor((kcal * 0.35) / 4);
    var proteinFloor = Math.round(1.4 * w);
    protein = Math.max(Math.min(protein, Math.max(proteinCap, proteinFloor)), proteinFloor);

    var fat = Math.round((kcal * adj.fatPct) / 9);
    var carbKcal = kcal - (protein * 4) - (fat * 9);

    // A very aggressive deficit on a heavy lifter can drive carbs negative. Shave
    // fat down to a floor of 0.6 g/kg before letting that happen.
    if (carbKcal < 0) {
      var fatFloor = Math.round(0.6 * w);
      fat = Math.max(fatFloor, fat + Math.ceil(carbKcal / 9));
      carbKcal = Math.max(0, kcal - (protein * 4) - (fat * 9));
    }

    return {
      bmr: b,
      tdee: tdee,
      kcal: kcal,
      protein: protein,
      fat: fat,
      carbs: Math.round(carbKcal / 4),
      waterMl: Math.round(w * 35)
    };
  }

  function bmi(weightKg, heightCm) {
    var h = Number(heightCm) / 100;
    if (!h) return null;
    return Math.round((Number(weightKg) / (h * h)) * 10) / 10;
  }

  function bmiBand(v) {
    if (v == null) return { label: '—', tone: 'muted' };
    if (v < 18.5) return { label: 'Underweight', tone: 'warn' };
    if (v < 25)   return { label: 'Healthy',     tone: 'good' };
    if (v < 30)   return { label: 'Overweight',  tone: 'warn' };
    return { label: 'Obese', tone: 'bad' };
  }

  /* ------------------------------------------------------- macro arithmetic */

  function itemMacros(foodId, qty) {
    var f = FD.food(foodId);
    if (!f) return { kcal: 0, p: 0, c: 0, f: 0 };
    var k = qty / f.per;
    return {
      kcal: f.kcal * k,
      p: f.p * k,
      c: f.c * k,
      f: f.f * k
    };
  }

  function sumMacros(items) {
    return items.reduce(function (acc, it) {
      var m = itemMacros(it.food, it.qty);
      acc.kcal += m.kcal; acc.p += m.p; acc.c += m.c; acc.f += m.f;
      return acc;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
  }

  function roundMacros(m) {
    return {
      kcal: Math.round(m.kcal),
      p: Math.round(m.p * 10) / 10,
      c: Math.round(m.c * 10) / 10,
      f: Math.round(m.f * 10) / 10
    };
  }

  /* Fit a template to a calorie and protein target in two passes.
   *
   * A single pass that scaled everything to the calorie target and then topped up
   * protein overshot the day by ~20%: the top-up added calories nothing gave back.
   * So protein is settled first, against the items that actually carry it, and the
   * energy items are then scaled into whatever calories are left — which lets them
   * shrink when the protein anchor is already heavy.
   */
  function proteinDensity(foodId) {
    var f = FD.food(foodId);
    if (!f || !f.kcal) return 0;
    return (f.p * 4) / f.kcal;   // share of the food's calories coming from protein
  }

  function scaleMeal(template, kcalTarget, proteinTarget) {
    var items = template.items.map(function (it) {
      return { food: it.food, qty: it.qty, scalable: it.scalable };
    });

    var fixed = sumMacros(items.filter(function (i) { return !i.scalable; }));
    var scalable = items.filter(function (i) { return i.scalable; });
    if (!scalable.length) return items;

    // 0.20 is the line that puts dal, chana, rajma and curd on the protein side.
    // At 0.28 they counted as filler and vegetarian plans landed ~11% under target,
    // because the only thing left to scale up was rice.
    var ANCHOR_MIN = 0.20;
    var anchors = scalable.filter(function (i) { return proteinDensity(i.food) >= ANCHOR_MIN; });
    var fillers = scalable.filter(function (i) { return proteinDensity(i.food) < ANCHOR_MIN; });

    // Pass 1 — protein. Scale the anchors to cover what the fixed items don't.
    if (anchors.length && proteinTarget > 0) {
      var anchorP = sumMacros(anchors).p;
      if (anchorP > 0) {
        var wantP = Math.max(0, proteinTarget - fixed.p);
        var pf = Math.max(0.6, Math.min(2.6, wantP / anchorP));
        anchors.forEach(function (it) { it.qty = roundQty(it.food, it.qty * pf); });
      }
    } else {
      // No protein-dense item in this template — treat everything as filler and
      // let the calorie pass do the work.
      fillers = scalable;
      anchors = [];
    }

    // Pass 2 — calories. Everything already committed is spent; fillers take the rest.
    if (fillers.length) {
      var spent = sumMacros(items.filter(function (i) { return fillers.indexOf(i) === -1; })).kcal;
      var fillerKcal = sumMacros(fillers).kcal;
      var remaining = kcalTarget - spent;
      if (fillerKcal > 0) {
        var cf = remaining > 0 ? remaining / fillerKcal : 0.4;
        cf = Math.max(0.4, Math.min(2.0, cf));
        fillers.forEach(function (it) { it.qty = roundQty(it.food, it.qty * cf); });
      }
    } else if (anchors.length) {
      // Protein-only meal (a shake): trim toward the calorie target if far over.
      var over = sumMacros(items).kcal;
      if (over > kcalTarget * 1.25) {
        var tf = Math.max(0.6, kcalTarget / over);
        anchors.forEach(function (it) { it.qty = roundQty(it.food, it.qty * tf); });
      }
    }

    return items;
  }

  /* Portions people can actually serve: whole rotis, 5 g steps on solids. */
  function roundQty(foodId, qty) {
    var f = FD.food(foodId);
    if (!f) return Math.round(qty);
    if (f.unit === 'piece') return Math.max(1, Math.round(qty));
    if (f.unit === 'tbsp') return Math.max(0.5, Math.round(qty * 2) / 2);
    if (qty >= 100) return Math.max(10, Math.round(qty / 10) * 10);
    return Math.max(5, Math.round(qty / 5) * 5);
  }

  /* Final correction. The two passes above only move the items a template marked
   * scalable, so a meal keeps a floor made of its fixed parts — a tablespoon of oil,
   * a banana, 30 g of peanuts. On a big target that floor is invisible; on a 1500
   * kcal cut it put every plan ~40% over.
   *
   * This pass takes the difference out of the energy items and leaves the protein
   * alone. Scaling everything proportionally (the first attempt) hit the calorie
   * target but dragged protein down to 64% of goal — the one macro a deficit is
   * supposed to protect. Protein is only touched as a last resort, once the energy
   * items are already at their floor and the meal is still well over.
   */
  function fitMeal(items, kcalTarget) {
    if (!kcalTarget) return items;

    var FILLER_FLOOR = 0.25;

    for (var pass = 0; pass < 4; pass++) {
      var total = sumMacros(items).kcal;
      if (!total) return items;
      if (total > kcalTarget * 0.9 && total < kcalTarget * 1.1) break;

      var dense = items.filter(function (it) { return proteinDensity(it.food) >= 0.20; });
      var fillers = items.filter(function (it) { return proteinDensity(it.food) < 0.20; });

      var denseKcal = sumMacros(dense).kcal;
      var fillerKcal = sumMacros(fillers).kcal;

      if (fillerKcal > 0) {
        var want = kcalTarget - denseKcal;
        var f = Math.max(FILLER_FLOOR, Math.min(2.4, want / fillerKcal));
        fillers.forEach(function (it) { it.qty = roundQty(it.food, it.qty * f); });
      }

      // Last resort: energy items are at the floor and we are still far over, so
      // the protein itself has to give. Only ever shrinks, never grows.
      var after = sumMacros(items).kcal;
      if (after > kcalTarget * 1.12 && dense.length) {
        var df = Math.max(0.55, kcalTarget / after);
        dense.forEach(function (it) { it.qty = roundQty(it.food, it.qty * df); });
      }
    }
    return items;
  }

  function buildMeal(template, kcalTarget, proteinTarget) {
    var items = scaleMeal(template, kcalTarget, proteinTarget);
    items = fitMeal(items, kcalTarget);
    return {
      templateId: template.id,
      title: template.title,
      slot: template.slot,
      items: items,
      macros: roundMacros(sumMacros(items))
    };
  }

  /* Seven distinct days. Templates are dealt round-robin from a shuffled pool so
   * no day repeats until the pool is exhausted — with the smallest pool (vegan +
   * Indian lunch, two templates) a repeat is unavoidable, and dealing beats
   * random picking there too. */
  function generate(profile, prefs) {
    var t = targets(profile);
    prefs = Object.assign({}, prefs, { goal: profile.goal });
    var days = [];
    var pools = {};
    FD.SLOTS.forEach(function (slot) {
      var pool = FD.mealPool(slot, prefs);
      if (!pool.length) pool = FD.mealPool(slot, { dietPref: prefs.dietPref, cuisine: 'mixed', dislikes: [] });
      if (!pool.length) pool = FD.mealPool(slot, { dietPref: 'nonveg', cuisine: 'mixed', dislikes: [] });
      pools[slot] = rankPool(pool, prefs, seedOf(prefs, slot));
    });

    for (var d = 0; d < 7; d++) {
      var meals = FD.SLOTS.map(function (slot) {
        var pool = pools[slot];
        var tpl = pool[d % pool.length];
        return buildMeal(tpl, t.kcal * SLOT_SHARE[slot], t.protein * SLOT_SHARE[slot]);
      });
      var tot = meals.reduce(function (a, m) {
        a.kcal += m.macros.kcal; a.p += m.macros.p; a.c += m.macros.c; a.f += m.macros.f;
        return a;
      }, { kcal: 0, p: 0, c: 0, f: 0 });
      days.push({ day: d, meals: meals, totals: roundMacros(tot) });
    }

    return {
      dietPref: prefs.dietPref,
      cuisine: prefs.cuisine,
      dislikes: prefs.dislikes || [],
      targets: t,
      days: days,
      source: 'generated',
      updatedAt: Date.now()
    };
  }

  /* How much of a template's energy is protein, at its base portions. */
  function templateDensity(tpl) {
    var m = sumMacros(tpl.items);
    return m.kcal ? (m.p * 4) / m.kcal : 0;
  }

  /* Deal order for the week. Cutting goals get the leanest templates first, because
   * a deficit needs protein-dense meals to be reachable at all; everything else is
   * shuffled for variety. Either way the first seven are distinct. */
  function rankPool(pool, prefs, seed) {
    var shuffled = shuffle(pool, seed);
    if (prefs.goal === 'fat_loss') {
      return shuffled.slice().sort(function (a, b) { return templateDensity(b) - templateDensity(a); });
    }
    return shuffled;
  }

  // Deterministic shuffle, so regenerating with the same prefs is stable but the
  // four slots don't march in lockstep.
  function seedOf(prefs, slot) {
    var s = String(prefs.dietPref) + String(prefs.cuisine) + slot;
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function shuffle(arr, seed) {
    var a = arr.slice(), s = seed || 1;
    function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* Alternatives for one meal: every other template the preferences allow for that
   * slot, nearest in calories first, so a swap does not blow up the day's total. */
  function alternativesForMeal(dietPlan, dayIdx, slotIdx) {
    var day = dietPlan.days[dayIdx];
    if (!day) return [];
    var meal = day.meals[slotIdx];
    if (!meal) return [];
    var prefs = { dietPref: dietPlan.dietPref, cuisine: dietPlan.cuisine, dislikes: dietPlan.dislikes };
    var pool = FD.mealPool(meal.slot, prefs).filter(function (m) { return m.id !== meal.templateId; });
    var target = meal.macros.kcal;
    return pool.map(function (tpl) {
      var built = buildMeal(tpl, target, dietPlan.targets.protein * SLOT_SHARE[meal.slot]);
      return built;
    }).sort(function (a, b) {
      return Math.abs(a.macros.kcal - target) - Math.abs(b.macros.kcal - target);
    });
  }

  function applyMealSwap(dietPlan, dayIdx, slotIdx, built) {
    dietPlan.days[dayIdx].meals[slotIdx] = built;
    var day = dietPlan.days[dayIdx];
    var tot = day.meals.reduce(function (a, m) {
      a.kcal += m.macros.kcal; a.p += m.macros.p; a.c += m.macros.c; a.f += m.macros.f;
      return a;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
    day.totals = roundMacros(tot);
    dietPlan.updatedAt = Date.now();
    dietPlan.source = dietPlan.source === 'generated' ? 'generated+edited' : dietPlan.source;
    return dietPlan;
  }

  /* Recompute a day's totals after a manual portion edit. */
  function recalcMeal(meal) {
    meal.macros = roundMacros(sumMacros(meal.items));
    return meal;
  }

  function recalcDay(day) {
    day.meals.forEach(recalcMeal);
    var tot = day.meals.reduce(function (a, m) {
      a.kcal += m.macros.kcal; a.p += m.macros.p; a.c += m.macros.c; a.f += m.macros.f;
      return a;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
    day.totals = roundMacros(tot);
    return day;
  }

  global.DietGen = {
    ACTIVITY: ACTIVITY,
    GOAL_ADJ: GOAL_ADJ,
    SLOT_SHARE: SLOT_SHARE,
    bmr: bmr,
    targets: targets,
    bmi: bmi,
    bmiBand: bmiBand,
    itemMacros: itemMacros,
    sumMacros: sumMacros,
    roundMacros: roundMacros,
    roundQty: roundQty,
    buildMeal: buildMeal,
    generate: generate,
    alternativesForMeal: alternativesForMeal,
    applyMealSwap: applyMealSwap,
    recalcMeal: recalcMeal,
    recalcDay: recalcDay
  };

}(window));
