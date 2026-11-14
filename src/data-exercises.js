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
  //
  // Deliberately deep: the swap list for a slot is every movement sharing its
  // pattern plus every other movement for the same muscle, so depth here is what
  // makes "recommend an alternative" useful rather than a choice of three. Each
  // pattern carries barbell, dumbbell, machine, band and bodyweight entries so the
  // home profiles stay as deep as the gym one.
  var E = [
    // ================= horizontal push / chest =================
    ['Barbell Bench Press',          'hpush','chest',['bb','bn'],['shoulder'],1],
    ['Incline Barbell Press',        'hpush','chest',['bb','bn'],['shoulder'],1],
    ['Decline Barbell Press',        'hpush','chest',['bb','bn'],['shoulder'],1],
    ['Close-Grip Bench Press',       'hpush','chest',['bb','bn'],['shoulder','wrist'],1],
    ['Floor Press',                  'hpush','chest',['bb','db'],['shoulder'],1],
    ['Larsen Press',                 'hpush','chest',['bb','bn'],['shoulder'],1],
    ['Spoto Press',                  'hpush','chest',['bb','bn'],['shoulder'],1],
    ['Pin Press',                    'hpush','chest',['bb','bn'],['shoulder'],1],
    ['Dumbbell Bench Press',         'hpush','chest',['db','bn'],['shoulder'],1],
    ['Incline Dumbbell Press',       'hpush','chest',['db','bn'],['shoulder'],1],
    ['Decline Dumbbell Press',       'hpush','chest',['db','bn'],['shoulder'],1],
    ['Neutral-Grip DB Press',        'hpush','chest',['db','bn'],[],1],
    ['Single-Arm DB Floor Press',    'hpush','chest',['db'],[],1],
    ['Squeeze Press',                'hpush','chest',['db','bn'],[],1],
    ['Machine Chest Press',          'hpush','chest',['mc'],[],1],
    ['Incline Machine Press',        'hpush','chest',['mc'],[],1],
    ['Smith Machine Bench Press',    'hpush','chest',['mc','bn'],['shoulder'],1],
    ['Hammer Strength Press',        'hpush','chest',['mc'],[],1],
    ['Cable Chest Press',            'hpush','chest',['cb'],[],1],
    ['Single-Arm Cable Press',       'hpush','chest',['cb'],[],1],
    ['Push-Up',                      'hpush','chest',['bw'],['wrist'],1],
    ['Wide-Grip Push-Up',            'hpush','chest',['bw'],['wrist','shoulder'],1],
    ['Decline Push-Up',              'hpush','chest',['bw'],['wrist'],1],
    ['Incline Push-Up',              'hpush','chest',['bw'],['wrist'],1],
    ['Archer Push-Up',               'hpush','chest',['bw'],['wrist','shoulder'],1],
    ['Tempo Push-Up',                'hpush','chest',['bw'],['wrist'],1],
    ['Deficit Push-Up',              'hpush','chest',['bw'],['wrist','shoulder'],1],
    ['Explosive Push-Up',            'hpush','chest',['bw'],['wrist'],1],
    ['Pseudo Planche Push-Up',       'hpush','chest',['bw'],['wrist','shoulder'],1],
    ['Ring Push-Up',                 'hpush','chest',['bw'],['wrist','shoulder'],1],
    ['Dips (Chest Lean)',            'hpush','chest',['bw'],['shoulder'],1],
    ['Weighted Dip',                 'hpush','chest',['bw','db'],['shoulder'],1],
    ['Band Chest Press',             'hpush','chest',['bd'],[],1],
    ['Band Incline Press',           'hpush','chest',['bd'],[],1],
    ['Banded Push-Up',               'hpush','chest',['bd','bw'],['wrist'],1],
    ['Kettlebell Floor Press',       'hpush','chest',['kb'],[],1],

    // ---- chest isolation
    ['Cable Fly (Mid)',              'fly','chest',['cb'],['shoulder'],0],
    ['Cable Fly (High to Low)',      'fly','chest',['cb'],['shoulder'],0],
    ['Cable Fly (Low to High)',      'fly','chest',['cb'],['shoulder'],0],
    ['Pec Deck',                     'fly','chest',['mc'],['shoulder'],0],
    ['Dumbbell Fly',                 'fly','chest',['db','bn'],['shoulder'],0],
    ['Incline Dumbbell Fly',         'fly','chest',['db','bn'],['shoulder'],0],
    ['Decline Dumbbell Fly',         'fly','chest',['db','bn'],['shoulder'],0],
    ['Floor Fly',                    'fly','chest',['db'],['shoulder'],0],
    ['Band Fly',                     'fly','chest',['bd'],[],0],
    ['Band Crossover',               'fly','chest',['bd'],[],0],
    ['Svend Press',                  'fly','chest',['db'],[],0],
    ['Plate Squeeze',                'fly','chest',['db'],[],0],
    ['Dumbbell Pullover',            'fly','chest',['db','bn'],['shoulder'],0],
    ['Cable Pullover',               'fly','chest',['cb'],['shoulder'],0],
    ['Wall Press Iso-Hold',          'fly','chest',['bw'],[],0],
    ['Ring Fly',                     'fly','chest',['bw'],['shoulder'],0],
    ['Slider Fly',                   'fly','chest',['bw'],['shoulder'],0],
    ['Band Pec Squeeze',             'fly','chest',['bd'],[],0],

    // ================= vertical push / shoulders =================
    ['Overhead Barbell Press',       'vpush','shoulders',['bb'],['shoulder'],1],
    ['Seated Barbell Press',         'vpush','shoulders',['bb','bn'],['shoulder'],1],
    ['Push Press',                   'vpush','shoulders',['bb'],['shoulder'],1],
    ['Behind-the-Neck Press',        'vpush','shoulders',['bb'],['shoulder'],1],
    ['Z-Press',                      'vpush','shoulders',['bb','db'],['lower-back'],1],
    ['Seated Dumbbell Press',        'vpush','shoulders',['db','bn'],['shoulder'],1],
    ['Standing Dumbbell Press',      'vpush','shoulders',['db'],['shoulder'],1],
    ['Arnold Press',                 'vpush','shoulders',['db'],['shoulder'],1],
    ['Single-Arm DB Press',          'vpush','shoulders',['db'],['shoulder'],1],
    ['Neutral-Grip DB Press (OH)',   'vpush','shoulders',['db'],[],1],
    ['Machine Shoulder Press',       'vpush','shoulders',['mc'],[],1],
    ['Smith Machine OHP',            'vpush','shoulders',['mc'],['shoulder'],1],
    ['Cable Overhead Press',         'vpush','shoulders',['cb'],['shoulder'],1],
    ['Landmine Press',               'vpush','shoulders',['bb'],[],1],
    ['Half-Kneeling Landmine Press', 'vpush','shoulders',['bb'],[],1],
    ['Kettlebell Overhead Press',    'vpush','shoulders',['kb'],['shoulder'],1],
    ['Kettlebell Bottoms-Up Press',  'vpush','shoulders',['kb'],['shoulder','wrist'],1],
    ['Pike Push-Up',                 'vpush','shoulders',['bw'],['wrist','shoulder'],1],
    ['Elevated Pike Push-Up',        'vpush','shoulders',['bw'],['wrist','shoulder'],1],
    ['Wall Handstand Hold',          'vpush','shoulders',['bw'],['wrist','shoulder'],1],
    ['Wall Handstand Push-Up',       'vpush','shoulders',['bw'],['wrist','shoulder'],1],
    ['Band Overhead Press',          'vpush','shoulders',['bd'],['shoulder'],1],
    ['Band Single-Arm OH Press',     'vpush','shoulders',['bd'],['shoulder'],1],
    ['Banded Pike Push-Up',          'vpush','shoulders',['bd','bw'],['wrist'],1],
    ['Bradford Press',               'vpush','shoulders',['bb'],['shoulder'],1],

    // ---- delt isolation
    ['Dumbbell Lateral Raise',       'delt','shoulders',['db'],['shoulder'],0],
    ['Cable Lateral Raise',          'delt','shoulders',['cb'],['shoulder'],0],
    ['Machine Lateral Raise',        'delt','shoulders',['mc'],[],0],
    ['Leaning Lateral Raise',        'delt','shoulders',['db'],['shoulder'],0],
    ['Lu Raise',                     'delt','shoulders',['db'],['shoulder'],0],
    ['Band Lateral Raise',           'delt','shoulders',['bd'],['shoulder'],0],
    ['Front Raise',                  'delt','shoulders',['db','bd'],['shoulder'],0],
    ['Plate Front Raise',            'delt','shoulders',['db'],['shoulder'],0],
    ['Cable Front Raise',            'delt','shoulders',['cb'],['shoulder'],0],
    ['Upright Row',                  'delt','shoulders',['bb','db'],['shoulder'],0],
    ['Cable Upright Row',            'delt','shoulders',['cb'],['shoulder'],0],
    ['Face Pull',                    'delt','rear-delts',['cb','bd'],[],0],
    ['Reverse Pec Deck',             'delt','rear-delts',['mc'],[],0],
    ['Reverse Fly',                  'delt','rear-delts',['db','bd','bn'],[],0],
    ['Cable Reverse Fly',            'delt','rear-delts',['cb'],[],0],
    ['Bent-Over Lateral Raise',      'delt','rear-delts',['db'],[],0],
    ['Band Pull-Apart',              'delt','rear-delts',['bd'],[],0],
    ['Prone Y-Raise',                'delt','rear-delts',['bw','db','bn'],[],0],
    ['Prone T-Raise',                'delt','rear-delts',['bw','db','bn'],[],0],
    ['Wall Slide',                   'delt','shoulders',['bw'],[],0],
    ['Scapular Push-Up',             'delt','shoulders',['bw'],['wrist'],0],
    ['Band External Rotation',       'delt','shoulders',['bd'],[],0],

    // ================= horizontal pull / back =================
    ['Barbell Row',                  'hpull','back',['bb'],['lower-back'],1],
    ['Pendlay Row',                  'hpull','back',['bb'],['lower-back'],1],
    ['Yates Row',                    'hpull','back',['bb'],['lower-back'],1],
    ['Underhand Barbell Row',        'hpull','back',['bb'],['lower-back'],1],
    ['T-Bar Row',                    'hpull','back',['bb','mc'],['lower-back'],1],
    ['Landmine Row',                 'hpull','back',['bb'],['lower-back'],1],
    ['Seal Row',                     'hpull','back',['bb','db','bn'],[],1],
    ['One-Arm Dumbbell Row',         'hpull','back',['db','bn'],[],1],
    ['Two-Arm Dumbbell Row',         'hpull','back',['db'],['lower-back'],1],
    ['Chest-Supported DB Row',       'hpull','back',['db','bn'],[],1],
    ['Incline Bench Row',            'hpull','back',['db','bn'],[],1],
    ['Kroc Row',                     'hpull','back',['db','bn'],[],1],
    ['Seated Cable Row',             'hpull','back',['cb'],[],1],
    ['Wide-Grip Cable Row',          'hpull','back',['cb'],[],1],
    ['Single-Arm Cable Row',         'hpull','back',['cb'],[],1],
    ['Machine Row',                  'hpull','back',['mc'],[],1],
    ['Hammer Strength Row',          'hpull','back',['mc'],[],1],
    ['Chest-Supported Machine Row',  'hpull','back',['mc'],[],1],
    ['Inverted Row',                 'hpull','back',['bw','bar'],[],1],
    ['Feet-Elevated Inverted Row',   'hpull','back',['bw','bar'],[],1],
    ['Underhand Inverted Row',       'hpull','back',['bw','bar'],[],1],
    ['Ring Row',                     'hpull','back',['bw','bar'],[],1],
    ['Table Row',                    'hpull','back',['bw'],[],1],
    ['Towel Row (Door)',             'hpull','back',['bw'],[],1],
    ['Band Row',                     'hpull','back',['bd'],[],1],
    ['Band Single-Arm Row',          'hpull','back',['bd'],[],1],
    ['Band Seated Row',              'hpull','back',['bd'],[],1],
    ['Band Bent-Over Row',           'hpull','back',['bd'],['lower-back'],1],
    ['Kettlebell Row',               'hpull','back',['kb'],['lower-back'],1],
    ['Meadows Row',                  'hpull','back',['bb'],['lower-back'],1],

    // ================= vertical pull =================
    ['Pull-Up',                      'vpull','back',['bw','bar'],['shoulder'],1],
    ['Chin-Up',                      'vpull','back',['bw','bar'],['shoulder'],1],
    ['Neutral-Grip Pull-Up',         'vpull','back',['bw','bar'],[],1],
    ['Wide-Grip Pull-Up',            'vpull','back',['bw','bar'],['shoulder'],1],
    ['Weighted Pull-Up',             'vpull','back',['bw','bar','db'],['shoulder'],1],
    ['Negative Pull-Up',             'vpull','back',['bw','bar'],['shoulder'],1],
    ['Scapular Pull-Up',             'vpull','back',['bw','bar'],[],1],
    ['Archer Pull-Up',               'vpull','back',['bw','bar'],['shoulder'],1],
    ['Commando Pull-Up',             'vpull','back',['bw','bar'],['shoulder'],1],
    ['Lat Pulldown',                 'vpull','back',['cb','mc'],[],1],
    ['Wide-Grip Pulldown',           'vpull','back',['cb','mc'],['shoulder'],1],
    ['Close-Grip Pulldown',          'vpull','back',['cb','mc'],[],1],
    ['Reverse-Grip Pulldown',        'vpull','back',['cb','mc'],[],1],
    ['Single-Arm Pulldown',          'vpull','back',['cb'],[],1],
    ['Kneeling Cable Pulldown',      'vpull','back',['cb'],[],1],
    ['Straight-Arm Pulldown',        'vpull','back',['cb'],['shoulder'],0],
    ['Assisted Pull-Up',             'vpull','back',['mc'],['shoulder'],1],
    ['Band Lat Pulldown',            'vpull','back',['bd'],[],1],
    ['Band Assisted Pull-Up',        'vpull','back',['bd','bar','bw'],['shoulder'],1],
    ['Band Straight-Arm Pulldown',   'vpull','back',['bd'],[],0],
    ['Band Pullover',                'vpull','back',['bd'],['shoulder'],0],
    ['Dumbbell Pullover (Lat)',      'vpull','back',['db','bn'],['shoulder'],0],
    ['Door-Frame Lat Pull',          'vpull','back',['bw'],[],1],
    ['Bar Hang',                     'vpull','back',['bw','bar'],['shoulder'],0],

    // ================= squat pattern =================
    ['Back Squat',                   'squat','quads',['bb'],['knee','lower-back'],1],
    ['High-Bar Squat',               'squat','quads',['bb'],['knee','lower-back'],1],
    ['Low-Bar Squat',                'squat','quads',['bb'],['knee','lower-back'],1],
    ['Front Squat',                  'squat','quads',['bb'],['knee','wrist'],1],
    ['Zercher Squat',                'squat','quads',['bb'],['knee','lower-back'],1],
    ['Safety-Bar Squat',             'squat','quads',['bb'],['knee'],1],
    ['Box Squat',                    'squat','quads',['bb','bn'],['knee'],1],
    ['Pause Squat',                  'squat','quads',['bb'],['knee'],1],
    ['Tempo Squat',                  'squat','quads',['bb'],['knee'],1],
    ['Goblet Squat',                 'squat','quads',['db','kb'],['knee'],1],
    ['Dumbbell Front Squat',         'squat','quads',['db'],['knee'],1],
    ['Heels-Elevated Goblet Squat',  'squat','quads',['db','kb'],['knee'],1],
    ['Kettlebell Front Squat',       'squat','quads',['kb'],['knee'],1],
    ['Hack Squat',                   'squat','quads',['mc'],['knee'],1],
    ['Leg Press',                    'squat','quads',['mc'],['knee'],1],
    ['Single-Leg Press',             'squat','quads',['mc'],['knee'],1],
    ['Smith Machine Squat',          'squat','quads',['mc'],['knee'],1],
    ['Belt Squat',                   'squat','quads',['mc'],['knee'],1],
    ['Pendulum Squat',               'squat','quads',['mc'],['knee'],1],
    ['Bodyweight Squat',             'squat','quads',['bw'],['knee'],1],
    ['Prisoner Squat',               'squat','quads',['bw'],['knee'],1],
    ['Tempo Bodyweight Squat',       'squat','quads',['bw'],['knee'],1],
    ['Jump Squat',                   'squat','quads',['bw'],['knee'],1],
    ['Pistol Squat',                 'squat','quads',['bw'],['knee'],1],
    ['Assisted Pistol Squat',        'squat','quads',['bw'],['knee'],1],
    ['Shrimp Squat',                 'squat','quads',['bw'],['knee'],1],
    ['Cossack Squat',                'squat','quads',['bw','db'],['knee'],1],
    ['Sissy Squat (Supported)',      'squat','quads',['bw'],['knee'],1],
    ['Band Squat',                   'squat','quads',['bd'],['knee'],1],
    ['Band Front Squat',             'squat','quads',['bd'],['knee'],1],

    // ================= lunge / split squat =================
    ['Walking Lunge',                'lunge','quads',['db','bw'],['knee'],1],
    ['Reverse Lunge',                'lunge','quads',['bw','db'],['knee'],1],
    ['Forward Lunge',                'lunge','quads',['bw','db'],['knee'],1],
    ['Lateral Lunge',                'lunge','quads',['bw','db'],['knee'],1],
    ['Curtsy Lunge',                 'lunge','quads',['bw','db'],['knee'],1],
    ['Deficit Reverse Lunge',        'lunge','quads',['bw','db'],['knee'],1],
    ['Bulgarian Split Squat',        'lunge','quads',['db','bn'],['knee'],1],
    ['Barbell Bulgarian Split Squat','lunge','quads',['bb','bn'],['knee'],1],
    ['Split Squat',                  'lunge','quads',['bw','db'],['knee'],1],
    ['Barbell Lunge',                'lunge','quads',['bb'],['knee'],1],
    ['Front-Rack Lunge',             'lunge','quads',['bb','db'],['knee'],1],
    ['Step-Up',                      'lunge','quads',['bw','db','bn'],['knee'],1],
    ['High Step-Up',                 'lunge','quads',['bw','db','bn'],['knee'],1],
    ['Lateral Step-Up',              'lunge','quads',['bw','db','bn'],['knee'],1],
    ['Step-Down',                    'lunge','quads',['bw','bn'],['knee'],1],
    ['Smith Machine Lunge',          'lunge','quads',['mc'],['knee'],1],
    ['Kettlebell Lunge',             'lunge','quads',['kb'],['knee'],1],
    ['Jumping Lunge',                'lunge','quads',['bw'],['knee'],1],
    ['Slider Reverse Lunge',         'lunge','quads',['bw'],['knee'],1],
    ['Band Split Squat',             'lunge','quads',['bd'],['knee'],1],
    ['Band Walking Lunge',           'lunge','quads',['bd'],['knee'],1],
    ['Sled Push',                    'lunge','quads',['mc'],['knee'],1],
    ['Wall Sit (Weighted)',          'lunge','quads',['bw','db'],['knee'],0],

    // ================= hinge =================
    ['Conventional Deadlift',        'hinge','hamstrings',['bb'],['lower-back'],1],
    ['Sumo Deadlift',                'hinge','hamstrings',['bb'],['lower-back'],1],
    ['Romanian Deadlift',            'hinge','hamstrings',['bb','db'],['lower-back'],1],
    ['Stiff-Leg Deadlift',           'hinge','hamstrings',['bb'],['lower-back'],1],
    ['Deficit Deadlift',             'hinge','hamstrings',['bb'],['lower-back'],1],
    ['Rack Pull',                    'hinge','hamstrings',['bb'],['lower-back'],1],
    ['Trap-Bar Deadlift',            'hinge','hamstrings',['bb'],['lower-back'],1],
    ['Good Morning',                 'hinge','hamstrings',['bb'],['lower-back'],1],
    ['Dumbbell RDL',                 'hinge','hamstrings',['db'],['lower-back'],1],
    ['Single-Leg RDL',               'hinge','hamstrings',['bw','db'],[],1],
    ['B-Stance RDL',                 'hinge','hamstrings',['db'],['lower-back'],1],
    ['Kettlebell Swing',             'hinge','hamstrings',['kb'],['lower-back'],1],
    ['Kettlebell Deadlift',          'hinge','hamstrings',['kb'],['lower-back'],1],
    ['Cable Pull-Through',           'hinge','glutes',['cb'],[],1],
    ['Band Pull-Through',            'hinge','glutes',['bd'],[],1],
    ['Hip Thrust',                   'hinge','glutes',['bb','bn','db'],[],1],
    ['Single-Leg Hip Thrust',        'hinge','glutes',['bw','bn'],[],1],
    ['Machine Hip Thrust',           'hinge','glutes',['mc'],[],1],
    ['Glute Bridge',                 'hinge','glutes',['bw'],[],1],
    ['Single-Leg Glute Bridge',      'hinge','glutes',['bw'],[],1],
    ['Banded Glute Bridge',          'hinge','glutes',['bd'],[],1],
    ['Frog Pump',                    'hinge','glutes',['bw'],[],0],
    ['Back Extension',               'hinge','lower-back',['bw','bn'],['lower-back'],0],
    ['45-Degree Back Extension',     'hinge','lower-back',['mc'],['lower-back'],0],
    ['Reverse Hyperextension',       'hinge','lower-back',['mc','bn'],['lower-back'],0],
    ['Superman Hold',                'hinge','lower-back',['bw'],['lower-back'],0],
    ['Bird Dog',                     'hinge','lower-back',['bw'],[],0],
    ['Jefferson Curl',               'hinge','lower-back',['db'],['lower-back'],0],
    ['Band Good Morning',            'hinge','hamstrings',['bd'],['lower-back'],1],

    // ================= hamstring isolation =================
    ['Lying Leg Curl',               'ham','hamstrings',['mc'],[],0],
    ['Seated Leg Curl',              'ham','hamstrings',['mc'],[],0],
    ['Standing Leg Curl',            'ham','hamstrings',['mc'],[],0],
    ['Nordic Curl',                  'ham','hamstrings',['bw'],['knee'],0],
    ['Assisted Nordic Curl',         'ham','hamstrings',['bd','bw'],['knee'],0],
    ['Slider Leg Curl',              'ham','hamstrings',['bw'],[],0],
    ['Swiss Ball Leg Curl',          'ham','hamstrings',['bw'],[],0],
    ['Glute-Ham Raise',              'ham','hamstrings',['mc','bw'],['knee'],0],
    ['Band Leg Curl',                'ham','hamstrings',['bd'],[],0],
    ['Cable Leg Curl',               'ham','hamstrings',['cb'],[],0],
    ['Dumbbell Leg Curl',            'ham','hamstrings',['db','bn'],[],0],
    ['Razor Curl',                   'ham','hamstrings',['bw'],['knee'],0],

    // ================= quad isolation =================
    ['Leg Extension',                'knee','quads',['mc'],['knee'],0],
    ['Single-Leg Extension',         'knee','quads',['mc'],['knee'],0],
    ['Sissy Squat',                  'knee','quads',['bw'],['knee'],0],
    ['Reverse Nordic Curl',          'knee','quads',['bw'],['knee'],0],
    ['Wall Sit',                     'knee','quads',['bw'],['knee'],0],
    ['Spanish Squat',                'knee','quads',['bd'],['knee'],0],
    ['Band Leg Extension',           'knee','quads',['bd'],['knee'],0],
    ['Cable Leg Extension',          'knee','quads',['cb'],['knee'],0],
    ['Step-Up Hold',                 'knee','quads',['bw','bn'],['knee'],0],
    ['Terminal Knee Extension',      'knee','quads',['bd'],[],0],

    // ================= calves =================
    ['Standing Calf Raise',          'calf','calves',['mc','db','bw'],[],0],
    ['Seated Calf Raise',            'calf','calves',['mc','db'],[],0],
    ['Smith Machine Calf Raise',     'calf','calves',['mc'],[],0],
    ['Leg Press Calf Raise',         'calf','calves',['mc'],[],0],
    ['Single-Leg Calf Raise',        'calf','calves',['bw'],[],0],
    ['Deficit Calf Raise',           'calf','calves',['bw','db'],[],0],
    ['Donkey Calf Raise',            'calf','calves',['bw','mc'],[],0],
    ['Tibialis Raise',               'calf','calves',['bw'],[],0],
    ['Band Calf Raise',              'calf','calves',['bd'],[],0],
    ['Barbell Calf Raise',           'calf','calves',['bb'],[],0],
    ['Jump Rope Calf Bounce',        'calf','calves',['bw'],['knee'],0],

    // ================= biceps =================
    ['Barbell Curl',                 'biceps','biceps',['bb'],['wrist'],0],
    ['EZ-Bar Curl',                  'biceps','biceps',['bb'],[],0],
    ['Wide-Grip Barbell Curl',       'biceps','biceps',['bb'],['wrist'],0],
    ['Dumbbell Curl',                'biceps','biceps',['db'],[],0],
    ['Alternating DB Curl',          'biceps','biceps',['db'],[],0],
    ['Hammer Curl',                  'biceps','biceps',['db'],[],0],
    ['Cross-Body Hammer Curl',       'biceps','biceps',['db'],[],0],
    ['Incline Dumbbell Curl',        'biceps','biceps',['db','bn'],[],0],
    ['Concentration Curl',           'biceps','biceps',['db','bn'],[],0],
    ['Preacher Curl',                'biceps','biceps',['bb','db','bn'],['elbow'],0],
    ['Spider Curl',                  'biceps','biceps',['db','bn'],[],0],
    ['Drag Curl',                    'biceps','biceps',['bb','db'],[],0],
    ['Zottman Curl',                 'biceps','biceps',['db'],[],0],
    ['Cable Curl',                   'biceps','biceps',['cb'],[],0],
    ['Cable Hammer Curl',            'biceps','biceps',['cb'],[],0],
    ['Bayesian Cable Curl',          'biceps','biceps',['cb'],[],0],
    ['Machine Curl',                 'biceps','biceps',['mc'],[],0],
    ['Band Curl',                    'biceps','biceps',['bd'],[],0],
    ['Band Hammer Curl',             'biceps','biceps',['bd'],[],0],
    ['Towel Curl (Isometric)',       'biceps','biceps',['bw'],[],0],
    ['Chin-Up Hold',                 'biceps','biceps',['bw','bar'],['shoulder'],0],
    ['Backpack Curl',                'biceps','biceps',['bw'],[],0],
    ['Reverse Curl',                 'biceps','forearms',['bb','db'],['wrist'],0],
    ['Cable Reverse Curl',           'biceps','forearms',['cb'],['wrist'],0],
    ['Band Reverse Curl',            'biceps','forearms',['bd'],['wrist'],0],

    // ================= triceps =================
    ['Triceps Pushdown (Bar)',       'triceps','triceps',['cb'],['elbow'],0],
    ['Triceps Pushdown (Rope)',      'triceps','triceps',['cb'],['elbow'],0],
    ['Reverse-Grip Pushdown',        'triceps','triceps',['cb'],['elbow'],0],
    ['Overhead Cable Extension',     'triceps','triceps',['cb'],['elbow'],0],
    ['Overhead DB Extension',        'triceps','triceps',['db'],['elbow'],0],
    ['Single-Arm OH Extension',      'triceps','triceps',['db'],['elbow'],0],
    ['Skull Crusher',                'triceps','triceps',['bb','db','bn'],['elbow'],0],
    ['JM Press',                     'triceps','triceps',['bb','bn'],['elbow'],0],
    ['Close-Grip Floor Press',       'triceps','triceps',['bb','db'],['elbow'],0],
    ['Tate Press',                   'triceps','triceps',['db','bn'],['elbow'],0],
    ['Dumbbell Kickback',            'triceps','triceps',['db'],[],0],
    ['Cable Kickback',               'triceps','triceps',['cb'],[],0],
    ['Machine Triceps Extension',    'triceps','triceps',['mc'],['elbow'],0],
    ['Bench Dip',                    'triceps','triceps',['bw','bn'],['shoulder'],0],
    ['Parallel Bar Dip',             'triceps','triceps',['bw'],['shoulder'],0],
    ['Diamond Push-Up',              'triceps','triceps',['bw'],['wrist'],0],
    ['Close-Grip Push-Up',           'triceps','triceps',['bw'],['wrist'],0],
    ['Sphinx Push-Up',               'triceps','triceps',['bw'],['elbow'],0],
    ['Bodyweight Skull Crusher',     'triceps','triceps',['bw'],['elbow'],0],
    ['Band Pushdown',                'triceps','triceps',['bd'],['elbow'],0],
    ['Band Overhead Extension',      'triceps','triceps',['bd'],['elbow'],0],
    ['Band Kickback',                'triceps','triceps',['bd'],[],0],
    ['Ring Triceps Extension',       'triceps','triceps',['bw'],['elbow'],0],

    // ================= traps / carries / forearms =================
    ['Barbell Shrug',                'trap','traps',['bb'],[],0],
    ['Dumbbell Shrug',               'trap','traps',['db'],[],0],
    ['Trap-Bar Shrug',               'trap','traps',['bb'],[],0],
    ['Cable Shrug',                  'trap','traps',['cb'],[],0],
    ['Machine Shrug',                'trap','traps',['mc'],[],0],
    ['Band Shrug',                   'trap','traps',['bd'],[],0],
    ['Farmer Carry',                 'trap','traps',['db','kb'],[],1],
    ['Suitcase Carry',               'trap','traps',['db','kb'],[],1],
    ['Overhead Carry',               'trap','traps',['db','kb'],['shoulder'],1],
    ['Rack Carry',                   'trap','traps',['db','kb'],[],1],
    ['Backpack Carry',               'trap','traps',['bw'],[],1],
    ['Wrist Curl',                   'trap','forearms',['db','bb'],['wrist'],0],
    ['Reverse Wrist Curl',           'trap','forearms',['db','bb'],['wrist'],0],
    ['Dead Hang',                    'trap','forearms',['bw','bar'],['shoulder'],0],
    ['Plate Pinch Hold',             'trap','forearms',['db'],[],0],
    ['Towel Hang',                   'trap','forearms',['bw','bar'],['shoulder'],0],

    // ================= core =================
    ['Plank',                        'core','core',['bw'],[],0],
    ['Long-Lever Plank',             'core','core',['bw'],['lower-back'],0],
    ['Side Plank',                   'core','core',['bw'],[],0],
    ['Side Plank with Reach',        'core','core',['bw'],[],0],
    ['RKC Plank',                    'core','core',['bw'],[],0],
    ['Hollow Body Hold',             'core','core',['bw'],[],0],
    ['Hollow Rock',                  'core','core',['bw'],[],0],
    ['Dead Bug',                     'core','core',['bw'],[],0],
    ['Weighted Dead Bug',            'core','core',['bw','db'],[],0],
    ['Bird Dog Crunch',              'core','core',['bw'],[],0],
    ['Lying Leg Raise',              'core','core',['bw'],['lower-back'],0],
    ['Hanging Leg Raise',            'core','core',['bw','bar'],['shoulder'],0],
    ['Hanging Knee Raise',           'core','core',['bw','bar'],['shoulder'],0],
    ['Toes to Bar',                  'core','core',['bw','bar'],['shoulder'],0],
    ['Captain Chair Knee Raise',     'core','core',['mc'],[],0],
    ['Reverse Crunch',               'core','core',['bw'],['lower-back'],0],
    ['Crunch',                       'core','core',['bw'],['lower-back'],0],
    ['Bicycle Crunch',               'core','core',['bw'],['lower-back'],0],
    ['Cable Crunch',                 'core','core',['cb'],[],0],
    ['Machine Crunch',               'core','core',['mc'],[],0],
    ['Ab Wheel Rollout',             'core','core',['bw'],['lower-back'],0],
    ['Barbell Rollout',              'core','core',['bb'],['lower-back'],0],
    ['Slider Body Saw',              'core','core',['bw'],[],0],
    ['Mountain Climber',             'core','core',['bw'],['wrist'],0],
    ['Russian Twist',                'core','core',['bw','db'],['lower-back'],0],
    ['Pallof Press',                 'core','core',['cb','bd'],[],0],
    ['Half-Kneeling Pallof Press',   'core','core',['cb','bd'],[],0],
    ['Suitcase Hold',                'core','core',['db','kb'],[],0],
    ['Copenhagen Plank',             'core','core',['bw','bn'],[],0],
    ['V-Up',                         'core','core',['bw'],['lower-back'],0],
    ['Flutter Kick',                 'core','core',['bw'],['lower-back'],0],
    ['Windshield Wiper',             'core','core',['bw','bar'],['lower-back'],0],
    ['L-Sit Hold',                   'core','core',['bw'],['wrist'],0],
    ['Band Anti-Rotation Hold',      'core','core',['bd'],[],0],
    ['Side Bend',                    'core','core',['db'],['lower-back'],0],

    // ================= conditioning =================
    ['Treadmill Incline Walk',       'cardio','conditioning',['mc'],[],0],
    ['Treadmill Run',                'cardio','conditioning',['mc'],['knee'],0],
    ['Stationary Bike',              'cardio','conditioning',['mc'],[],0],
    ['Assault Bike Intervals',       'cardio','conditioning',['mc'],[],0],
    ['Rowing Machine',               'cardio','conditioning',['mc'],['lower-back'],0],
    ['Stair Climber',                'cardio','conditioning',['mc'],['knee'],0],
    ['Elliptical',                   'cardio','conditioning',['mc'],[],0],
    ['Ski Erg',                      'cardio','conditioning',['mc'],['lower-back'],0],
    ['Sled Drag',                    'cardio','conditioning',['mc'],[],0],
    ['Battle Ropes',                 'cardio','conditioning',['mc'],['shoulder'],0],
    ['Burpee',                       'cardio','conditioning',['bw'],['knee','wrist'],0],
    ['Half Burpee',                  'cardio','conditioning',['bw'],['wrist'],0],
    ['Jump Rope',                    'cardio','conditioning',['bw'],['knee'],0],
    ['Brisk Walk / Jog',             'cardio','conditioning',['bw'],['knee'],0],
    ['High Knees',                   'cardio','conditioning',['bw'],['knee'],0],
    ['Butt Kicks',                   'cardio','conditioning',['bw'],['knee'],0],
    ['Jumping Jacks',                'cardio','conditioning',['bw'],['knee'],0],
    ['Shadow Boxing',                'cardio','conditioning',['bw'],[],0],
    ['Bear Crawl',                   'cardio','conditioning',['bw'],['wrist'],0],
    ['Skater Hops',                  'cardio','conditioning',['bw'],['knee'],0],
    ['Step-Up Cardio',               'cardio','conditioning',['bw','bn'],['knee'],0],
    ['Kettlebell Swing Intervals',   'cardio','conditioning',['kb'],['lower-back'],0],
    ['Band Sprint Drive',            'cardio','conditioning',['bd'],['knee'],0],
    ['Stair Sprints',                'cardio','conditioning',['bw'],['knee'],0],

    // ===== depth for the patterns that were thin, and for band-only training =====
    // Pulling without a bar, calves, hamstrings and arms were the shallow spots;
    // a band costs almost nothing and reopens most of the pulling library.
    ['Band Face Pull (Anchored)',    'hpull','back',['bd'],[],1],
    ['Band Wide Row',                'hpull','back',['bd'],[],1],
    ['Band High Row',                'hpull','back',['bd'],[],1],
    ['Band Low Row',                 'hpull','back',['bd'],[],1],
    ['Band Reverse Fly Row',         'hpull','back',['bd'],[],1],
    ['Band Chest-Supported Row',     'hpull','back',['bd','bn'],[],1],
    ['Doorway Isometric Row',        'hpull','back',['bw'],[],1],
    ['Towel Inverted Row (Door)',    'hpull','back',['bw'],[],1],
    ['Prone Swimmer Pull',           'hpull','back',['bw'],[],1],
    ['Floor Lat Pull (Slider)',      'hpull','back',['bw'],[],1],
    ['Band Kneeling Pulldown',       'vpull','back',['bd'],[],1],
    ['Band Half-Kneeling Pulldown',  'vpull','back',['bd'],[],1],
    ['Band Lat Prayer',              'vpull','back',['bd'],[],0],
    ['Band Front Lever Pull',        'vpull','back',['bd'],['shoulder'],1],
    ['Towel Lat Pull (Floor)',       'vpull','back',['bw'],[],1],
    ['Band Shrug Pull',              'trap','traps',['bd'],[],0],
    ['Band Upright Shrug',           'trap','traps',['bd'],[],0],
    ['Isometric Towel Shrug',        'trap','traps',['bw'],[],0],
    ['Bodyweight Scap Shrug',        'trap','traps',['bw'],[],0],
    ['Band Wrist Curl',              'trap','forearms',['bd'],['wrist'],0],
    ['Towel Wring',                  'trap','forearms',['bw'],['wrist'],0],
    ['Fingertip Push-Up Hold',       'trap','forearms',['bw'],['wrist'],0],
    ['Band Concentration Curl',      'biceps','biceps',['bd'],[],0],
    ['Band Preacher Curl',           'biceps','biceps',['bd'],['elbow'],0],
    ['Band Spider Curl',             'biceps','biceps',['bd'],[],0],
    ['Band Drag Curl',               'biceps','biceps',['bd'],[],0],
    ['Isometric Wall Curl',          'biceps','biceps',['bw'],[],0],
    ['Self-Resisted Curl',           'biceps','biceps',['bw'],[],0],
    ['Sliding Towel Curl',           'biceps','biceps',['bw'],[],0],
    ['Band Incline Curl',            'biceps','biceps',['bd','bn'],[],0],
    ['Band Zottman Curl',            'biceps','biceps',['bd'],[],0],
    ['Band Skull Crusher',           'triceps','triceps',['bd'],['elbow'],0],
    ['Band Close-Grip Press',        'triceps','triceps',['bd'],['elbow'],0],
    ['Band Tate Press',              'triceps','triceps',['bd'],['elbow'],0],
    ['Self-Resisted Extension',      'triceps','triceps',['bw'],['elbow'],0],
    ['Wall Triceps Extension',       'triceps','triceps',['bw'],['elbow'],0],
    ['Slider Triceps Extension',     'triceps','triceps',['bw'],['elbow'],0],
    ['Chair Dip (Feet Up)',          'triceps','triceps',['bw','bn'],['shoulder'],0],
    ['Band Seated Calf Raise',       'calf','calves',['bd'],[],0],
    ['Band Tibialis Raise',          'calf','calves',['bd'],[],0],
    ['Stair Calf Raise',             'calf','calves',['bw'],[],0],
    ['Weighted Calf Raise (Pack)',   'calf','calves',['bw'],[],0],
    ['Calf Raise Hold',              'calf','calves',['bw'],[],0],
    ['Seated Bodyweight Calf Raise', 'calf','calves',['bw'],[],0],
    ['Jump Rope Double Bounce',      'calf','calves',['bw'],['knee'],0],
    ['Band Nordic Assist',           'ham','hamstrings',['bd'],['knee'],0],
    ['Towel Slider Curl',            'ham','hamstrings',['bw'],[],0],
    ['Chair Leg Curl',               'ham','hamstrings',['bw','bn'],[],0],
    ['Isometric Heel Dig',           'ham','hamstrings',['bw'],[],0],
    ['Band Standing Curl',           'ham','hamstrings',['bd'],[],0],
    ['Single-Leg Bridge Curl',       'ham','hamstrings',['bw'],[],0],
    ['Band Hamstring Walkout',       'ham','hamstrings',['bd'],[],0],
    ['Band Reverse Nordic',          'knee','quads',['bd'],['knee'],0],
    ['Slider Reverse Nordic',        'knee','quads',['bw'],['knee'],0],
    ['Wall Sit March',               'knee','quads',['bw'],['knee'],0],
    ['Isometric Knee Extension',     'knee','quads',['bw'],['knee'],0],
    ['Band Overhead Squat Hold',     'knee','quads',['bd'],['knee'],0],
    ['Band Pike Walkout',            'core','core',['bd'],['wrist'],0],
    ['Plank Shoulder Tap',           'core','core',['bw'],['wrist'],0],
    ['Plank Reach-Out',              'core','core',['bw'],['wrist'],0],
    ['Side Plank Hip Dip',           'core','core',['bw'],[],0],
    ['Standing Band Crunch',         'core','core',['bd'],[],0],
    ['Band Woodchop',                'core','core',['bd','cb'],['lower-back'],0],
    ['Seated Knee Tuck',             'core','core',['bw'],['lower-back'],0],
    ['Jackknife',                    'core','core',['bw'],['lower-back'],0],
    ['Band Dead Bug',                'core','core',['bd'],[],0],
    ['Sprinter Crunch',              'core','core',['bw'],['lower-back'],0],
    ['Cable Woodchop',               'core','core',['cb'],['lower-back'],0],
    ['Cable Pallof Hold',            'core','core',['cb'],[],0],
    ['Landmine Twist',               'core','core',['bb'],['lower-back'],0],
    ['Weighted Plank',               'core','core',['bw','db'],[],0],
    ['Plank Pull-Through',           'core','core',['bw','db'],['wrist'],0],
    ['Hanging Oblique Raise',        'core','core',['bw','bar'],['shoulder'],0],
    ['Decline Sit-Up',               'core','core',['bw','bn'],['lower-back'],0],
    ['Weighted Crunch',              'core','core',['bw','db'],['lower-back'],0],
    ['Swiss Ball Crunch',            'core','core',['bw'],['lower-back'],0],
    ['Swiss Ball Stir-the-Pot',      'core','core',['bw'],[],0],
    ['Standing Cable Crunch',        'core','core',['cb'],[],0],
    ['Machine Oblique Twist',        'core','core',['mc'],['lower-back'],0],
    ['Toe Touch Crunch',             'core','core',['bw'],['lower-back'],0],
    ['Heel Tap',                     'core','core',['bw'],[],0],
    ['Reverse Plank Hold',           'core','core',['bw'],['wrist'],0],
    ['Hip Dip Plank',                'core','core',['bw'],[],0],
    ['Lying Windmill',               'core','core',['bw'],['lower-back'],0],
    ['Kettlebell Windmill',          'core','core',['kb'],['shoulder'],0],
    ['Turkish Get-Up',               'core','core',['kb','db'],['shoulder'],1],
    ['Band Rotational Chop',         'core','core',['bd'],['lower-back'],0],
    ['Band March in Place',          'cardio','conditioning',['bd'],[],0],
    ['Squat to Press (Band)',        'cardio','conditioning',['bd'],['knee'],0],
    ['Mountain Climber Sprint',      'cardio','conditioning',['bw'],['wrist'],0],
    ['Inchworm Walkout',             'cardio','conditioning',['bw'],['wrist'],0],
    ['Tuck Jump',                    'cardio','conditioning',['bw'],['knee'],0],
    ['Lateral Shuffle',              'cardio','conditioning',['bw'],['knee'],0],
    ['Plank Jack',                   'cardio','conditioning',['bw'],['wrist'],0],
    ['Star Jump',                    'cardio','conditioning',['bw'],['knee'],0]
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

  /* Which muscles belong together, for the widest tier of the swap list. */
  var MUSCLE_GROUP = {
    chest: 'push', shoulders: 'push', triceps: 'push',
    back: 'pull', biceps: 'pull', 'rear-delts': 'pull', traps: 'pull', forearms: 'pull',
    quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', 'lower-back': 'legs',
    core: 'core', conditioning: 'conditioning'
  };

  /* Alternatives for one slot, in three tiers of decreasing closeness:
   *
   *   direct  — same movement pattern. A bench press for a bench press.
   *   muscle  — same primary muscle, different pattern. A fly for a press.
   *   related — same muscle group. A triceps slot offering other pressing work.
   *
   * The tiers are returned in order and tagged, so the UI can show the close
   * swaps first and still offer a deep list underneath. Without the third tier
   * the small patterns — calves, traps, hamstrings — bottomed out around ten
   * options, which is not a choice.
   */
  function alternatives(ex, profileId, avoid, excludeIds) {
    if (!ex) return [];
    excludeIds = excludeIds || [];
    var p = pool(profileId, avoid);
    var seen = {};
    excludeIds.forEach(function (id) { seen[id] = 1; });
    seen[ex.id] = 1;

    var out = [];
    function take(list, tier) {
      list.forEach(function (c) {
        if (seen[c.id]) return;
        seen[c.id] = 1;
        var copy = Object.create(c);
        copy.tier = tier;
        out.push(copy);
      });
    }

    take(p.filter(function (c) { return c.pattern === ex.pattern; }), 'direct');
    take(p.filter(function (c) { return c.primary === ex.primary; }), 'muscle');

    var group = MUSCLE_GROUP[ex.primary];
    if (group) {
      take(p.filter(function (c) { return MUSCLE_GROUP[c.primary] === group; }), 'related');
    }
    return out;
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
    MUSCLE_GROUP: MUSCLE_GROUP,
    AVOID_OPTIONS: [
      { id: 'knee',       label: 'Knees' },
      { id: 'shoulder',   label: 'Shoulders' },
      { id: 'lower-back', label: 'Lower back' },
      { id: 'wrist',      label: 'Wrists' },
      { id: 'elbow',      label: 'Elbows' }
    ]
  };

}(window));
