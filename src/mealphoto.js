/* mealphoto.js — logging a meal from a photo and from household portions.
 *
 * The photo is a record, not a measurement. Nothing looks at the picture to
 * work out what is in it — the macros come from what you say is on the plate,
 * and the photo is stored alongside the entry so the log shows the actual meal.
 *
 * Entering the plate is built to take seconds rather than to be exhaustive: tap
 * the household portions people actually measure in — two rotis, a katori of dal,
 * a palm of chicken — or type the plate as a sentence and let the parser read it.
 * Quantities are editable everywhere, so a custom portion is just a number change.
 */
(function (global) {
  'use strict';

  var FD = global.FoodData;
  var DG = global.DietGen;

  /* Household portions. These are the units a person measures a plate in, mapped
   * to the library's grams. Quantities are a starting point, not a verdict —
   * everything stays editable. */
  var QUICK = [
    { food: 'roti',       label: 'Roti / chapati',   step: 1,   unitLabel: 'roti' },
    { food: 'rice',       label: 'Rice',             step: 150, unitLabel: 'katori (150 g)' },
    { food: 'dal',        label: 'Dal',              step: 150, unitLabel: 'katori (150 g)' },
    { food: 'mixveg',     label: 'Sabzi',            step: 150, unitLabel: 'katori (150 g)' },
    { food: 'rajma',      label: 'Rajma',            step: 150, unitLabel: 'katori (150 g)' },
    { food: 'chana',      label: 'Chole / chana',    step: 150, unitLabel: 'katori (150 g)' },
    { food: 'curd',       label: 'Curd',             step: 150, unitLabel: 'katori (150 g)' },
    { food: 'chicken',    label: 'Chicken',          step: 100, unitLabel: 'palm (100 g)' },
    { food: 'fish',       label: 'Fish',             step: 100, unitLabel: 'piece (100 g)' },
    { food: 'mutton',     label: 'Mutton',           step: 100, unitLabel: 'piece (100 g)' },
    { food: 'prawn',      label: 'Prawns',           step: 100, unitLabel: '100 g' },
    { food: 'egg',        label: 'Egg',              step: 1,   unitLabel: 'egg' },
    { food: 'paneer',     label: 'Paneer',           step: 50,  unitLabel: '50 g' },
    { food: 'tofu',       label: 'Tofu',             step: 100, unitLabel: '100 g' },
    { food: 'soyachunk',  label: 'Soya chunks',      step: 25,  unitLabel: '25 g dry' },
    { food: 'sprouts',    label: 'Sprouts',          step: 100, unitLabel: '100 g' },
    { food: 'idli',       label: 'Idli',             step: 1,   unitLabel: 'idli' },
    { food: 'dosa',       label: 'Dosa',             step: 1,   unitLabel: 'dosa' },
    { food: 'paratha',    label: 'Paratha',          step: 1,   unitLabel: 'paratha' },
    { food: 'poha',       label: 'Poha',             step: 70,  unitLabel: 'plate (70 g dry)' },
    { food: 'upma',       label: 'Upma',             step: 60,  unitLabel: 'plate (60 g dry)' },
    { food: 'oats',       label: 'Oats',             step: 50,  unitLabel: '50 g dry' },
    { food: 'bread',      label: 'Bread slice',      step: 1,   unitLabel: 'slice' },
    { food: 'milk',       label: 'Milk',             step: 200, unitLabel: 'glass (200 ml)' },
    { food: 'whey',       label: 'Whey scoop',       step: 1,   unitLabel: 'scoop' },
    { food: 'banana',     label: 'Banana',           step: 1,   unitLabel: 'banana' },
    { food: 'salad',      label: 'Salad',            step: 150, unitLabel: 'bowl (150 g)' },
    { food: 'oil',        label: 'Cooking oil',      step: 1,   unitLabel: 'tbsp' },
    { food: 'ghee',       label: 'Ghee',             step: 1,   unitLabel: 'tbsp' },
    { food: 'peanut',     label: 'Peanuts',          step: 30,  unitLabel: '30 g' },
    { food: 'pb',         label: 'Peanut butter',    step: 1,   unitLabel: 'tbsp' },
    { food: 'almond',     label: 'Almonds',          step: 25,  unitLabel: '25 g' },
    { food: 'potato',     label: 'Potato',           step: 150, unitLabel: '150 g' },
    { food: 'sambar',     label: 'Sambar',           step: 200, unitLabel: 'bowl (200 ml)' }
  ];

  /* ------------------------------------------------------------ photo handling */

  /* Downscale before anything else: a 12 MP phone photo is ~4 MB, and a stored
   * photo travels with the rest of the state on every save. A few hundred pixels
   * on the long edge is plenty to recognise a plate of food. */
  function readPhoto(file, maxEdge) {
    maxEdge = maxEdge || 900;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        return reject(new Error('That is not an image file.'));
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxEdge / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        resolve({ dataUrl: dataUrl, width: cw, height: ch });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('That image could not be read.'));
      };
      img.src = url;
    });
  }

  /* ------------------------------------------------------- typed portion entry */

  var WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
                   half: 0.5, 'two-and-half': 2.5 };

  /* Parse lines like "2 roti", "1 katori dal", "150g chicken", "chicken 150 g",
   * "3 eggs", "1 bowl rice". Anything it cannot place comes back in `unmatched`
   * so the UI can say so rather than silently losing it. */
  /* One segment is one food. Splitting on commas alone merged "3 rotis and 2
   * katori sabzi" into a single segment, where the longest alias won and the
   * rotis vanished — so the joining words people actually use split too. */
  var SEGMENT_RE = /[\n,;]+|\s+and\s+|\s+with\s+|\s*\+\s*|\s+plus\s+/i;

  function parsePortions(text) {
    var out = [], unmatched = [];
    String(text || '').split(SEGMENT_RE).forEach(function (raw) {
      var line = raw.trim().toLowerCase();
      if (!line) return;

      // explicit gram/ml weight anywhere in the line
      var gm = line.match(/(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|ml)\b/);
      var grams = gm ? parseFloat(gm[1]) : null;

      // leading count, numeric or written
      var cm = line.match(/^(\d+(?:\.\d+)?)\s+/);
      var count = cm ? parseFloat(cm[1]) : null;
      if (count === null) {
        var first = line.split(/\s+/)[0];
        if (WORD_NUM[first] != null) count = WORD_NUM[first];
      }
      // "bread 2 slices" puts the number after the food. For things counted in
      // pieces, any bare number in the segment is the count — there is nothing
      // else it could be, since weights are matched separately above.
      if (count === null && !gm) {
        var anyNum = line.match(/\b(\d+(?:\.\d+)?)\b/);
        if (anyNum) count = parseFloat(anyNum[1]);
      }

      var hit = matchFood(line);
      if (!hit) { unmatched.push(raw.trim()); return; }

      var f = FD.food(hit.food);
      var qty;
      if (grams != null && f.unit !== 'piece') {
        qty = grams;
      } else if (f.unit === 'piece') {
        qty = count != null ? count : 1;
      } else if (count != null) {
        // "2 katori dal" -> two of the household step
        qty = count * hit.step;
      } else {
        qty = hit.step;
      }
      out.push({ food: hit.food, qty: DG.roundQty(hit.food, qty) });
    });
    return { items: out, unmatched: unmatched };
  }

  /* Longest alias first, so "peanut butter" never matches as "peanut".
   *
   * Keys come from the portion label, the library name, and — for the labels that
   * are a phrase rather than a word — the word people actually type. Taking the
   * label whole was not enough: "Roti / chapati" never matched a line reading
   * "2 roti", because neither the full label nor "Whole-wheat roti" is a substring
   * of it. Generating the last word automatically would be worse ("Peanut butter"
   * would claim every mention of butter), so the handful of phrase labels name
   * their own key here.
   */
  var EXTRA_KEYS = {
    bread: ['bread'], whey: ['whey', 'scoop'], oil: ['oil'], soyachunk: ['soya', 'soy chunk'],
    peanut: ['peanut', 'groundnut'], almond: ['almond'], prawn: ['prawn'],
    sprouts: ['sprout'], oats: ['oat'], egg: ['egg'], salad: ['salad']
  };

  var ALIASES = (function () {
    var map = [];
    var seen = {};
    function add(key, food, step) {
      key = String(key).trim().toLowerCase();
      if (!key || key.length < 3 || seen[key]) return;
      seen[key] = 1;
      map.push({ key: key, food: food, step: step });
    }
    QUICK.forEach(function (q) {
      var f = FD.food(q.food);
      if (!f) return;
      // "Chole / chana" and "Roti / chapati" carry two names for one food.
      q.label.split('/').forEach(function (part) { add(part, q.food, q.step); });
      add(f.name, q.food, q.step);
      (EXTRA_KEYS[q.food] || []).forEach(function (k) { add(k, q.food, q.step); });
    });
    [['chapati','roti'],['phulka','roti'],['chawal','rice'],['bhat','rice'],
     ['daal','dal'],['dhal','dal'],['sabji','mixveg'],['sabzi','mixveg'],
     ['vegetable','mixveg'],['dahi','curd'],['yoghurt','curd'],['yogurt','curd'],
     ['murgh','chicken'],['anda','egg'],['chhole','chana'],['rajmah','rajma'],
     ['protein shake','whey'],['whey protein','whey'],['doodh','milk'],
     ['aloo','potato'],['salaad','salad'],['moongfali','peanut'],
     ['bhindi','mixveg'],['palak','mixveg'],['curry','mixveg'],['cashew','almond']
    ].forEach(function (pair) {
      var q = QUICK.filter(function (x) { return x.food === pair[1]; })[0];
      add(pair[0], pair[1], q ? q.step : 100);
    });
    return map.sort(function (a, b) { return b.key.length - a.key.length; });
  }());

  function matchFood(line) {
    for (var i = 0; i < ALIASES.length; i++) {
      if (line.indexOf(ALIASES[i].key) !== -1) return ALIASES[i];
    }
    return null;
  }

  global.MealPhoto = {
    QUICK: QUICK,
    readPhoto: readPhoto,
    parsePortions: parsePortions,
    macrosFor: function (items) { return DG.roundMacros(DG.sumMacros(items)); }
  };

}(window));
