import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  Bell,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  List,
  Check,
  RefreshCw,
  Sliders,
  Package,
  RotateCcw,
  LifeBuoy,
  Info
} from 'lucide-react';

interface CustomerNotificationsModalProps {
  onClose: () => void;
  onOpenOrder?: (orderId: number) => void;
}

export const CustomerNotificationsModal: React.FC<CustomerNotificationsModalProps> = ({
  onClose,
  onOpenOrder
}) => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'NOTIFICATIONS' | 'PREFERENCES'>('NOTIFICATIONS');
  const [filterUnread, setFilterUnread] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preferences State
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    smsNotifications: false,
    inAppNotifications: true,
    orderUpdates: true,
    promotionalUpdates: false,
    supportUpdates: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefSuccess, setPrefSuccess] = useState<string | null>(null);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (filterUnread) params.append('unreadOnly', 'true');
      if (selectedType !== 'ALL') params.append('type', selectedType);

      const [notifRes, unreadRes] = await Promise.all([
        fetch(`/api/notifications?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/notifications/unread-count', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!notifRes.ok) throw new Error('Failed to load notifications');
      const notifData = await notifRes.json();
      const unreadData = await unreadRes.json();

      setNotifications(notifData.notifications || []);
      setUnreadCount(unreadData.unreadCount || 0);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error loading notifications');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications/preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch preferences');
      const data = await res.json();
      if (data.preferences) {
        setPreferences({
          emailNotifications: !!data.preferences.emailNotifications,
          smsNotifications: !!data.preferences.smsNotifications,
          inAppNotifications: data.preferences.inAppNotifications !== false,
          orderUpdates: data.preferences.orderUpdates !== false,
          promotionalUpdates: !!data.preferences.promotionalUpdates,
          supportUpdates: data.preferences.supportUpdates !== false,
        });
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchPreferences();
  }, [user, filterUnread, selectedType]);

  const handleMarkAsRead = async (id: number) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingPrefs(true);
    setPrefSuccess(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(preferences)
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save preferences');
      }
      setPrefSuccess('Notification dispatch preferences updated successfully.');
      setTimeout(() => setPrefSuccess(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Could not update preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ORDER_STATUS':
        return <Package size={16} className="text-[#c5a059]" />;
      case 'REFUND_UPDATE':
        return <RotateCcw size={16} className="text-blue-400" />;
      case 'SUPPORT_RESPONSE':
        return <LifeBuoy size={16} className="text-purple-400" />;
      case 'ADMIN_ALERT':
        return <AlertCircle size={16} className="text-amber-400" />;
      default:
        return <Bell size={16} className="text-white/60" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'ORDER_STATUS':
        return <span className="text-[9px] px-2 py-0.5 border border-[#c5a059]/30 text-[#c5a059] font-mono">ORDER</span>;
      case 'REFUND_UPDATE':
        return <span className="text-[9px] px-2 py-0.5 border border-blue-500/30 text-blue-400 font-mono">REFUND</span>;
      case 'SUPPORT_RESPONSE':
        return <span className="text-[9px] px-2 py-0.5 border border-purple-500/30 text-purple-400 font-mono">SUPPORT</span>;
      case 'PROMOTION':
        return <span className="text-[9px] px-2 py-0.5 border border-emerald-500/30 text-emerald-400 font-mono">PROMO</span>;
      default:
        return <span className="text-[9px] px-2 py-0.5 border border-white/20 text-white/60 font-mono">{type}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 animate-fade-in">
      <div className="bg-[#0b0b0b] border border-white/15 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden rounded-none">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#111]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/30 flex items-center justify-center text-[#c5a059]">
              <Bell size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-serif uppercase tracking-[0.2em] text-white">Client Concierge Alerts</h3>
                {unreadCount > 0 && (
                  <span className="bg-[#c5a059] text-black text-[10px] font-bold px-2 py-0.2 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/40 tracking-wider">Authoritative order, refund, and support notifications</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors p-1.5 hover:bg-white/5"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 bg-[#0f0f0f]">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('NOTIFICATIONS')}
              className={`py-3 text-xs uppercase tracking-widest font-mono border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'NOTIFICATIONS'
                  ? 'border-[#c5a059] text-[#c5a059]'
                  : 'border-transparent text-white/40 hover:text-white'
              }`}
            >
              <List size={13} /> Notification Feed
            </button>
            <button
              onClick={() => setActiveTab('PREFERENCES')}
              className={`py-3 text-xs uppercase tracking-widest font-mono border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'PREFERENCES'
                  ? 'border-[#c5a059] text-[#c5a059]'
                  : 'border-transparent text-white/40 hover:text-white'
              }`}
            >
              <Sliders size={13} /> Dispatch Preferences
            </button>
          </div>

          {activeTab === 'NOTIFICATIONS' && notifications.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={fetchNotifications}
                className="text-white/40 hover:text-white p-1 text-xs"
                title="Refresh feed"
              >
                <RefreshCw size={13} />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={actionLoading}
                  className="text-[10px] text-[#c5a059] hover:underline font-mono uppercase tracking-wider disabled:opacity-50"
                >
                  Mark All Read
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'NOTIFICATIONS' ? (
            <>
              {/* Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-white/40 text-[10px] uppercase font-mono mr-1">Filter:</span>
                  {['ALL', 'ORDER_STATUS', 'REFUND_UPDATE', 'SUPPORT_RESPONSE'].map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedType(t)}
                      className={`px-2.5 py-1 text-[10px] font-mono tracking-wider transition-colors ${
                        selectedType === t
                          ? 'bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/50'
                          : 'bg-white/5 text-white/60 hover:text-white border border-transparent'
                      }`}
                    >
                      {t === 'ALL' ? 'ALL' : t.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-white/60 hover:text-white text-[11px] font-mono">
                  <input
                    type="checkbox"
                    checked={filterUnread}
                    onChange={e => setFilterUnread(e.target.checked)}
                    className="accent-[#c5a059]"
                  />
                  Unread Only
                </label>
              </div>

              {/* Feed List */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/40">
                  <RefreshCw className="animate-spin mb-3 text-[#c5a059]" size={24} />
                  <p className="text-xs font-mono">Retrieving encrypted notifications...</p>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-950/20 border border-red-500/30 text-red-400 text-xs font-mono">
                  {error}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-white/5 bg-[#0f0f0f] p-8">
                  <Bell size={36} className="text-white/20 mb-3" />
                  <p className="text-sm font-serif text-white/70">No Notifications</p>
                  <p className="text-xs text-white/40 max-w-sm mt-1">
                    {filterUnread
                      ? 'You have caught up on all pending alerts.'
                      : 'You do not have any notifications matching this filter.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map(item => (
                    <div
                      key={item.id}
                      className={`p-4 border transition-all ${
                        item.isRead
                          ? 'bg-[#0f0f0f] border-white/5 opacity-80'
                          : 'bg-[#141414] border-[#c5a059]/30 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-black/40 border border-white/10 rounded">
                            {getTypeIcon(item.type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-serif text-white font-medium">{item.title}</h4>
                              {!item.isRead && (
                                <span className="w-2 h-2 rounded-full bg-[#c5a059]" />
                              )}
                            </div>
                            <span className="text-[10px] text-white/40 flex items-center gap-1 font-mono">
                              <Clock size={10} /> {new Date(item.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {getTypeBadge(item.type)}
                          {!item.isRead && (
                            <button
                              onClick={() => handleMarkAsRead(item.id)}
                              className="text-[10px] text-white/40 hover:text-[#c5a059] font-mono px-2 py-0.5 border border-white/10 hover:border-[#c5a059]/40 transition-colors"
                              title="Mark as read"
                            >
                              <Check size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-white/80 leading-relaxed font-sans pl-8">
                        {item.message}
                      </p>

                      {item.relatedEntityType === 'ORDER' && item.relatedEntityId && (
                        <div className="mt-3 pl-8 flex items-center gap-3">
                          <button
                            onClick={() => {
                              onClose();
                              if (onOpenOrder) onOpenOrder(item.relatedEntityId);
                            }}
                            className="text-[10px] font-mono uppercase tracking-wider text-[#c5a059] hover:underline flex items-center gap-1"
                          >
                            <Package size={11} /> View Order #{item.relatedEntityId}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Preferences Tab */
            <form onSubmit={handleSavePreferences} className="space-y-6 max-w-xl mx-auto py-2">
              <div className="bg-[#111] p-4 border border-white/5 text-xs text-white/60 space-y-1">
                <div className="flex items-center gap-2 text-[#c5a059] font-medium font-serif">
                  <Info size={14} /> Dispatch Policy
                </div>
                <p>
                  Mratina notifies you regarding order progression, refund status, and concierge support responses. Adjust your communication delivery preferences below.
                </p>
              </div>

              {prefSuccess && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 size={14} /> {prefSuccess}
                </div>
              )}

              {/* Delivery Channels */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase font-mono tracking-widest text-[#c5a059]">Active Delivery Channels</h4>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-3.5 bg-[#0f0f0f] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-white">In-App Notification Feed</div>
                      <div className="text-[11px] text-white/40">Receive alert badges and timeline cards directly inside your Mratina vault.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.inAppNotifications}
                      onChange={e => setPreferences(p => ({ ...p, inAppNotifications: e.target.checked }))}
                      className="w-4 h-4 accent-[#c5a059]"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 bg-[#0f0f0f] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-white">Email Notifications</div>
                      <div className="text-[11px] text-white/40">Receive verified order receipts and status dispatches to your account email.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.emailNotifications}
                      onChange={e => setPreferences(p => ({ ...p, emailNotifications: e.target.checked }))}
                      className="w-4 h-4 accent-[#c5a059]"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 bg-[#0f0f0f] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-white">SMS Alerts</div>
                      <div className="text-[11px] text-white/40">Receive SMS notifications for rapid out-for-delivery and courier updates.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.smsNotifications}
                      onChange={e => setPreferences(p => ({ ...p, smsNotifications: e.target.checked }))}
                      className="w-4 h-4 accent-[#c5a059]"
                    />
                  </label>
                </div>
              </div>

              {/* Event Subscriptions */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase font-mono tracking-widest text-[#c5a059]">Notification Categories</h4>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-3.5 bg-[#0f0f0f] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-white">Order & Delivery Tracking</div>
                      <div className="text-[11px] text-white/40">Placement, confirmation, dispatch, and delivery updates.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.orderUpdates}
                      onChange={e => setPreferences(p => ({ ...p, orderUpdates: e.target.checked }))}
                      className="w-4 h-4 accent-[#c5a059]"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 bg-[#0f0f0f] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-white">Support Concierge & Refund Alerts</div>
                      <div className="text-[11px] text-white/40">Replies to your support tickets and refund review decisions.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.supportUpdates}
                      onChange={e => setPreferences(p => ({ ...p, supportUpdates: e.target.checked }))}
                      className="w-4 h-4 accent-[#c5a059]"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 bg-[#0f0f0f] border border-white/10 hover:border-white/20 transition-colors cursor-pointer">
                    <div>
                      <div className="text-xs font-medium text-white">Limited Vintage & Curated Releases</div>
                      <div className="text-[11px] text-white/40">Exclusive barrel selections, private reserves, and tastings.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.promotionalUpdates}
                      onChange={e => setPreferences(p => ({ ...p, promotionalUpdates: e.target.checked }))}
                      className="w-4 h-4 accent-[#c5a059]"
                    />
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={savingPrefs}
                  className="px-6 py-2.5 bg-[#c5a059] hover:bg-[#d5b069] text-black font-serif text-xs uppercase tracking-widest font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {savingPrefs && <RefreshCw size={14} className="animate-spin" />}
                  Save Dispatch Preferences
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
