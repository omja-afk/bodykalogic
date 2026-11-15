/* sync.js — accounts and cross-device sync, over Supabase's REST API.
 *
 * No SDK and no CDN script: the auth and database endpoints are ordinary HTTP,
 * so plain fetch does the job and the app still loads with no network at all.
 *
 * The model is offline-first, because the place this app gets used is a gym with
 * bad wifi:
 *
 *   - every change is written to localStorage immediately and unconditionally
 *   - the state is marked dirty the moment it changes, and a push is debounced
 *   - a push that fails leaves it dirty; nothing is lost and nothing blocks. The
 *     next successful push sends the latest state, so a queue of individual
 *     edits is unnecessary — the document IS the queue
 *   - coming back online, returning to the tab, or a retry timer flushes it
 *
 * Which copy wins is decided from two facts kept on the device: whether it has
 * changes the account has not seen (dirty), and the server's timestamp for the
 * row the last time the two agreed (base). Only when BOTH sides have moved since
 * then is there a real conflict, and only then is the user asked.
 */
(function (global) {
  'use strict';

  var CFG = global.AppConfig;
  var SESSION_KEY = 'bkl.session.v1';
  var DIRTY_KEY = 'bkl.dirty.v1';
  var BASE_KEY = 'bkl.base.v1';      // server updated_at when local and cloud last agreed
  var OWNER_KEY = 'bkl.owner.v1';    // whose data the local copy is

  var session = null;      // { access_token, refresh_token, expires_at, user }
  var listeners = [];
  var pushTimer = null;
  var retryTimer = null;
  var inFlight = null;     // the push currently on the wire
  var queued = false;      // something changed while it was
  var refreshing = null;   // the token refresh currently on the wire
  var failures = 0;
  var lastCheck = 0;
  var status = {
    state: 'off',          // off | signed-out | syncing | synced | offline | error
    message: '',
    lastSync: null,
    dirty: false
  };

  /* ------------------------------------------------------------- plumbing */

  function cfg() { return CFG.supabase; }
  function enabled() { return CFG.syncConfigured(); }
  function current() { return global.State ? global.State.get() : null; }

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
    try {
      if (v === null || v === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }

  function markDirty(on) {
    on = !!on;
    if (status.dirty === on) return;
    status.dirty = on;
    writeJSON(DIRTY_KEY, on || null);
    emit();
  }

  function online() { return global.navigator ? global.navigator.onLine !== false : true; }

  /* HTTP against the project. `auth` false for the auth endpoints that take only
   * the anon key; true to send the user's access token as well.
   *
   * A request that never got an answer rejects with `network` set, so callers
   * can tell "the server said no" from "there was no server to ask". */
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

    var body = opts.body ? JSON.stringify(opts.body) : undefined;
    var init = { method: opts.method || 'GET', headers: headers, body: body };
    // keepalive lets a request outlive the page, but browsers cap its body at
    // 64 KB and reject anything larger outright — so only ask when it fits.
    if (opts.keepalive && body && body.length < 60000) init.keepalive = true;

    return fetch(cfg().url + path, init).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        if (txt) { try { data = JSON.parse(txt); } catch (e) { data = txt; } }
        if (!res.ok) {
          var msg = (data && (data.msg || data.message || data.error_description ||
                              data.error || data.hint)) || ('HTTP ' + res.status);
          var err = new Error(typeof msg === 'string' ? msg : ('HTTP ' + res.status));
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    }, function () {
      var err = new Error('Can’t reach the server.');
      err.network = true;
      throw err;
    });
  }

  /* An answer that means "this session is not valid", as opposed to a request
   * that failed for some other reason. */
  function rejected(e) {
    return !!(e && (e.status === 400 || e.status === 401 || e.status === 403));
  }

  /* Turn a server error into something a person can act on. */
  function explain(e) {
    var m = String((e && e.message) || '');
    if (e && e.network) return 'Can’t reach the server. Check your connection and try again.';
    if (/invalid login credentials/i.test(m)) return 'That email and password don’t match.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first — the link is in your inbox.';
    if (/already (been )?registered|already exists/i.test(m)) {
      return 'An account with that email already exists. Sign in instead.';
    }
    if ((e && e.status === 429) || /rate limit|too many/i.test(m)) {
      return 'Too many attempts. Wait a minute and try again.';
    }
    // Before the email check: "Email link is invalid or has expired" is about
    // the link, not the address.
    if (/otp|(link|token).*(invalid|expired)|(invalid|expired).*(link|token)/i.test(m)) {
      return 'That link has expired or was already used. Ask for a new one.';
    }
    if (/validate email|invalid email|email address.*invalid/i.test(m)) return 'That email address doesn’t look right.';
    if (/different from the old|same.*password/i.test(m)) return 'Choose a password you have not used before.';
    if (e && e.status >= 500) return 'The server had a problem. Try again in a moment.';
    return m || 'Something went wrong. Try again.';
  }

  /* --------------------------------------------------------------- session */

  function saveSession(s) {
    if (!s) { session = null; writeJSON(SESSION_KEY, null); return; }
    session = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      // expires_in is seconds from now; store an absolute moment instead.
      expires_at: Date.now() + ((Number(s.expires_in) || 3600) * 1000),
      user: s.user ? { id: s.user.id, email: s.user.email } : (session && session.user)
    };
    writeJSON(SESSION_KEY, session);
  }

  function loadSession() {
    var s = readJSON(SESSION_KEY);
    session = (s && s.access_token && s.user && s.user.id) ? s : null;
    return session;
  }

  function endSession(message) {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    saveSession(null);
    setStatus('signed-out', message || '');
  }

  /* Another tab may already have refreshed. Refresh tokens are single-use, so
   * spending a stale one would end the session for both. */
  function adoptNewerStoredSession() {
    var s = readJSON(SESSION_KEY);
    if (s && s.access_token && session && s.user && s.user.id === session.user.id &&
        s.expires_at > session.expires_at) {
      session = s;
      return true;
    }
    return false;
  }

  /* Refresh a little before expiry, so a long save does not land on a dead token. */
  function ensureFresh() {
    if (!session) return Promise.reject(new Error('Not signed in.'));
    if (Date.now() < session.expires_at - 60000) return Promise.resolve(session);
    if (adoptNewerStoredSession() && Date.now() < session.expires_at - 60000) {
      return Promise.resolve(session);
    }
    if (refreshing) return refreshing;

    refreshing = api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', auth: false,
      body: { refresh_token: session.refresh_token }
    }).then(function (s) {
      refreshing = null;
      saveSession(s);
      return session;
    }, function (e) {
      refreshing = null;
      // Only an explicit "no" ends the session. A refresh that failed because
      // there is no signal must leave it alone: an expired token in a basement
      // gym is the ordinary case, and signing the user out there would strand
      // everything they log until they are back online.
      if (rejected(e) && !adoptNewerStoredSession()) {
        endSession('Your session has expired. Sign in again.');
      }
      throw e;
    });
    return refreshing;
  }

  /* ------------------------------------------------------------------ auth */

  /* Where links in Supabase's emails should land: the page this was opened
   * from. Supabase only honours it if the URL is on the project's Redirect
   * URLs list; otherwise it falls back to the Site URL. */
  function returnUrl() {
    var loc = global.location;
    return loc ? '?redirect_to=' + encodeURIComponent(loc.origin + loc.pathname) : '';
  }

  function signUp(email, password) {
    return api('/auth/v1/signup' + returnUrl(), {
      method: 'POST', auth: false,
      body: { email: email, password: password }
    }).then(function (res) {
      // With email confirmation on, Supabase returns a user but no session.
      if (res && res.access_token) {
        saveSession(res);
        setStatus('syncing', '');
        return { confirmed: true };
      }
      return { confirmed: false };
    });
  }

  function signIn(email, password) {
    return api('/auth/v1/token?grant_type=password', {
      method: 'POST', auth: false,
      body: { email: email, password: password }
    }).then(function (res) {
      saveSession(res);
      setStatus('syncing', '');
      return session.user;
    });
  }

  function signOut() {
    if (session) {
      api('/auth/v1/logout', { method: 'POST' }).catch(function () { /* local sign-out regardless */ });
    }
    endSession('');
    return Promise.resolve();
  }

  /* Email a password-reset link. It comes back to wherever the app is being
   * served from, which has to be on the project's list of allowed redirects. */
  function recover(email) {
    return api('/auth/v1/recover' + returnUrl(), {
      method: 'POST', auth: false,
      body: { email: email }
    });
  }

  function updatePassword(password) {
    return ensureFresh().then(function () {
      return api('/auth/v1/user', { method: 'PUT', body: { password: password } });
    });
  }

  /* Links in Supabase's emails (confirm your address, reset your password) land
   * back here with the outcome in the URL fragment. Read it, clear it out of the
   * address bar, and report what kind of arrival this was:
   *   null                 — an ordinary visit
   *   { error }            — the link was bad or had expired
   *   { type: 'recovery' } — signed in, and owes a new password
   *   { type: 'signup' }   — address confirmed and signed in
   */
  function consumeRedirect() {
    var loc = global.location;
    var raw = loc ? String(loc.hash || '').replace(/^#/, '') : '';
    if (raw.indexOf('access_token=') === -1 && raw.indexOf('error=') === -1 &&
        raw.indexOf('error_description=') === -1) {
      return Promise.resolve(null);
    }
    var q = {};
    raw.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 1) return;
      try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); }
      catch (e) {}
    });
    // The fragment holds a live token; it should not sit in the address bar or
    // in the history for the next person at this keyboard.
    try { global.history.replaceState(null, '', loc.pathname + loc.search); } catch (e) {}

    if (q.error || q.error_description) {
      return Promise.resolve({ error: explain(new Error(q.error_description || q.error)) });
    }
    if (!q.access_token) return Promise.resolve(null);

    session = {
      access_token: q.access_token,
      refresh_token: q.refresh_token,
      expires_at: Date.now() + ((Number(q.expires_in) || 3600) * 1000),
      user: null
    };
    return api('/auth/v1/user').then(function (u) {
      session.user = { id: u.id, email: u.email };
      writeJSON(SESSION_KEY, session);
      return { type: q.type || 'signin' };
    }, function (e) {
      session = null;
      return { error: explain(e) };
    });
  }

  /* -------------------------------------------------------------- transfer */

  function pull() {
    return ensureFresh().then(function () {
      return api('/rest/v1/' + CFG.table + '?user_id=eq.' + session.user.id +
                 '&select=data,updated_at');
    }).then(function (rows) {
      if (!rows || !rows.length) return null;
      return { data: rows[0].data, updatedAt: rows[0].updated_at };
    }, function (e) {
      if (session && e && e.status === 401) endSession('Your session has expired. Sign in again.');
      throw e;
    });
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    failures++;
    var wait = Math.min(300000, 15000 * Math.pow(2, Math.min(failures - 1, 5)));
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (status.dirty && session) push();
    }, wait);
  }

  function send(state, opts) {
    var sentAt = state.updatedAt;
    return ensureFresh().then(function () {
      setStatus('syncing', '');
      return api('/rest/v1/' + CFG.table + '?select=updated_at', {
        method: 'POST',
        keepalive: opts && opts.keepalive,
        headers: {
          // Upsert: one row per user, so a conflict on the primary key is the
          // normal case rather than an error. The row comes back so the server's
          // own timestamp for it can be kept as the new base.
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: [{ user_id: session.user.id, data: state }]
      });
    }).then(function (rows) {
      var stamp = rows && rows[0] && rows[0].updated_at;
      writeJSON(BASE_KEY, stamp || null);
      writeJSON(OWNER_KEY, session.user.id);
      status.lastSync = Date.now();
      failures = 0;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      // An edit made while this was on the wire is not in what was sent.
      var now = current();
      if (now && now !== state) queued = true;
      else if (now && now.updatedAt !== sentAt) queued = true;
      else markDirty(false);
      setStatus('synced', '');
      return true;
    }, function (e) {
      if (!session) return false;                       // ended while refreshing
      if (e && e.status === 401) { endSession('Your session has expired. Sign in again.'); return false; }
      if ((e && e.network) || !online()) setStatus('offline', '');
      else setStatus('error', explain(e));
      scheduleRetry();
      return false;
    });
  }

  /* One push at a time. Two on the wire at once can land out of order and
   * leave the older state as the account's copy. */
  function push(state, opts) {
    if (!enabled() || !session) return Promise.resolve(false);
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (inFlight) { queued = true; return inFlight; }
    state = state || current();
    if (!state) return Promise.resolve(false);

    inFlight = send(state, opts).then(function (ok) {
      inFlight = null;
      if (queued) {
        queued = false;
        if (ok && session) return push();
      }
      return ok;
    });
    return inFlight;
  }

  /* Called on every change. Debounced, so a burst of edits is one request. */
  function schedulePush() {
    if (!enabled() || !session) return;
    markDirty(true);
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      push();
    }, 1200);
  }

  /* Send anything unsent now, rather than when the debounce gets round to it. */
  function flush(opts) {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (status.dirty && session && enabled()) return push(null, opts);
    return Promise.resolve(false);
  }

  /* Has the account moved on since this device last agreed with it? Resolves
   * the newer copy when it has, null when there is nothing to pick up. Never
   * asked while this device has unsent changes of its own — those go out
   * instead, and the next boot sorts out anything that collided. */
  function refresh() {
    if (!enabled() || !session) return Promise.resolve(null);
    if (status.dirty) { flush(); return Promise.resolve(null); }
    if (inFlight || Date.now() - lastCheck < 15000) return Promise.resolve(null);
    lastCheck = Date.now();
    var base = readJSON(BASE_KEY);
    return pull().then(function (remote) {
      if (!remote || status.dirty) return null;
      if (status.state !== 'synced') setStatus('synced', '');
      if (base && remote.updatedAt === base) return null;
      return remote;
    }, function () { return null; });
  }

  /* ------------------------------------------------------------- reconcile */

  /* Key order is not preserved by a jsonb column, so two copies of the same
   * state do not serialise to the same string. Compare them canonically. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function same(a, b) { return canon(a) === canon(b); }

  /* Which copy opens: 'cloud', 'local', or 'ask'.
   *
   * `hasContent` says whether a copy holds anything worth keeping, which is the
   * tie-break only when the history between the two is unknown. */
  function decide(local, remote, hasContent) {
    if (!remote || !remote.data) return 'local';
    if (!local) return 'cloud';
    if (same(local, remote.data)) return 'cloud';

    var base = readJSON(BASE_KEY);
    if (base) {
      if (!status.dirty) return 'cloud';                    // nothing unsent here
      if (remote.updatedAt === base) return 'local';        // only this device moved
    }
    if (!hasContent(local)) return 'cloud';
    if (!hasContent(remote.data)) return 'local';
    return 'ask';
  }

  /* The cloud copy is now what this device holds. */
  function adopt(remote) {
    if (!session) return;
    writeJSON(BASE_KEY, (remote && remote.updatedAt) || null);
    writeJSON(OWNER_KEY, session.user.id);
    status.lastSync = Date.now();
    markDirty(false);
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

    /* Resolves the account's copy when signed in and reachable, null otherwise.
     * `status().state` afterwards says which kind of null it was. */
    init: function () {
      if (!enabled()) { setStatus('off', ''); return Promise.resolve(null); }
      loadSession();
      status.dirty = !!readJSON(DIRTY_KEY);
      if (!session) { setStatus('signed-out', ''); return Promise.resolve(null); }
      setStatus('syncing', '');
      lastCheck = Date.now();
      return pull().then(function (remote) {
        setStatus('synced', '');
        return remote;
      }, function (e) {
        // A stored session the server rejects is not a session. Say so and end
        // it, so boot puts the sign-in screen up rather than opening the app on
        // an account it cannot actually reach.
        //
        // Only an explicit rejection counts. A request that failed because
        // there is no network must leave the session alone: working offline
        // from the local copy is the point, not a reason to sign anyone out.
        if (!session) return null;
        if (e && (e.status === 401 || e.status === 403)) {
          endSession('Your session has expired. Sign in again.');
          return null;
        }
        if ((e && e.network) || !online()) setStatus('offline', '');
        else setStatus('error', explain(e));
        return null;
      });
    },

    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    recover: recover,
    updatePassword: updatePassword,
    consumeRedirect: consumeRedirect,
    explain: explain,

    pull: pull,
    push: push,
    schedulePush: schedulePush,
    flush: flush,
    refresh: refresh,

    same: same,
    decide: decide,
    adopt: adopt,
    markDirty: function () { markDirty(true); },

    /* The local copy belongs to whoever last used this browser. If that is not
     * the person now signed in, it must not be shown to them or merged into
     * their account. */
    localIsForeign: function () {
      var owner = readJSON(OWNER_KEY);
      return !!(session && owner && owner !== session.user.id);
    },
    claimLocal: function () { if (session) writeJSON(OWNER_KEY, session.user.id); },
    forgetLocal: function () {
      writeJSON(BASE_KEY, null);
      writeJSON(OWNER_KEY, null);
      markDirty(false);
    },

    user: function () { return session ? session.user : null; },

    /* A current access token, refreshed first if it is about to expire. Used
     * to prove to the meal-analysis function who is asking. */
    accessToken: function () {
      return ensureFresh().then(function (s) { return s.access_token; });
    }
  };

  global.Sync = Sync;

  // Reconnecting is the moment a dirty state should go out.
  if (global.addEventListener) {
    global.addEventListener('online', function () {
      if (!session) return;
      if (status.dirty) flush();
      else if (status.state === 'offline') setStatus('synced', '');
    });
    global.addEventListener('offline', function () {
      if (session) setStatus('offline', '');
    });
  }

}(window));
