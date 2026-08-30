import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  Bell,
  RefreshCw,
  AlertCircle,
  Package,
  RotateCcw,
  LifeBuoy,
  Clock,
  CheckCircle2,
  Filter,
  ShieldAlert
} from 'lucide-react';

interface AdminNotificationsPanelProps {
  onSelectOrder?: (orderId: number) => void;
  onSelectRefund?: (refundId: number) => void;
  onSelectSupportTicket?: (ticketId: number) => void;
}

export const AdminNotificationsPanel: React.FC<AdminNotificationsPanelProps> = ({
  onSelectOrder,
  onSelectRefund,
  onSelectSupportTicket
}) => {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  const fetchAdminAlerts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/notifications?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to load admin notifications');
      }
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error fetching alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminAlerts();
  }, [user]);

  const filtered = notifications.filter(n => {
    if (filterType === 'ALL') return true;
    return n.type === filterType;
  });

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'ADMIN_ALERT':
        return <ShieldAlert size={16} className="text-amber-400" />;
      case 'ORDER_STATUS':
        return <Package size={16} className="text-[#c5a059]" />;
      case 'REFUND_UPDATE':
        return <RotateCcw size={16} className="text-blue-400" />;
      case 'SUPPORT_RESPONSE':
        return <LifeBuoy size={16} className="text-purple-400" />;
      default:
        return <Bell size={16} className="text-white/60" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 md:p-6 border border-white/10 bg-[#0d0d0d] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-serif uppercase tracking-[0.2em] text-white font-semibold">
              Operational Event Alerts & System Notifications
            </h2>
            <span className="text-[9px] px-2 py-0.5 bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/40 font-mono uppercase">
              LIVE EVENT STREAM
            </span>
          </div>
          <p className="text-[11px] text-white/40 font-mono mt-0.5">
            Real-time authoritative dispatches, order placements, refund requests, and concierge escalation feeds
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-black border border-white/10 p-0.5">
            {['ALL', 'ADMIN_ALERT', 'ORDER_STATUS', 'REFUND_UPDATE', 'SUPPORT_RESPONSE'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 text-xs font-mono tracking-wider transition-colors ${
                  filterType === t
                    ? 'bg-[#c5a059] text-black font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {t === 'ALL' ? 'ALL' : t.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={fetchAdminAlerts}
            disabled={loading}
            className="p-2 border border-white/10 hover:border-white/30 text-white/70 hover:text-white bg-black transition-colors"
            title="Refresh alerts"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#c5a059]' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/40 space-y-3 bg-[#0d0d0d] border border-white/5">
          <RefreshCw size={24} className="animate-spin text-[#c5a059]" />
          <p className="text-xs font-mono">Synchronizing administrative event feed...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-950/20 border border-red-500/30 text-red-400 text-xs font-mono">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-xs text-white/40 font-mono bg-[#0d0d0d] border border-white/5 space-y-2">
          <CheckCircle2 size={32} className="text-emerald-400 mx-auto" />
          <p>No administrative alerts matching the selected filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div
              key={item.id}
              className="p-4 border border-white/10 bg-[#0d0d0d] hover:border-white/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-black border border-white/10 rounded shrink-0">
                  {getAlertIcon(item.type)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-serif font-semibold text-white">{item.title}</h4>
                    <span className="text-[9px] font-mono px-2 py-0.5 bg-white/5 border border-white/10 text-white/60">
                      {item.type}
                    </span>
                  </div>
                  <p className="text-xs text-white/70 font-sans leading-relaxed">
                    {item.message}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-white/40 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {new Date(item.createdAt).toLocaleString()}
                    </span>
                    {item.relatedEntityType && item.relatedEntityId && (
                      <span>Ref: {item.relatedEntityType} #{item.relatedEntityId}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Jump Buttons */}
              {item.relatedEntityType && item.relatedEntityId && (
                <div className="shrink-0 flex items-center gap-2">
                  {item.relatedEntityType === 'ORDER' && onSelectOrder && (
                    <button
                      onClick={() => onSelectOrder(item.relatedEntityId)}
                      className="px-3 py-1.5 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30 text-xs font-mono uppercase tracking-wider"
                    >
                      View Order #{item.relatedEntityId}
                    </button>
                  )}
                  {item.relatedEntityType === 'REFUND' && onSelectRefund && (
                    <button
                      onClick={() => onSelectRefund(item.relatedEntityId)}
                      className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono uppercase tracking-wider"
                    >
                      Inspect Refund #{item.relatedEntityId}
                    </button>
                  )}
                  {item.relatedEntityType === 'SUPPORT_TICKET' && onSelectSupportTicket && (
                    <button
                      onClick={() => onSelectSupportTicket(item.relatedEntityId)}
                      className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-mono uppercase tracking-wider"
                    >
                      Open Ticket #{item.relatedEntityId}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
