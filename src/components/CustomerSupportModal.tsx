import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  LifeBuoy,
  X,
  Send,
  Plus,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  RefreshCw
} from 'lucide-react';

interface CustomerSupportModalProps {
  initialOrderId?: number;
  onClose: () => void;
}

export const CustomerSupportModal: React.FC<CustomerSupportModalProps> = ({ initialOrderId, onClose }) => {
  const { user } = useAuthStore();
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'THREAD'>(initialOrderId ? 'CREATE' : 'LIST');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Form State
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('ORDER_ISSUE');
  const [priority, setPriority] = useState('MEDIUM');
  const [linkedOrderId, setLinkedOrderId] = useState<string>(initialOrderId ? String(initialOrderId) : '');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Thread State
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ticketDetails, setTicketDetails] = useState<any | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const fetchCustomerTickets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/support/tickets/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load your support tickets');
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketThread = async (ticketId: number) => {
    if (!user) return;
    setSelectedTicketId(ticketId);
    setViewMode('THREAD');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load thread');
      const data = await res.json();
      setTicketDetails(data.ticket);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCustomerTickets();
  }, [user]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          orderId: linkedOrderId ? parseInt(linkedOrderId) : undefined,
          message: message.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit support ticket');
      }

      // Reset & Switch to created thread
      setSubject('');
      setMessage('');
      await fetchCustomerTickets();
      await loadTicketThread(data.ticket.id);
    } catch (err: any) {
      setFormError(err.message || 'Error creating ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedTicketId || !replyText.trim()) return;

    setIsSendingReply(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: replyText.trim()
        })
      });

      if (!res.ok) throw new Error('Failed to send reply');
      setReplyText('');
      await loadTicketThread(selectedTicketId);
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setIsSendingReply(false);
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/20 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-xs font-sans">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center bg-[#0d0d0d]">
          <div className="flex items-center gap-3">
            {viewMode !== 'LIST' && (
              <button
                onClick={() => setViewMode('LIST')}
                className="p-1 text-white/50 hover:text-white border border-white/10 bg-white/5 mr-1"
                title="Back to Tickets"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h3 className="text-base font-serif text-white flex items-center gap-2">
                <LifeBuoy className="w-4 h-4 text-[#c5a059]" /> Customer Support Desk
              </h3>
              <p className="text-white/40 text-[11px]">Direct inquiry channel with Mratina concierge staff</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'LIST' && (
              <button
                onClick={() => setViewMode('CREATE')}
                className="px-3 py-1.5 bg-[#c5a059] text-black font-mono text-[11px] font-bold uppercase tracking-wider hover:bg-[#b08d4b] flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> New Ticket
              </button>
            )}
            <button onClick={onClose} className="text-white/40 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* VIEW 1: TICKETS LIST */}
        {viewMode === 'LIST' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
            {loading ? (
              <div className="text-center py-12 text-white/40 font-mono text-xs">Loading your support tickets...</div>
            ) : tickets.length > 0 ? (
              <div className="divide-y divide-white/5 border border-white/10 bg-black/40">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => loadTicketThread(t.id)}
                    className="p-4 hover:bg-white/[0.03] cursor-pointer transition-colors space-y-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[#c5a059] font-bold text-xs">{t.ticketNumber}</span>
                        {getStatusBadge(t.status)}
                      </div>
                      <span className="text-[10px] text-white/40 font-mono">
                        {new Date(t.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h4 className="text-sm font-medium text-white/90">{t.subject}</h4>

                    <div className="flex items-center justify-between text-[11px] text-white/40 font-mono">
                      <span>Category: <span className="text-white/70 uppercase">{t.category}</span></span>
                      {t.orderId && <span>Order #{t.orderId}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 space-y-3 bg-black/20 border border-white/5 p-6">
                <LifeBuoy className="w-10 h-10 text-white/20 mx-auto" />
                <p className="text-sm font-serif text-white/70">No open tickets</p>
                <p className="text-xs text-white/40 max-w-sm mx-auto">
                  Need assistance with an order, delivery, or drink specifications? Create a ticket to reach our team.
                </p>
                <button
                  onClick={() => setViewMode('CREATE')}
                  className="px-4 py-2 bg-[#c5a059] text-black font-mono text-xs uppercase font-bold tracking-wider hover:bg-[#b08d4b]"
                >
                  Open Support Ticket
                </button>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: CREATE TICKET FORM */}
        {viewMode === 'CREATE' && (
          <form onSubmit={handleCreateTicket} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {formError && (
              <div className="p-3 bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ORDER_ISSUE">Order Issue / Modification</option>
                  <option value="DELIVERY_STATUS">Delivery Status / ETA</option>
                  <option value="QUALITY_ISSUE">Quality / Seal Integrity</option>
                  <option value="PAYMENT_ISSUE">Payment / M-Pesa Inquiry</option>
                  <option value="ACCOUNT_INQUIRY">Account Inquiry</option>
                  <option value="OTHER">Other Concierge Request</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium (Standard)</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent (Delivery in transit)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1">
                Linked Order # (Optional)
              </label>
              <input
                type="number"
                placeholder="e.g. 104"
                value={linkedOrderId}
                onChange={(e) => setLinkedOrderId(e.target.value)}
                className="w-full bg-black/60 border border-white/15 px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#c5a059]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1">
                Subject *
              </label>
              <input
                type="text"
                placeholder="Brief summary of your inquiry..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-black/60 border border-white/15 px-3 py-2 text-white text-xs focus:outline-none focus:border-[#c5a059]"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1">
                Detailed Message *
              </label>
              <textarea
                rows={4}
                placeholder="Describe your inquiry or issue clearly..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-black/60 border border-white/15 p-2.5 text-white text-xs focus:outline-none focus:border-[#c5a059]"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                className="px-4 py-2 border border-white/10 text-white/60 hover:text-white text-xs font-mono uppercase"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !subject.trim() || !message.trim()}
                className="px-4 py-2 bg-[#c5a059] hover:bg-[#b08d4b] text-black font-mono text-xs uppercase font-bold tracking-wider disabled:opacity-40"
              >
                {isSubmitting ? 'Creating...' : 'Submit Ticket'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 3: TICKET THREAD */}
        {viewMode === 'THREAD' && ticketDetails && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Thread Details Bar */}
            <div className="p-4 bg-black/60 border-b border-white/10 flex justify-between items-center text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#c5a059] font-bold">{ticketDetails.ticketNumber}</span>
                  {getStatusBadge(ticketDetails.status)}
                </div>
                <h4 className="font-serif text-white text-sm mt-0.5">{ticketDetails.subject}</h4>
              </div>
              <div className="text-right text-[11px] font-mono text-white/40">
                <span>Category: {ticketDetails.category}</span>
                {ticketDetails.orderId && <span className="block text-white/70">Order #{ticketDetails.orderId}</span>}
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {ticketDetails.messages && ticketDetails.messages.length > 0 ? (
                ticketDetails.messages.map((msg: any) => {
                  const isStaff = msg.senderRole === 'ADMIN' || msg.senderRole === 'STAFF';

                  return (
                    <div
                      key={msg.id}
                      className={`p-3.5 border text-xs max-w-[85%] ${
                        isStaff
                          ? 'bg-[#c5a059]/10 border-[#c5a059]/30 text-white ml-auto'
                          : 'bg-white/[0.03] border-white/10 text-white mr-auto'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-white/40">
                        <span className={isStaff ? 'text-[#c5a059] font-bold' : 'text-white/70 font-bold'}>
                          {isStaff ? 'Mratina Concierge' : 'You'}
                        </span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-white/40">No messages in this conversation.</div>
              )}
            </div>

            {/* Reply Input */}
            {['OPEN', 'IN_PROGRESS'].includes(ticketDetails.status) ? (
              <form onSubmit={handleSendReply} className="p-3 bg-[#0a0a0a] border-t border-white/10 flex gap-2">
                <input
                  type="text"
                  placeholder="Type your message to support..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c5a059]"
                />
                <button
                  type="submit"
                  disabled={isSendingReply || !replyText.trim()}
                  className="px-4 py-2 bg-[#c5a059] hover:bg-[#b08d4b] text-black font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1 disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingReply ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            ) : (
              <div className="p-3 bg-black/40 border-t border-white/10 text-center text-xs font-mono text-white/40">
                This ticket has been marked as {ticketDetails.status}. Open a new ticket if further assistance is required.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
