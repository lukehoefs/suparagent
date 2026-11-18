import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en, LOCALES, translate } from './i18n.ts';
import { signinMessages } from './locales/signin-extra.ts';
import { inviteLink } from './session.ts';
import { ERROR_KEYS, inviteFromLink, loginView, pastedInviteMessage, signInError } from './signin.ts';

const status = (over = {}) => ({ owner_configured: true, setup_allowed: false, desktop: false, signed_in: false, ...over });

test('the sign-in page picks its state from the server status', () => {
  assert.equal(loginView(null, false), 'loading');
  assert.equal(loginView(null, true), 'unreachable');
  assert.equal(loginView(status(), true), 'unreachable');
  assert.equal(loginView(status(), false), 'signIn');
  assert.equal(loginView(status({ signed_in: true }), false), 'redirect');
  assert.equal(loginView(status({ desktop: true, owner_configured: false }), false), 'redirect');
  assert.equal(loginView(status({ owner_configured: false, setup_allowed: true }), false), 'setup');
  assert.equal(loginView(status({ owner_configured: false }), false), 'setupServerOnly');
});

test('a known refusal gets its own words; an unknown one keeps the server message', () => {
  assert.deepEqual(signInError({ status: 401, code: 'wrong_passphrase', message: 'That passphrase is not right.' }, 'auth.signInError'), { key: 'signin.error.wrongPassphrase' });
  assert.deepEqual(signInError({ status: 401, code: 'wrong_credentials', message: 'x' }, 'auth.signInError'), { key: 'signin.error.wrongCredentials' });
  assert.deepEqual(signInError({ status: 400, code: 'invite_invalid', message: 'x' }, 'signin.joinFailed'), { key: 'signin.error.inviteInvalid' });
  assert.deepEqual(signInError({ status: 500, code: null, message: 'Database is down' }, 'auth.signInError'), { text: 'Database is down' });
  assert.deepEqual(signInError({ status: 500, code: 'something_new', message: '  ' }, 'auth.signInError'), { key: 'auth.signInError' });
});

test('no answer at all falls back to the page message', () => {
  assert.deepEqual(signInError(null, 'signin.joinFailed'), { key: 'signin.joinFailed' });
});

test('a lockout keeps its wait, and a weak secret keeps its limit', () => {
  assert.deepEqual(
    signInError({ status: 429, code: 'locked_out', message: 'Too many wrong passphrases. Try again in 42 seconds.' }, 'auth.signInError'),
    { key: 'signin.error.lockedOut', params: { seconds: 42 } },
  );
  assert.deepEqual(signInError({ status: 429, code: 'locked_out', message: 'Locked.' }, 'auth.signInError'), { text: 'Locked.' });
  assert.deepEqual(
    signInError({ status: 422, code: 'weak_password', message: 'Use at least 10 characters.' }, 'signin.joinFailed'),
    { key: 'signin.passwordRule', params: { count: 10 } },
  );
  assert.deepEqual(
    signInError({ status: 422, code: 'weak_passphrase', message: 'Use at most 1024 characters.' }, 'auth.signInError'),
    { key: 'signin.error.tooLong', params: { count: 1024 } },
  );
});

test('every message key the sign-in pages can show exists in English and is filled in every locale', () => {
  const keys = [...Object.values(ERROR_KEYS), 'signin.error.lockedOut', 'signin.passwordRule', 'signin.error.tooLong', 'signin.linkEmpty', 'signin.linkNotInvite', 'signin.linkOtherSite', 'signin.unreachable', 'signin.joinFailed'];
  for (const key of keys) {
    assert.ok(key in en, `${key} is missing from English`);
    for (const locale of LOCALES) assert.notEqual(translate(locale, key), key, `${key} is missing in ${locale}`);
  }
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(signinMessages[locale])) {
      assert.ok(value.trim(), `${locale} ${key} is empty`);
      assert.ok(!/\[[A-Z ]+\]/.test(value), `${locale} ${key} has a placeholder in brackets`);
      // A translation keeps every {placeholder} the English text has.
      for (const name of signinMessages.en[key].match(/\{\w+\}/g) ?? []) assert.ok(value.includes(name), `${locale} ${key} lost ${name}`);
    }
  }
});

test('a pasted invitation link is read back, on this site only', () => {
  const link = inviteLink('https://agent.example.com', '', { token: 'a/b+c', email: 'sam@example.com' });
  assert.deepEqual(inviteFromLink(`  ${link}\n`, 'https://agent.example.com'), { ok: true, token: 'a/b+c', email: 'sam@example.com' });
  assert.deepEqual(inviteFromLink(link, 'https://other.example.com'), { ok: false, reason: 'otherSite', host: 'agent.example.com' });
  assert.deepEqual(inviteFromLink('#token=abc', 'https://agent.example.com'), { ok: true, token: 'abc', email: '' });
  assert.deepEqual(inviteFromLink('token=abc&email=sam%40example.com', 'https://agent.example.com'), { ok: true, token: 'abc', email: 'sam@example.com' });
});

test('anything that is not an invitation link says why', () => {
  assert.deepEqual(inviteFromLink('   ', 'https://agent.example.com'), { ok: false, reason: 'empty' });
  assert.deepEqual(inviteFromLink('https://agent.example.com/join/', 'https://agent.example.com'), { ok: false, reason: 'notInvite' });
  assert.deepEqual(inviteFromLink('hello there', 'https://agent.example.com'), { ok: false, reason: 'notInvite' });
  assert.deepEqual(inviteFromLink('https://', 'https://agent.example.com'), { ok: false, reason: 'notInvite' });
  assert.deepEqual(pastedInviteMessage({ ok: false, reason: 'otherSite', host: 'x.example' }), { key: 'signin.linkOtherSite', params: { host: 'x.example' } });
  assert.deepEqual(pastedInviteMessage({ ok: false, reason: 'empty' }), { key: 'signin.linkEmpty' });
  assert.deepEqual(pastedInviteMessage({ ok: false, reason: 'notInvite' }), { key: 'signin.linkNotInvite' });
  assert.equal(pastedInviteMessage({ ok: true, token: 't', email: '' }), null);
});
