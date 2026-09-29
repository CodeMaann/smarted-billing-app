import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { AppUser } from '../types';
import { setTeamId } from '../store';

interface AuthContextType {
  currentUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  refreshAppUser: () => Promise<void>;
  checkSubscriptionSilent: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  appUser: null,
  loading: true,
  refreshAppUser: async () => {},
  checkSubscriptionSilent: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAppUser = async (uid: string, email: string | null) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as AppUser;
        
        if (data.role === 'staff' && data.ownerId) {
          // Fetch owner's sub status
          const ownerDoc = await getDoc(doc(db, 'users', data.ownerId));
          if (ownerDoc.exists()) {
            const ownerData = ownerDoc.data();
            data.subscription_status = ownerData.subscription_status;
            data.trial_start_date = ownerData.trial_start_date;
          }
        }
        
        setAppUser(data);
        setTeamId(data.ownerId || data.id);
      } else {
        const now = Date.now();
        let newUserData: any = {
          email: email || '',
          role: 'owner',
          account_created_date: now,
          trial_start_date: now,
          subscription_status: 'trial'
        };

        // Check if user was invited
        if (email) {
          const inviteQuery = query(collection(db, 'invitations'), where('email', '==', email));
          const inviteSnapshot = await getDocs(inviteQuery);
          if (!inviteSnapshot.empty) {
            const invite = inviteSnapshot.docs[0].data();
            let ownerTrialStart = now;
            let ownerSubStatus = 'trial';
            
            const ownerDoc = await getDoc(doc(db, 'users', invite.ownerId));
            if (ownerDoc.exists()) {
              ownerTrialStart = ownerDoc.data().trial_start_date;
              ownerSubStatus = ownerDoc.data().subscription_status;
            }

            newUserData = {
              email: email,
              role: 'staff',
              ownerId: invite.ownerId,
              account_created_date: now,
              trial_start_date: ownerTrialStart,
              subscription_status: ownerSubStatus
            };
          }
        }

        await setDoc(docRef, newUserData);
        const data = { id: uid, ...newUserData } as AppUser;
        setAppUser(data);
        setTeamId(data.ownerId || data.id);
      }
    } catch (error) {
      console.error('Error fetching app user:', error);
    }
  };

  /**
   * Lightweight silent re-check of subscription status and trial start date from Firestore.
   * Runs without disrupting the UI or resetting state.
   */
  const checkSubscriptionSilent = async () => {
    if (!auth.currentUser) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    try {
      const uid = auth.currentUser.uid;
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        let subStatus = userData.subscription_status;
        let trialStart = userData.trial_start_date;

        if (userData.role === 'staff' && userData.ownerId) {
          const ownerSnap = await getDoc(doc(db, 'users', userData.ownerId));
          if (ownerSnap.exists()) {
            const ownerData = ownerSnap.data();
            subStatus = ownerData.subscription_status;
            trialStart = ownerData.trial_start_date;
          }
        }

        setAppUser(prev => {
          if (!prev) return prev;
          if (prev.subscription_status === subStatus && prev.trial_start_date === trialStart) {
            return prev;
          }
          return {
            ...prev,
            subscription_status: subStatus,
            trial_start_date: trialStart,
          };
        });
      }
    } catch (err) {
      console.warn('Background subscription check failed silently:', err);
    }
  };

  const refreshAppUser = async () => {
    if (currentUser) {
      await fetchAppUser(currentUser.uid, currentUser.email);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchAppUser(user.uid, user.email);
      } else {
        setAppUser(null);
        setTeamId('local');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Periodic and visibility/focus background subscription monitor
  useEffect(() => {
    if (!currentUser) return;

    let lastCheckTime = Date.now();

    // 1. Periodic check every 5 minutes while actively open
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        lastCheckTime = Date.now();
        checkSubscriptionSilent();
      }
    }, 5 * 60 * 1000);

    // 2. Immediate check whenever app regains focus or becomes visible again (e.g. switching back from tab / background PWA)
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const now = Date.now();
        // Throttle to at most once per 20 seconds to prevent spammed reads on quick tab switching
        if (now - lastCheckTime > 20000) {
          lastCheckTime = now;
          checkSubscriptionSilent();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [currentUser]);

  return (
    <AuthContext.Provider value={{ currentUser, appUser, loading, refreshAppUser, checkSubscriptionSilent }}>
      {children}
    </AuthContext.Provider>
  );
};
