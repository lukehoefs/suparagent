import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_MARKET, AppsError, accountStatus, appStatus, canGrant, canTurnOn, cardNameKey, catalogQuery, checkAll, connectedAppCards,
  createBody, EMPTY_SERVER_FORM, endpointLabel, errorText, exactGrants, formFor, formReady, listingBadge, listingState, marketApps, marketFilterActive,
  marketListings, marketplaceRedirectHref, problemOf, rawStatus, reserveSignInTab, reserveTab, sameSet, serverHintKey, serverStart, serverStatus,
  shownTools, signInFinished, sourceNoticeKey, testedLineKey, testFailed, testFailedHintKey, testPassed, toggleTool,
} from './apps-page.ts';

const server = (patch = {}) => ({
  state: 'not_tested', enabled: false, auth_mode: 'none', oauth_signed_in: false, credential_configured: false, ...patch,
});

test('a server card has a word and a dot for every state', () => {
  assert.deepEqual(serverStatus(server({ state: 'connected', enabled: true })), { status: 'done', key: 'apps.servers.status.on' });
  assert.deepEqual(serverStatus(server({ state: 'disabled' })), { status: 'idle', key: 'apps.servers.status.off' });
  assert.deepEqual(serverStatus(server()), { status: 'idle', key: 'apps.servers.status.draft' });
  assert.deepEqual(serverStatus(server({ state: 'unreachable' })), { status: 'denied', key: 'apps.add.testFailed' });
  assert.deepEqual(serverStatus(server({ state: 'needs_sign_in', auth_mode: 'oauth' })), { status: 'waiting', key: 'apps.servers.status.signIn' });
  assert.deepEqual(serverStatus(server({ state: 'needs_sign_in', auth_mode: 'bearer' })), { status: 'denied', key: 'apps.servers.status.secret' });
  // Signed in, but the server turned the sign-in down (authentication_failed): it needs sign-in, not a secret.
  assert.deepEqual(serverStatus(server({ state: 'needs_sign_in', auth_mode: 'oauth', oauth_signed_in: true })), { status: 'waiting', key: 'apps.servers.status.signIn' });
});

test('a test runs only once the server can sign in', () => {
  assert.equal(serverStart(server({ auth_mode: 'oauth' })), 'signIn');
  assert.equal(serverStart(server({ auth_mode: 'oauth', oauth_signed_in: true })), 'test');
  assert.equal(serverStart(server({ state: 'needs_sign_in', auth_mode: 'oauth', oauth_signed_in: true })), 'signIn');
  assert.equal(serverStart(server({ auth_mode: 'bearer' })), 'addSecret');
  assert.equal(serverStart(server({ auth_mode: 'header', credential_configured: true })), 'test');
  assert.equal(serverStart(server()), 'test');
});

test('turning on needs a passed test, and grants need the server on', () => {
  assert.equal(testPassed(server({ state: 'disabled' })), true);
  assert.equal(testPassed(server({ state: 'connected', enabled: true })), true);
  assert.equal(testPassed(server({ state: 'not_tested' })), false);
  assert.equal(testPassed(server({ state: 'unreachable' })), false);
  assert.equal(canTurnOn(server({ state: 'disabled' })), true);
  assert.equal(canTurnOn(server({ state: 'not_tested' })), false);
  assert.equal(canGrant(server({ state: 'connected', enabled: true })), true);
  assert.equal(canGrant(server({ state: 'disabled' })), false);
});

test('hints say what to do next', () => {
  assert.equal(serverHintKey(server({ state: 'unreachable' })), 'apps.servers.unreachableHint');
  // A test that never reached the server names its address; one that reached it but got a bad answer does not.
  assert.equal(serverHintKey(server({ state: 'unreachable', last_error_code: 'connect_failed' })), 'apps.add.unreachableHint');
  assert.equal(serverHintKey(server({ state: 'unreachable', last_error_code: 'dns_failed' })), 'apps.add.unreachableHint');
  assert.equal(serverHintKey(server({ state: 'unreachable', last_error_code: 'endpoint_mismatch' })), 'apps.add.unreachableHint');
  assert.equal(serverHintKey(server({ state: 'unreachable', last_error_code: 'invalid_response' })), 'apps.servers.unreachableHint');
  assert.equal(serverHintKey(server({ state: 'needs_sign_in', auth_mode: 'oauth' })), 'apps.servers.signInHint');
  assert.equal(serverHintKey(server({ state: 'needs_sign_in', auth_mode: 'oauth', oauth_signed_in: true })), 'apps.servers.signInHint');
  assert.equal(serverHintKey(server({ state: 'needs_sign_in', auth_mode: 'header' })), 'apps.servers.secretRejected');
  assert.equal(serverHintKey(server({ state: 'disabled' })), null);
});

