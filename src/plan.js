/* plan.js — workout plan generation and exercise swapping.
 *
 * A plan is: { equipment, goal, experience, daysPerWeek, days: [ { name, focus,
 * slots: [ { exId, pattern, sets, reps, rest, note } ] } ], source, updatedAt }
 *
 * Slots keep their `pattern` independently of the exercise sitting in them. That is
 * what lets "recommend an alternative" stay sane: swapping never changes what the
 * slot is FOR, only which movement fills it.
 */
(function (global) {
  'use strict';

  var EX = global.ExerciseData;

  /* Prescription by goal. reps is a [low, high] range shown as "8-12". */
  var GOAL_RX = {
    strength:  { compound: { sets: 5, reps: [4, 6],   rest: 180 }, iso: { sets: 3, reps: [8, 10],  rest: 90 },  cardio: 0 },
    muscle:    { compound: { sets: 4, reps: [8, 12],  rest: 120 }, iso: { sets: 3, reps: [10, 15], rest: 75 },  cardio: 1 },
    fat_loss:  { compound: { sets: 3, reps: [12, 15], rest: 60 },  iso: { sets: 3, reps: [15, 20], rest: 45 },  cardio: 2 },
    endurance: { compound: { sets: 3, reps: [15, 20], rest: 45 },  iso: { sets: 2, reps: [15, 20], rest: 45 },  cardio: 2 },
    maintain:  { compound: { sets: 3, reps: [8, 12],  rest: 90 },  iso: { sets: 3, reps: [12, 15], rest: 60 },  cardio: 1 },
    recomp:    { compound: { sets: 4, reps: [8, 12],  rest: 105 }, iso: { sets: 3, reps: [10, 15], rest: 75 },  cardio: 1 }
  };

  var VOLUME = { beginner: 5, intermediate: 6, advanced: 7 };

  /* Holds are prescribed in seconds; the goal only changes how long. */
  var HOLD = { strength: '20-30 s', muscle: '30-45 s', fat_loss: '30-45 s', endurance: '45-60 s',
               maintain: '30-45 s', recomp: '30-45 s' };
  function repsFor(ex, p, goal) {
    return ex.timed ? (HOLD[goal] || HOLD.muscle) : p.reps[0] + '-' + p.reps[1];
  }

  /* Sets, reps and rest for a movement under a goal. Conditioning is one
   * stretch of minutes — "3 × 10-15" of a brisk walk means nothing. */
  function rxFor(ex, goal) {
    var rx = GOAL_RX[goal] || GOAL_RX.muscle;
    if (ex.pattern === 'cardio') {
      return { sets: 1, reps: rx.cardio === 2 ? '20 min' : '12 min', rest: 0 };
    }
    var p = ex.compound ? rx.compound : rx.iso;
    return { sets: p.sets, reps: repsFor(ex, p, goal), rest: p.rest };
  }

  /* Default weekday for each training day, 0 = Sunday. Spread so the rest days
   * fall between sessions rather than all landing at the end of the week. */
  var WEEK_SCHEDULE = {
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6]
  };

  /* Split templates: an ordered list of pattern slots per training day. The
   * generator fills each slot with the best available movement for that pattern. */
  var SPLITS = {
    2: [
      { name: 'Full Body A', focus: 'Full body', patterns: ['squat','hpush','hpull','hinge','core','delt','biceps'] },
      { name: 'Full Body B', focus: 'Full body', patterns: ['hinge','vpush','vpull','lunge','core','triceps','calf'] }
    ],
    3: [
      { name: 'Full Body A', focus: 'Squat focus',    patterns: ['squat','hpush','hpull','core','delt','triceps','calf'] },
      { name: 'Full Body B', focus: 'Hinge focus',    patterns: ['hinge','vpush','vpull','lunge','core','biceps','trap'] },
      { name: 'Full Body C', focus: 'Volume',         patterns: ['lunge','hpush','vpull','ham','fly','delt','core'] }
    ],
    4: [
      { name: 'Upper A', focus: 'Chest & back',       patterns: ['hpush','hpull','vpush','vpull','delt','triceps','biceps'] },
      { name: 'Lower A', focus: 'Quad focus',         patterns: ['squat','hinge','lunge','knee','calf','core','core'] },
      { name: 'Upper B', focus: 'Shoulders & arms',   patterns: ['vpush','vpull','hpush','hpull','fly','biceps','triceps'] },
      { name: 'Lower B', focus: 'Posterior chain',    patterns: ['hinge','squat','ham','lunge','calf','core','core'] }
    ],
    5: [
      { name: 'Push',    focus: 'Chest, shoulders, triceps', patterns: ['hpush','vpush','hpush','fly','delt','triceps','triceps'] },
      { name: 'Pull',    focus: 'Back & biceps',             patterns: ['vpull','hpull','hpull','delt','trap','biceps','biceps'] },
      { name: 'Legs',    focus: 'Quads, hams, calves',       patterns: ['squat','hinge','lunge','ham','knee','calf','core'] },
      { name: 'Upper',   focus: 'Upper body volume',         patterns: ['hpush','vpull','vpush','hpull','fly','biceps','triceps'] },
      { name: 'Lower',   focus: 'Lower body volume',         patterns: ['hinge','squat','lunge','ham','calf','core','core'] }
    ],
    6: [
      { name: 'Push A',  focus: 'Heavy press',   patterns: ['hpush','vpush','fly','delt','triceps','triceps','core'] },
      { name: 'Pull A',  focus: 'Heavy pull',    patterns: ['vpull','hpull','trap','delt','biceps','biceps','core'] },
      { name: 'Legs A',  focus: 'Squat focus',   patterns: ['squat','lunge','knee','ham','calf','core','core'] },
      { name: 'Push B',  focus: 'Volume press',  patterns: ['vpush','hpush','fly','delt','triceps','triceps','core'] },
      { name: 'Pull B',  focus: 'Volume pull',   patterns: ['hpull','vpull','delt','trap','biceps','biceps','core'] },
      { name: 'Legs B',  focus: 'Hinge focus',   patterns: ['hinge','lunge','ham','squat','calf','core','core'] }
    ]
  };

  /* Preference order for picking a movement within a pattern. In a gym we want the
   * loadable barbell/machine option first; at home the dumbbell or bodyweight one. */
  function rank(ex, profileId) {
    var order = profileId === 'gym'
      ? ['bb', 'mc', 'cb', 'db', 'kb', 'bw', 'bd']
      : ['db', 'kb', 'bw', 'bd', 'bb', 'mc', 'cb'];
    var best = 99;
    ex.equip.forEach(function (tok) {
      var i = order.indexOf(tok);
      if (i !== -1 && i < best) best = i;
    });
    return best + (ex.compound ? 0 : 0.5);
  }

  function pickFor(pattern, profileId, avoid, used) {
    var candidates = EX.pool(profileId, avoid).filter(function (e) {
      return e.pattern === pattern && used.indexOf(e.id) === -1;
    });
    if (!candidates.length) {
      // Pattern impossible with this equipment (e.g. 'ham' with nothing but a
      // floor). Fall back to any unused movement for the same muscle group.
      candidates = EX.pool(profileId, avoid).filter(function (e) {
        return used.indexOf(e.id) === -1;
      });
    }
    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return rank(a, profileId) - rank(b, profileId); });
    return candidates[0];
  }

  function generate(profile) {
    var goal = profile.goal || 'muscle';
    var rx = GOAL_RX[goal] || GOAL_RX.muscle;
    var days = Math.min(6, Math.max(2, parseInt(profile.daysPerWeek, 10) || 4));
    var profileId = profile.equipment || 'gym';
    var avoid = profile.avoid || [];
    var count = VOLUME[profile.experience] || 6;

    var template = SPLITS[days];
    var out = template.map(function (day, dayIdx) {
      var used = [];
      var slots = day.patterns.slice(0, count).map(function (pattern) {
        var ex = pickFor(pattern, profileId, avoid, used);
        if (!ex) return null;
        used.push(ex.id);
        var p = rxFor(ex, goal);
        return {
          exId: ex.id,
          name: ex.name,
          pattern: pattern,
          sets: p.sets,
          reps: p.reps,
          rest: p.rest,
          note: ''
        };
      }).filter(Boolean);

      // Conditioning finisher, for goals where it earns its place.
      if (rx.cardio > 0) {
        // Rotate the finisher across the week — the same treadmill walk on all
        // four days is technically correct and nobody sticks to it.
        var cardioPool = EX.pool(profileId, avoid).filter(function (e) { return e.pattern === 'cardio'; });
        var cardio = cardioPool.length ? cardioPool[dayIdx % cardioPool.length] : null;
        if (cardio) {
          var cp = rxFor(cardio, goal);
          slots.push({
            exId: cardio.id,
            name: cardio.name,
            pattern: 'cardio',
            sets: cp.sets,
            reps: cp.reps,
            rest: cp.rest,
            note: 'Finisher — steady, conversational pace'
          });
        }
      }

      var sched = WEEK_SCHEDULE[days] || [];
      return {
        name: day.name, focus: day.focus, slots: slots, notes: '',
        weekday: sched[dayIdx] != null ? sched[dayIdx] : null
      };
    });

    return {
      equipment: profileId,
      goal: goal,
      experience: profile.experience || 'beginner',
      daysPerWeek: days,
      days: out,
      source: 'generated',
      updatedAt: Date.now()
    };
  }

  /* All legal replacements for one slot, excluding movements already in that day. */
  function alternativesForSlot(plan, dayIdx, slotIdx, avoid) {
    var day = plan.days[dayIdx];
    if (!day) return [];
    var slot = day.slots[slotIdx];
    if (!slot) return [];
    var current = EX.byId(slot.exId) || EX.byName(slot.name);
    var exclude = day.slots.map(function (s) { return s.exId; });

    if (!current) {
      // An imported line the library could not place. Its pattern is a guess,
      // so narrowing by it would offer the wrong things with confidence; offer
      // everything the equipment allows instead and let the search do the work.
      return EX.pool(plan.equipment, avoid).filter(function (c) {
        return exclude.indexOf(c.id) === -1;
      }).map(function (c) {
        var copy = Object.create(c);
        copy.tier = 'direct';
        return copy;
      });
    }
    return EX.alternatives(current, plan.equipment, avoid, exclude);
  }

  /* Swap in a specific alternative, or step to the next one in the list. */
  function applySwap(plan, dayIdx, slotIdx, exId) {
    var ex = EX.byId(exId);
    if (!ex) return plan;
    var slot = plan.days[dayIdx].slots[slotIdx];
    var was = EX.byId(slot.exId);
    slot.exId = ex.id;
    slot.name = ex.name;
    slot.pattern = slot.pattern === 'cardio' ? 'cardio' : (was ? slot.pattern : ex.pattern);
    slot.importedAs = null;
    // Prescription follows the movement: an isolation swap for a compound should
    // not inherit 5x5, and a lift swapped for a walk should not keep its reps.
    // Like for like keeps the sets and reps already there — they may be the
    // user's own, or their trainer's.
    if (!was || was.measure !== ex.measure ||
        (ex.measure !== 'cardio' && was.compound !== ex.compound)) {
      var p = rxFor(ex, plan.goal);
      slot.sets = p.sets;
      slot.reps = p.reps;
      slot.rest = p.rest;
    }
    plan.updatedAt = Date.now();
    plan.source = plan.source === 'generated' ? 'generated+edited' : plan.source;
    return plan;
  }

  /* Rebuild a plan for different equipment, keeping the same split shape. Used by
   * the gym/home toggle at the top of the plan tab. */
  function reequip(plan, profileId, avoid) {
    plan.days.forEach(function (day) {
      var used = [];
      day.slots.forEach(function (slot) {
        var cur = EX.byId(slot.exId);
        // A line the library does not know is the user's own. There is no way
        // to tell what equipment it needs, so it stays exactly as written.
        if (!cur) return;
        if (EX.available(cur, EX.profileHas(profileId)) &&
            !avoid.some(function (t) { return cur.tags.indexOf(t) !== -1; })) {
          used.push(cur.id);
          return;
        }
        var repl = pickFor(slot.pattern, profileId, avoid, used);
        if (repl) {
          slot.exId = repl.id;
          slot.name = repl.name;
          used.push(repl.id);
        }
      });
    });
    plan.equipment = profileId;
    plan.updatedAt = Date.now();
    return plan;
  }

  global.PlanGen = {
    GOAL_RX: GOAL_RX,
    repsFor: repsFor,
    rxFor: rxFor,
    generate: generate,
    alternativesForSlot: alternativesForSlot,
    applySwap: applySwap,
    reequip: reequip,
    GOALS: [
      { id: 'muscle',    label: 'Build muscle',            note: 'slight surplus, hypertrophy rep ranges' },
      { id: 'fat_loss',  label: 'Lose fat',                note: '20% deficit, protein held high' },
      { id: 'recomp',    label: 'Body recomposition',      note: 'eat at maintenance, build while leaning out' },
      { id: 'strength',  label: 'Get stronger',            note: 'heavy low-rep work, small surplus' },
      { id: 'endurance', label: 'Endurance / conditioning',note: 'higher reps, more conditioning' },
      { id: 'maintain',  label: 'General fitness',         note: 'stay where you are, stay healthy' }
    ],
    EXPERIENCE: [
      { id: 'beginner',     label: 'Beginner (under 6 months)' },
      { id: 'intermediate', label: 'Intermediate (6 months – 2 years)' },
      { id: 'advanced',     label: 'Advanced (2 years +)' }
    ]
  };

}(window));
