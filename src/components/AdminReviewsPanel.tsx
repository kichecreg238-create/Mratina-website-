import React, { useState, useEffect } from 'react';
import {
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Trash2,
  Eye,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  FileText,
  X
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.ts';

interface ReviewItem {
  id: number;
  userId: number;
  productId: number;
  orderId: number | null;
  rating: number;
  comment: string | null;
  reviewerName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isApproved: boolean;
  rejectionReason: string | null;
  moderatedBy: number | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  productName: string | null;
  userEmail: string | null;
}

interface ReviewMetrics {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  overallAverageRating: number;
}

interface ReviewAuditLog {
  id: number;
  reviewId: number;
  actorId: number | null;
  actorRole: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  metadata: any;
  createdAt: string;
  actorEmail: string | null;
}

export const AdminReviewsPanel: React.FC = () => {
  const { user } = useAuthStore();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [metrics, setMetrics] = useState<ReviewMetrics>({
    totalCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    overallAverageRating: 0
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reject / Reason Modal
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedReviewForAction, setSelectedReviewForAction] = useState<ReviewItem | null>(null);
  const [actionType, setActionType] = useState<'REJECT' | 'HIDE' | 'DELETE'>('REJECT');
  const [actionReason, setActionReason] = useState('');

  // Audit Logs View Modal
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<ReviewAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [inspectingReviewId, setInspectingReviewId] = useState<number | null>(null);

  const fetchReviews = async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/admin/reviews?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch reviews');

      setReviews(data.reviews || []);
      if (data.metrics) setMetrics(data.metrics);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error loading reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [user, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReviews();
  };

  const handleModerate = async (reviewId: number, action: 'APPROVE' | 'REJECT' | 'HIDE', reason?: string) => {
    if (!user) return;
    setActionLoadingId(reviewId);
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/reviews/${reviewId}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, reason })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to moderate review');

      setShowReasonModal(false);
      setSelectedReviewForAction(null);
      setActionReason('');
      await fetchReviews();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error moderating review');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (reviewId: number, reason?: string) => {
    if (!user) return;
    setActionLoadingId(reviewId);
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete review');

      setShowReasonModal(false);
      setSelectedReviewForAction(null);
      setActionReason('');
      await fetchReviews();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error deleting review');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openReasonModal = (review: ReviewItem, type: 'REJECT' | 'HIDE' | 'DELETE') => {
    setSelectedReviewForAction(review);
    setActionType(type);
    setActionReason(type === 'REJECT' ? 'Inappropriate content / Unverified claims' : '');
    setShowReasonModal(true);
  };

  const handleReasonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReviewForAction) return;

    if (actionType === 'DELETE') {
      handleDelete(selectedReviewForAction.id, actionReason);
    } else {
      handleModerate(selectedReviewForAction.id, actionType, actionReason);
    }
  };

  const openAuditLogs = async (reviewId?: number) => {
    if (!user) return;
    setInspectingReviewId(reviewId || null);
    setShowAuditModal(true);
    setAuditLoading(true);
    try {
      const token = await user.getIdToken();
      const url = reviewId
        ? `/api/admin/reviews/audit-logs?reviewId=${reviewId}`
        : `/api/admin/reviews/audit-logs`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAuditLogs(data.auditLogs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Audit Ledger Access */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-serif text-white tracking-wider flex items-center gap-2">
            <Star className="w-5 h-5 text-[#c5a059]" />
            Reviews & Ratings Moderation
          </h2>
          <p className="text-xs text-white/50 font-mono mt-0.5">
            Module 18 — Customer Verified Reviews, Ratings & Moderation Lifecycle
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openAuditLogs()}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-mono border border-white/10 transition-colors"
          >
            <FileText size={13} className="text-[#c5a059]" />
            Audit Ledger
          </button>
          <button
            onClick={fetchReviews}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-mono border border-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-[#c5a059]' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/30 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-white/50 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 bg-[#0a0a0a] border border-white/10">
          <span className="block text-[10px] uppercase tracking-widest text-white/40 mb-1">Total Submissions</span>
          <span className="text-2xl font-serif font-bold text-white">{metrics.totalCount}</span>
        </div>

        <div className="p-4 bg-[#0a0a0a] border border-amber-500/30 bg-amber-950/10">
          <span className="block text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">Pending Moderation</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-serif font-bold text-amber-400">{metrics.pendingCount}</span>
            {metrics.pendingCount > 0 && (
              <span className="text-[9px] font-mono uppercase text-amber-400 bg-amber-500/20 px-1.5 py-0.5 border border-amber-500/30">
                Action Required
              </span>
            )}
          </div>
        </div>

        <div className="p-4 bg-[#0a0a0a] border border-[#00ff88]/30 bg-[#00ff88]/5">
          <span className="block text-[10px] uppercase tracking-widest text-[#00ff88]/70 mb-1">Approved & Live</span>
          <span className="text-2xl font-serif font-bold text-[#00ff88]">{metrics.approvedCount}</span>
        </div>

        <div className="p-4 bg-[#0a0a0a] border border-red-500/30 bg-red-950/10">
          <span className="block text-[10px] uppercase tracking-widest text-red-400/70 mb-1">Rejected / Hidden</span>
          <span className="text-2xl font-serif font-bold text-red-400">{metrics.rejectedCount}</span>
        </div>

        <div className="p-4 bg-[#0a0a0a] border border-[#c5a059]/30 bg-[#c5a059]/5">
          <span className="block text-[10px] uppercase tracking-widest text-[#c5a059]/80 mb-1">Average Rating</span>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-serif font-bold text-[#c5a059]">
              {metrics.overallAverageRating > 0 ? metrics.overallAverageRating.toFixed(1) : '—'}
            </span>
            <Star size={16} className="text-[#c5a059] fill-current" />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="p-4 bg-[#0a0a0a] border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Tab Pills */}
        <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Reviews', count: metrics.totalCount },
            { id: 'PENDING', label: 'Pending', count: metrics.pendingCount },
            { id: 'APPROVED', label: 'Approved', count: metrics.approvedCount },
            { id: 'REJECTED', label: 'Rejected', count: metrics.rejectedCount }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-[#c5a059] text-black font-bold'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-80">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search product, author, text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111] border border-white/10 text-white pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#c5a059]"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-mono"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Reviews Table / Grid */}
      <div className="bg-[#0a0a0a] border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-white/40 font-mono text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw size={18} className="animate-spin text-[#c5a059]" />
            Loading reviews data...
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-white/40 text-xs font-mono italic">
            No reviews found matching the current filters.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {reviews.map((r) => {
              const isActioning = actionLoadingId === r.id;
              return (
                <div key={r.id} className="p-5 hover:bg-white/[0.01] transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Review Details */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Status Badge */}
                        <span
                          className={`text-[9px] font-mono uppercase px-2 py-0.5 border ${
                            r.status === 'APPROVED'
                              ? 'text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/20'
                              : r.status === 'REJECTED'
                              ? 'text-red-400 bg-red-500/10 border-red-500/20'
                              : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          }`}
                        >
                          {r.status}
                        </span>

                        {/* Product Name */}
                        <span className="text-xs font-serif font-bold text-white">
                          {r.productName || `Product #${r.productId}`}
                        </span>

                        {/* Stars */}
                        <div className="flex text-[#c5a059] items-center gap-1">
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                fill={i < r.rating ? 'currentColor' : 'none'}
                                className={i < r.rating ? 'text-[#c5a059]' : 'text-white/20'}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] font-mono text-[#c5a059] font-bold">
                            {r.rating}/5
                          </span>
                        </div>

                        {/* Verified Purchase Badge */}
                        <span className="flex items-center gap-1 text-[9px] font-mono text-[#00ff88]/80 bg-[#00ff88]/5 px-1.5 py-0.2 border border-[#00ff88]/20">
                          <ShieldCheck size={10} />
                          Verified Order {r.orderId ? `#${r.orderId}` : ''}
                        </span>
                      </div>

                      {/* Comment Body */}
                      <p className="text-xs text-white/80 leading-relaxed font-sans bg-white/[0.02] p-3 border border-white/5">
                        {r.comment || <span className="italic text-white/40">No written comment provided.</span>}
                      </p>

                      {/* Rejection reason if any */}
                      {r.rejectionReason && (
                        <div className="text-[10px] text-red-300 bg-red-950/20 border border-red-500/20 p-2 font-mono">
                          Rejection Reason: {r.rejectionReason}
                        </div>
                      )}

                      {/* Metadata / Author Line */}
                      <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-white/40 pt-1">
                        <span>Author: <strong className="text-white/70">{r.reviewerName || 'Anonymous'}</strong> ({r.userEmail})</span>
                        <span>•</span>
                        <span>Submitted: {new Date(r.createdAt).toLocaleString()}</span>
                        {r.moderatedAt && (
                          <>
                            <span>•</span>
                            <span>Moderated: {new Date(r.moderatedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Moderation Controls */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0">
                      {/* View audit history for this review */}
                      <button
                        onClick={() => openAuditLogs(r.id)}
                        title="View audit logs for this review"
                        className="p-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition-colors"
                      >
                        <FileText size={14} />
                      </button>

                      {/* Approve Button */}
                      {r.status !== 'APPROVED' && (
                        <button
                          onClick={() => handleModerate(r.id, 'APPROVE')}
                          disabled={isActioning}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00ff88]/10 hover:bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 text-xs font-mono transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={13} />
                          Approve
                        </button>
                      )}

                      {/* Reject / Hide Button */}
                      {r.status === 'APPROVED' ? (
                        <button
                          onClick={() => openReasonModal(r, 'HIDE')}
                          disabled={isActioning}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono transition-colors disabled:opacity-50"
                        >
                          <XCircle size={13} />
                          Hide
                        </button>
                      ) : (
                        <button
                          onClick={() => openReasonModal(r, 'REJECT')}
                          disabled={isActioning}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-mono transition-colors disabled:opacity-50"
                        >
                          <XCircle size={13} />
                          Reject
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        onClick={() => openReasonModal(r, 'DELETE')}
                        disabled={isActioning}
                        title="Delete Review"
                        className="p-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/20 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Moderation Reason / Action Modal */}
      {showReasonModal && selectedReviewForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0e0e0e] border border-white/20 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-serif text-white tracking-wider">
                {actionType === 'DELETE' ? 'Delete Review' : actionType === 'HIDE' ? 'Hide Review' : 'Reject Review'}
              </h3>
              <button
                onClick={() => {
                  setShowReasonModal(false);
                  setSelectedReviewForAction(null);
                }}
                className="text-white/50 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-white/70 space-y-1">
              <p>Review ID: <strong className="text-white font-mono">#{selectedReviewForAction.id}</strong></p>
              <p>Product: <strong className="text-white">{selectedReviewForAction.productName}</strong></p>
              <p>Author: <strong className="text-white">{selectedReviewForAction.reviewerName}</strong></p>
            </div>

            <form onSubmit={handleReasonSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
                  Moderation Reason (Recorded to Audit Ledger)
                </label>
                <textarea
                  required
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter specific justification for this action..."
                  className="w-full bg-[#161616] border border-white/10 text-white p-2.5 text-xs focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReasonModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider ${
                    actionType === 'DELETE'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : actionType === 'HIDE'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  Confirm {actionType}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Audit Logs Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0e0e0e] border border-white/20 p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-[#c5a059]" />
                <h3 className="text-sm font-serif text-white tracking-wider">
                  Review Audit Ledger {inspectingReviewId ? `(Review #${inspectingReviewId})` : '(Recent Moderation Events)'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowAuditModal(false);
                  setInspectingReviewId(null);
                }}
                className="text-white/50 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {auditLoading ? (
              <div className="p-8 text-center text-white/40 font-mono text-xs">
                Loading audit ledger records...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-xs font-mono italic">
                No audit records recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-white/[0.02] border border-white/5 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.2 bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30">
                          {log.action}
                        </span>
                        <span className="text-white/60">Review #{log.reviewId}</span>
                        <span className="text-white/40">by {log.actorRole} ({log.actorEmail || 'system'})</span>
                      </div>
                      <span className="text-white/40">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.reason && (
                      <p className="text-white/70 text-[11px] pt-1">
                        Reason / Note: {log.reason}
                      </p>
                    )}
                    {log.fromStatus && log.toStatus && (
                      <p className="text-white/40 text-[10px]">
                        Transition: {log.fromStatus} → {log.toStatus}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
