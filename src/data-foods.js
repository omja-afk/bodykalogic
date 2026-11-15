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
    ['rasam',     'Rasam',                 'ml',200,  70,  3.0, 10.0, 2.0, 0, 'in'],

    // --- extra protein
    ['wheyiso',   'Whey isolate scoop',    'piece',1,110, 26,   1.0,  0.5, 1, 'both'],
    ['casein',    'Casein scoop',          'piece',1,120, 24,   3.0,  1.0, 1, 'both'],
    ['cottage',   'Cottage cheese',        'g', 100,  98, 11.0, 3.4,  4.3, 1, 'gl'],
    ['seitan',    'Seitan',                'g', 100, 141, 25.0, 14.0, 1.9, 0, 'gl'],
    ['edamame',   'Edamame',               'g', 150, 185, 16.5, 14.0, 8.0, 0, 'gl'],
    ['turkey',    'Turkey breast',         'g', 100, 135, 29.0, 0,    1.7, 3, 'gl'],
    ['beef',      'Lean beef',             'g', 100, 217, 26.0, 0,   12.0, 3, 'gl'],
    ['squid',     'Squid / calamari',      'g', 100,  92, 15.6, 3.1,  1.4, 3, 'gl'],
    ['sardine',   'Sardines',              'g', 100, 208, 25.0, 0,   11.5, 3, 'gl'],
    ['eggcurryb', 'Egg (boiled, large)',   'piece',1, 78,  6.3, 0.6,  5.3, 2, 'both'],
    ['besan',     'Besan (gram flour)',    'g',  60, 230, 12.5, 36.0, 3.6, 0, 'in'],
    ['moongdal',  'Moong dal (cooked)',    'g', 200, 212, 14.2, 36.0, 0.8, 0, 'in'],
    ['chanadal',  'Chana dal (cooked)',    'g', 200, 240, 13.0, 40.0, 2.4, 0, 'in'],
    ['kadhi',     'Kadhi',                 'ml',200, 150,  6.0, 14.0, 7.5, 1, 'in'],
    ['lassi',     'Salted lassi / chaas',  'ml',250, 100,  5.5, 8.0,  5.0, 1, 'in'],
    ['makhana',   'Roasted makhana',       'g',  30, 105,  3.0, 23.0, 0.3, 0, 'in'],
    ['peanutchat','Peanut chaat',          'g', 100, 320, 15.0, 16.0, 22.0,0, 'in'],

    // --- extra grains and starches
    ['pulao',     'Vegetable pulao',       'g', 200, 290,  6.0, 48.0, 8.0, 0, 'in'],
    ['biryanir',  'Biryani rice',          'g', 200, 320,  7.0, 50.0, 9.5, 0, 'in'],
    ['chilla',    'Besan chilla',          'piece',1,120,  6.0, 14.0, 4.5, 0, 'in'],
    ['moongchil', 'Moong dal chilla',      'piece',1,110,  7.0, 14.0, 2.5, 0, 'in'],
    ['dhokla',    'Dhokla',                'g', 150, 240, 10.0, 34.0, 6.5, 0, 'in'],
    ['uttapam',   'Uttapam',               'piece',1,160,  4.0, 26.0, 4.5, 0, 'in'],
    ['appam',     'Appam',                 'piece',1,120,  2.5, 24.0, 1.5, 0, 'in'],
    ['thepla',    'Methi thepla',          'piece',1,130,  3.5, 18.0, 5.0, 0, 'in'],
    ['khakhra',   'Khakhra',               'piece',1, 65,  2.0, 11.0, 1.5, 0, 'in'],
    ['couscous',  'Couscous (cooked)',     'g', 150, 168,  5.6, 35.0, 0.3, 0, 'gl'],
    ['bulgur',    'Bulgur (cooked)',       'g', 150, 125,  4.5, 27.0, 0.4, 0, 'gl'],
    ['granola',   'Granola',               'g',  50, 215,  5.0, 33.0, 7.0, 1, 'gl'],
    ['ricecake',  'Rice cakes',            'piece',1, 35,  0.7, 7.3,  0.3, 0, 'gl'],
    ['tortilla',  'Wholewheat tortilla',   'piece',1,140,  5.0, 23.0, 3.5, 0, 'gl'],
    ['noodles',   'Wholewheat noodles',    'g', 150, 190,  7.0, 38.0, 1.2, 0, 'gl'],
    ['millet',    'Bajra / jowar roti',    'piece',1, 97,  2.8, 19.0, 1.0, 0, 'in'],
    ['curdrice',  'Curd rice',             'g', 250, 290,  8.5, 42.0, 9.0, 1, 'in'],

    // --- extra vegetables
    ['lauki',     'Lauki sabzi',           'g', 150,  85,  2.0, 9.0,  4.5, 0, 'in'],
    ['baingan',   'Baingan bharta',        'g', 150, 130,  2.5, 12.0, 8.0, 0, 'in'],
    ['methi',     'Methi sabzi',           'g', 150, 100,  4.0, 9.0,  5.5, 0, 'in'],
    ['gobhi',     'Gobhi / cauliflower',   'g', 150, 105,  3.5, 10.0, 6.0, 0, 'in'],
    ['beans',     'French beans',          'g', 150,  90,  3.0, 10.0, 4.5, 0, 'both'],
    ['mushroom',  'Mushrooms',             'g', 150,  52,  5.0, 5.0,  1.5, 0, 'both'],
    ['capsicum',  'Capsicum & onion',      'g', 150,  70,  2.0, 10.0, 2.5, 0, 'both'],
    ['zucchini',  'Grilled zucchini',      'g', 150,  60,  2.2, 7.0,  2.8, 0, 'gl'],
    ['asparagus', 'Asparagus',             'g', 150,  48,  3.3, 6.0,  1.2, 0, 'gl'],
    ['kale',      'Kale salad',            'g', 150,  73,  4.3, 10.0, 1.5, 0, 'gl'],
    ['coleslaw',  'Cabbage slaw',          'g', 150,  85,  1.8, 9.0,  4.5, 0, 'gl'],

    // --- extra fruit and fats
    ['mango',     'Mango',                 'g', 150,  90,  1.2, 22.0, 0.6, 0, 'in'],
    ['guava',     'Guava',                 'piece',1, 68,  2.6, 14.0, 1.0, 0, 'in'],
    ['pomegran',  'Pomegranate',           'g', 150, 125,  2.5, 28.0, 1.8, 0, 'in'],
    ['grapes',    'Grapes',                'g', 150, 104,  1.1, 27.0, 0.2, 0, 'both'],
    ['watermelon','Watermelon',            'g', 200,  60,  1.2, 15.0, 0.3, 0, 'both'],
    ['dates',     'Dates',                 'g',  40, 110,  0.9, 30.0, 0.2, 0, 'both'],
    ['cashew',    'Cashews',               'g',  25, 138,  4.6, 7.6, 11.0, 0, 'both'],
    ['flax',      'Flax seeds',            'g',  15,  80,  2.8, 4.3,  6.3, 0, 'both'],
    ['coconut',   'Fresh coconut',         'g',  30, 107,  1.0, 4.6, 10.1, 0, 'in'],
    ['butter',    'Butter',                'tbsp',1,102,  0.1, 0,   11.5, 1, 'both'],
    ['mayo',      'Light mayonnaise',      'tbsp',1, 45,  0.1, 1.0,  4.5, 2, 'gl'],
    ['pesto',     'Pesto',                 'tbsp',1, 80,  1.5, 1.0,  8.0, 1, 'gl'],
    ['tahini',    'Tahini',                'tbsp',1, 89,  2.6, 3.2,  8.0, 0, 'gl'],
    ['tomato',    'Tomato gravy base',     'g', 100,  70,  1.5, 8.0,  3.8, 0, 'in'],
    ['pickle',    'Pickle',                'g',  15,  30,  0.2, 1.0,  2.8, 0, 'in'],
    ['proteinbar','Protein bar',           'piece',1,200, 20.0, 20.0, 6.0, 1, 'gl'],
    ['darkchoc',  'Dark chocolate',        'g',  20, 120,  1.6, 9.0,  8.6, 1, 'gl']
  ];

  var FOODS = {};
  F.forEach(function (r) {
    FOODS[r[0]] = {
      id: r[0], name: r[1], unit: r[2], per: r[3],
      kcal: r[4], p: r[5], c: r[6], f: r[7],
      diet: r[8], cuisine: r[9]
    };
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

  global.FoodData = {
    FOODS: FOODS,
    DIET_PREFS: DIET_PREFS,
    CUISINES: CUISINES,
    SLOTS: ['breakfast', 'lunch', 'snack', 'dinner'],
    SLOT_LABEL: { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' },
    dietLevel: dietLevel,
    cuisineAccepts: cuisineAccepts,
    food: function (id) { return FOODS[id] || null; },

    /* The food behind a meal item. Usually a library food; an item estimated
     * by meal analysis that matched nothing in the library carries its own
     * figures instead, per one unit (one gram, one ml, or one piece):
     *   { food: null, qty, custom: { name, unit, kcal, p, c, f } } */
    itemFood: function (item) {
      if (!item) return null;
      if (item.custom) {
        var c = item.custom;
        return { id: null, name: String(c.name || 'Food'), unit: c.unit || 'g', per: 1,
                 kcal: Number(c.kcal) || 0, p: Number(c.p) || 0, c: Number(c.c) || 0, f: Number(c.f) || 0 };
      }
      return FOODS[item.food] || null;
    }
    // MEALS, mealPool and meal() are attached by data-meals.js.
  };

}(window));
