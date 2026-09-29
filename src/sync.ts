import { collection, doc, setDoc, deleteDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, auth } from './firebase';

export type SyncCollection = 
  | 'bills'
  | 'catalog'
  | 'customers'
  | 'purchases'
  | 'expenses'
  | 'estimates'
  | 'challans'
  | 'suppliers'
  | 'loans'
  | 'profile';

export interface SyncQueueItem {
  id: string;
  collection: SyncCollection;
  action: 'set' | 'delete';
  data?: any;
  timestamp: number;
}

const STORAGE_KEYS: Record<SyncCollection, string> = {
  bills: 'quickbill_invoices',
  catalog: 'quickbill_catalog',
  customers: 'quickbill_customers',
  purchases: 'quickbill_purchases',
  expenses: 'quickbill_expenses',
  estimates: 'quickbill_estimates',
  challans: 'quickbill_challans',
  suppliers: 'quickbill_suppliers',
  loans: 'quickbill_loans',
  profile: 'quickbill_profile',
};

const getTeamStorageKey = (teamId: string, key: string) => `${teamId}_${key}`;
const getQueueKey = (teamId: string) => `${teamId}_sync_queue`;

let activeTeamId: string | null = null;
let activeUnsubscribes: Unsubscribe[] = [];
let isProcessingQueue = false;

/**
 * Sanitizes object by removing undefined fields to prevent Firestore serialization errors.
 */