test('a sign-in is finished once the server no longer needs one, also when it was signed in already', () => {
  assert.equal(signInFinished(server({ state: 'needs_sign_in', auth_mode: 'oauth' })), false);
  assert.equal(signInFinished(server({ state: 'needs_sign_in', auth_mode: 'oauth', oauth_signed_in: true })), false);
  assert.equal(signInFinished(server({ state: 'not_tested', auth_mode: 'oauth', oauth_signed_in: true })), true);
  assert.equal(signInFinished(undefined), true);
});

test('the tested line never makes up a tool count', () => {
  assert.equal(testedLineKey({ last_tested_at: null, tool_count: null }), 'apps.servers.notTested');
  assert.equal(testedLineKey({ last_tested_at: '2026-11-17T10:00:00Z', tool_count: 3 }), 'apps.servers.lastTested');
  assert.equal(testedLineKey({ last_tested_at: '2026-11-17T10:00:00Z', tool_count: 0 }), 'apps.servers.lastTested');
  // A failed test sets the time and drops the tools.
  assert.equal(testedLineKey({ last_tested_at: '2026-11-17T10:00:00Z', tool_count: null }), 'apps.servers.lastTestFailed');
});

test('a sign-in tab opens during the click and only ever goes to https', () => {
  const calls = [];
  const tab = { opener: 'page', closed: false, location: { href: 'about:blank' }, close() { this.closed = true; } };
  const page = reserveSignInTab((url, features) => { calls.push([url, features]); return tab; });
  assert.deepEqual(calls, [['about:blank', undefined]]);
  assert.equal(tab.opener, null);
  page.navigate('https://auth.example.com/authorize?x=1');
  assert.equal(tab.location.href, 'https://auth.example.com/authorize?x=1');
  assert.equal(calls.length, 1);

  const other = { opener: null, closed: false, location: { href: 'about:blank' }, close() { this.closed = true; } };
  assert.throws(() => reserveSignInTab(() => other).navigate('http://auth.example.com/'), (err) => err.code === 'sign_in_not_https');
  assert.equal(other.closed, true);

  const shut = { opener: null, closed: true, location: { href: 'about:blank' }, close() {} };
  assert.throws(() => reserveSignInTab(() => shut).navigate('https://auth.example.com/'), (err) => err.code === 'popup_blocked');

  // The desktop app gives no tab: the page is opened directly once it is known.
  const direct = [];
  reserveSignInTab((url, features) => { direct.push([url, features]); return null; }).navigate('https://auth.example.com/');
  assert.deepEqual(direct, [['about:blank', undefined], ['https://auth.example.com/', 'noopener']]);
});

test('a failed test is the one whose error still stands, and its hint never claims more than the error says', () => {
  assert.equal(testFailed({ last_error_code: null }), false);
  assert.equal(testFailed({ last_error_code: 'connect_failed' }), true);
  assert.equal(testFailed({ last_error_code: 'authentication_failed' }), true);
  // Only a test that never reached the server names its address.
  assert.equal(testFailedHintKey({ last_error_code: 'connect_failed' }), 'apps.add.unreachableHint');
  assert.equal(testFailedHintKey({ last_error_code: 'dns_failed' }), 'apps.add.unreachableHint');
  assert.equal(testFailedHintKey({ last_error_code: 'endpoint_mismatch' }), 'apps.add.unreachableHint');
  assert.equal(testFailedHintKey({ last_error_code: 'authentication_failed' }), 'apps.servers.secretRejected');
  // It answered, just not as expected: the error above says why.
  assert.equal(testFailedHintKey({ last_error_code: 'unsupported_schema' }), 'apps.add.testFailedHint');
  assert.equal(testFailedHintKey({ last_error_code: 'remote_unavailable' }), 'apps.add.testFailedHint');
  assert.equal(testFailedHintKey({ last_error_code: null }), 'apps.add.testFailedHint');
});

