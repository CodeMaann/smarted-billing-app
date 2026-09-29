import { collection, addDoc, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { exportAllData, importAllData } from './store';

export interface BackupMetadata {
  id: string;
  timestamp: number;
  ownerId: string;
  source?: 'cloud' | 'local';
  summary?: {
    invoices: number;
    catalog: number;
    purchases: number;
    expenses: number;
    customers: number;
  };
}

export const createCloudBackup = async (ownerId?: string): Promise<string> => {
  const currentUid = auth.currentUser?.uid || ownerId;
  if (!currentUid) {
    throw new Error('User is not authenticated for cloud backup');
  }

  const rawData = exportAllData();
  // Strip any undefined or non-serializable fields to prevent Firestore serialization errors
  const data = JSON.parse(JSON.stringify(rawData));
  const timestamp = Date.now();

  const summary = {
    invoices: Array.isArray(data.invoices) ? data.invoices.length : 0,
    catalog: Array.isArray(data.catalog) ? data.catalog.length : 0,
    purchases: Array.isArray(data.purchases) ? data.purchases.length : 0,
    expenses: Array.isArray(data.expenses) ? data.expenses.length : 0,
    customers: Array.isArray(data.customers) ? data.customers.length : 0,
  };

  const backupDoc = {
    timestamp,
    ownerId: currentUid,
    summary,
    data
  };

  // Keep a local cached copy as immediate safety net
  try {
    localStorage.setItem(`quickbill_backup_cache_${currentUid}`, JSON.stringify({
      id: `local-cached-${timestamp}`,
      timestamp,
      ownerId: currentUid,
      summary,
      data
    }));
  } catch (err) {
    console.warn('Could not cache backup in localStorage:', err);
  }

  // Write to user's dedicated backups subcollection (matches rules: /users/{userId}/{document=**})
  const userBackupsRef = collection(db, 'users', currentUid, 'backups');
  const docRef = await addDoc(userBackupsRef, backupDoc);
  return docRef.id;
};

export const getRecentBackups = async (ownerId?: string): Promise<BackupMetadata[]> => {
  const currentUid = auth.currentUser?.uid || ownerId;
  if (!currentUid) return [];

  const backupsMap = new Map<string, BackupMetadata>();

  // Fetch from user's dedicated backups collection (/users/{uid}/backups)
  try {
    const userBackupsRef = collection(db, 'users', currentUid, 'backups');
    const q = query(userBackupsRef, orderBy('timestamp', 'desc'), limit(15));
    const snapshot = await getDocs(q);

    snapshot.docs.forEach(docSnap => {
      const d = docSnap.data();
      backupsMap.set(docSnap.id, {
        id: docSnap.id,
        timestamp: d.timestamp || Date.now(),
        ownerId: currentUid,
        source: 'cloud',
        summary: d.summary || {
          invoices: d.data?.invoices?.length || 0,
          catalog: d.data?.catalog?.length || 0,
          purchases: d.data?.purchases?.length || 0,
          expenses: d.data?.expenses?.length || 0,
          customers: d.data?.customers?.length || 0,
        }
      });
    });
  } catch (err) {
    console.warn('Could not fetch backups from Firestore:', err);
  }

  // Also include cached snapshot if offline or before cloud sync
  const cachedStr = localStorage.getItem(`quickbill_backup_cache_${currentUid}`);
  if (cachedStr) {
    try {
      const cached = JSON.parse(cachedStr);
      if (cached && cached.timestamp && !backupsMap.has(cached.id)) {
        backupsMap.set(cached.id, {
          id: cached.id,
          timestamp: cached.timestamp,
          ownerId: currentUid,
          source: 'local',
          summary: cached.summary
        });
      }
    } catch {
      // ignore
    }
  }

  const results = Array.from(backupsMap.values());
  results.sort((a, b) => b.timestamp - a.timestamp);
  return results;
};

export const restoreFromBackup = async (backupId: string, ownerId?: string) => {
  const currentUid = auth.currentUser?.uid || ownerId;
  let backupData: any = null;

  // 1. Check local cache first if ID matches
  if (currentUid && backupId.startsWith('local-cached-')) {
    const cachedStr = localStorage.getItem(`quickbill_backup_cache_${currentUid}`);
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (cached?.data) backupData = cached.data;
      } catch {}
    }
  }

  // 2. Fetch from Firestore subcollection (/users/{uid}/backups/{backupId})
  if (!backupData && currentUid) {
    try {
      const userDocRef = doc(db, 'users', currentUid, 'backups', backupId);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const d = snap.data();
        if (d && d.data) {
          backupData = typeof d.data === 'string' ? JSON.parse(d.data) : d.data;
        }
      }
    } catch (e) {
      console.warn('Error fetching backup from cloud:', e);
    }
  }

  // 3. Fallback to cached local backup if cloud fetch was unavailable
  if (!backupData && currentUid) {
    const cachedStr = localStorage.getItem(`quickbill_backup_cache_${currentUid}`);
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (cached?.data) backupData = cached.data;
      } catch {}
    }
  }

  if (!backupData) {
    throw new Error('Backup data could not be retrieved.');
  }

  importAllData(backupData);
  window.location.reload();
};

export const downloadBackupFile = () => {
  const rawData = exportAllData();
  const jsonStr = JSON.stringify(rawData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `quickbill-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const restoreFromLocalFile = (file: File): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format');
        }
        importAllData(parsed);
        window.location.reload();
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};
