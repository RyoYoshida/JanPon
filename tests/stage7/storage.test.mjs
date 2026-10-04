import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createIndexedDbStore } from '../../src/adapters/indexeddb.ts';
import { createOwnership } from '../../src/adapters/locks.ts';
import { ENGINE } from '../../src/spec.ts';

// Deliberately controlled API contract fake, not evidence of browser compatibility.
function fakeDatabase() {
  const values = new Map(), transactions = [], names = new Set();
  const database = {
    closed: false, objectStoreNames: { contains: name => names.has(name) },
    createObjectStore(name) { names.add(name); }, close() { this.closed = true; },
    transaction(name, mode) {
      assert.equal(name, ENGINE.storeName);
      if (this.closed) throw new Error('Connection closed');
      const transaction = {
        mode, pending: null, request: {}, error: null, terminated: false,
        objectStore(storeName) {
          assert.equal(storeName, ENGINE.storeName);
          return {
            openCursor(key) { transaction.key = key; return transaction.request; },
            put(value, key) { transaction.pending = { key, value: structuredClone(value) }; return transaction.request; },
          };
        },
        succeed() {
          this.request.result = this.mode === 'readonly' ? (values.has(this.key) ? { value: structuredClone(values.get(this.key)) } : null) : ENGINE.stateKey;
          this.request.onsuccess?.();
        },
        complete() {
          assert.equal(this.terminated, false); this.terminated = true;
          if (this.pending) values.set(this.pending.key, this.pending.value);
          this.oncomplete?.();
        },
        abort() {
          assert.equal(this.terminated, false); this.terminated = true;
          queueMicrotask(() => this.onabort?.());
        },
      };
      transactions.push(transaction); return transaction;
    },
  };
  const factory = { open(name, version) { assert.equal(name, ENGINE.databaseName); assert.equal(version, ENGINE.databaseVersion); return this.request = { result: database }; } };
  return { factory, database, values, transactions, names };
}
async function opened(fake = fakeDatabase()) {
  const pending = createIndexedDbStore(fake.factory);
  fake.factory.request.onupgradeneeded(); fake.factory.request.onsuccess();
  return { ...fake, store: await pending };
}
async function read(fake) {
  const pending = fake.store.read(), transaction = fake.transactions.at(-1);
  transaction.succeed(); transaction.complete(); return pending;
}

test('T07-03 write waits for transaction commit after request success; one record resumes', async () => {
  const fake = await opened();
  assert.deepEqual(await read(fake), { kind: 'empty' });
  const state = { balance: 9, round: { opponent: 'scissors' }, revision: 1 };
  let settled = false;
  const pending = fake.store.write(state).then(result => { settled = true; return result; });
  const transaction = fake.transactions.at(-1);
  assert.equal(transaction.mode, 'readwrite'); transaction.succeed(); await setImmediate();
  assert.equal(settled, false); assert.equal(fake.values.size, 0);
  transaction.complete(); assert.deepEqual(await pending, { kind: 'committed' });
  assert.equal(fake.values.size, 1); assert.deepEqual(await read(fake), { kind: 'loaded', value: state });
  const resumed = await opened(fake); assert.deepEqual(await read(resumed), { kind: 'loaded', value: state });
});

test('T07-03 request success followed by abort preserves the original atomic state', async () => {
  const fake = await opened(), original = { balance: 9, revision: 1 };
  fake.values.set(ENGINE.stateKey, original);
  const pending = fake.store.write({ balance: 29, revision: 2 });
  const transaction = fake.transactions.at(-1); transaction.succeed(); transaction.error = new Error('quota');
  transaction.abort(); assert.deepEqual(await pending, { kind: 'failed', reason: 'quota' });
  assert.deepEqual(await read(fake), { kind: 'loaded', value: original });
  assert.equal(fake.values.size, 1);
});

