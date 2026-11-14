/* sync.js — accounts and cross-device sync, over Supabase's REST API.
 *
 * No SDK and no CDN script: the auth and database endpoints are ordinary HTTP,
 * so plain fetch does the job and the app still loads with no network at all.
 *
 * The model is offline-first, because the place this app gets used is a gym with
 * bad wifi:
 *
 *   - every change is written to localStorage immediately and unconditionally
 *   - a push to the cloud is attempted, debounced
 *   - if that push fails, the state is simply marked dirty; nothing is lost and
 *     nothing blocks. The next successful push sends the latest state, so a
 *     queue of individual edits is unnecessary — the document IS the queue
 *   - coming back online, or signing in, flushes it
 *
 * Conflicts are resolved by asking, not by guessing. Two devices editing the
 * same day is rare enough that a silent merge would be more surprising than a
 * question, and a wrong silent merge loses a workout.
 */
(function (global) {
  'use strict';

  var CFG = global.AppConfig;
  var SESSION_KEY = 'bkl.session.v1';
  var DIRTY_KEY = 'bkl.dirty.v1';

  var session = null;      // { access_token, refresh_token, expires_at, user }
  var listeners = [];
  var pushTimer = null;
  var pending = null;
  var status = {
    state: 'off',          // off | signed-out | syncing | synced | offline | error
    message: '',
    lastSync: null,
    dirty: false
  };

  /* ------------------------------------------------------------- plumbing */

  function cfg() { return CFG.supabase; }
  function enabled() { return CFG.syncConfigured(); }

  function emit() {
    var snap = Sync.status();
    listeners.forEach(function (fn) { try { fn(snap); } catch (e) {} });
  }

  function setStatus(state, message) {
    status.state = state;
    status.message = message || '';
    emit();
  }

  function readJSON(key) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }

  function markDirty(on) {
    status.dirty = !!on;
    writeJSON(DIRTY_KEY, !!on);
    emit();
  }

  /* HTTP against the project. `auth` false for the auth endpoints that take only
   * the anon key; true to send the user's access token as well. */
  function api(path, opts) {
    opts = opts || {};
    var headers = {
      'apikey': cfg().anonKey,
      'content-type': 'application/json'
    };
    if (opts.auth !== false && session && session.access_token) {
      headers['Authorization'] = 'Bearer ' + session.access_token;
    } else {
      headers['Authorization'] = 'Bearer ' + cfg().anonKey;
    }
    Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });

    return fetch(cfg().url + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        if (txt) { try { data = JSON.parse(txt); } catch (e) { data = txt; } }
        if (!res.ok) {
          var msg = (data && (data.msg || data.message || data.error_description ||
                              data.error || data.hint)) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  /* --------------------------------------------------------------- session */

  function saveSession(s) {
    if (!s) { session = null; writeJSON(SESSION_KEY, null); return; }
    session = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      // expires_in is seconds from now; store an absolute moment instead.
      expires_at: Date.now() + ((s.expires_in || 3600) * 1000),
      user: s.user ? { id: s.user.id, email: s.user.email } : (session && session.user)
    };
    writeJSON(SESSION_KEY, session);
  }

  function loadSession() {
    session = readJSON(SESSION_KEY);
    return session;
  }

  /* Refresh a little before expiry, so a long save does not land on a dead token. */
  function ensureFresh() {
    if (!session) return Promise.reject(new Error('Not signed in.'));
    if (Date.now() < session.expires_at - 60000) return Promise.resolve(session);
    return api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', auth: false,
      body: { refresh_token: session.refresh_token }
    }).then(function (s) {
      saveSession(s);
      return session;
    }).catch(function (e) {
      // A refresh token that no longer works means the session is over.
      saveSession(null);
      setStatus('signed-out', 'Your session expired — sign in again.');
      throw e;
    });
  }

  /* ------------------------------------------------------------------ auth */

  function signUp(email, password) {
    return api('/auth/v1/signup', {
      method: 'POST', auth: false,
      body: { email: email, password: password }
    }).then(function (res) {
      // With email confirmation on, Supabase returns a user but no session.
      if (res && res.access_token) {
        saveSession(res);
        setStatus('synced', 'Account created.');
        return { confirmed: true };
      }
      setStatus('signed-out', 'Check your email to confirm the account, then sign in.');
      return { confirmed: false };
    });
  }

  function signIn(email, password) {
    return api('/auth/v1/token?grant_type=password', {
      method: 'POST', auth: false,
      body: { email: email, password: password }
    }).then(function (res) {
      saveSession(res);
      setStatus('syncing', 'Signed in.');
      return session.user;
    });
  }

  function signOut() {
    var had = !!session;
    if (had) {
      api('/auth/v1/logout', { method: 'POST' }).catch(function () { /* local sign-out regardless */ });
    }
    saveSession(null);
    setStatus('signed-out', '');
    return Promise.resolve();
  }

  /* -------------------------------------------------------------- transfer */

  function pull() {
    return ensureFresh().then(function () {
      return api('/rest/v1/' + CFG.table + '?user_id=eq.' + session.user.id +
                 '&select=data,updated_at');
    }).then(function (rows) {
      if (!rows || !rows.length) return null;
      return { data: rows[0].data, updatedAt: rows[0].updated_at };
    });
  }

  function push(state) {
    if (!enabled() || !session) return Promise.resolve(false);
    return ensureFresh().then(function () {
      setStatus('syncing', 'Saving…');
      return api('/rest/v1/' + CFG.table, {
        method: 'POST',
        headers: {
          // Upsert: one row per user, so a conflict on the primary key is the
          // normal case rather than an error.
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: [{ user_id: session.user.id, data: state }]
      });
    }).then(function () {
      status.lastSync = Date.now();
      markDirty(false);
      setStatus('synced', '');
      return true;
    }).catch(function (e) {
      markDirty(true);
      if (!navigator.onLine) {
        setStatus('offline', 'Offline — saved here, will sync when you reconnect.');
      } else {
        setStatus('error', e.message);
      }
      return false;
    });
  }

  /* Debounced, so a burst of edits is one request. */
  function schedulePush(state) {
    if (!enabled() || !session) return;
    pending = state;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      if (pending) push(pending);
    }, 1200);
  }

  function flush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (pending && session) return push(pending);
    return Promise.resolve(false);
  }

  /* ------------------------------------------------------------------ API */

  var Sync = {
    onChange: function (fn) { listeners.push(fn); },

    status: function () {
      return {
        enabled: enabled(),
        signedIn: !!session,
        email: session && session.user ? session.user.email : null,
        state: enabled() ? status.state : 'off',
        message: status.message,
        lastSync: status.lastSync,
        dirty: status.dirty
      };
    },

    init: function () {
      if (!enabled()) { setStatus('off', ''); return Promise.resolve(null); }
      loadSession();
      status.dirty = !!readJSON(DIRTY_KEY);
      if (!session) { setStatus('signed-out', ''); return Promise.resolve(null); }
      setStatus('syncing', 'Checking for changes…');
      return pull().then(function (remote) {
        setStatus('synced', '');
        return remote;
      }).catch(function (e) {
        // A stored session the server rejects is not a session. Say so and end
        // it, so boot puts the sign-in screen up rather than opening the app on
        // an account it cannot actually reach — every edit made in that state
        // would be stranded on this device, which is the split history the
        // account exists to prevent.
        //
        // Only an explicit rejection counts. A request that failed because
        // there is no network must leave the session alone: working offline
        // from the local copy is the point, not a reason to sign anyone out.
        if (e && (e.status === 401 || e.status === 403)) {
          saveSession(null);
          setStatus('signed-out', 'Your session has expired — sign in again.');
          return null;
        }
        setStatus(navigator.onLine ? 'error' : 'offline', e.message);
        return null;
      });
    },

    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    pull: pull,
    push: push,
    schedulePush: schedulePush,
    flush: flush,
    user: function () { return session ? session.user : null; }
  };

  global.Sync = Sync;

  // Reconnecting is the moment a dirty state should go out.
  global.addEventListener('online', function () {
    if (session && status.dirty) {
      setStatus('syncing', 'Back online — syncing…');
      flush();
    }
  });
  global.addEventListener('offline', function () {
    if (session) setStatus('offline', 'Offline — changes are saved here.');
  });

}(window));