test('a card shows the address without its https:// scheme', () => {
  assert.equal(endpointLabel('https://search.lthops.tech/mcp'), 'search.lthops.tech/mcp');
  assert.equal(endpointLabel('HTTPS://Search.example.com/mcp'), 'Search.example.com/mcp');
  // Only the leading scheme goes.
  assert.equal(endpointLabel('https://a.example.com/https://b'), 'a.example.com/https://b');
  assert.equal(endpointLabel('search.example.com/mcp'), 'search.example.com/mcp');
});

test('a new server sends a secret only when one was typed, and only with its auth method', () => {
  const base = { ...EMPTY_SERVER_FORM, name: ' Notes ', endpoint: ' https://notes.example.com/mcp ' };
  assert.deepEqual(createBody(base), { name: 'Notes', endpoint: 'https://notes.example.com/mcp', auth_mode: 'none' });
  assert.equal('credential' in createBody({ ...base, credential: 'typed' }), false);
  assert.equal('credential' in createBody({ ...base, auth_mode: 'bearer' }), false);
  assert.equal(createBody({ ...base, auth_mode: 'bearer', credential: 'typed' }).credential, 'typed');
  assert.deepEqual(createBody({ ...base, auth_mode: 'header', auth_header_name: ' X-Api-Key ', credential: 'k' }),
    { name: 'Notes', endpoint: 'https://notes.example.com/mcp', auth_mode: 'header', auth_header_name: 'X-Api-Key', credential: 'k' });
  assert.deepEqual(createBody({ ...base, auth_mode: 'oauth', oauth_scopes: ' read   write ' }),
    { name: 'Notes', endpoint: 'https://notes.example.com/mcp', auth_mode: 'oauth', oauth_client_id: '', oauth_scopes: 'read write' });
});

test('the edit form never carries the saved secret, and Continue waits for what is required', () => {
  const form = formFor({ name: 'A', endpoint: 'https://a.example.com/mcp', auth_mode: 'header', auth_header_name: 'X-Key', oauth_client_id: null, oauth_scopes: null });
  assert.equal(form.credential, '');
  assert.equal(form.auth_header_name, 'X-Key');
  assert.equal(formReady(form), true);
  assert.equal(formReady({ ...form, auth_header_name: ' ' }), false);
  assert.equal(formReady({ ...EMPTY_SERVER_FORM, name: 'A' }), false);
});

test('tool grants keep the server order and the reviewed schema', () => {
  const tools = [{ name: 'a', schema_digest: '1', description: '' }, { name: 'b', schema_digest: '2', description: '' }];
  assert.deepEqual(exactGrants(tools, ['b', 'a', 'gone']), [{ name: 'a', schema_digest: '1' }, { name: 'b', schema_digest: '2' }]);
  assert.deepEqual(toggleTool(['a'], 'b', true), ['a', 'b']);
  assert.deepEqual(toggleTool(['a', 'b'], 'a', false), ['b']);
  assert.deepEqual(checkAll(['a'], ['a', 'b']), ['a', 'b']);
  assert.equal(sameSet(['a', 'b'], ['b', 'a']), true);
  assert.equal(sameSet(['a'], ['a', 'b']), false);
  assert.deepEqual(shownTools([1, 2, 3], 2), { shown: [1, 2], more: 1 });
});

test('known error codes get the page own words; others keep the backend message', () => {
  assert.deepEqual(errorText({ code: 'unsafe_endpoint' }, 'apps.error.generic'), { key: 'apps.error.unsafe_endpoint' });
  assert.deepEqual(errorText(new AppsError('popup_blocked'), 'apps.error.generic'), { key: 'apps.error.popup_blocked' });
  assert.deepEqual(errorText(new Error('Boom'), 'apps.error.generic'), { message: 'Boom' });
  assert.deepEqual(errorText(null, 'apps.error.generic'), { key: 'apps.error.generic' });
  assert.deepEqual(problemOf(new Error('Boom'), 'apps.key.saveFailed'), { key: 'apps.key.saveFailed', detail: 'Boom' });
  assert.deepEqual(problemOf({ code: 'invalid_credential' }, 'apps.key.saveFailed'), { key: 'apps.error.invalid_credential', detail: null });
});

