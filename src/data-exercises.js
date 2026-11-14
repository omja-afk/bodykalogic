/* data-exercises.js — the movement library.
 *
 * Every exercise carries a `pattern` and a `primary` muscle. That pairing is what
 * makes "recommend an alternative" work: a swap is any other movement with the same
 * pattern that the user's equipment can actually do. Because every pattern has at
 * least one barbell, one dumbbell and one bodyweight entry, a home-only lifter never
 * hits a dead end.
 *
 * equip tokens: bb barbell | db dumbbell | mc machine | cb cable | bw bodyweight
 *               bn bench | bar pull-up bar | bd band | kb kettlebell
 * tags: joints the movement loads, used to honour "avoid" flags from onboarding.
 */
(function (global) {
  'use strict';

  var EQUIPMENT_PROFILES = {
    gym:     { id: 'gym',     label: 'Full gym',            has: ['bb','db','mc','cb','bw','bn','bar','bd','kb'] },
    home_db: { id: 'home_db', label: 'Home — dumbbells',    has: ['db','bw','bn','bd','kb','bar'] },
    home_bw: { id: 'home_bw', label: 'Home — bodyweight',   has: ['bw','bd'] }
  };

  // name, pattern, primary, equip[], tags[], compound
  var E = [
    // ---- horizontal push
    ['Barbell Bench Press',        'hpush','chest',   ['bb','bn'],   ['shoulder'], 1],
    ['Dumbbell Bench Press',       'hpush','chest',   ['db','bn'],   ['shoulder'], 1],
    ['Incline Barbell Press',      'hpush','chest',   ['bb','bn'],   ['shoulder'], 1],
    ['Incline Dumbbell Press',     'hpush','chest',   ['db','bn'],   ['shoulder'], 1],
    ['Machine Chest Press',        'hpush','chest',   ['mc'],        [],           1],
    ['Push-Up',                    'hpush','chest',   ['bw'],        ['wrist'],    1],
    ['Decline Push-Up',            'hpush','chest',   ['bw'],        ['wrist'],    1],
    ['Dips (Chest Lean)',          'hpush','chest',   ['bw'],        ['shoulder'], 1],
    ['Band Chest Press',           'hpush','chest',   ['bd'],        [],           1],
    ['Cable Fly',                  'fly',  'chest',   ['cb'],        ['shoulder'], 0],
    ['Dumbbell Fly',               'fly',  'chest',   ['db','bn'],   ['shoulder'], 0],
    ['Band Fly',                   'fly',  'chest',   ['bd'],        [],           0],

    // ---- vertical push
    ['Overhead Barbell Press',     'vpush','shoulders',['bb'],       ['shoulder'], 1],
    ['Seated Dumbbell Press',      'vpush','shoulders',['db','bn'],  ['shoulder'], 1],
    ['Arnold Press',               'vpush','shoulders',['db'],       ['shoulder'], 1],
    ['Machine Shoulder Press',     'vpush','shoulders',['mc'],       [],           1],
    ['Pike Push-Up',               'vpush','shoulders',['bw'],       ['wrist','shoulder'], 1],
    ['Band Overhead Press',        'vpush','shoulders',['bd'],       ['shoulder'], 1],

    // ---- horizontal pull
    ['Barbell Row',                'hpull','back',    ['bb'],        ['lower-back'], 1],
    ['Pendlay Row',                'hpull','back',    ['bb'],        ['lower-back'], 1],
    ['One-Arm Dumbbell Row',       'hpull','back',    ['db','bn'],   [],            1],
    ['Chest-Supported Row',        'hpull','back',    ['db','bn'],   [],            1],
    ['Seated Cable Row',           'hpull','back',    ['cb'],        [],            1],
    ['Machine Row',                'hpull','back',    ['mc'],        [],            1],
    ['Inverted Row',               'hpull','back',    ['bw','bar'],  [],            1],
    ['Band Row',                   'hpull','back',    ['bd'],        [],            1],

    // ---- vertical pull
    ['Pull-Up',                    'vpull','back',    ['bw','bar'],  ['shoulder'],  1],
    ['Chin-Up',                    'vpull','back',    ['bw','bar'],  ['shoulder'],  1],
    ['Lat Pulldown',               'vpull','back',    ['cb','mc'],   [],            1],
    ['Assisted Pull-Up',           'vpull','back',    ['mc'],        ['shoulder'],  1],
    ['Band Lat Pulldown',          'vpull','back',    ['bd'],        [],            1],
    ['Dumbbell Pullover',          'vpull','back',    ['db','bn'],   ['shoulder'],  0],

    // ---- squat
    ['Back Squat',                 'squat','quads',   ['bb'],        ['knee','lower-back'], 1],
    ['Front Squat',                'squat','quads',   ['bb'],        ['knee','wrist'],      1],
    ['Goblet Squat',               'squat','quads',   ['db','kb'],   ['knee'],      1],
    ['Hack Squat',                 'squat','quads',   ['mc'],        ['knee'],      1],
    ['Leg Press',                  'squat','quads',   ['mc'],        ['knee'],      1],
    ['Bodyweight Squat',           'squat','quads',   ['bw'],        ['knee'],      1],
    ['Bulgarian Split Squat',      'lunge','quads',   ['db','bn'],   ['knee'],      1],
    ['Walking Lunge',              'lunge','quads',   ['db','bw'],   ['knee'],      1],
    ['Reverse Lunge',              'lunge','quads',   ['bw','db'],   ['knee'],      1],
    ['Step-Up',                    'lunge','quads',   ['bw','db','bn'], ['knee'],   1],

    // ---- hinge
    ['Conventional Deadlift',      'hinge','hamstrings',['bb'],      ['lower-back'], 1],
    ['Romanian Deadlift',          'hinge','hamstrings',['bb','db'], ['lower-back'], 1],
    ['Dumbbell RDL',               'hinge','hamstrings',['db'],      ['lower-back'], 1],
    ['Kettlebell Swing',           'hinge','hamstrings',['kb'],      ['lower-back'], 1],
    ['Hip Thrust',                 'hinge','glutes',  ['bb','bn','db'], [],          1],
    ['Glute Bridge',               'hinge','glutes',  ['bw'],        [],            1],
    ['Good Morning',               'hinge','hamstrings',['bb'],      ['lower-back'], 1],
    ['Single-Leg RDL',             'hinge','hamstrings',['bw','db'], [],            1],
    ['Back Extension',             'hinge','lower-back',['bw','bn'], ['lower-back'], 0],

    // ---- hamstring / quad isolation
    ['Leg Curl',                   'ham',  'hamstrings',['mc'],      [],            0],
    ['Nordic Curl',                'ham',  'hamstrings',['bw'],      ['knee'],      0],
    ['Band Leg Curl',              'ham',  'hamstrings',['bd'],      [],            0],
    ['Leg Extension',              'knee', 'quads',    ['mc'],       ['knee'],      0],
    ['Sissy Squat',                'knee', 'quads',    ['bw'],       ['knee'],      0],
    ['Wall Sit',                   'knee', 'quads',    ['bw'],       ['knee'],      0],

    // ---- calves
    ['Standing Calf Raise',        'calf', 'calves',   ['mc','db','bw'], [],         0],
    ['Seated Calf Raise',          'calf', 'calves',   ['mc','db'],  [],            0],
    ['Single-Leg Calf Raise',      'calf', 'calves',   ['bw'],       [],            0],

    // ---- delts
    ['Lateral Raise',              'delt', 'shoulders',['db','cb'],  ['shoulder'],  0],
    ['Band Lateral Raise',         'delt', 'shoulders',['bd'],       ['shoulder'],  0],
    ['Face Pull',                  'delt', 'rear-delts',['cb','bd'], [],            0],
    ['Reverse Fly',                'delt', 'rear-delts',['db','bd','bn'], [],        0],

    // ---- biceps
    ['Barbell Curl',               'biceps','biceps',  ['bb'],       ['wrist'],     0],
    ['Dumbbell Curl',              'biceps','biceps',  ['db'],       [],            0],
    ['Hammer Curl',                'biceps','biceps',  ['db'],       [],            0],
    ['Cable Curl',                 'biceps','biceps',  ['cb'],       [],            0],
    ['Band Curl',                  'biceps','biceps',  ['bd'],       [],            0],
    ['Towel Curl (Isometric)',     'biceps','biceps',  ['bw'],       [],            0],

    // ---- triceps
    ['Close-Grip Bench Press',     'triceps','triceps',['bb','bn'],  ['shoulder','wrist'], 1],
    ['Triceps Pushdown',           'triceps','triceps',['cb'],       ['elbow'],     0],
    ['Overhead Triceps Extension', 'triceps','triceps',['db','cb'],  ['elbow'],     0],
    ['Skull Crusher',              'triceps','triceps',['bb','db','bn'], ['elbow'], 0],
    ['Bench Dip',                  'triceps','triceps',['bw','bn'],  ['shoulder'],  0],
    ['Diamond Push-Up',            'triceps','triceps',['bw'],       ['wrist'],     0],
    ['Band Pushdown',              'triceps','triceps',['bd'],       ['elbow'],     0],

    // ---- traps / forearms
    ['Barbell Shrug',              'trap', 'traps',    ['bb','db'],  [],            0],
    ['Farmer Carry',               'trap', 'traps',    ['db','kb'],  [],            1],

    // ---- core
    ['Plank',                      'core', 'core',     ['bw'],       [],            0],
    ['Side Plank',                 'core', 'core',     ['bw'],       [],            0],
    ['Hanging Leg Raise',          'core', 'core',     ['bw','bar'], ['shoulder'],  0],
    ['Lying Leg Raise',            'core', 'core',     ['bw'],       ['lower-back'],0],
    ['Cable Crunch',               'core', 'core',     ['cb'],       [],            0],
    ['Ab Wheel Rollout',           'core', 'core',     ['bw'],       ['lower-back'],0],
    ['Dead Bug',                   'core', 'core',     ['bw'],       [],            0],
    ['Russian Twist',              'core', 'core',     ['bw','db'],  ['lower-back'],0],
    ['Mountain Climber',           'core', 'core',     ['bw'],       ['wrist'],     0],

    // ---- conditioning
    ['Treadmill Incline Walk',     'cardio','conditioning',['mc'],   [],            0],
    ['Stationary Bike',            'cardio','conditioning',['mc'],   [],            0],
    ['Rowing Machine',             'cardio','conditioning',['mc'],   ['lower-back'],0],
    ['Burpee',                     'cardio','conditioning',['bw'],   ['knee','wrist'],0],
    ['Jump Rope',                  'cardio','conditioning',['bw'],   ['knee'],      0],
    ['Brisk Walk / Jog',           'cardio','conditioning',['bw'],   ['knee'],      0],
    ['High Knees',                 'cardio','conditioning',['bw'],   ['knee'],      0]
  ];

  var EXERCISES = E.map(function (row, i) {
    return {
      id: 'ex' + i,
      name: row[0],
      pattern: row[1],
      primary: row[2],
      equip: row[3],
      tags: row[4],
      compound: !!row[5]
    };
  });

  var byId = {};
  EXERCISES.forEach(function (e) { byId[e.id] = e; });

  var PATTERN_LABEL = {
    hpush: 'Horizontal press', vpush: 'Overhead press', fly: 'Chest isolation',
    hpull: 'Row', vpull: 'Pulldown / pull-up', squat: 'Squat', lunge: 'Lunge / split squat',
    hinge: 'Hip hinge', ham: 'Hamstring curl', knee: 'Quad isolation', calf: 'Calf raise',
    delt: 'Delt isolation', biceps: 'Biceps', triceps: 'Triceps', trap: 'Traps / carry',
    core: 'Core', cardio: 'Conditioning'
  };

  /* Can this movement be done with the equipment on hand?
   *
   * The token list mixes two different ideas, so it is read in three buckets:
   *   HARD  ('bar') — a fixture the movement cannot exist without. A pull-up with
   *                   no bar to hang from is not a pull-up, so this must be present.
   *   SOFT  ('bn')  — a bench. Every bench movement here has a floor variant, so it
   *                   never gates availability; the UI notes the substitution.
   *   rest          — the implements the movement can be loaded with, read as OR.
   *                   'Walking Lunge' ['db','bw'] is doable with dumbbells *or*
   *                   bodyweight; 'Bench Press' ['bb','bn'] needs the barbell.
   *
   * Reading the rest as AND (the first cut of this) quietly broke two things: it
   * dropped bodyweight lunges from home plans, which then backfilled the leg day
   * with a push-up, and it let 'bn' alone satisfy a barbell movement. */
  var HARD = ['bar'];
  var SOFT = ['bn'];

  function available(ex, has) {
    var implements_ = [];
    for (var i = 0; i < ex.equip.length; i++) {
      var tok = ex.equip[i];
      if (SOFT.indexOf(tok) !== -1) continue;
      if (HARD.indexOf(tok) !== -1) {
        if (has.indexOf(tok) === -1) return false;
        continue;
      }
      implements_.push(tok);
    }
    if (!implements_.length) return true;
    return implements_.some(function (tok) { return has.indexOf(tok) !== -1; });
  }

  function profileHas(profileId) {
    var p = EQUIPMENT_PROFILES[profileId] || EQUIPMENT_PROFILES.gym;
    return p.has;
  }

  function pool(profileId, avoid) {
    var has = profileHas(profileId);
    avoid = avoid || [];
    return EXERCISES.filter(function (ex) {
      if (!available(ex, has)) return false;
      if (avoid.some(function (t) { return ex.tags.indexOf(t) !== -1; })) return false;
      return true;
    });
  }

  /* Alternatives for one slot: same pattern first, then same primary muscle as a
   * fallback, always within the available pool and never a duplicate of what is
   * already in the day. */
  function alternatives(ex, profileId, avoid, excludeIds) {
    if (!ex) return [];
    excludeIds = excludeIds || [];
    var p = pool(profileId, avoid);
    var samePattern = p.filter(function (c) {
      return c.pattern === ex.pattern && c.id !== ex.id && excludeIds.indexOf(c.id) === -1;
    });
    var sameMuscle = p.filter(function (c) {
      return c.primary === ex.primary && c.pattern !== ex.pattern &&
             c.id !== ex.id && excludeIds.indexOf(c.id) === -1;
    });
    return samePattern.concat(sameMuscle);
  }

  global.ExerciseData = {
    EQUIPMENT_PROFILES: EQUIPMENT_PROFILES,
    EXERCISES: EXERCISES,
    PATTERN_LABEL: PATTERN_LABEL,
    byId: function (id) { return byId[id] || null; },
    byName: function (name) {
      var n = String(name || '').trim().toLowerCase();
      return EXERCISES.filter(function (e) { return e.name.toLowerCase() === n; })[0] || null;
    },
    available: available,
    profileHas: profileHas,
    pool: pool,
    alternatives: alternatives,
    AVOID_OPTIONS: [
      { id: 'knee',       label: 'Knees' },
      { id: 'shoulder',   label: 'Shoulders' },
      { id: 'lower-back', label: 'Lower back' },
      { id: 'wrist',      label: 'Wrists' },
      { id: 'elbow',      label: 'Elbows' }
    ]
  };

}(window));
