/* store.js — persistence.
 *
 * Three tiers, chosen by what the browser gives us:
 *   folder : showDirectoryPicker  -> <dir>/gymtrack-data.json + <dir>/backups/*.json
 *   file   : showSaveFilePicker   -> one chosen .json file
 *   local  : localStorage only
 *
 * The chosen handle lives in IndexedDB (handles are structured-cloneable but not
 * JSON-serialisable, so localStorage cannot hold them). On every load we try to
 * restore it; if the permission has lapsed we surface a reconnect prompt rather
 * than silently dropping to localStorage, because a silent downgrade is how people
 * end up with two diverging copies of their history.
 *
 * localStorage is ALWAYS written as a mirror, whatever tier is active.
 */
(function (global) {
  'use strict';

  var DATA_FILE = 'gymtrack-data.json';
  var LS_KEY = 'forge.mirror.v1';
  var LS_TIER = 'forge.tier.v1';
  var IDB_NAME = 'forge-fs';
  var IDB_STORE = 'handles';

  var state = {
    tier: 'local',        // 'folder' | 'file' | 'local'
    handle: null,         // FileSystemDirectoryHandle | FileSystemFileHandle
    needsPermission: false,
    pathLabel: 'Browser storage',
    lastSaved: null,
    lastError: null
  };

  var saveTimer = null;
  var pendingPayload = null;
  var listeners = [];

  /* ---------------------------------------------------------------- IndexedDB */

  function idb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('IndexedDB unavailable'));
      var req = global.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(key, value) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    }).catch(function () { return false; });
  }

  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function () { db.close(); resolve(req.result || null); };
        req.onerror = function () { db.close(); reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function idbDel(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); resolve(false); };
      });
    }).catch(function () { return false; });
  }

  /* ------------------------------------------------------------- capabilities */

  function canFolder() { return typeof global.showDirectoryPicker === 'function'; }
  function canFile() { return typeof global.showSaveFilePicker === 'function'; }

  function capability() {
    if (canFolder()) return 'folder';
    if (canFile()) return 'file';
    return 'local';
  }

  /* ----------------------------------------------------------------- mirror IO */

  function mirrorWrite(payload) {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(payload));
      global.localStorage.setItem(LS_TIER, state.tier);
      return true;
    } catch (e) {
      state.lastError = 'Browser storage is full or blocked: ' + e.message;
      return false;
    }
  }

  function mirrorRead() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------- permissions */

  function queryPerm(handle) {
    if (!handle || !handle.queryPermission) return Promise.resolve('granted');
    return handle.queryPermission({ mode: 'readwrite' }).catch(function () { return 'denied'; });
  }

  function requestPerm(handle) {
    if (!handle || !handle.requestPermission) return Promise.resolve('granted');
    return handle.requestPermission({ mode: 'readwrite' }).catch(function () { return 'denied'; });
  }

  /* -------------------------------------------------------------- folder/file */

  function fileHandleFor(handle, create) {
    if (!handle) return Promise.reject(new Error('no handle'));
    if (handle.kind === 'file') return Promise.resolve(handle);
    return handle.getFileHandle(DATA_FILE, { create: !!create });
  }

  function readFromHandle(handle) {
    return fileHandleFor(handle, false)
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); })
      .then(function (txt) {
        if (!txt || !txt.trim()) return null;
        return JSON.parse(txt);
      })
      .catch(function (e) {
        // NotFoundError simply means a fresh folder — that is not an error.
        if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null;
        state.lastError = 'Could not read data file: ' + (e && e.message);
        return null;
      });
  }

  function writeToHandle(handle, payload) {
    var text = JSON.stringify(payload, null, 2);
    return fileHandleFor(handle, true)
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
  }

  // One snapshot per calendar day, kept under <dir>/backups/.
  function writeBackup(handle, payload) {
    if (!handle || handle.kind !== 'directory') return Promise.resolve();
    var day = new Date().toISOString().slice(0, 10);
    return handle.getDirectoryHandle('backups', { create: true })
      .then(function (dir) {
        return dir.getFileHandle('gymtrack-' + day + '.json', { create: true });
      })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) {
        return w.write(JSON.stringify(payload, null, 2)).then(function () { return w.close(); });
      })
      .catch(function () { /* backups are best-effort */ });
  }

  function labelFor(handle) {
    if (!handle) return 'Browser storage';
    if (handle.kind === 'directory') return handle.name + '/' + DATA_FILE;
    return handle.name;
  }

  /* ------------------------------------------------------------------- events */

  function emit() {
    var snap = Store.status();
    listeners.forEach(function (fn) { try { fn(snap); } catch (e) {} });
  }

  /* -------------------------------------------------------------------- public */

  var Store = {

    onChange: function (fn) { listeners.push(fn); },

    status: function () {
      return {
        tier: state.tier,
        capability: capability(),
        needsPermission: state.needsPermission,
        pathLabel: state.pathLabel,
        lastSaved: state.lastSaved,
        lastError: state.lastError,
        connected: state.tier !== 'local' && !state.needsPermission
      };
    },

    /* Boot: find the info path, or decide this is a new user.
     * Resolves { data, source } where source is 'folder' | 'file' | 'local' | 'none'. */
    boot: function () {
      return idbGet('infoHandle').then(function (handle) {
        if (!handle) {
          state.tier = 'local';
          state.pathLabel = 'Browser storage';
          var local = mirrorRead();
          emit();
          return { data: local, source: local ? 'local' : 'none' };
        }

        state.handle = handle;
        state.tier = handle.kind === 'directory' ? 'folder' : 'file';
        state.pathLabel = labelFor(handle);

        return queryPerm(handle).then(function (perm) {
          if (perm !== 'granted') {
            // Chrome drops the grant between sessions unless the origin is
            // persisted. Re-requesting needs a user gesture, so we flag it and
            // let the UI show a Reconnect button, serving the mirror meanwhile.
            state.needsPermission = true;
            emit();
            var local = mirrorRead();
            return { data: local, source: local ? 'local' : 'none' };
          }
          state.needsPermission = false;
          return readFromHandle(handle).then(function (data) {
            emit();
            if (data) return { data: data, source: state.tier };
            var local = mirrorRead();
            return { data: local, source: local ? 'local' : 'none' };
          });
        });
      });
    },

    /* Re-request a lapsed permission. Must be called from a user gesture. */
    reconnect: function () {
      if (!state.handle) return Promise.resolve(null);
      return requestPerm(state.handle).then(function (perm) {
        if (perm !== 'granted') {
          state.lastError = 'Permission to the data folder was declined.';
          emit();
          return null;
        }
        state.needsPermission = false;
        state.lastError = null;
        return readFromHandle(state.handle).then(function (data) {
          emit();
          return data;
        });
      });
    },

    /* Let the user choose the info path. User gesture required. */
    connect: function () {
      var cap = capability();
      var picker;

      if (cap === 'folder') {
        picker = global.showDirectoryPicker({ id: 'forge-data', mode: 'readwrite', startIn: 'documents' });
      } else if (cap === 'file') {
        picker = global.showSaveFilePicker({
          id: 'forge-data',
          suggestedName: DATA_FILE,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
      } else {
        return Promise.reject(new Error(
          'This browser cannot write to a folder. Your data stays in browser storage — use Export to keep a copy.'
        ));
      }

      return picker.then(function (handle) {
        return requestPerm(handle).then(function (perm) {
          if (perm !== 'granted') throw new Error('Permission declined.');
          state.handle = handle;
          state.tier = handle.kind === 'directory' ? 'folder' : 'file';
          state.needsPermission = false;
          state.pathLabel = labelFor(handle);
          state.lastError = null;
          return idbPut('infoHandle', handle).then(function () {
            // Read whatever is already there — connecting to a folder that has
            // history should adopt that history, not clobber it.
            return readFromHandle(handle);
          }).then(function (existing) {
            emit();
            return existing;
          });
        });
      });
    },

    /* Forget the folder, drop back to browser storage. Data is untouched on disk. */
    disconnect: function () {
      return idbDel('infoHandle').then(function () {
        state.handle = null;
        state.tier = 'local';
        state.needsPermission = false;
        state.pathLabel = 'Browser storage';
        emit();
        return true;
      });
    },

    /* Debounced write-through. Mirror is synchronous and immediate; the disk
     * write is coalesced so a burst of edits is one file write. */
    save: function (payload) {
      pendingPayload = payload;
      mirrorWrite(payload);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { Store.flush(); }, 400);
    },

    flush: function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      var payload = pendingPayload;
      if (!payload) return Promise.resolve(false);
      if (!state.handle || state.needsPermission) {
        state.lastSaved = Date.now();
        emit();
        return Promise.resolve(false);
      }
      return writeToHandle(state.handle, payload)
        .then(function () { return writeBackup(state.handle, payload); })
        .then(function () {
          state.lastSaved = Date.now();
          state.lastError = null;
          emit();
          return true;
        })
        .catch(function (e) {
          state.lastError = 'Write failed: ' + (e && e.message) + ' — your data is still in browser storage.';
          if (e && e.name === 'NotAllowedError') state.needsPermission = true;
          emit();
          return false;
        });
    },

    exportFile: function (payload, filename) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || ('gymtrack-' + new Date().toISOString().slice(0, 10) + '.json');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    },

    importFile: function (file) {
      return file.text().then(function (t) { return JSON.parse(t); });
    },

    wipe: function () {
      try { global.localStorage.removeItem(LS_KEY); } catch (e) {}
      return idbDel('infoHandle').then(function () {
        state.handle = null;
        state.tier = 'local';
        state.pathLabel = 'Browser storage';
        state.needsPermission = false;
        emit();
      });
    }
  };

  global.Store = Store;

  // Last-ditch flush. Not guaranteed, but catches the common tab-close case.
  global.addEventListener('beforeunload', function () { Store.flush(); });
  global.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') Store.flush();
  });

}(window));
