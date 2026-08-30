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
      <nav className="fixed top-0 left-0 w-full z-30 bg-gradient-to-b from-[#050505] to-transparent px-6 py-4 flex justify-between items-center">
        <div className="md:hidden">
          <Link to="/">
            <h1 className="text-xl tracking-[0.3em] font-serif font-light text-white">MRATINA</h1>
          </Link>
        </div>
        <div className="hidden md:block">
          {/* Empty space for balance */}
        </div>
        
        <div className="flex items-center gap-6">
          {dbUser && dbUser.role === 'ADMIN' && (
            <Link to="/admin" className="text-[10px] uppercase tracking-widest text-white/50 hover:text-white transition-colors flex items-center gap-1">
              <Shield size={12} /> Admin
            </Link>
          )}

          {dbUser && dbUser.role === 'DELIVERER' && (
            <Link to="/deliverer" className="text-[10px] uppercase tracking-widest text-white/50 hover:text-white transition-colors flex items-center gap-1">
              <Truck size={12} /> Dispatch
            </Link>
          )}
          
          {user ? (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowNotifications(true)}
                className="relative text-white/70 hover:text-white transition-colors p-1"
                title="Concierge Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#c5a059] text-[#050505] text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <Link to="/orders" className="text-[10px] uppercase tracking-widest text-white/50 hover:text-white transition-colors hidden md:inline">
                {user.displayName || user.email}
              </Link>
              <button onClick={signOut} className="text-[10px] uppercase tracking-widest text-[#c5a059] hover:text-white transition-colors">
                Sign Out
              </button>
            </div>
          ) : (
            <button onClick={signIn} className="text-[10px] uppercase tracking-widest text-white/70 hover:text-white transition-colors flex items-center gap-2">
              <User size={14} /> Sign In
            </button>
          )}
          
          <button onClick={toggleCart} className="relative text-white/70 hover:text-white transition-colors">
            <ShoppingBag size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-[#c5a059] text-[#050505] text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
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

