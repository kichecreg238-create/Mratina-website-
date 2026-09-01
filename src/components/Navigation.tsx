import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useCartStore } from '../store/useCartStore.ts';
import { ShoppingBag, User, Shield, Truck, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CustomerNotificationsModal } from './CustomerNotificationsModal.tsx';

export const TopNavigation = () => {
  const { user, dbUser, signIn, signOut } = useAuthStore();
  const { toggleCart, items } = useCartStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const cartCount = items.reduce((acc, item) => acc + item.quantity, 0);

  const fetchUnreadCount = async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications/unread-count', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to load unread count:', err);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [user]);

  return (
    <>
      <nav className="fixed top-0 left-0 w-full z-30 bg-[#050505]/80 backdrop-blur-md border-b border-white/5 px-6 md:px-12 py-3.5 flex justify-between items-center transition-all">
        <div>
          <Link to="/" className="flex items-baseline gap-2 group">
            <h1 className="text-lg md:text-xl tracking-[0.35em] font-serif font-light text-white group-hover:text-[#c5a059] transition-colors">
              MRATINA
            </h1>
            <span className="text-[8px] font-mono uppercase tracking-widest text-[#c5a059]/70 hidden sm:inline">
              Reserve
            </span>
          </Link>
        </div>
        
        <div className="flex items-center gap-4 md:gap-6">
          {dbUser && dbUser.role === 'ADMIN' && (
            <Link to="/admin" className="text-[10px] uppercase tracking-widest text-amber-300/80 hover:text-amber-300 transition-colors flex items-center gap-1 bg-amber-950/30 px-2 py-1 border border-amber-500/30">
              <Shield size={12} /> Admin
            </Link>
          )}

          {dbUser && dbUser.role === 'DELIVERER' && (
            <Link to="/deliverer" className="text-[10px] uppercase tracking-widest text-purple-300/80 hover:text-purple-300 transition-colors flex items-center gap-1 bg-purple-950/30 px-2 py-1 border border-purple-500/30">
              <Truck size={12} /> Dispatch
            </Link>
          )}
          
          {user ? (
            <div className="flex items-center gap-3 md:gap-4">
              <button
                onClick={() => setShowNotifications(true)}
                className="relative text-white/70 hover:text-white transition-colors p-1.5 rounded-sm hover:bg-white/5"
                title="Concierge Notifications"
                aria-label="View notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#c5a059] text-[#050505] text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-sm animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <Link to="/orders" className="text-[10px] uppercase tracking-widest text-white/70 hover:text-[#c5a059] transition-colors flex items-center gap-1.5 py-1">
                <User size={13} className="text-[#c5a059]" />
                <span className="hidden md:inline font-mono">{user.displayName || user.email?.split('@')[0]}</span>
              </Link>
              <button onClick={signOut} className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors py-1">
                Sign Out
              </button>
            </div>
          ) : (
            <button onClick={signIn} className="text-[10px] uppercase tracking-widest text-white/80 hover:text-white transition-colors flex items-center gap-2 border border-white/10 px-3 py-1.5 bg-white/[0.02] hover:bg-white/5">
              <User size={13} className="text-[#c5a059]" /> Sign In
            </button>
          )}
          
          <button 
            onClick={toggleCart} 
            className="relative text-white/80 hover:text-white transition-colors p-1.5 rounded-sm hover:bg-white/5"
            aria-label="Open cart"
          >
            <ShoppingBag size={20} className="text-[#c5a059]" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[#c5a059] text-[#050505] text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-sm">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {showNotifications && (
        <CustomerNotificationsModal
          onClose={() => {
            setShowNotifications(false);
            fetchUnreadCount();
          }}
        />
      )}
    </>
  );
};

