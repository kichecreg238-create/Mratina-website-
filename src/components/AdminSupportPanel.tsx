import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  LifeBuoy,
  Search,
  Filter,
  MessageSquare,
  Lock,
  Send,
  UserCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  RefreshCw,
  ExternalLink,
  Tag,
  X,
  ChevronRight,
  Shield,
  Eye
} from 'lucide-react';

interface AdminSupportPanelProps {
  onOpenOrderOperations?: (orderId: number) => void;
}

export const AdminSupportPanel: React.FC<AdminSupportPanelProps> = ({ onOpenOrderOperations }) => {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalCount: 0,
    openCount: 0,
    inProgressCount: 0,
    resolvedCount: 0,
    urgentCount: 0,
  });
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Ticket Detail
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ticketDetails, setTicketDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Reply / Note Composer
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Internal Notes Editor
  const [internalNotesText, setInternalNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(false);

  // Audit Logs Modal
  const [showAuditModal, setShowAuditModal] = useState(false);

  const fetchTickets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/admin/support/tickets?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch tickets');
      const data = await res.json();
      setTickets(data.tickets || []);
      setStats(data.stats || {});
    } catch (err) {
      console.error('Error fetching support tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffUsers = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const staff = (data.users || []).filter((u: any) => ['ADMIN', 'DELIVERER'].includes(u.role));
        setStaffUsers(staff);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadTicketDetails = async (ticketId: number) => {
    if (!user) return;
    setSelectedTicketId(ticketId);
    setLoadingDetails(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load ticket details');
      const data = await res.json();
      setTicketDetails(data.ticket);
      setInternalNotesText(data.ticket.internalNotes || '');
    } catch (err) {
      console.error('Error loading ticket details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchStaffUsers();
  }, [statusFilter, categoryFilter, priorityFilter]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyMessage.trim() || !user) return;
    setIsSending(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: replyMessage.trim(),
          isInternalNote,
        })
      });
      if (!res.ok) throw new Error('Failed to send response');
      setReplyMessage('');
      await loadTicketDetails(selectedTicketId);
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Error sending message');
    } finally {
      setIsSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicketId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets/${selectedTicketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update status');
      await loadTicketDetails(selectedTicketId);
      await fetchTickets();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAssignChange = async (assignedToId: string) => {
    if (!selectedTicketId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets/${selectedTicketId}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ assignedTo: assignedToId ? parseInt(assignedToId) : null })
      });
      if (!res.ok) throw new Error('Failed to assign ticket');
      await loadTicketDetails(selectedTicketId);
      await fetchTickets();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveInternalNotes = async () => {
    if (!selectedTicketId || !user) return;
    setIsSavingNotes(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets/${selectedTicketId}/internal-notes`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ internalNotes: internalNotesText })
      });
      if (!res.ok) throw new Error('Failed to update internal notes');
      setShowNotesEditor(false);
      await loadTicketDetails(selectedTicketId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="bg-red-950/60 text-red-400 border border-red-500/40 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-bold">URGENT</span>;
      case 'HIGH':
        return <span className="bg-amber-950/40 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">HIGH</span>;
      case 'LOW':
        return <span className="bg-white/5 text-white/50 border border-white/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">LOW</span>;
      default:
        return <span className="bg-blue-950/40 text-blue-300 border border-blue-500/30 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">MEDIUM</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="bg-amber-950/40 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">OPEN</span>;
      case 'IN_PROGRESS':
        return <span className="bg-purple-950/40 text-purple-300 border border-purple-500/30 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">IN PROGRESS</span>;
      case 'RESOLVED':
        return <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">RESOLVED</span>;
      case 'CLOSED':
        return <span className="bg-white/10 text-white/50 border border-white/20 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider">CLOSED</span>;
      default:
        return <span className="bg-white/5 text-white/70 px-2 py-0.5 text-[9px] font-mono uppercase">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 border border-white/10 bg-[#0d0d0d]">
          <div className="text-white/40 text-[9px] uppercase font-mono tracking-wider mb-1">Total Inquiries</div>
          <div className="text-lg font-bold font-mono text-white">{stats.totalCount || 0}</div>
        </div>
        <div className="p-3.5 border border-amber-500/20 bg-amber-950/10">
          <div className="text-amber-400/70 text-[9px] uppercase font-mono tracking-wider mb-1">Open Tickets</div>
          <div className="text-lg font-bold font-mono text-amber-300">{stats.openCount || 0}</div>
        </div>
        <div className="p-3.5 border border-purple-500/20 bg-purple-950/10">
          <div className="text-purple-400/70 text-[9px] uppercase font-mono tracking-wider mb-1">In Progress</div>
          <div className="text-lg font-bold font-mono text-purple-300">{stats.inProgressCount || 0}</div>
        </div>
        <div className="p-3.5 border border-red-500/20 bg-red-950/10">
          <div className="text-red-400/70 text-[9px] uppercase font-mono tracking-wider mb-1">Urgent Queue</div>
          <div className="text-lg font-bold font-mono text-red-400">{stats.urgentCount || 0}</div>
        </div>
        <div className="p-3.5 border border-emerald-500/20 bg-emerald-950/10">
          <div className="text-emerald-400/70 text-[9px] uppercase font-mono tracking-wider mb-1">Resolved</div>
          <div className="text-lg font-bold font-mono text-emerald-400">{stats.resolvedCount || 0}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0d0d0d] p-3 border border-white/10 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/40 text-[10px] uppercase font-mono">Status:</span>
          {['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((st) => (
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

          <span className="text-white/40 text-[10px] uppercase font-mono ml-2">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-black/50 border border-white/10 px-2 py-1 text-white/80 font-mono text-[10px] focus:outline-none focus:border-[#c5a059]"
          >
            <option value="ALL">ALL CATEGORIES</option>
            <option value="ORDER_ISSUE">ORDER ISSUE</option>
            <option value="DELIVERY_STATUS">DELIVERY STATUS</option>
            <option value="QUALITY_ISSUE">QUALITY ISSUE</option>
            <option value="PAYMENT_ISSUE">PAYMENT ISSUE</option>
            <option value="ACCOUNT_INQUIRY">ACCOUNT INQUIRY</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-60">
            <input
              type="text"
              placeholder="Search ticket #, subject, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTickets()}
              className="w-full bg-black/50 border border-white/10 px-3 py-1.5 pl-8 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#c5a059]"
            />
            <Search className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-2.5" />
          </div>
          <button
            onClick={fetchTickets}
            className="p-1.5 text-white/50 hover:text-white bg-white/5 border border-white/10"
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Split Layout: Ticket List & Active Conversation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Tickets List */}
        <div className="lg:col-span-5 border border-white/10 bg-[#0d0d0d] overflow-hidden">
          <div className="p-3 border-b border-white/10 bg-white/[0.02] flex justify-between items-center text-xs">
            <span className="text-white/60 font-mono text-[10px] uppercase tracking-wider">
              {tickets.length} Tickets
            </span>
          </div>

          <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
            {tickets.length > 0 ? (
              tickets.map((t) => {
                const isSelected = selectedTicketId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => loadTicketDetails(t.id)}
                    className={`p-3.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-white/10 border-l-2 border-l-[#c5a059]'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white font-bold text-xs">{t.ticketNumber}</span>
                        {getStatusBadge(t.status)}
                      </div>
                      {getPriorityBadge(t.priority)}
                    </div>

                    <h4 className="text-xs text-white/90 font-medium mb-1 line-clamp-1">{t.subject}</h4>

                    <div className="flex items-center justify-between text-[10px] text-white/40 font-mono">
                      <span>{t.customerEmail}</span>
                      <span>{new Date(t.updatedAt).toLocaleDateString()}</span>
                    </div>

                    {t.orderId && (
                      <div className="mt-2 text-[10px] font-mono text-[#c5a059] flex items-center gap-1">
                        <span>Linked Order #{t.orderId}</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-white/40 text-xs font-sans">
                {loading ? 'Loading tickets...' : 'No support tickets found.'}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active Ticket Conversation & Inspector */}
        <div className="lg:col-span-7 border border-white/10 bg-[#0d0d0d] overflow-hidden min-h-[600px] flex flex-col justify-between">
          {selectedTicketId && ticketDetails ? (
            <div className="flex-1 flex flex-col h-full">
              {/* Ticket Header & Operations Bar */}
              <div className="p-4 border-b border-white/10 bg-[#080808] space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-serif text-white">{ticketDetails.subject}</h3>
                      <span className="text-xs font-mono text-white/50">({ticketDetails.ticketNumber})</span>
                    </div>
                    <p className="text-xs text-white/50">
                      From: <span className="text-white/80">{ticketDetails.customer?.email}</span> • Category: <span className="text-[#c5a059] uppercase font-mono text-[10px]">{ticketDetails.category}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAuditModal(true)}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/15 text-white/70 text-[10px] uppercase font-mono border border-white/10 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> Audit
                    </button>
                    {ticketDetails.orderId && onOpenOrderOperations && (
                      <button
                        onClick={() => onOpenOrderOperations(ticketDetails.orderId)}
                        className="px-2.5 py-1 bg-[#c5a059]/20 hover:bg-[#c5a059]/30 text-[#c5a059] border border-[#c5a059]/40 text-[10px] uppercase font-mono flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Order #{ticketDetails.orderId}
                      </button>
                    )}
                  </div>
                </div>

                {/* Status & Assignment Quick-Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-[10px] uppercase">Status:</span>
                    <select
                      value={ticketDetails.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="bg-black/60 border border-white/20 px-2 py-1 text-white text-[11px] font-mono focus:outline-none focus:border-[#c5a059]"
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="IN_PROGRESS">IN PROGRESS</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-[10px] uppercase">Assigned Staff:</span>
                    <select
                      value={ticketDetails.assignedTo || ''}
                      onChange={(e) => handleAssignChange(e.target.value)}
                      className="bg-black/60 border border-white/20 px-2 py-1 text-white text-[11px] font-mono focus:outline-none focus:border-[#c5a059]"
                    >
                      <option value="">Unassigned</option>
                      {staffUsers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.email} ({s.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <button
                      onClick={() => setShowNotesEditor(!showNotesEditor)}
                      className="text-[10px] uppercase font-mono text-[#c5a059] hover:underline flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      {ticketDetails.internalNotes ? 'Edit Staff Notes' : '+ Add Staff Note'}
                    </button>
                  </div>
                </div>

                {/* Private Internal Notes Box */}
                {(showNotesEditor || ticketDetails.internalNotes) && (
                  <div className="p-3 bg-[#c5a059]/10 border border-[#c5a059]/30 rounded-none space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-mono uppercase text-[#c5a059]">
                      <span className="flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3" /> Internal Staff Notes (Hidden from Customer)
                      </span>
                    </div>
                    {showNotesEditor ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={internalNotesText}
                          onChange={(e) => setInternalNotesText(e.target.value)}
                          placeholder="Private investigation notes, deliverer handover info, or quality inspection logs..."
                          className="w-full bg-black/60 border border-[#c5a059]/40 p-2 text-xs text-white focus:outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowNotesEditor(false)}
                            className="px-2 py-1 border border-white/10 text-white/50 text-[10px] font-mono uppercase"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveInternalNotes}
                            disabled={isSavingNotes}
                            className="px-3 py-1 bg-[#c5a059] text-black font-bold text-[10px] font-mono uppercase"
                          >
                            {isSavingNotes ? 'Saving...' : 'Save Note'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-white/80 font-sans italic">{ticketDetails.internalNotes}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Message Thread */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[400px]">
                {ticketDetails.messages && ticketDetails.messages.length > 0 ? (
                  ticketDetails.messages.map((msg: any) => {
                    const isStaff = msg.senderRole === 'ADMIN' || msg.senderRole === 'STAFF';
                    const isInternal = msg.isInternalNote;

                    return (
                      <div
                        key={msg.id}
                        className={`p-3.5 border text-xs ${
                          isInternal
                            ? 'bg-amber-950/20 border-amber-500/40 text-amber-100'
                            : isStaff
                            ? 'bg-white/[0.04] border-[#c5a059]/40 ml-4'
                            : 'bg-black/40 border-white/10 mr-4'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${isInternal ? 'text-amber-400' : isStaff ? 'text-[#c5a059]' : 'text-white/80'}`}>
                              {msg.senderEmail || (isStaff ? 'Staff' : 'Customer')}
                            </span>
                            <span className="text-white/40 uppercase">[{msg.senderRole}]</span>
                            {isInternal && (
                              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase text-[8px] flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" /> Staff Note
                              </span>
                            )}
                          </div>
                          <span className="text-white/40">
                            {new Date(msg.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-white/90 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                          {msg.message}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-white/40 text-xs">No messages in this thread.</div>
                )}
              </div>

              {/* Message Composer */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-[#080808] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                        className="rounded-none bg-black border-white/20 text-[#c5a059] focus:ring-0"
                      />
                      <span className={isInternalNote ? 'text-amber-400 font-bold' : 'text-white/60'}>
                        Post as Internal Staff Note (Hidden from Customer)
                      </span>
                    </label>
                  </div>
                  <span className="text-[10px] font-mono text-white/40">
                    {isInternalNote ? 'Confidential Staff Note' : 'Public Customer Response'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder={
                      isInternalNote
                        ? 'Write an internal note for staff review...'
                        : 'Write a response to the customer...'
                    }
                    className={`flex-1 p-2.5 text-xs text-white focus:outline-none bg-black/60 border ${
                      isInternalNote ? 'border-amber-500/40' : 'border-white/20 focus:border-[#c5a059]'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={isSending || !replyMessage.trim()}
                    className={`px-4 py-2 text-xs font-mono uppercase tracking-wider font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 ${
                      isInternalNote
                        ? 'bg-amber-600 hover:bg-amber-500 text-black'
                        : 'bg-[#c5a059] hover:bg-[#b08d4b] text-black'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending ? 'Sending...' : isInternalNote ? 'Add Note' : 'Reply'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-white/40">
              <LifeBuoy className="w-12 h-12 text-white/20 mb-3" />
              <p className="font-serif text-sm text-white/70 mb-1">Select a Support Ticket</p>
              <p className="text-xs text-white/40 max-w-sm">
                Inspect customer messages, respond authoritatively, manage ticket status, or record internal staff notes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* TICKET AUDIT LOGS MODAL */}
      {showAuditModal && ticketDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/20 w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-serif text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#c5a059]" /> Ticket {ticketDetails.ticketNumber} Audit Trail
                </h3>
                <p className="text-xs text-white/40">{ticketDetails.subject}</p>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="border-l border-white/10 ml-3 pl-4 space-y-4">
              {ticketDetails.auditLogs && ticketDetails.auditLogs.length > 0 ? (
                ticketDetails.auditLogs.map((log: any, idx: number) => (
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
                      {log.details && (
                        <p className="text-xs text-white/70 italic mt-1 bg-black/40 p-2 border border-white/5">
                          {log.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))
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
