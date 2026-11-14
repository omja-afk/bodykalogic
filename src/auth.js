/* auth.js — the signed-out screen: sign in, create an account, reset a password.
 *
 * One card that moves between a handful of states rather than several pages,
 * because every one of them needs the same email address and nobody should have
 * to type it twice to get from "sign in" to "I forgot my password".
 *
 *   signin  — email + password
 *   signup  — email + password + the password again
 *   forgot  — email, sends a reset link
 *   newpass — arrived from a reset link; choose the new password
 *   sent    — a link has been emailed; nothing more to do on this screen
 *
 * Signing in does not open the app from here. It reloads, so the ordinary boot
 * path does the opening — there is exactly one piece of code that decides which
 * copy of someone's data they see, and this is not it.
 */
(function (global) {
  'use strict';

  var UI = global.UI, h = UI.h;
  var MIN_PASSWORD = 8;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var seq = 0;

  /* A password input with a show/hide control inside its right edge. */
  function passwordField(label, autocomplete, extra) {
    var id = 'auth-pw-' + (++seq);
    var input = h('input', { id: id, type: 'password', autocomplete: autocomplete, spellcheck: 'false',
                             autocapitalize: 'none' });
    var toggle = h('button.field-toggle', { type: 'button', title: 'Show password',
                                            'aria-label': 'Show password', 'aria-pressed': 'false' },
                   [UI.icon('eye')]);
    toggle.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      UI.clear(toggle).appendChild(UI.icon(show ? 'eyeOff' : 'eye'));
      toggle.title = show ? 'Hide password' : 'Show password';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus();
    });
    var node = h('.field', [
      h('.field-label', [h('label', { 'for': id, text: label }), extra || null]),
      h('.field-wrap', [input, toggle])
    ]);
    return { input: input, node: node };
  }

  /* opts: { logo, mode, notice: { kind, text }, onDone } */
  function authScreen(opts) {
    opts = opts || {};
    var Sync = global.Sync;
    var mode = opts.mode || 'signin';
    var notice = opts.notice || null;
    var email = '';
    var busy = false;

    var card = h('.auth-card');
    var root = h('.auth', [
      opts.logo ? h('img.brand-logo.auth-logo', { src: opts.logo, alt: 'BodyKaLogic — train smart, grow strong' }) : null,
      card,
      h('p.auth-foot', { text: 'Your data is private to your account. Only you can see it.' })
    ]);

    function go(next, withNotice) {
      mode = next;
      notice = withNotice || null;
      draw();
    }

    function linkButton(text, onclick) {
      return h('button.link', { type: 'button', text: text, onclick: onclick });
    }

    /* A panel with nothing to fill in: "we have emailed you". */
    function sentPanel(title, lines, backLabel) {
      UI.clear(card);
      card.appendChild(h('.auth-mark', [UI.icon('mail', 22)]));
      card.appendChild(h('h1.auth-title', { text: title }));
      lines.forEach(function (line) { card.appendChild(h('p.auth-sub', line)); });
      card.appendChild(h('button.btn.btn-block', {
        type: 'button', text: backLabel || 'Back to sign in',
        onclick: function () { go('signin'); }
      }));
    }

    function draw() {
      if (mode === 'sent-confirm') {
        return sentPanel('Check your inbox', [
          ['We sent a confirmation link to ', h('b', { text: email }), '.'],
          ['Open it to finish creating your account. It can take a minute to arrive — check spam if it does not.']
        ]);
      }
      if (mode === 'sent-reset') {
        return sentPanel('Check your inbox', [
          ['If there is an account for ', h('b', { text: email }),
           ', a link to reset its password is on the way.'],
          ['The link opens this page and lets you choose a new password.']
        ]);
      }

      var copy = {
        signin:  { title: 'Welcome back', sub: 'Sign in to pick up where you left off.',
                   action: 'Sign in', working: 'Signing in…' },
        signup:  { title: 'Create your account', sub: 'Your plan, training log and records, on every device you sign in on.',
                   action: 'Create account', working: 'Creating your account…' },
        forgot:  { title: 'Reset your password', sub: 'Enter the email you signed up with and we will send you a link.',
                   action: 'Send reset link', working: 'Sending…' },
        newpass: { title: 'Choose a new password', sub: 'You are signed in. Set a new password to finish.',
                   action: 'Save password', working: 'Saving…' }
      }[mode];

      UI.clear(card);
      card.appendChild(h('h1.auth-title', { text: copy.title }));
      card.appendChild(h('p.auth-sub', { text: copy.sub }));

      var alertBox = h('.banner.is-bad', { role: 'alert', hidden: true });
      card.appendChild(alertBox);
      if (notice) {
        card.appendChild(h('.banner' + (notice.kind === 'good' ? '.is-good' : notice.kind === 'bad' ? '.is-bad' : '.is-warn'),
                           { role: 'status' }, [h('div', { text: notice.text })]));
      }

      var needsEmail = mode !== 'newpass';
      var needsPass = mode !== 'forgot';
      var needsConfirm = mode === 'signup' || mode === 'newpass';

      var emailInput = h('input', {
        type: 'email', value: email, placeholder: 'you@example.com',
        autocomplete: mode === 'signup' ? 'email' : 'username',
        inputmode: 'email', autocapitalize: 'none', spellcheck: 'false'
      });
      var pass = needsPass ? passwordField(
        mode === 'newpass' ? 'New password' : 'Password',
        mode === 'signin' ? 'current-password' : 'new-password',
        mode === 'signin' ? linkButton('Forgot password?', function () {
          email = emailInput.value.trim(); go('forgot');
        }) : null) : null;
      var again = needsConfirm ? passwordField('Confirm password', 'new-password') : null;

      /* Two rules, shown as you type so the button is never a surprise. */
      var ruleLength = h('li', { text: 'At least ' + MIN_PASSWORD + ' characters' });
      var ruleMatch = h('li', { text: 'Both passwords match' });
      function refreshRules() {
        if (!needsConfirm) return;
        var p = pass.input.value, a = again.input.value;
        ruleLength.classList.toggle('is-met', p.length >= MIN_PASSWORD);
        ruleMatch.classList.toggle('is-met', !!a && p === a);
      }

      var submit = h('button.btn.btn-primary.btn-block', { type: 'submit', text: copy.action });

      function fail(message, field) {
        alertBox.textContent = message;
        alertBox.hidden = false;
        [emailInput, pass && pass.input, again && again.input].forEach(function (n) {
          if (n) n.classList.toggle('is-invalid', n === field);
        });
        if (field) field.focus();
      }

      function setBusy(on) {
        busy = on;
        submit.disabled = on;
        submit.textContent = on ? copy.working : copy.action;
        submit.classList.toggle('is-busy', on);
      }

      function done() {
        setBusy(true);
        submit.textContent = 'Loading your data…';
        if (opts.onDone) opts.onDone(); else global.location.reload();
      }

      function onSubmit(e) {
        e.preventDefault();
        if (busy) return;
        alertBox.hidden = true;

        if (needsEmail) {
          email = emailInput.value.trim();
          if (!email) return fail('Enter your email address.', emailInput);
          if (!EMAIL_RE.test(email)) return fail('That email address doesn’t look right.', emailInput);
        }
        var pw = needsPass ? pass.input.value : '';
        if (needsPass && !pw) return fail('Enter your password.', pass.input);
        if (needsConfirm) {
          if (pw.length < MIN_PASSWORD) {
            return fail('Use at least ' + MIN_PASSWORD + ' characters for your password.', pass.input);
          }
          if (again.input.value !== pw) return fail('The two passwords don’t match.', again.input);
        }

        setBusy(true);
        var job;
        if (mode === 'signin') {
          job = Sync.signIn(email, pw).then(done);
        } else if (mode === 'signup') {
          job = Sync.signUp(email, pw).then(function (res) {
            if (res && res.confirmed === false) { setBusy(false); go('sent-confirm'); return; }
            done();
          });
        } else if (mode === 'forgot') {
          job = Sync.recover(email).then(function () { setBusy(false); go('sent-reset'); });
        } else {
          job = Sync.updatePassword(pw).then(done);
        }
        job.catch(function (err) {
          setBusy(false);
          var msg = Sync.explain(err);
          // A wrong password is the commonest failure on this screen; point at
          // the way out rather than just saying no.
          if (mode === 'signin' && /don’t match/.test(msg)) msg += ' Try again, or reset your password.';
          fail(msg, mode === 'signin' && pass ? pass.input : null);
        });
      }

      var form = h('form.auth-form', { novalidate: true, onsubmit: onSubmit }, [
        needsEmail ? h('.field', [h('label', { text: 'Email' }), emailInput]) : null,
        pass ? pass.node : null,
        again ? again.node : null,
        needsConfirm ? h('ul.auth-rules', [ruleLength, ruleMatch]) : null,
        submit
      ]);
      if (needsConfirm) {
        pass.input.addEventListener('input', refreshRules);
        again.input.addEventListener('input', refreshRules);
      }
      card.appendChild(form);

      var foot = h('.auth-switch');
      if (mode === 'signin') {
        foot.appendChild(h('span', { text: 'New to BodyKaLogic? ' }));
        foot.appendChild(linkButton('Create an account', function () { email = emailInput.value.trim(); go('signup'); }));
      } else if (mode === 'signup') {
        foot.appendChild(h('span', { text: 'Already have an account? ' }));
        foot.appendChild(linkButton('Sign in', function () { email = emailInput.value.trim(); go('signin'); }));
      } else if (mode === 'forgot') {
        foot.appendChild(linkButton('Back to sign in', function () { email = emailInput.value.trim(); go('signin'); }));
      } else {
        foot.appendChild(linkButton('Skip for now', done));
      }
      card.appendChild(foot);

      UI.linkLabels(card);
      // Land in the first thing that still needs typing — except on a touch
      // screen, where that would open the keyboard over a page nobody has read.
      var touch = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
      var first = needsEmail && !emailInput.value ? emailInput : (pass ? pass.input : emailInput);
      if (!touch) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 0);
    }

    draw();
    return root;
  }

  global.Views = global.Views || {};
  global.Views.authScreen = authScreen;

}(window));
