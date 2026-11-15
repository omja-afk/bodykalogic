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

  /* Words that describe a food without changing what it is. */
  var PLAIN = ['steamed', 'boiled', 'plain', 'cooked', 'whole', 'wheat', 'atta', 'homemade', 'home', 'made',
               'fresh', 'small', 'medium', 'large', 'toasted', 'hard', 'soft', 'raw', 'tadka', 'a', 'of', 'the',
               'cup', 'bowl', 'katori', 'plate', 'serving', 'piece', 'pieces', 'slice', 'slices', 'glass', 'basmati',
               'white', 'phulka', 'chapati'];

  /* Amounts and containers, which say how much rather than what. */
  var MEASURE = ['g', 'gm', 'gms', 'gram', 'grams', 'ml', 'katori', 'katoris', 'bowl', 'bowls', 'glass',
                 'glasses', 'cups', 'plates', 'tbsp', 'tsp', 'spoon', 'spoons', 'scoop', 'scoops', 'and', 'with'];

  /* Does `line` say nothing but the matched food, an amount, and plain
   * description? Another name for the same food ("scoop" and "whey") is fine. */
  function onlyThis(line, hit) {
    return line.replace(hit.key, ' ').split(/[^a-z0-9.]+/).filter(Boolean).every(function (w) {
      return /^\d+(\.\d+)?[a-z]*$/.test(w) || WORD_NUM[w] != null || PLAIN.indexOf(w) !== -1 ||
             MEASURE.indexOf(w) !== -1 || /^(es|s)$/.test(w) ||
             ALIASES.some(function (a) { return a.food === hit.food && (a.key === w || a.key === w.replace(/e?s$/, '')); });
    });
  }

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

      // A known food only counts when it is the whole of what was typed:
      // "2 roti" is roti, but "chicken biryani" is not chicken.
      var hit = matchFood(line);
      if (!hit || !onlyThis(line, hit)) { unmatched.push(raw.trim()); return; }

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

  /* ------------------------------------------------------- AI meal analysis */

  /* Ask the server to estimate a meal from a photo (a data URL) or a short
   * description. Resolves the estimate, or rejects with an Error whose
   * message is ready to show. Used only by the "Log a meal" window. */
  function analyse(payload) {
    var Sync = global.Sync;
    if (!Sync || !Sync.status().signedIn) return Promise.reject(new Error('Sign in to use meal analysis.'));
    return Sync.accessToken().then(function (token) {
      return fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.ok) return body;
        var why = {
          not_configured: 'Meal analysis isn\u2019t switched on for this site yet.',
          daily_limit: 'You\u2019ve used today\u2019s ' + (body.limit || '') + ' meal analyses. Add the foods below by hand, or try again tomorrow.',
          ai_busy: 'Meal analysis is busy right now. Try again in a minute.',
          image_too_large: 'That photo is too large to analyse.',
          too_long: 'That description is too long. Keep it to a sentence or two.',
          signed_out: 'Your session has expired. Sign in again to use meal analysis.'
        }[body.error];
        if (!why && res.status === 404) why = 'Meal analysis isn\u2019t available here.';
        throw new Error(why || 'Couldn\u2019t analyse that meal. Try again, or add the foods by hand.');
      });
    }, function (e) {
      throw new Error(e && /fetch|network/i.test(String(e.message)) || !navigator.onLine
        ? 'You\u2019re offline. Meal analysis needs a connection.'
        : (e && e.message) || 'Couldn\u2019t analyse that meal.');
    });
  }

  /* Turn one estimated food into a meal item. A food the library already knows
   * is logged as that library food, so the same thing always counts the same;
   * anything else keeps the estimate's own figures. The library food only
   * counts as a match when everything else in the name is plain description —
   * "steamed rice" is rice, but "chicken biryani" is not chicken. */
  function fromEstimate(est) {
    var name = String(est.name || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    var hit = name ? matchFood(name) : null;
    if (hit && onlyThis(name, hit)) {
      var f = FD.food(hit.food);
      var weightish = f.unit === 'g' || f.unit === 'ml';
      if ((weightish && est.unit !== 'piece') || (f.unit === 'piece' && est.unit === 'piece')) {
        return { food: hit.food, qty: DG.roundQty(hit.food, est.quantity) };
      }
    }
    var q = Number(est.quantity) || 1;
    var per = function (v) { return Math.round((Number(v) || 0) / q * 10000) / 10000; };
    return {
      food: null, qty: q, ai: true,
      custom: { name: String(est.name || 'Food'), unit: est.unit === 'piece' || est.unit === 'ml' ? est.unit : 'g',
                kcal: per(est.kcal), p: per(est.protein_g), c: per(est.carbs_g), f: per(est.fat_g) }
    };
  }

  global.MealPhoto = {
    QUICK: QUICK,
    readPhoto: readPhoto,
    parsePortions: parsePortions,
    analyse: analyse,
    fromEstimate: fromEstimate,
    macrosFor: function (items) { return DG.roundMacros(DG.sumMacros(items)); }
  };

}(window));
