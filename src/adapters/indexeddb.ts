import type { Store, StoreRead, StoreWrite } from '../core/contracts.ts';
import { ENGINE } from '../spec.ts';

type Failure = { kind: 'failed'; reason: string };
const failure = (error: unknown): Failure => ({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) });

/** No repair or migration of stored values: validation belongs to the application. */
export async function createIndexedDbStore(factory: IDBFactory): Promise<Store<unknown>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory?.open) { reject(new Error('IndexedDB unavailable')); return; }
    const request = factory.open(ENGINE.databaseName, ENGINE.databaseVersion);
    let abandoned = false;
    request.onblocked = () => { abandoned = true; reject(new Error('IndexedDB open blocked')); };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onupgradeneeded = () => {
      if (abandoned) { request.transaction?.abort(); return; }
      if (!request.result.objectStoreNames.contains(ENGINE.storeName)) request.result.createObjectStore(ENGINE.storeName);
    };
    request.onsuccess = () => {
      if (abandoned || !request.result.objectStoreNames.contains(ENGINE.storeName)) {
        request.result.close(); reject(new Error('IndexedDB state store unavailable')); return;
      }
      resolve(request.result);
    };
  });
  let closed = false;
  db.onversionchange = () => { closed = true; db.close(); };
  db.onclose = () => { closed = true; };

  function transact<T>(mode: IDBTransactionMode, execute: (store: IDBObjectStore, record: (value: T) => void) => void): Promise<T | Failure> {
    return new Promise(resolve => {
      if (closed) { resolve(failure('IndexedDB connection closed')); return; }
      let transaction: IDBTransaction;
      try { transaction = db.transaction(ENGINE.storeName, mode); }
      catch (error) { resolve(failure(error)); return; }
      let result: T | undefined;
      let setupFailure: Failure | undefined;
      // Request success/error is not terminal. Only complete/abort can release callers.
      transaction.oncomplete = () => resolve(setupFailure ?? result ?? failure('IndexedDB result unavailable'));
      transaction.onabort = () => resolve(setupFailure ?? failure(transaction.error ?? 'IndexedDB transaction aborted'));
      try { execute(transaction.objectStore(ENGINE.storeName), value => { result = value; }); }
      catch (error) {
        setupFailure = failure(error);
        try { transaction.abort(); } catch { /* Already terminating: still await its terminal event. */ }
      }
    });
  }
  return {
    read: () => transact<StoreRead<unknown>>('readonly', (store, record) => {
      // A cursor distinguishes an absent record from a corrupt stored undefined value.
      const request = store.openCursor(ENGINE.stateKey);
      request.onsuccess = () => record(request.result === null ? { kind: 'empty' } : { kind: 'loaded', value: request.result.value });
    }),
    write: value => transact<StoreWrite>('readwrite', (store, record) => {
      store.put(value, ENGINE.stateKey);
      record({ kind: 'committed' });
    }),
  };
}
