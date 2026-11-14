/* store.js — local persistence.
 *
 * One job: keep a copy of the state on this device so the app works with no
 * network, and hand it back on the next load. `localStorage` is the whole
 * mechanism — the cloud copy in sync.js is the source of truth, and this is the
 * offline cache in front of it.
 *
 * An earlier version also wrote to a folder chosen through the File System
 * Access API. That was dropped: it could never do what it was asked to (a
 * browser cannot open a path like Desktop/BodyKaLogic/progress from a string —
 * the user must pick it, every new browser, by hand), and once sync existed it
 * was a third copy that could disagree with the other two. Export and import
 * cover the "a file I own" case without any of that.
 */
(function (global) {
  'use strict';

  var LS_KEY = 'bkl.mirror.v1';
  var LEGACY_KEYS = ['forge.mirror.v1'];

  var listeners = [];
  var lastSaved = null;
  var lastError = null;

  function emit() {
    var snap = Store.status();
    listeners.forEach(function (fn) { try { fn(snap); } catch (e) {} });
  }

  function read() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (!raw) {
        // Anything written before the rename still deserves to be found.
        for (var i = 0; i < LEGACY_KEYS.length && !raw; i++) {
          raw = global.localStorage.getItem(LEGACY_KEYS[i]);
        }
      }
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      lastError = 'Stored data could not be read: ' + e.message;
      return null;
    }
  }

  function write(payload) {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(payload));
      lastSaved = Date.now();
      lastError = null;
      return true;
    } catch (e) {
      // Quota, or storage blocked in a private window. Worth surfacing, because
      // without the cloud this is the only copy.
      lastError = 'Could not save on this device: ' + e.message;
      emit();
      return false;
    }
  }

  var Store = {
    onChange: function (fn) { listeners.push(fn); },

    status: function () {
      return { lastSaved: lastSaved, lastError: lastError };
    },

    /* Resolves { data, source } — 'local' when something was found here,
     * 'none' for a device that has never been used. */
    boot: function () {
      var data = read();
      emit();
      return Promise.resolve({ data: data, source: data ? 'local' : 'none' });
    },

    /* Synchronous and immediate on purpose: this is the write that must not
     * fail or lag, because everything else is best-effort on top of it. */
    save: function (payload) {
      write(payload);
      emit();
    },

    exportFile: function (payload, filename) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || ('bodykalogic-' + new Date().toISOString().slice(0, 10) + '.json');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    },

    importFile: function (file) {
      return file.text().then(function (t) { return JSON.parse(t); });
    },

    wipe: function () {
      try {
        global.localStorage.removeItem(LS_KEY);
        LEGACY_KEYS.forEach(function (k) { global.localStorage.removeItem(k); });
      } catch (e) {}
      lastSaved = null;
      emit();
      return Promise.resolve();
    }
  };

  global.Store = Store;

}(window));