test('a connect tab opens during the click and only ever goes to Composio', async () => {
  const tab = { opener: 'page', closed: false, location: { href: 'about:blank' }, closed_by: null, close() { this.closed = true; } };
  const page = reserveTab(undefined, () => tab);
  assert.equal(tab.opener, null);
  await assert.rejects(page.navigate('https://evil.example.com/x'), (err) => err.code === 'not_composio');
  assert.equal(tab.closed, true);
  const blocked = reserveTab(undefined, () => null);
  await assert.rejects(blocked.navigate('https://connect.composio.dev/link/x'), (err) => err.code === 'popup_blocked');
  const fresh = { opener: null, closed: false, location: { href: '' }, close() {} };
  await reserveTab(undefined, () => fresh).navigate('https://connect.composio.dev/link/x');
  assert.equal(fresh.location.href, 'https://connect.composio.dev/link/x');
  const opened = [];
  await reserveTab({ openComposioLink: async (url) => { opened.push(url); } }, () => { throw new Error('no tab in the desktop app'); }).navigate('https://app.composio.dev/a');
  assert.deepEqual(opened, ['https://app.composio.dev/a']);
});

const account = (toolkit, status = 'ACTIVE') => ({ id: `${toolkit}-${status}`, toolkit, alias: null, status, created_at: null, updated_at: null });
const app = (slug, agent_actions = 'generic', name = slug) => ({ app: slug, name, description: '', categories: ['Other'], icon: null, connection: 'managed', agent_actions, curated_tools: [] });

test('app cards show a status only once there is an account', () => {
  assert.equal(appStatus(true, []), null);
  assert.equal(appStatus(false, [account('gmail')]), null);
  assert.deepEqual(appStatus(true, [account('gmail', 'FAILED'), account('gmail')]), { status: 'done', key: 'apps.status.connected' });
  assert.deepEqual(appStatus(true, [account('gmail', 'INITIATED')]), { status: 'waiting', key: 'apps.status.pending' });
  assert.deepEqual(appStatus(true, [account('gmail', 'EXPIRED')]), { status: 'denied', key: 'apps.status.failed' });
  assert.deepEqual(accountStatus('INITIALIZING'), { status: 'waiting', key: 'apps.account.waiting' });
  assert.deepEqual(accountStatus('SOMETHING_NEW'), { status: 'idle', key: null });
  assert.equal(rawStatus('INACTIVE_BY_ADMIN'), 'Inactive by admin');
});

test('Connected apps: curated apps first, then other apps with an account, each once', () => {
  const home = [app('github', 'curated', 'GitHub'), app('gmail', 'curated', 'Gmail'), app('notion', 'generic', 'Notion')];
  const cards = connectedAppCards(home, [app('slack', 'generic', 'Slack')], [account('slack'), account('github'), account('zeta_app'), account('slack', 'FAILED')], (slug) => `Label ${slug}`);
  // Curated in the design's order, then the rest by name ("Label zeta_app" sorts before "Slack").
  assert.deepEqual(cards.map((card) => card.app), ['gmail', 'github', 'zeta_app', 'slack']);
  // Gmail, GitHub, Calendar whatever order the catalog gives; another curated app follows in catalog order.
  const curated = [app('newapp', 'curated'), app('googlecalendar', 'curated'), app('other', 'curated'), app('github', 'curated'), app('gmail', 'curated')];
  assert.deepEqual(connectedAppCards(curated, [], [], (slug) => slug).map((card) => card.app), ['gmail', 'github', 'googlecalendar', 'newapp', 'other']);
  assert.equal(cards.find((card) => card.app === 'zeta_app').name, 'Label zeta_app');
  assert.deepEqual(marketApps(home, cards).map((item) => item.app), ['notion']);
});

test("a Connected apps card uses the design's short name where it has one", () => {
  assert.equal(cardNameKey(app('googlecalendar', 'curated', 'Google Calendar')), 'apps.connected.short.googlecalendar');
  assert.equal(cardNameKey(app('gmail', 'curated', 'Gmail')), null);
  // Only its own entries: a slug named after an object property is no short name.
  assert.equal(cardNameKey(app('constructor')), null);
});

