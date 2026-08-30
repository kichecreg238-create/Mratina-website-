import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  RotateCcw,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  ShieldAlert,
  ArrowRight,
  Eye,
  RefreshCw,
  X,
  CreditCard
} from 'lucide-react';

interface AdminRefundsPanelProps {
  onOpenOrderOperations?: (orderId: number) => void;
}

export const AdminRefundsPanel: React.FC<AdminRefundsPanelProps> = ({ onOpenOrderOperations }) => {
  const { user } = useAuthStore();
  const [refunds, setRefunds] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalCount: 0,
    requestedCount: 0,
    approvedCount: 0,
    completedCount: 0,
    rejectedCount: 0,
    totalRefundedAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals
  const [selectedRefund, setSelectedRefund] = useState<any | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Action forms
  const [actionReason, setActionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRefunds = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/admin/refunds?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load refund requests');
      const data = await res.json();
      setRefunds(data.refunds || []);
      setStats(data.stats || {});
    } catch (err: any) {
      setErrorMsg(err.message || 'Error fetching refunds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefunds();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRefunds();
  };

  const handleOpenAudit = async (refund: any) => {
    setSelectedRefund(refund);
    setShowAuditModal(true);
    setLoadingAudit(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/refunds/audit-logs?refundId=${refund.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      const data = await res.json();
      setAuditLogs(data.auditLogs || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRefund || !user) return;
    setIsSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/refunds/${selectedRefund.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'APPROVE',
          reason: actionReason || 'Admin approved refund',
          adminNotes: adminNotes || undefined,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve refund');

      setShowApproveModal(false);
      setSelectedRefund(null);
      setActionReason('');
      setAdminNotes('');
      await fetchRefunds();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRefund || !user) return;
    if (!actionReason.trim()) {
      alert('A rejection reason is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/refunds/${selectedRefund.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'REJECT',
          reason: actionReason.trim(),
          adminNotes: adminNotes || undefined,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject refund');

      setShowRejectModal(false);
      setSelectedRefund(null);
      setActionReason('');
      setAdminNotes('');
      await fetchRefunds();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="bg-amber-950/40 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase">REQUESTED</span>;
      case 'APPROVED':
      case 'COMPLETED':
        return <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase">COMPLETED</span>;
      case 'PROCESSING':
        return <span className="bg-blue-950/40 text-blue-400 border border-blue-500/30 px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase">PROCESSING</span>;
      case 'REJECTED':
        return <span className="bg-red-950/40 text-red-400 border border-red-500/30 px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase">REJECTED</span>;
      default:
        return <span className="bg-white/10 text-white/70 border border-white/20 px-2 py-0.5 text-[9px] font-mono tracking-wider uppercase">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 border border-white/10 bg-[#0d0d0d]">
          <div className="text-white/40 text-[9px] uppercase font-mono tracking-wider mb-1">Total Requests</div>
          <div className="text-lg font-bold font-mono text-white">{stats.totalCount || 0}</div>
        </div>
        <div className="p-3.5 border border-amber-500/20 bg-amber-950/10">
          <div className="text-amber-400/70 text-[9px] uppercase font-mono tracking-wider mb-1">Pending Review</div>
          <div className="text-lg font-bold font-mono text-amber-300">{stats.requestedCount || 0}</div>
        </div>
        <div className="p-3.5 border border-emerald-500/20 bg-emerald-950/10">
          <div className="text-emerald-400/70 text-[9px] uppercase font-mono tracking-wider mb-1">Completed</div>
          <div className="text-lg font-bold font-mono text-emerald-400">{stats.completedCount || 0}</div>
        </div>
        <div className="p-3.5 border border-red-500/20 bg-red-950/10">
          <div className="text-red-400/70 text-[9px] uppercase font-mono tracking-wider mb-1">Rejected</div>
          <div className="text-lg font-bold font-mono text-red-400">{stats.rejectedCount || 0}</div>
        </div>
        <div className="p-3.5 border border-[#c5a059]/30 bg-[#c5a059]/5 col-span-2 md:col-span-1">
          <div className="text-[#c5a059]/70 text-[9px] uppercase font-mono tracking-wider mb-1">Total Refunded</div>
          <div className="text-lg font-bold font-mono text-[#c5a059]">
            KES {Number(stats.totalRefundedAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0d0d0d] p-3 border border-white/10 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/40 text-[10px] uppercase font-mono">Status:</span>
          {['ALL', 'REQUESTED', 'COMPLETED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider border transition-all ${
                statusFilter === st
                  ? 'bg-[#c5a059]/20 text-[#c5a059] border-[#c5a059]/40'
                  : 'bg-white/5 text-white/50 border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Search order #, customer, reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/50 border border-white/10 px-3 py-1.5 pl-8 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#c5a059]"
            />
            <Search className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-2.5" />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] uppercase tracking-wider transition-colors"
          >
            Filter
          </button>
          <button
            type="button"
            onClick={fetchRefunds}
            className="p-1.5 text-white/50 hover:text-white bg-white/5 border border-white/10"
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </form>
      </div>

      {/* Refunds Table */}
      <div className="border border-white/10 bg-[#0d0d0d] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                <th className="p-3">Req ID</th>
                <th className="p-3">Linked Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Status</th>
                <th className="p-3">Requested</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {refunds.length > 0 ? (
                refunds.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3 text-white font-bold">#REF-{r.id}</td>
                    <td className="p-3">
                      <button
                        onClick={() => onOpenOrderOperations && onOpenOrderOperations(r.orderId)}
                        className="text-[#c5a059] hover:underline font-bold"
                      >
                        Order #{r.orderId}
                      </button>
                    </td>
                    <td className="p-3 text-white/80 font-sans text-xs max-w-[160px] truncate" title={r.customerEmail}>
                      {r.customerEmail || 'Guest'}
                    </td>
                    <td className="p-3 text-emerald-400 font-bold">KES {Number(r.amount).toFixed(2)}</td>
                    <td className="p-3 text-white/70 font-sans text-xs max-w-[220px] truncate" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="p-3 text-white/60 text-[10px]">
                      {r.provider || 'M-PESA'}
                      {r.providerReference && <span className="block text-white/30 text-[9px]">{r.providerReference}</span>}
                    </td>
                    <td className="p-3">{getStatusBadge(r.status)}</td>
                    <td className="p-3 text-white/40 text-[10px]">
                      {new Date(r.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                      {r.status === 'REQUESTED' ? (
                        <>
                          <button
                            onClick={() => {
                              setSelectedRefund(r);
                              setActionReason('');
                              setAdminNotes('');
                              setShowApproveModal(true);
                            }}
                            className="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/40 text-[10px] uppercase tracking-wider font-mono transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRefund(r);
                              setActionReason('');
                              setAdminNotes('');
                              setShowRejectModal(true);
                            }}
                            className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-500/40 text-[10px] uppercase tracking-wider font-mono transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleOpenAudit(r)}
                          className="px-2.5 py-1 bg-white/5 hover:bg-white/15 text-white/70 text-[10px] uppercase tracking-wider font-mono transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Audit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-white/40 font-sans text-xs">
                    {loading ? 'Loading refund requests...' : 'No refund requests found matching the criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* APPROVE MODAL */}
      {showApproveModal && selectedRefund && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-emerald-500/40 w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-serif text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" /> Approve Refund #REF-{selectedRefund.id}
                </h3>
                <p className="text-xs text-white/40">Order #{selectedRefund.orderId} • {selectedRefund.customerEmail}</p>
              </div>
              <button onClick={() => setShowApproveModal(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black/40 border border-white/5 p-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-white/40">Refund Amount:</span>
                <span className="text-emerald-400 font-bold">KES {Number(selectedRefund.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Payment Provider:</span>
                <span className="text-white/80">{selectedRefund.provider || 'M-PESA'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Customer Reason:</span>
                <span className="text-white/80 max-w-[200px] truncate">{selectedRefund.reason}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px]">
              Approving will trigger the payment provider refund adapter, transition the order's payment state to <strong className="font-mono">REFUNDED</strong>, and record immutable audit logs.
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-white/50 text-[10px] uppercase font-mono mb-1">
                  Approval Notes / Justification (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Customer return verified, batch defect acknowledged"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 p-2 text-white focus:outline-none focus:border-[#c5a059]"
                />
              </div>
              <div>
                <label className="block text-white/50 text-[10px] uppercase font-mono mb-1">
                  Internal Staff Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Private notes for ledger"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 p-2 text-white focus:outline-none focus:border-[#c5a059]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 border border-white/10 text-white/60 hover:text-white text-xs font-mono uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleApprove}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Processing...' : 'Confirm & Execute Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {showRejectModal && selectedRefund && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-red-500/40 w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-serif text-white flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" /> Reject Refund #REF-{selectedRefund.id}
                </h3>
                <p className="text-xs text-white/40">Order #{selectedRefund.orderId} • {selectedRefund.customerEmail}</p>
              </div>
              <button onClick={() => setShowRejectModal(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-white/70 text-[10px] uppercase font-mono mb-1">
                  Rejection Reason (Required - Visible to Customer) <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why the refund request cannot be fulfilled (e.g. Past return window, product altered or consumed)..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 p-2.5 text-white focus:outline-none focus:border-red-400 text-xs"
                />
              </div>
              <div>
                <label className="block text-white/50 text-[10px] uppercase font-mono mb-1">
                  Internal Staff Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Internal notes for ledger"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 p-2 text-white focus:outline-none focus:border-white/40"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-white/10 text-white/60 hover:text-white text-xs font-mono uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !actionReason.trim()}
                onClick={handleReject}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-mono uppercase tracking-wider font-bold transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL MODAL */}
      {showAuditModal && selectedRefund && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/20 w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-serif text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#c5a059]" /> Refund #REF-{selectedRefund.id} Lifecycle Audit Trail
                </h3>
                <p className="text-xs text-white/40">Order #{selectedRefund.orderId} • Amount: KES {Number(selectedRefund.amount).toFixed(2)}</p>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono bg-black/30 p-3 border border-white/5">
              <div>
                <span className="text-white/40 text-[9px] uppercase block">Current Status</span>
                <span className="text-white font-bold">{selectedRefund.status}</span>
              </div>
              <div>
                <span className="text-white/40 text-[9px] uppercase block">Provider</span>
                <span className="text-white">{selectedRefund.provider || 'M-PESA'}</span>
              </div>
              <div>
                <span className="text-white/40 text-[9px] uppercase block">Customer Email</span>
                <span className="text-white/80 truncate block">{selectedRefund.customerEmail}</span>
              </div>
              <div>
                <span className="text-white/40 text-[9px] uppercase block">Requested At</span>
                <span className="text-white/70">{new Date(selectedRefund.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            {selectedRefund.rejectionReason && (
              <div className="p-3 bg-red-950/20 border border-red-500/30 text-xs">
                <span className="text-red-400 font-mono text-[10px] uppercase block mb-1">Rejection Reason:</span>
                <p className="text-white/80">{selectedRefund.rejectionReason}</p>
              </div>
            )}

            {selectedRefund.adminNotes && (
              <div className="p-3 bg-[#c5a059]/10 border border-[#c5a059]/20 text-xs">
                <span className="text-[#c5a059] font-mono text-[10px] uppercase block mb-1">Internal Admin Notes:</span>
                <p className="text-white/80">{selectedRefund.adminNotes}</p>
              </div>
            )}

            {/* Timeline */}
            <div>
              <h4 className="text-xs uppercase font-mono tracking-wider text-white/50 mb-3">Event Timeline</h4>
              {loadingAudit ? (
                <div className="text-center py-6 text-white/40 text-xs font-mono">Loading audit trail...</div>
              ) : auditLogs.length > 0 ? (
                <div className="border-l border-white/10 ml-3 pl-4 space-y-4">
                  {auditLogs.map((log, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#c5a059]"></div>
                      <div className="text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-white font-bold uppercase text-[10px] tracking-wider">
                            {log.action}
                          </span>
                          <span className="text-white/40 text-[10px] font-mono">
                            [{log.actorRole}] {log.actorEmail || 'System'}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/40 font-mono block">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                        {log.reason && (
                          <p className="text-xs text-white/70 italic mt-1 bg-black/40 p-2 border border-white/5">
                            {log.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-white/40 text-xs">No audit events recorded.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
