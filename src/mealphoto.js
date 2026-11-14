/* mealphoto.js — logging a meal from a photo, or from household portions.
 *
 * A static page cannot look at a photograph on its own; there is no model in the
 * browser. So this offers two honest paths and never pretends the first one
 * happened when it didn't:
 *
 *   1. Portions (always available, offline, no key). Tap the things on the plate in
 *      the units people actually use — two rotis, a katori of dal, a palm of chicken
 *      — or type them. The macros are computed from the food library. The photo is
 *      still attached to the entry as a record of the meal.
 *
 *   2. Estimate from the photo (opt-in). If you put your own Claude API key in
 *      Profile & Data, the photo is sent to the Claude API, which returns the items
 *      and portions it can see; those land in the same editable list as path 1, so
 *      you correct anything wrong before it is saved.
 *
 * Path 2 is the only thing in this app that touches the network, and it only runs
 * when a key is present and the button is pressed.
 */
(function (global) {
  'use strict';

  var FD = global.FoodData;
  var DG = global.DietGen;

  var API_URL = 'https://api.anthropic.com/v1/messages';
  var API_VERSION = '2026-10-21';
  var DEFAULT_MODEL = 'claude-opus-5-5';

  var MODELS = [
    { id: 'claude-opus-5-5',   label: 'Opus 5.5 — most accurate' },
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 — faster, cheaper' },
    { id: 'claude-haiku-5-5',  label: 'Haiku 5.5 — cheapest' }
  ];

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

  /* Downscale before anything else: a 12 MP phone photo is ~4 MB, and these are
   * written into the data file and (optionally) uploaded. 900 px on the long edge
   * is plenty to recognise a plate of food. */
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
        resolve({
          dataUrl: dataUrl,
          base64: dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
          mediaType: 'image/jpeg',
          width: cw, height: ch,
          bytes: Math.round(dataUrl.length * 0.75)
        });
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
  function parsePortions(text) {
    var out = [], unmatched = [];
    String(text || '').split(/[\n,;]+/).forEach(function (raw) {
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

  /* Longest alias first, so "peanut butter" never matches as "peanut". */
  var ALIASES = (function () {
    var map = [];
    QUICK.forEach(function (q) {
      var f = FD.food(q.food);
      if (!f) return;
      map.push({ key: q.label.toLowerCase(), food: q.food, step: q.step });
      map.push({ key: f.name.toLowerCase(), food: q.food, step: q.step });
    });
    [['chapati','roti'],['phulka','roti'],['chawal','rice'],['bhat','rice'],
     ['daal','dal'],['dhal','dal'],['sabji','mixveg'],['sabzi','mixveg'],
     ['vegetable','mixveg'],['veg','mixveg'],['dahi','curd'],['yoghurt','curd'],
     ['yogurt','curd'],['murgh','chicken'],['anda','egg'],['eggs','egg'],
     ['rotis','roti'],['chhole','chana'],['chole','chana'],['rajmah','rajma'],
     ['protein shake','whey'],['whey protein','whey'],['doodh','milk'],
     ['aloo','potato'],['salaad','salad'],['moongfali','peanut'],['nuts','almond'],
     ['bhindi','mixveg'],['palak','mixveg'],['curry','mixveg']
    ].forEach(function (p) {
      var q = QUICK.filter(function (x) { return x.food === p[1]; })[0];
      map.push({ key: p[0], food: p[1], step: q ? q.step : 100 });
    });
    return map.sort(function (a, b) { return b.key.length - a.key.length; });
  }());

  function matchFood(line) {
    for (var i = 0; i < ALIASES.length; i++) {
      if (line.indexOf(ALIASES[i].key) !== -1) return ALIASES[i];
    }
    return null;
  }

  /* ---------------------------------------------------- optional photo estimate */

  function schema() {
    var ids = Object.keys(FD.FOODS);
    return {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Every distinct food visible on the plate.',
          items: {
            type: 'object',
            properties: {
              food_id: { type: 'string', enum: ids.concat(['unknown']),
                         description: 'Closest match from the library, or "unknown".' },
              label: { type: 'string', description: 'What you see, in plain words.' },
              grams: { type: 'number', description: 'Estimated cooked weight in grams, or the count for items measured in pieces (rotis, eggs, idlis).' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
            },
            required: ['food_id', 'label', 'grams', 'confidence'],
            additionalProperties: false
          }
        },
        notes: { type: 'string', description: 'Anything uncertain, in one short sentence.' }
      },
      required: ['items', 'notes'],
      additionalProperties: false
    };
  }

  function promptText() {
    return [
      'Identify every food in this photo of a meal and estimate the portion of each.',
      '',
      'Return grams of cooked weight, except for foods counted in pieces — rotis,',
      'parathas, eggs, idlis, dosas, bread slices, bananas — where you return the',
      'count instead. Use ordinary serving sizes as a reference: one roti is about',
      '40 g, a katori of dal or sabzi about 150 g, a palm of chicken about 100 g.',
      '',
      'Match each item to the closest food_id in the schema. Use "unknown" only when',
      'nothing is close. Estimate conservatively and mark anything you are unsure of',
      'as low confidence — the person will check your numbers before saving them.'
    ].join('\n');
  }

  /* The only network call in this app. Returns items shaped like the portion list
   * so both paths feed the same editor. */
  function estimateFromPhoto(photo, settings) {
    var key = settings && settings.apiKey;
    if (!key) {
      return Promise.reject(new Error(
        'No API key saved. Add one in Profile & Data to estimate from a photo, or enter the portions yourself.'
      ));
    }

    var body = {
      model: (settings.model || DEFAULT_MODEL),
      max_tokens: 2000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: schema() }
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 } },
          { type: 'text', text: promptText() }
        ]
      }]
    };

    return fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        // Required for a request made straight from a page rather than a server.
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (txt) {
        if (!res.ok) {
          var msg = txt;
          try { msg = (JSON.parse(txt).error || {}).message || txt; } catch (e) {}
          throw new Error('Claude API ' + res.status + ': ' + msg);
        }
        return JSON.parse(txt);
      });
    }).then(function (data) {
      if (data.stop_reason === 'refusal') {
        throw new Error('The request was declined by the API. Enter the portions yourself.');
      }
      var textBlock = (data.content || []).filter(function (b) { return b.type === 'text'; })[0];
      if (!textBlock) throw new Error('The API returned no readable result.');
      var parsed = JSON.parse(textBlock.text);

      var items = [], skipped = [];
      (parsed.items || []).forEach(function (it) {
        var f = FD.food(it.food_id);
        if (!f || it.food_id === 'unknown') { skipped.push(it.label || it.food_id); return; }
        items.push({
          food: it.food_id,
          qty: DG.roundQty(it.food_id, Number(it.grams) || 0),
          confidence: it.confidence,
          label: it.label
        });
      });

      return {
        items: items,
        skipped: skipped,
        notes: parsed.notes || '',
        usage: data.usage || null
      };
    });
  }

  global.MealPhoto = {
    QUICK: QUICK,
    MODELS: MODELS,
    DEFAULT_MODEL: DEFAULT_MODEL,
    readPhoto: readPhoto,
    parsePortions: parsePortions,
    estimateFromPhoto: estimateFromPhoto,
    macrosFor: function (items) { return DG.roundMacros(DG.sumMacros(items)); }
  };

}(window));