test('catalog notices say where the list came from', () => {
  assert.deepEqual(sourceNoticeKey({ source: 'starter', error: 'key_rejected', stale: false, complete: true }, true), { tone: 'warning', key: 'apps.source.starterRejected' });
  assert.deepEqual(sourceNoticeKey({ source: 'starter', error: null, stale: false, complete: true }, false), { tone: 'info', key: 'apps.source.starterNoKey' });
  assert.deepEqual(sourceNoticeKey({ source: 'composio', error: null, stale: true, complete: true }, true), { tone: 'warning', key: 'apps.source.stale' });
  assert.equal(sourceNoticeKey({ source: 'composio', error: null, stale: false, complete: true }, true), null);
});

const listing = (slug, digest = 'd1', name = slug) => ({
  slug, name, version: '1.0.0', summary: `${name} tools`, publisher: 'Pub', source_repo: 'https://example.com', endpoint: 'https://mcp.example.com',
  auth_mode: 'none', privacy_url: 'https://example.com/p', terms_url: 'https://example.com/t', license: 'MIT', setup_instructions: '', test_instructions: '', manifest_digest: digest,
});
const connection = (slug, section, digest = 'd1') => ({ id: `${slug}-${section}`, slug, section, name: slug, manifest: listing(slug, digest), manifest_digest: digest, credential_configured: false });

test('a listing says whether to add it, show it here, or update the copy added elsewhere', () => {
  assert.equal(listingState('tested', listing('a'), []).action, 'install');
  assert.equal(listingState('tested', listing('a'), [connection('a', 'community')]).action, 'show');
  assert.equal(listingState('tested', listing('a', 'd2'), [connection('a', 'community')]).action, 'update');
  const here = listingState('tested', listing('a', 'd2'), [connection('a', 'tested')]);
  assert.equal(here.action, 'none');
  assert.equal(here.updateAvailable, true);
});

test('a listing card offers Add only for a server that was never added', () => {
  const badge = (item) => listingBadge({ withdrawn: false, ...item });
  assert.equal(badge(listingState('tested', listing('a'), [])), null);
  assert.deepEqual(badge(listingState('tested', listing('a'), [connection('a', 'community')])), { status: 'idle', key: 'apps.market.addedUnder', section: 'community' });
  assert.deepEqual(badge(listingState('tested', listing('a', 'd2'), [connection('a', 'community')])), { status: 'waiting', key: 'apps.market.updateAvailable' });
  assert.deepEqual(badge(listingState('tested', listing('a'), [connection('a', 'tested')])), { status: 'done', key: 'apps.market.added' });
  assert.deepEqual(badge(listingState('tested', listing('a', 'd2'), [connection('a', 'tested')])), { status: 'waiting', key: 'apps.market.updateAvailable' });
  assert.deepEqual(listingBadge({ ...listingState('tested', listing('a'), [connection('a', 'tested')]), withdrawn: true }), { status: 'idle', key: 'apps.market.withdrawn' });
});

test('the marketplace filter keeps MCP listings, withdrawn copies, and the search', () => {
  const catalog = { tested: [listing('search', 'd1', 'Web search')], community: [listing('notes', 'd1', 'Notes')] };
  const connections = [connection('gone', 'community')];
  assert.deepEqual(marketListings(catalog, connections, ALL_MARKET).map((item) => `${item.section}:${item.listing.slug}:${item.withdrawn}`),
    ['tested:search:false', 'community:notes:false', 'community:gone:true']);
  assert.deepEqual(marketListings(catalog, connections, { search: 'web', category: { kind: 'mcp' } }).map((item) => item.listing.slug), ['search']);
  assert.deepEqual(marketListings(catalog, connections, { search: '', category: { kind: 'app', name: 'CRM' } }), []);
  assert.equal(catalogQuery({ search: ' x ', category: { kind: 'mcp' } }), null);
  assert.deepEqual(catalogQuery({ search: ' x ', category: { kind: 'app', name: 'CRM' } }), { search: 'x', category: 'CRM' });
  assert.equal(marketFilterActive(ALL_MARKET), false);
  assert.equal(marketFilterActive({ search: '', category: { kind: 'mcp' } }), true);
});

test('the old marketplace address lands on the same place in Apps', () => {
  assert.equal(marketplaceRedirectHref('', ''), '/apps/');
  assert.equal(marketplaceRedirectHref('', '#custom-mcp-heading'), '/apps/#custom-mcp-heading');
  assert.equal(marketplaceRedirectHref('?add=server&x=1', ''), '/apps/?add=server');
  assert.equal(marketplaceRedirectHref('', '#"><script>'), '/apps/');
});