export function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = sanitizeForFirestore(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Gets pending sync queue items from localStorage.
 */
export function getSyncQueue(teamId: string): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(getQueueKey(teamId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Saves sync queue items to localStorage.
 */
function saveSyncQueue(teamId: string, queue: SyncQueueItem[]) {
  try {
    localStorage.setItem(getQueueKey(teamId), JSON.stringify(queue));
  } catch (err) {
    console.warn('Could not save sync queue to localStorage:', err);
  }
}

/**
 * Removes an item from the sync queue after successful write.
 */
export function removeFromSyncQueue(teamId: string, collectionName: SyncCollection, id: string) {
  const queue = getSyncQueue(teamId);
  const filtered = queue.filter(item => !(item.collection === collectionName && item.id === id));
  saveSyncQueue(teamId, filtered);
}

/**
 * Performs a direct immediate write to Firestore with error tracking and offline fallback.
 */
export async function syncDirectToFirestore(
  teamId: string, 
  collectionName: SyncCollection, 
  id: string, 
  data: any
): Promise<boolean> {
  if (!teamId || teamId === 'local') return false;

  try {
    const docRef = doc(db, 'users', teamId, collectionName, id);
    const sanitized = sanitizeForFirestore(data);
    await setDoc(docRef, sanitized, { merge: true });
    removeFromSyncQueue(teamId, collectionName, id);
    console.log(`[Firestore] Successfully saved document to users/${teamId}/${collectionName}/${id}`);
    return true;
  } catch (err) {
    console.error(`[Firestore] Write failed for users/${teamId}/${collectionName}/${id}:`, err);
    // Queue for automatic retry
    enqueueSync(teamId, collectionName, id, 'set', data);
    return false;
  }
}

/**
 * Enqueues an item to be synced to Firestore.
 */
export function enqueueSync(
  teamId: string, 
  collectionName: SyncCollection, 
  id: string, 
  action: 'set' | 'delete', 
  data?: any
) {
  if (!teamId || teamId === 'local') return;

  const queue = getSyncQueue(teamId);
  const timestamp = Date.now();
  
  // Ensure data has updatedAt timestamp
  let preparedData = data;
  if (preparedData && typeof preparedData === 'object') {
    preparedData = {
      ...preparedData,
      updatedAt: preparedData.updatedAt || preparedData.timestamp || timestamp,
    };
  }

  // Deduplicate in queue: replace existing item if already queued for this id
  const existingIndex = queue.findIndex(item => item.collection === collectionName && item.id === id);
  const queueItem: SyncQueueItem = {
    id,
    collection: collectionName,
    action,
    data: preparedData,
    timestamp
  };

  if (existingIndex !== -1) {
    queue[existingIndex] = queueItem;
  } else {
    queue.push(queueItem);
  }

  saveSyncQueue(teamId, queue);

  // Trigger flush immediately if online
  if (typeof navigator !== 'undefined' && navigator.onLine && auth.currentUser) {
    processSyncQueue(teamId).catch(err => {
      console.warn('Background sync attempt failed, will retry:', err);
    });
  }
}

/**
 * Flushes all pending items in the offline queue to Firestore.
 */
export async function processSyncQueue(teamId: string): Promise<void> {
  if (isProcessingQueue) return;
  if (!teamId || teamId === 'local') return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!auth.currentUser) return;

  isProcessingQueue = true;
  try {
    const queue = getSyncQueue(teamId);
    if (queue.length === 0) {
      isProcessingQueue = false;
      return;
    }

    const remainingQueue: SyncQueueItem[] = [];

    for (const item of queue) {
      try {
        const docRef = doc(db, 'users', teamId, item.collection, item.id);
        if (item.action === 'set' && item.data) {
          const sanitized = sanitizeForFirestore(item.data);
          await setDoc(docRef, sanitized, { merge: true });
          console.log(`[Firestore Queue] Flushed users/${teamId}/${item.collection}/${item.id}`);
        } else if (item.action === 'delete') {
          await deleteDoc(docRef);
          console.log(`[Firestore Queue] Deleted users/${teamId}/${item.collection}/${item.id}`);
        }
      } catch (err: any) {
        console.error(`[Firestore Queue] Failed to sync item ${item.collection}/${item.id}:`, err);
        remainingQueue.push(item);
      }
    }

    saveSyncQueue(teamId, remainingQueue);
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Starts real-time listening and bidirectional sync for the given team ID.
 */
export function startSync(teamId: string) {
  if (!teamId || teamId === 'local') return;
  if (activeTeamId === teamId && activeUnsubscribes.length > 0) return;

  // Clean up any prior subscriptions
  stopSync();
  activeTeamId = teamId;

  // Process any pending queued items from previous offline session
  processSyncQueue(teamId).catch(console.warn);

  const arrayCollections: SyncCollection[] = [
    'bills',
    'catalog',
    'customers',
    'purchases',
    'expenses',
    'estimates',
    'challans',
    'suppliers',
    'loans'
  ];

  // 1. Subscribe to array collections
  for (const colName of arrayCollections) {
    const storageKey = getTeamStorageKey(teamId, STORAGE_KEYS[colName]);
    const colRef = collection(db, 'users', teamId, colName);

    let isInitialSnapshot = true;

    const unsub = onSnapshot(colRef, (snapshot) => {
      try {
        // Read current local items
        const rawLocal = localStorage.getItem(storageKey);
        let localItems: any[] = rawLocal ? JSON.parse(rawLocal) : [];

        // Check if unauthenticated local items exist and merge them
        const unauthKey = `local_${STORAGE_KEYS[colName]}`;
        const rawUnauth = localStorage.getItem(unauthKey);
        if (rawUnauth) {
          try {
            const unauthItems: any[] = JSON.parse(rawUnauth);
            const existingIds = new Set(localItems.map(item => item.id));
            let mergedCount = 0;
            unauthItems.forEach(u => {
              if (u && u.id && !existingIds.has(u.id)) {
                localItems.push(u);
                existingIds.add(u.id);
                mergedCount++;
              }
            });
            if (mergedCount > 0) {
              localStorage.setItem(storageKey, JSON.stringify(localItems));
            }
            localStorage.removeItem(unauthKey);
          } catch (e) {
            console.warn('Error merging unauth items:', e);
          }
        }

        const localMap = new Map<string, any>(localItems.map(item => [item.id, item]));

        const pendingQueue = getSyncQueue(teamId);
        const pendingIds = new Set(
          pendingQueue.filter(q => q.collection === colName).map(q => q.id)
        );

        let hasChanges = false;
        const remoteDocIds = new Set<string>();

        snapshot.docChanges().forEach(change => {
          const docData = change.doc.data();
          const docId = change.doc.id;
          remoteDocIds.add(docId);

          if (change.type === 'added' || change.type === 'modified') {
            const remoteItem: any = { id: docId, ...docData };
            const localItem: any = localMap.get(docId);

            if (!localItem) {
              // New remote item
              localMap.set(docId, remoteItem);
              hasChanges = true;
            } else {
              // Conflict check: last-write-wins based on updatedAt / timestamp
              const remoteTime = remoteItem.updatedAt || remoteItem.timestamp || 0;
              const localTime = localItem.updatedAt || localItem.timestamp || 0;

              // If there's an unsynced local pending change for this item that is newer, don't overwrite
              if (pendingIds.has(docId)) {
                const pendingItem = pendingQueue.find(q => q.collection === colName && q.id === docId);
                const pendingTime = pendingItem?.timestamp || 0;
                if (pendingTime > remoteTime) {
                  return; // local change pending sync wins
                }
              }

              if (remoteTime >= localTime) {
                localMap.set(docId, remoteItem);
                hasChanges = true;
              }
            }
          } else if (change.type === 'removed') {
            if (!pendingIds.has(docId) && localMap.has(docId)) {
              localMap.delete(docId);
              hasChanges = true;
            }
          }
        });

        // On initial snapshot: migrate/push any local-only items that do not exist in Firestore
        if (isInitialSnapshot) {
          isInitialSnapshot = false;
          // All docs currently in Firestore
          snapshot.forEach(d => remoteDocIds.add(d.id));

          // Any local items not present in Firestore should be pushed up immediately
          localItems.forEach(localItem => {
            if (localItem && localItem.id && !remoteDocIds.has(localItem.id)) {
              syncDirectToFirestore(teamId, colName, localItem.id, localItem).catch(console.warn);
            }
          });
        }

        if (hasChanges) {
          const updatedList = Array.from(localMap.values());
          localStorage.setItem(storageKey, JSON.stringify(updatedList));
          window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: colName } }));
        }
      } catch (err) {
        console.warn(`Error processing remote snapshot for ${colName}:`, err);
      }
    }, (error) => {
      console.error(`[Firestore Snapshot Error] ${colName}:`, error);
    });

    activeUnsubscribes.push(unsub);
  }

  // 2. Subscribe to profile doc: users/{teamId}/profile/main
  const profileDocRef = doc(db, 'users', teamId, 'profile', 'main');
  const profileStorageKey = getTeamStorageKey(teamId, STORAGE_KEYS['profile']);

  let isProfileInitialSnapshot = true;
  const profileUnsub = onSnapshot(profileDocRef, (snap) => {
    try {
      if (snap.exists()) {
        const remoteProfile = snap.data();
        const rawLocal = localStorage.getItem(profileStorageKey);
        const localProfile = rawLocal ? JSON.parse(rawLocal) : null;

        const remoteTime = remoteProfile.updatedAt || 0;
        const localTime = localProfile?.updatedAt || 0;

        if (!localProfile || remoteTime >= localTime) {
          localStorage.setItem(profileStorageKey, JSON.stringify(remoteProfile));
          window.dispatchEvent(new CustomEvent('quickbill-data-updated', { detail: { collection: 'profile' } }));
        }
      } else if (isProfileInitialSnapshot) {
        // Upload initial local profile if not in Firestore
        const rawLocal = localStorage.getItem(profileStorageKey) || localStorage.getItem('local_quickbill_profile');
        if (rawLocal) {
          const localProfile = JSON.parse(rawLocal);
          syncDirectToFirestore(teamId, 'profile', 'main', localProfile).catch(console.warn);
        }
      }
      isProfileInitialSnapshot = false;
    } catch (err) {
      console.warn('Error syncing profile document:', err);
    }
  }, (err) => {
    console.error('[Firestore Snapshot Error] profile:', err);
  });

  activeUnsubscribes.push(profileUnsub);
}

/**
 * Stops all active Firestore snapshot listeners and unbinds the team.
 */
export function stopSync() {
  activeUnsubscribes.forEach(unsub => {
    try {
      unsub();
    } catch (err) {
      // ignore
    }
  });
  activeUnsubscribes = [];
  activeTeamId = null;
}

// Online/visibility reconnect listeners to auto-flush queue when connectivity returns
if (typeof window !== 'undefined') {
  const triggerFlush = () => {
    if (activeTeamId) {
      processSyncQueue(activeTeamId).catch(console.warn);
    }
  };

  window.addEventListener('online', triggerFlush);
  window.addEventListener('focus', triggerFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      triggerFlush();
    }
  });
}
