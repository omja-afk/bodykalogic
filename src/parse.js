/* parse.js — importing an existing plan from text, a file, or a photo.
 *
 * The parser is deliberately forgiving. Plans come off a trainer's notepad, a
 * WhatsApp message or a gym printout, and they never agree on a format. It reads
 * day headers and set notation, and anything it cannot place is kept as a note on
 * the day rather than dropped — losing a line silently is worse than showing it
 * unparsed.
 *
 * Photos use Tesseract.js, which runs the OCR in the browser (WASM). The engine
 * is fetched from a CDN the first time and cached by the browser; the image
 * itself never leaves the machine. If the download fails — offline, blocked — the
 * photo is shown beside an empty box so the plan can be typed in from it.
 */
(function (global) {
  'use strict';

  var EX = global.ExerciseData;
  var TESS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js';

  /* Lines that start a new day. Matches "Day 1", "Day 2 - Push", "Monday:",
   * "Push Day", "Upper A", "Session 3". */
  var DAY_RE = new RegExp(
    '^\\s*(?:' +
      'day\\s*\\d+|' +
      'session\\s*\\d+|' +
      '(?:mon|tues?|wednes|thurs?|fri|satur|sun)day|' +
      '(?:push|pull|legs?|upper|lower|full\\s*body|chest|back|shoulders?|arms?|core|cardio|rest)' +
        '(?:\\s*(?:day|[a-c]|\\d))?' +
    ')\\s*[:.\\-–—]?\\s*(.*)$', 'i');

  /* "4x8", "4 x 8", "3x10-12", "4 sets of 8", with an optional load:
   * "60kg", "@60", "x 60 kg", "60 lbs". */
  var SETS_RE = /(\d+)\s*(?:x|×|sets?\s*(?:of)?)\s*(\d+)\s*(?:[-–]\s*(\d+))?/i;
  // Two accepted load forms. A bare number is NOT one of them — "4x8" would be
  // read as 8 kg. Either the unit is spelled out, or an @ marks it as a load.
  var LOAD_RE = /@\s*(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|pounds?)?|(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs|pounds?)\b/i;

  function readLoad(line) {
    var m = LOAD_RE.exec(line);
    if (!m) return null;
    var value = m[1] !== undefined ? m[1] : m[3];
    var unit = m[1] !== undefined ? m[2] : m[4];
    return { value: parseFloat(value), unit: /lb|pound/i.test(unit || '') ? 'lb' : 'kg' };
  }
  var TIME_RE = /(\d+)\s*(min|mins|minutes|sec|secs|seconds)\b/i;

  var NOISE_RE = /^\s*(?:warm[\s-]?up|cool[\s-]?down|stretch|rest|notes?|week\s*\d+|total|$)/i;

  /* Gym shorthand, expanded before matching. Without this "Incline DB Press"
   * matches the barbell version — the right pattern but the wrong implement. */
  var ABBREV = [
    [/\bdb\b/gi, 'dumbbell'], [/\bbb\b/gi, 'barbell'], [/\bkb\b/gi, 'kettlebell'],
    [/\bohp\b/gi, 'overhead press'], [/\bbp\b/gi, 'bench press'],
    [/\brdl\b/gi, 'romanian deadlift'], [/\bsldl\b/gi, 'stiff-leg deadlift'],
    [/\bdl\b/gi, 'deadlift'], [/\bbor\b/gi, 'barbell row'],
    [/\bcgbp\b/gi, 'close-grip bench press'], [/\bbss\b/gi, 'bulgarian split squat'],
    [/\bpulldowns?\b/gi, 'pulldown'], [/\bcurls?\b/gi, 'curl'],
    [/\braises?\b/gi, 'raise'], [/\bextensions?\b/gi, 'extension'],
    [/\bpress(es)?\b/gi, 'press'], [/\brows?\b/gi, 'row'],
    [/\bsquats?\b/gi, 'squat'], [/\blunges?\b/gi, 'lunge'],
    [/\bdips?\b/gi, 'dip'], [/\bflys?\b|\bflies\b/gi, 'fly'],
    [/\bbicep?s?\b/gi, 'biceps'], [/\btricep?s?\b/gi, 'triceps'],
    [/\blats?\b/gi, 'lat'], [/\bdelts?\b/gi, 'delt'], [/\babs?\b/gi, 'core'],
    [/\bpushups?\b|\bpush ups?\b/gi, 'push-up'],
    [/\bpullups?\b|\bpull ups?\b/gi, 'pull-up'],
    [/\bchinups?\b|\bchin ups?\b/gi, 'chin-up'],
    [/\bstepups?\b|\bstep ups?\b/gi, 'step-up']
  ];

  function expand(name) {
    var out = String(name || '');
    ABBREV.forEach(function (a) { out = out.replace(a[0], a[1]); });
    return out;
  }

  function cleanName(s) {
    return String(s || '')
      .replace(SETS_RE, ' ')
      .replace(LOAD_RE, ' ')
      .replace(TIME_RE, ' ')
      .replace(/^[\s\-–—•*·\d.)]+/, '')
      .replace(/[\s\-–—:,]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* Fuzzy-match a parsed name onto the library, so an imported plan still gets
   * working swap suggestions. Falls back to a loose token overlap. */
  var MUSCLE_WORDS = {
    biceps: 'biceps', triceps: 'triceps', chest: 'chest', pecs: 'chest',
    back: 'back', lat: 'back', lats: 'back', shoulder: 'shoulders',
    shoulders: 'shoulders', delt: 'shoulders', delts: 'shoulders',
    quad: 'quads', quads: 'quads', hamstring: 'hamstrings', hamstrings: 'hamstrings',
    hams: 'hamstrings', glute: 'glutes', glutes: 'glutes', calf: 'calves',
    calves: 'calves', trap: 'traps', traps: 'traps', core: 'core', abs: 'core',
    forearm: 'forearms', forearms: 'forearms'
  };

  function matchExercise(name) {
    if (!name) return null;
    var exact = EX.byName(name);
    if (exact) return exact;

    var norm = function (t) {
      return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    };
    var n = norm(expand(name));
    if (!n) return null;

    var exact2 = EX.EXERCISES.filter(function (ex) { return norm(ex.name) === n; })[0];
    if (exact2) return exact2;

    var want = n.split(' ').filter(function (w) { return w.length > 2; });
    if (!want.length) return null;

    var best = null, bestScore = 0;
    EX.EXERCISES.forEach(function (ex) {
      // Empty tokens are fatal here: ''.indexOf('') is 0, so a blank hay word
      // matched every query word and "Bicep curls" came back as "Dips".
      var hayWords = norm(ex.name).split(' ').filter(Boolean);
      if (!hayWords.length) return;

      var hits = 0;
      want.forEach(function (w) {
        var got = hayWords.some(function (hw) {
          if (hw === w) return true;
          if (w.length >= 4 && hw.indexOf(w) === 0) return true;
          if (hw.length >= 4 && w.indexOf(hw) === 0) return true;
          return false;
        });
        if (got) hits++;
      });
      if (!hits) return;

      var coverage = hits / want.length;                 // how much of the query matched
      var precision = hits / hayWords.length;            // how much of the candidate is query
      var score = coverage * 2 + precision;

      // People name the muscle, not the movement: "bicep curls", "chest press".
      // No exercise is called "biceps", so without this the muscle word is dead
      // weight and the line goes unmatched.
      if (MUSCLE_WORDS[want[0]] || want.some(function (w) { return MUSCLE_WORDS[w]; })) {
        var muscles = want.filter(function (w) { return MUSCLE_WORDS[w]; })
                          .map(function (w) { return MUSCLE_WORDS[w]; });
        if (muscles.indexOf(ex.primary) !== -1) score += 0.8;
      }
      if (score > bestScore) { bestScore = score; best = ex; }
    });

    // Needs most of the query matched, not one stray word in common.
    return bestScore >= 1.6 ? best : null;
  }

  function parsePlanText(text) {
    var lines = String(text || '').split(/\r?\n/);
    var days = [];
    var current = null;
    var unmatched = 0, matched = 0;

    function startDay(name, focus) {
      current = { name: name.trim() || ('Day ' + (days.length + 1)), focus: (focus || '').trim(), slots: [], notes: '' };
      days.push(current);
    }

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;

      var dm = DAY_RE.exec(line);
      // A day header is only a header if it has no set notation on it — "Legs
      // 4x10" is an exercise line, not a new day.
      if (dm && !SETS_RE.test(line)) {
        var head = line.replace(/[:.\-–—]\s*$/, '');
        var parts = head.split(/[:\-–—]/);
        startDay(parts[0], parts.slice(1).join(' '));
        return;
      }

      if (NOISE_RE.test(line)) {
        if (current) current.notes += (current.notes ? '\n' : '') + line;
        return;
      }

      if (!current) startDay('Day 1', '');

      var sm = SETS_RE.exec(line);
      var lm = readLoad(line);
      var tm = TIME_RE.exec(line);
      var name = cleanName(line);
      if (!name || name.length < 3) {
        current.notes += (current.notes ? '\n' : '') + line;
        return;
      }

      var ex = matchExercise(name);
      if (ex) matched++; else unmatched++;

      current.slots.push({
        exId: ex ? ex.id : null,
        name: ex ? ex.name : name,
        importedAs: ex && ex.name.toLowerCase() !== name.toLowerCase() ? name : null,
        pattern: ex ? ex.pattern : 'core',
        sets: sm ? parseInt(sm[1], 10) : (tm ? 1 : 3),
        reps: sm ? (sm[3] ? sm[2] + '-' + sm[3] : sm[2]) : (tm ? tm[1] + ' ' + tm[2] : '8-12'),
        rest: 90,
        weight: lm ? lm.value : null,
        weightUnit: lm ? lm.unit : null,
        note: ''
      });
    });

    var kept = days.filter(function (d) { return d.slots.length || d.notes; });
    return {
      days: kept,
      stats: { days: kept.length, matched: matched, unmatched: unmatched,
               exercises: matched + unmatched }
    };
  }

  /* Diet import: "Breakfast: 3 eggs, 2 toast" style lines, grouped by slot. */
  var SLOT_RE = /^\s*(breakfast|lunch|dinner|snack|mid[\s-]?morning|evening|pre[\s-]?workout|post[\s-]?workout|brunch|supper)\s*[:.\-–—]?\s*(.*)$/i;

  function slotFor(word) {
    var w = word.toLowerCase();
    if (/break|brunch/.test(w)) return 'breakfast';
    if (/lunch/.test(w)) return 'lunch';
    if (/dinner|supper/.test(w)) return 'dinner';
    return 'snack';
  }

  function parseDietText(text) {
    var MP = global.MealPhoto;
    var lines = String(text || '').split(/\r?\n/);
    var meals = [];
    var current = null;
    var unmatched = [];

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var sm = SLOT_RE.exec(line);
      if (sm) {
        current = { slot: slotFor(sm[1]), title: sm[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }), items: [] };
        meals.push(current);
        if (sm[2]) addItems(current, sm[2]);
        return;
      }
      if (!current) {
        current = { slot: 'snack', title: 'Meal', items: [] };
        meals.push(current);
      }
      addItems(current, line);
    });

    function addItems(meal, txt) {
      var r = MP.parsePortions(txt);
      r.items.forEach(function (it) { meal.items.push(it); });
      r.unmatched.forEach(function (u) { unmatched.push(u); });
    }

    return {
      meals: meals.filter(function (m) { return m.items.length; }),
      unmatched: unmatched
    };
  }

  /* ------------------------------------------------------------------- OCR */

  var tessLoading = null;

  function loadTesseract() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (tessLoading) return tessLoading;
    tessLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = TESS_URL;
      s.onload = function () {
        global.Tesseract ? resolve(global.Tesseract)
                         : reject(new Error('The OCR engine loaded but did not start.'));
      };
      s.onerror = function () {
        tessLoading = null;
        reject(new Error('Could not download the OCR engine. Type the plan in from the photo instead.'));
      };
      document.head.appendChild(s);
    });
    return tessLoading;
  }

  /* onProgress gets 0..1 so the UI can show something during the first download. */
  function ocr(dataUrl, onProgress) {
    return loadTesseract().then(function (T) {
      return T.recognize(dataUrl, 'eng', {
        logger: function (m) {
          if (onProgress && typeof m.progress === 'number') onProgress(m.progress, m.status);
        }
      });
    }).then(function (res) {
      return (res && res.data && res.data.text) || '';
    });
  }

  /* --------------------------------------------------------------- files */

  function readFile(file) {
    var name = (file.name || '').toLowerCase();
    if (/\.json$/.test(name)) {
      return file.text().then(function (t) { return { kind: 'json', data: JSON.parse(t) }; });
    }
    if (/^image\//.test(file.type)) {
      return global.MealPhoto.readPhoto(file, 1600).then(function (p) { return { kind: 'image', photo: p }; });
    }
    return file.text().then(function (t) { return { kind: 'text', text: t }; });
  }

  global.PlanParse = {
    parsePlanText: parsePlanText,
    parseDietText: parseDietText,
    matchExercise: matchExercise,
    ocr: ocr,
    readFile: readFile
  };

}(window));
