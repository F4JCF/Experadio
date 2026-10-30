// Tests de la recherche d'indicatifs avec des réponses simulées des trois services
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLookup, configuredServices, LookupError } from '../js/lookup.js';

const QRZ_LOGIN = '<?xml version="1.0"?><QRZDatabase version="1.34"><Session><Key>abc123</Key><Count>1</Count><SubExp>Thu Dec 31 2026</SubExp></Session></QRZDatabase>';
const QRZ_BAD = '<QRZDatabase><Session><Error>Username/password incorrect</Error></Session></QRZDatabase>';
const QRZ_DL = '<QRZDatabase><Callsign><call>DL1AB</call><fname>J&#252;rgen</fname><name>Muller</name><addr2>Bonn</addr2><land>Germany</land><grid>JO30nr</grid><lat>50.7</lat><lon>7.1</lon></Callsign><Session><Key>abc123</Key></Session></QRZDatabase>';
const QRZ_NF = '<QRZDatabase><Session><Error>Not found: XX9XX</Error><Key>abc123</Key></Session></QRZDatabase>';
const QRZ_TIMEOUT = '<QRZDatabase><Session><Error>Session Timeout</Error></Session></QRZDatabase>';
const HQ_LOGIN = '<HamQTH version="2.8"><session><session_id>sid42</session_id></session></HamQTH>';
const HQ_XX = '<HamQTH version="2.8"><search><callsign>XX9XX</callsign><nick>Bob</nick><qth>Nowhere</qth><country>Test</country><grid>AB12cd</grid><latitude>12.5</latitude><longitude>-30.2</longitude></search></HamQTH>';
const HQ_NF = '<HamQTH version="2.8"><session><error>Callsign not found</error></session></HamQTH>';
const CQ_LOGIN = '<QRZCQDatabase version="1.00"><Session><Key>cqkey</Key><SubExp>premium</SubExp></Session></QRZCQDatabase>';
const CQ_ZZ = '<QRZCQDatabase><Callsign><call>ZZ1ZZ</call><name>Zoé</name><city>Lyon</city><country>France</country><locator>JN25</locator></Callsign></QRZCQDatabase>';

function harness(routes, accounts) {
  const mem = new Map();
  const calls = [];
  const store = { get: async (k) => mem.get(k), set: async (k, v) => { mem.set(k, v); } };
  const fetchFn = async (url) => {
    calls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new TypeError('Failed to fetch');
    const body = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    return { ok: true, status: 200, text: async () => body };
  };
  const lk = makeLookup({ store, fetchFn, getAccounts: async () => accounts, isOnline: () => true });
  return { lk, calls, mem };
}

const ALL = { order: ['qrz', 'hamqth', 'qrzcq'], qrz: { user: 'F4JCF', pass: 'x' }, hamqth: { user: 'F4JCF', pass: 'y' }, qrzcq: { user: 'F4JCF', pass: 'z' } };
const ROUTES = [
  [/qrz\.com.*username=/, QRZ_LOGIN],
  [/qrz\.com.*callsign=DL1AB/, QRZ_DL],
  [/qrz\.com.*callsign=/, QRZ_NF],
  [/hamqth.*u=F4JCF/, HQ_LOGIN],
  [/hamqth.*callsign=XX9XX/, HQ_XX],
  [/hamqth.*callsign=/, HQ_NF],
  [/qrzcq.*username=/, CQ_LOGIN],
  [/qrzcq.*callsign=ZZ1ZZ/, CQ_ZZ],
];

test('comptes configurés dans l\'ordre choisi', () => {
  assert.deepEqual(configuredServices(ALL), ['qrz', 'hamqth', 'qrzcq']);
  assert.deepEqual(configuredServices({ order: ['hamqth', 'qrz'], qrz: { user: 'a', pass: 'b' }, hamqth: { user: 'c' } }), ['qrz']);
  assert.deepEqual(configuredServices({}), []);
});

test('QRZ.com trouvé en premier, accents décodés, portable /P ignoré', async () => {
  const { lk, calls } = harness(ROUTES, ALL);
  const r = await lk.lookup('DL1AB/P');
  assert.equal(r.source, 'QRZ.com');
  assert.equal(r.name, 'Jürgen Muller');
  assert.equal(r.qth, 'Bonn');
  assert.equal(r.grid, 'JO30nr');
  assert.equal(r.lat, 50.7);
  assert.ok(calls.some((u) => /callsign=DL1AB(&|$)/.test(u)));
});

test('repli sur HamQTH puis QRZCQ quand le premier ne trouve pas', async () => {
  const { lk } = harness(ROUTES, ALL);
  assert.equal((await lk.lookup('XX9XX')).source, 'HamQTH');
  const z = await lk.lookup('ZZ1ZZ');
  assert.equal(z.source, 'QRZCQ');
  assert.equal(z.grid, 'JN25');
  assert.equal(z.qth, 'Lyon');
  assert.equal(await lk.lookup('NO1NE'), null);
});

test('cache : fiche réutilisée sans réseau, session réutilisée', async () => {
  const { lk, calls } = harness(ROUTES, ALL);
  await lk.lookup('DL1AB');
  const n = calls.length;
  const again = await lk.lookup('DL1AB');
  assert.equal(again.cached, true);
  assert.equal(calls.length, n);
  await lk.lookup('XX9XX');
  assert.equal(calls.filter((u) => /qrz\.com.*username=/.test(u)).length, 1, 'une seule connexion QRZ');
});

test('session expirée : reconnexion automatique', async () => {
  let first = true;
  const routes = [
    [/qrz\.com.*username=/, QRZ_LOGIN],
    [/qrz\.com.*callsign=DL1AB/, () => { if (first) { first = false; return QRZ_TIMEOUT; } return QRZ_DL; }],
  ];
  const { lk, calls } = harness(routes, { qrz: ALL.qrz });
  assert.equal((await lk.lookup('DL1AB')).name, 'Jürgen Muller');
  assert.equal(calls.filter((u) => /username=/.test(u)).length, 2);
});

test('test d\'un compte : identifiants refusés ou service injoignable', async () => {
  const { lk } = harness([[/qrz\.com.*username=/, QRZ_BAD]], ALL);
  await assert.rejects(() => lk.test('qrz', ALL.qrz, 'DL1AB'), (e) => e instanceof LookupError && e.kind === 'auth');
  const { lk: lk2 } = harness([], ALL);
  await assert.rejects(() => lk2.test('hamqth', ALL.hamqth, 'DL1AB'), (e) => e.kind === 'network');
  assert.equal(await lk2.lookup('DL1AB'), null, 'la saisie n\'est jamais bloquée');
});
