import { create } from 'zustand';
import { User, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

interface AuthStore {
  user: User | null;
  dbUser: any | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  dbUser: null,
  loading: true,
  setUser: async (user) => {
    if (!user) {
      set({ user: null, dbUser: null, loading: false });
      return;
    }
    
    set({ user, loading: true });
    
    try {
      const token = await user.getIdToken();
      
      // Sync with DB
      const syncRes = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const syncData = await syncRes.json();
      
      if (syncData.success) {
        set({ dbUser: syncData.user, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (e) {
      console.error(e);
      set({ loading: false });
    }
  },
  signIn: async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        // Silently ignore when user intentionally closes the popup or if multiple popups are requested
        return;
      }
      console.error('Sign in error', error);
    }
  },
  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null, dbUser: null });
  }
}));

// Initialize auth listener
auth.onAuthStateChanged((user) => {
  useAuthStore.getState().setUser(user);
});