test('T07-03 request error is not transaction termination or permission to reread', async () => {
  const fake = await opened(); fake.values.set(ENGINE.stateKey, 'original');
  let settled = false;
  const pending = fake.store.write('replacement').then(result => { settled = true; return result; });
  const transaction = fake.transactions.at(-1);
  transaction.request.error = new Error('request failed');
  transaction.request.onerror?.(); transaction.onerror?.();
  await setImmediate(); assert.equal(settled, false); assert.equal(transaction.terminated, false);
  transaction.error = transaction.request.error; transaction.abort();
  assert.deepEqual(await pending, { kind: 'failed', reason: 'request failed' });
  assert.deepEqual(await read(fake), { kind: 'loaded', value: 'original' });
});

test('T07-03 corrupt unknown values, including undefined, are returned without repair', async () => {
  const fake = await opened();
  for (const value of [undefined, null, { schema: 'future', balance: -1 }, 'broken']) {
    fake.values.set(ENGINE.stateKey, value);
    assert.deepEqual(await read(fake), { kind: 'loaded', value });
    assert.deepEqual(fake.values.get(ENGINE.stateKey), value);
  }
  assert.ok(fake.transactions.every(transaction => transaction.mode === 'readonly'));
});

test('T07-03 synchronous put errors wait for abort before failing safely', async () => {
  const fake = await opened(); fake.values.set(ENGINE.stateKey, 'original');
  const pending = fake.store.write(() => 'uncloneable');
  assert.equal((await pending).kind, 'failed');
  assert.equal(fake.transactions.at(-1).terminated, true);
  assert.equal(fake.values.get(ENGINE.stateKey), 'original');
});

test('T07-03 versionchange closes the connection and rejects future operations', async () => {
  const fake = await opened();
  const pending = fake.store.write({ balance: 9 });
  fake.database.onversionchange(); assert.equal(fake.database.closed, true);
  assert.equal((await fake.store.read()).kind, 'failed');
  assert.equal((await fake.store.write('new')).kind, 'failed');
  fake.transactions.at(-1).complete(); assert.equal((await pending).kind, 'committed');
  assert.equal(fake.transactions.length, 1);
});

test('T07-03 absent APIs, blocked/open failures and malformed schema fail without deletion', async () => {
  await assert.rejects(createIndexedDbStore(undefined), /unavailable/);
  await assert.rejects(createIndexedDbStore({ open() { throw new Error('denied'); } }), /denied/);
  const blocked = fakeDatabase(), opening = createIndexedDbStore(blocked.factory);
  blocked.factory.request.onblocked(); await assert.rejects(opening, /blocked/);
  blocked.factory.request.onsuccess(); assert.equal(blocked.database.closed, true);
  const missing = fakeDatabase(), invalid = createIndexedDbStore(missing.factory);
  missing.factory.request.onsuccess(); await assert.rejects(invalid, /unavailable/);
  assert.equal(missing.database.closed, true); assert.equal(missing.values.size, 0);
  const failed = fakeDatabase(), error = createIndexedDbStore(failed.factory);
  failed.factory.request.error = new Error('VersionError'); failed.factory.request.onerror();
  await assert.rejects(error, /VersionError/);
});

function fakeLocks() {
  const held = new Set();
  return { async request(name, options, callback) {
    assert.equal(name, ENGINE.lockName); assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name, mode: 'exclusive' }); }
    finally { held.delete(name); }
  } };
}
test('T07-03 Web Locks rejects a second tab nonblockingly and holds until idempotent release', async () => {
  const manager = fakeLocks(), first = createOwnership(manager), second = createOwnership(manager);
  const lease = await first.acquire(); assert.ok(lease);
  assert.equal(await second.acquire(), null); await setImmediate(); assert.equal(await second.acquire(), null);
  lease.release(); lease.release(); await setImmediate();
  const next = await second.acquire(); assert.ok(next); next.release();
});
test('T07-03 absent or rejected Web Locks never grants ownership', async () => {
  await assert.rejects(createOwnership(undefined).acquire(), /unavailable/);
  await assert.rejects(createOwnership({ request() { throw new Error('denied'); } }).acquire(), /denied/);
  await assert.rejects(createOwnership({ request() { return Promise.reject(new Error('disabled')); } }).acquire(), /disabled/);
});
