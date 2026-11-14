/* data-foods.js — food library and meal templates.
 *
 * diet levels, lowest to most permissive: 0 vegan, 1 vegetarian (dairy), 2 egg, 3 meat/fish.
 * A preference accepts every level at or below itself, so a non-veg plan can still
 * serve dal and a vegan plan never sees paneer.
 *
 * cuisine: 'in' Indian, 'gl' global, 'both'.
 *
 * Macros are per `per` units and scale linearly. They are ordinary reference values
 * for the cooked item; they are close enough to plan with, not lab figures.
 */
(function (global) {
  'use strict';

  // id, name, unit, per, kcal, protein, carbs, fat, diet, cuisine
  var F = [
    // --- protein, animal
    ['chicken',   'Chicken breast',        'g', 100, 165, 31,  0,   3.6, 3, 'both'],
    ['chickthigh','Chicken thigh',         'g', 100, 209, 26,  0,  10.9, 3, 'both'],
    ['fish',      'Rohu / white fish',     'g', 100, 128, 23,  0,   3.5, 3, 'both'],
    ['salmon',    'Salmon',                'g', 100, 208, 20,  0,  13.0, 3, 'gl'],
    ['tuna',      'Canned tuna',           'g', 100, 116, 26,  0,   1.0, 3, 'gl'],
    ['egg',       'Whole egg',             'piece', 1, 72,  6.3, 0.4, 4.8, 2, 'both'],
    ['eggwhite',  'Egg white',             'piece', 1, 17,  3.6, 0.2, 0.1, 2, 'both'],
    ['mutton',    'Mutton curry cut',      'g', 100, 258, 26,  0,  17.0, 3, 'in'],
    ['prawn',     'Prawns',                'g', 100,  99, 24,  0.2, 0.3, 3, 'both'],

    // --- protein, vegetarian
    ['paneer',    'Paneer',                'g', 100, 265, 18,  1.2, 21.0, 1, 'in'],
    ['lowfatpan', 'Low-fat paneer',        'g', 100, 180, 24,  3.0,  8.0, 1, 'in'],
    ['tofu',      'Tofu (firm)',           'g', 100, 144, 17,  2.8,  8.7, 0, 'both'],
    ['soyachunk', 'Soya chunks (dry)',     'g',  50, 172, 26, 16.0,  0.5, 0, 'in'],
    ['curd',      'Curd / plain yoghurt',  'g', 100,  61,  3.5, 4.7,  3.3, 1, 'in'],
    ['greekyog',  'Greek yoghurt',         'g', 100,  97, 10.0, 3.6,  5.0, 1, 'gl'],
    ['milk',      'Toned milk',            'ml',200, 116,  6.4, 9.6,  5.8, 1, 'both'],
    ['soymilk',   'Soy milk (unsweetened)','ml',200, 108, 7.0, 4.0,  4.5, 0, 'both'],
    ['tempeh',    'Tempeh',                'g', 100, 192, 20.0, 7.6, 11.0, 0, 'gl'],
    ['peanutcurd','Peanut curd (vegan)',   'g', 150, 140,  6.0, 8.0,  9.0, 0, 'both'],
    ['whey',      'Whey protein scoop',    'piece',1,120, 24,   3.0,  1.5, 1, 'both'],
    ['cheese',    'Cheese slice',          'piece',1, 68,  4.0, 1.0,  5.0, 1, 'gl'],

    // --- legumes
    ['dal',       'Cooked dal (toor/moong)','g',200, 232, 14.0, 38.0, 1.4, 0, 'in'],
    ['rajma',     'Rajma (cooked)',        'g', 200, 254, 16.0, 44.0, 1.0, 0, 'in'],
    ['chana',     'Chole / chickpeas',     'g', 200, 328, 17.0, 54.0, 5.2, 0, 'in'],
    ['sprouts',   'Mixed sprouts',         'g', 100, 100,  9.0, 17.0, 0.6, 0, 'in'],
    ['lentilsoup','Lentil soup',           'ml',300, 210, 13.0, 32.0, 2.0, 0, 'gl'],
    ['blackbean', 'Black beans',           'g', 150, 198, 13.0, 36.0, 0.8, 0, 'gl'],

    // --- grains and starch
    ['rice',      'Cooked rice',           'g', 100, 130,  2.7, 28.0, 0.3, 0, 'both'],
    ['brownrice', 'Brown rice (cooked)',   'g', 100, 123,  2.6, 26.0, 1.0, 0, 'both'],
    ['roti',      'Whole-wheat roti',      'piece',1,104,  3.2, 20.0, 1.5, 0, 'in'],
    ['paratha',   'Plain paratha',         'piece',1,180,  4.0, 24.0, 7.0, 0, 'in'],
    ['oats',      'Rolled oats (dry)',     'g',  50, 190,  6.8, 33.0, 3.5, 0, 'both'],
    ['poha',      'Poha (dry)',            'g',  70, 243,  5.0, 53.0, 0.8, 0, 'in'],
    ['upma',      'Upma (sooji, dry)',     'g',  60, 220,  6.5, 44.0, 1.2, 0, 'in'],
    ['idli',      'Idli',                  'piece',1, 58,  1.9, 12.0, 0.3, 0, 'in'],
    ['dosa',      'Plain dosa',            'piece',1,133,  2.7, 22.0, 3.7, 0, 'in'],
    ['bread',     'Whole-wheat bread',     'piece',1, 75,  3.6, 13.0, 1.0, 0, 'both'],
    ['pasta',     'Wholewheat pasta (cooked)','g',150,186, 7.5, 37.0, 1.1, 0, 'gl'],
    ['quinoa',    'Quinoa (cooked)',       'g', 150, 180,  6.6, 31.0, 2.9, 0, 'gl'],
    ['potato',    'Boiled potato',         'g', 150, 116,  3.0, 26.0, 0.2, 0, 'both'],
    ['sweetpot',  'Sweet potato',          'g', 150, 129,  2.4, 30.0, 0.2, 0, 'both'],
    ['daliya',    'Daliya (broken wheat)', 'g',  60, 205,  7.0, 42.0, 1.0, 0, 'in'],

    // --- vegetables
    ['mixveg',    'Mixed vegetable sabzi', 'g', 200, 130,  4.0, 16.0, 5.5, 0, 'in'],
    ['palak',     'Palak (spinach)',       'g', 150,  35,  4.4, 5.4,  0.6, 0, 'both'],
    ['bhindi',    'Bhindi sabzi',          'g', 150, 120,  3.0, 12.0, 6.5, 0, 'in'],
    ['salad',     'Green salad',           'g', 150,  45,  2.0, 8.0,  0.4, 0, 'both'],
    ['broccoli',  'Broccoli',              'g', 150,  51,  4.2, 10.0, 0.6, 0, 'gl'],
    ['veggiestir','Stir-fried vegetables', 'g', 200, 140,  5.0, 18.0, 5.5, 0, 'gl'],
    ['cucumber',  'Cucumber & tomato',     'g', 150,  24,  1.1, 5.4,  0.2, 0, 'both'],

    // --- fruit
    ['banana',    'Banana',                'piece',1,105,  1.3, 27.0, 0.4, 0, 'both'],
    ['apple',     'Apple',                 'piece',1, 95,  0.5, 25.0, 0.3, 0, 'both'],
    ['papaya',    'Papaya',                'g', 150,  65,  0.7, 16.0, 0.4, 0, 'both'],
    ['berries',   'Mixed berries',         'g', 100,  57,  0.7, 14.0, 0.3, 0, 'gl'],
    ['orange',    'Orange',                'piece',1, 62,  1.2, 15.0, 0.2, 0, 'both'],

    // --- fats and extras
    ['ghee',      'Ghee',                  'tbsp',1,112,  0,    0,   12.7, 1, 'in'],
    ['oil',       'Cooking oil',           'tbsp',1,120,  0,    0,   14.0, 0, 'both'],
    ['peanut',    'Peanuts',               'g',  30, 170,  7.7, 4.9, 14.7, 0, 'both'],
    ['pb',        'Peanut butter',         'tbsp',1, 94,  4.0, 3.2,  8.0, 0, 'both'],
    ['almond',    'Almonds',               'g',  25, 145,  5.3, 5.4, 12.5, 0, 'both'],
    ['walnut',    'Walnuts',               'g',  25, 163,  3.8, 3.4, 16.3, 0, 'both'],
    ['avocado',   'Avocado',               'g', 100, 160,  2.0, 8.5, 14.7, 0, 'gl'],
    ['seeds',     'Pumpkin / chia seeds',  'g',  20, 112,  5.0, 3.5,  9.0, 0, 'both'],
    ['olive',     'Olive oil',             'tbsp',1,119,  0,    0,   13.5, 0, 'gl'],
    ['honey',     'Honey',                 'tbsp',1, 64,  0.1, 17.0, 0,    1, 'both'],
    ['chutney',   'Coconut chutney',       'g',  50,  97,  1.5, 4.5,  8.0, 0, 'in'],
    ['sambar',    'Sambar',                'ml',200, 139,  6.5, 20.0, 3.5, 0, 'in'],
    ['hummus',    'Hummus',                'g',  60, 100,  4.8, 8.5,  5.8, 0, 'gl'],
    ['rasam',     'Rasam',                 'ml',200,  70,  3.0, 10.0, 2.0, 0, 'in']
  ];

  var FOODS = {};
  F.forEach(function (r) {
    FOODS[r[0]] = {
      id: r[0], name: r[1], unit: r[2], per: r[3],
      kcal: r[4], p: r[5], c: r[6], f: r[7],
      diet: r[8], cuisine: r[9]
    };
  });

  /* Meal templates.
   * id, title, slot, cuisine, items[]  — each item [foodId, qty, scalable]
   * `scalable` marks the portion the generator is allowed to grow or shrink to hit
   * the day's targets. Fixed items (one egg, one tbsp of ghee) stay put so the
   * output still reads like a meal a person would actually cook.
   */
  var M = [
    // ---------------- breakfast
    ['b_oats',    'Oats with milk, banana & peanut butter', 'breakfast','both', [['oats',50,1],['milk',200,1],['banana',1,0],['pb',1,0]]],
    ['b_poha',    'Poha with peanuts & sprouts',            'breakfast','in',   [['poha',70,1],['peanut',30,0],['sprouts',100,1],['oil',1,0]]],
    ['b_upma',    'Vegetable upma with curd',               'breakfast','in',   [['upma',60,1],['mixveg',100,1],['curd',150,1],['oil',1,0]]],
    ['b_idli',    'Idli with sambar & chutney',             'breakfast','in',   [['idli',4,1],['sambar',200,1],['chutney',50,0]]],
    ['b_paneer',  'Paneer bhurji with roti',                'breakfast','in',   [['lowfatpan',150,1],['roti',2,1],['oil',1,0],['cucumber',150,0]]],
    ['b_egg',     'Egg bhurji with toast',                  'breakfast','both', [['egg',3,1],['bread',2,1],['oil',1,0],['cucumber',150,0]]],
    ['b_omelette','Omelette with vegetables & avocado',     'breakfast','gl',   [['egg',3,1],['eggwhite',2,1],['veggiestir',150,1],['avocado',50,0]]],
    ['b_yog',     'Greek yoghurt, berries & seeds',         'breakfast','gl',   [['greekyog',200,1],['berries',100,1],['seeds',20,0],['honey',1,0]]],
    ['b_dosa',    'Dosa with sambar',                       'breakfast','in',   [['dosa',2,1],['sambar',200,1],['chutney',50,0]]],
    ['b_daliya',  'Daliya with milk & almonds',             'breakfast','in',   [['daliya',60,1],['milk',200,1],['almond',25,0]]],
    ['b_shake',   'Whey shake with oats & banana',          'breakfast','both', [['whey',1,0],['oats',40,1],['milk',200,1],['banana',1,0]]],
    ['b_tofu',    'Tofu scramble with toast',               'breakfast','gl',   [['tofu',150,1],['bread',2,1],['olive',1,0],['salad',150,0]]],
    ['b_parcurd', 'Paratha with curd',                      'breakfast','in',   [['paratha',2,1],['curd',200,1],['cucumber',150,0]]],
    ['b_soyoats', 'Overnight oats with soy milk & berries',  'breakfast','both', [['oats',60,1],['soymilk',200,1],['berries',100,1],['seeds',20,0]]],
    ['b_soyabhur','Soya bhurji with toast',                  'breakfast','both', [['soyachunk',50,1],['bread',2,1],['oil',1,0],['cucumber',150,0]]],
    ['b_pbshake', 'Peanut butter & banana shake',            'breakfast','both', [['soymilk',250,1],['pb',2,0],['banana',1,0],['oats',40,1]]],
    ['b_eggwhite','Egg white scramble with vegetables',       'breakfast','both', [['eggwhite',6,1],['egg',1,0],['veggiestir',150,1],['oil',1,0]]],
    ['b_curdspr', 'Curd with sprouts & seeds',                'breakfast','in',   [['curd',250,1],['sprouts',150,1],['seeds',20,0]]],

    // ---------------- lunch
    ['l_chicken', 'Chicken curry, rice & salad',            'lunch','in',   [['chicken',180,1],['rice',200,1],['salad',150,0],['oil',1,0]]],
    ['l_dalrice', 'Dal, rice, sabzi & curd',                'lunch','in',   [['dal',200,1],['rice',180,1],['mixveg',150,1],['curd',100,0]]],
    ['l_rajma',   'Rajma chawal with salad',                'lunch','in',   [['rajma',200,1],['rice',180,1],['salad',150,0],['ghee',1,0]]],
    ['l_paneer',  'Paneer sabzi with roti',                 'lunch','in',   [['lowfatpan',150,1],['roti',3,1],['palak',150,1],['oil',1,0]]],
    ['l_fish',    'Fish curry with rice',                   'lunch','in',   [['fish',180,1],['rice',200,1],['bhindi',150,1],['oil',1,0]]],
    ['l_chole',   'Chole with brown rice',                  'lunch','in',   [['chana',200,1],['brownrice',180,1],['cucumber',150,0],['oil',1,0]]],
    ['l_grillch', 'Grilled chicken, quinoa & broccoli',     'lunch','gl',   [['chicken',180,1],['quinoa',150,1],['broccoli',150,1],['olive',1,0]]],
    ['l_tuna',    'Tuna pasta with vegetables',             'lunch','gl',   [['tuna',120,1],['pasta',150,1],['veggiestir',150,1],['olive',1,0]]],
    ['l_soya',    'Soya chunk curry with rice',             'lunch','in',   [['soyachunk',50,1],['rice',180,1],['mixveg',150,1],['oil',1,0]]],
    ['l_bowl',    'Black bean & quinoa bowl',               'lunch','gl',   [['blackbean',150,1],['quinoa',150,1],['salad',150,0],['avocado',50,0]]],
    ['l_mutton',  'Mutton curry with roti',                 'lunch','in',   [['mutton',150,1],['roti',3,1],['salad',150,0]]],
    ['l_tofu',    'Tofu stir-fry with brown rice',          'lunch','gl',   [['tofu',180,1],['brownrice',180,1],['veggiestir',200,1],['olive',1,0]]],
    ['l_sprout',  'Sprout salad with roti & curd',          'lunch','in',   [['sprouts',150,1],['roti',3,1],['curd',150,1],['oil',1,0]]],
    ['l_tempeh',  'Tempeh bowl with quinoa & greens',       'lunch','gl',   [['tempeh',150,1],['quinoa',150,1],['broccoli',150,1],['olive',1,0]]],
    ['l_dalroti', 'Dal with roti & salad',                  'lunch','both', [['dal',200,1],['roti',3,1],['salad',150,0],['oil',1,0]]],
    ['l_soyapas', 'Soya pasta with vegetables',             'lunch','gl',   [['soyachunk',50,1],['pasta',150,1],['veggiestir',150,1],['olive',1,0]]],
    ['l_chsalad', 'Grilled chicken salad bowl',             'lunch','both', [['chicken',200,1],['salad',200,1],['cucumber',150,0],['olive',1,0]]],
    ['l_pansalad','Paneer tikka salad',                     'lunch','in',   [['lowfatpan',180,1],['salad',200,1],['cucumber',150,0],['oil',1,0]]],
    ['l_dalsalad','Dal with a large salad',                 'lunch','both', [['dal',250,1],['salad',200,1],['cucumber',150,0],['oil',1,0]]],
    ['l_soyasal', 'Soya chunk & sprout salad',             'lunch','both', [['soyachunk',60,1],['sprouts',150,1],['salad',200,1],['oil',1,0]]],

    // ---------------- snack
    ['s_shake',   'Whey shake with milk',                   'snack','both', [['whey',1,0],['milk',200,1]]],
    ['s_sprouts', 'Sprout chaat',                           'snack','in',   [['sprouts',150,1],['cucumber',150,0]]],
    ['s_curdfr',  'Curd with fruit',                        'snack','in',   [['curd',200,1],['papaya',150,1]]],
    ['s_nuts',    'Peanuts & an apple',                     'snack','both', [['peanut',30,1],['apple',1,0]]],
    ['s_eggs',    'Boiled eggs',                            'snack','both', [['egg',3,1],['cucumber',150,0]]],
    ['s_pbtoast', 'Peanut butter toast',                    'snack','both', [['bread',2,1],['pb',1,0],['banana',1,0]]],
    ['s_hummus',  'Hummus with vegetable sticks',           'snack','gl',   [['hummus',60,1],['salad',150,1]]],
    ['s_paneer',  'Roasted paneer cubes',                   'snack','in',   [['lowfatpan',100,1],['cucumber',150,0]]],
    ['s_yogseed', 'Greek yoghurt with seeds',               'snack','gl',   [['greekyog',150,1],['seeds',20,0]]],
    ['s_chana',   'Roasted chana & orange',                 'snack','in',   [['chana',100,1],['orange',1,0]]],
    ['s_almond',  'Almonds & walnuts',                      'snack','both', [['almond',25,1],['walnut',25,0]]],
    ['s_tofu',    'Tofu bites with salad',                  'snack','gl',   [['tofu',120,1],['salad',150,0]]],
    ['s_soyshake','Soy milk & peanut butter shake',         'snack','both', [['soymilk',250,1],['pb',1,0]]],
    ['s_peacurd', 'Peanut curd with fruit',                 'snack','both', [['peanutcurd',150,1],['apple',1,0]]],
    ['s_wheyw',   'Whey shake with water',                  'snack','both', [['whey',1,1]]],
    ['s_eggwhite','Boiled egg whites',                      'snack','both', [['eggwhite',6,1],['cucumber',150,0]]],
    ['s_soyasal', 'Soya chunk salad',                       'snack','both', [['soyachunk',40,1],['salad',150,1],['cucumber',150,0]]],
    ['s_tempeh',  'Tempeh bites',                           'snack','gl',   [['tempeh',100,1],['salad',150,0]]],

    // ---------------- dinner
    ['d_rotisab', 'Roti, dal & sabzi',                      'dinner','in',   [['roti',3,1],['dal',200,1],['mixveg',150,1],['ghee',1,0]]],
    ['d_chicken', 'Grilled chicken with sautéed vegetables','dinner','both', [['chicken',180,1],['veggiestir',200,1],['olive',1,0]]],
    ['d_paneer',  'Palak paneer with roti',                 'dinner','in',   [['lowfatpan',150,1],['palak',150,1],['roti',2,1],['oil',1,0]]],
    ['d_fish',    'Baked fish with sweet potato',           'dinner','gl',   [['fish',180,1],['sweetpot',150,1],['broccoli',150,1],['olive',1,0]]],
    ['d_khich',   'Moong dal khichdi with curd',            'dinner','in',   [['dal',200,1],['rice',150,1],['curd',150,1],['ghee',1,0]]],
    ['d_eggcur',  'Egg curry with roti',                    'dinner','in',   [['egg',3,1],['roti',3,1],['mixveg',150,1],['oil',1,0]]],
    ['d_soup',    'Lentil soup with bread & salad',         'dinner','gl',   [['lentilsoup',300,1],['bread',2,1],['salad',150,0]]],
    ['d_prawn',   'Prawn stir-fry with rice',               'dinner','both', [['prawn',180,1],['rice',150,1],['veggiestir',150,1],['oil',1,0]]],
    ['d_tofu',    'Tofu curry with roti',                   'dinner','in',   [['tofu',180,1],['roti',3,1],['palak',150,1],['oil',1,0]]],
    ['d_chickpas','Chicken pasta with salad',               'dinner','gl',   [['chicken',150,1],['pasta',150,1],['salad',150,0],['olive',1,0]]],
    ['d_rasam',   'Rasam, rice & sprout poriyal',           'dinner','in',   [['rasam',200,1],['rice',150,1],['sprouts',150,1],['oil',1,0]]],
    ['d_salmon',  'Salmon with quinoa & greens',            'dinner','gl',   [['salmon',150,1],['quinoa',150,1],['broccoli',150,1]]],
    ['d_soya',    'Soya keema with roti',                   'dinner','in',   [['soyachunk',50,1],['roti',3,1],['salad',150,0],['oil',1,0]]],
    ['d_tempeh',  'Tempeh stir-fry with brown rice',        'dinner','gl',   [['tempeh',150,1],['brownrice',150,1],['veggiestir',150,1],['olive',1,0]]],
    ['d_chanab',  'Chickpea & vegetable bowl',              'dinner','both', [['chana',200,1],['veggiestir',200,1],['salad',150,0],['olive',1,0]]],
    ['d_chsoup',  'Chicken & vegetable soup',               'dinner','both', [['chicken',180,1],['veggiestir',200,1],['oil',1,0]]],
    ['d_pansalad','Paneer & sprout salad',                  'dinner','in',   [['lowfatpan',150,1],['sprouts',150,1],['cucumber',150,0],['oil',1,0]]],
    ['d_tofusal', 'Tofu & greens salad',                    'dinner','gl',   [['tofu',180,1],['salad',200,1],['broccoli',150,1],['olive',1,0]]],
    ['d_eggwhite','Egg white omelette with salad',          'dinner','both', [['eggwhite',6,1],['egg',1,0],['salad',200,1],['olive',1,0]]]
  ];

  var MEALS = M.map(function (r) {
    var items = r[4].map(function (it) {
      return { food: it[0], qty: it[1], scalable: !!it[2] };
    });
    // A template is only as permissive as its most restrictive-to-serve ingredient:
    // the highest diet level any item requires.
    var diet = items.reduce(function (acc, it) {
      var f = FOODS[it.food];
      return f ? Math.max(acc, f.diet) : acc;
    }, 0);
    return { id: r[0], title: r[1], slot: r[2], cuisine: r[3], diet: diet, items: items };
  });

  var DIET_PREFS = [
    { id: 'vegan',  label: 'Vegan',           level: 0 },
    { id: 'veg',    label: 'Vegetarian',      level: 1 },
    { id: 'egg',    label: 'Eggetarian',      level: 2 },
    { id: 'nonveg', label: 'Non-vegetarian',  level: 3 }
  ];

  var CUISINES = [
    { id: 'indian', label: 'Indian only', accepts: ['in', 'both'] },
    { id: 'global', label: 'Global / continental', accepts: ['gl', 'both'] },
    { id: 'mixed',  label: 'Mixed', accepts: ['in', 'gl', 'both'] }
  ];

  function dietLevel(prefId) {
    var p = DIET_PREFS.filter(function (d) { return d.id === prefId; })[0];
    return p ? p.level : 3;
  }

  function cuisineAccepts(cuisineId) {
    var c = CUISINES.filter(function (x) { return x.id === cuisineId; })[0];
    return c ? c.accepts : ['in', 'gl', 'both'];
  }

  /* Every template the user's preferences allow, for one slot. This is both the
   * generator's pick list and the "suggest an alternative" pool. */
  function mealPool(slot, prefs) {
    var lvl = dietLevel(prefs.dietPref);
    var acc = cuisineAccepts(prefs.cuisine);
    var dislikes = prefs.dislikes || [];
    return MEALS.filter(function (m) {
      if (m.slot !== slot) return false;
      if (m.diet > lvl) return false;
      if (acc.indexOf(m.cuisine) === -1) return false;
      if (dislikes.some(function (d) {
        return m.items.some(function (it) { return it.food === d; });
      })) return false;
      return true;
    });
  }

  global.FoodData = {
    FOODS: FOODS,
    MEALS: MEALS,
    DIET_PREFS: DIET_PREFS,
    CUISINES: CUISINES,
    SLOTS: ['breakfast', 'lunch', 'snack', 'dinner'],
    SLOT_LABEL: { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' },
    dietLevel: dietLevel,
    cuisineAccepts: cuisineAccepts,
    mealPool: mealPool,
    food: function (id) { return FOODS[id] || null; },
    meal: function (id) { return MEALS.filter(function (m) { return m.id === id; })[0] || null; }
  };

}(window));
