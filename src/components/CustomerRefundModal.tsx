import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { RotateCcw, X, AlertCircle, CheckCircle2, ShieldCheck, Clock } from 'lucide-react';

interface CustomerRefundModalProps {
  order: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerRefundModal: React.FC<CustomerRefundModalProps> = ({ order, onClose, onSuccess }) => {
  const { user } = useAuthStore();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState<number>(Number(order.totalAmount));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!reason.trim()) {
      setErrorMsg('Please specify a detailed reason for the refund request.');
      return;
    }
    if (amount <= 0 || amount > Number(order.totalAmount)) {
      setErrorMsg(`Refund amount must be between KES 1.00 and KES ${Number(order.totalAmount).toLocaleString()}.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/refunds/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId: order.id,
          reason: reason.trim(),
          amount: amount,
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit refund request');
      }

      setSuccessData(data.refund);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while submitting the refund request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/20 w-full max-w-lg p-6 space-y-4 text-xs font-sans">
        <div className="flex justify-between items-start border-b border-white/10 pb-3">
          <div>
            <h3 className="text-base font-serif text-white flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#c5a059]" /> Request Refund — Order #{order.id}
            </h3>
            <p className="text-white/40 text-[11px] mt-0.5">
              Purchased: {new Date(order.createdAt).toLocaleDateString()} • Total: KES {Number(order.totalAmount).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {successData ? (
          <div className="space-y-4 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-serif text-white mb-1">Refund Request Submitted</h4>
              <p className="text-xs text-white/60 max-w-sm mx-auto">
                Your request <strong className="font-mono text-emerald-400">#REF-{successData.id}</strong> for <strong className="text-white font-mono">KES {Number(successData.amount).toLocaleString()}</strong> has been submitted to the auditing desk for review.
              </p>
            </div>
            <div className="p-3 bg-black/40 border border-white/5 text-[11px] font-mono text-white/50 text-left space-y-1">
              <div>Status: <span className="text-amber-400 uppercase">REQUESTED</span></div>
              <div>Estimated Review Time: <span className="text-white/80">Within 24 Hours</span></div>
              <div>Reversal Destination: <span className="text-white/80">Original Payment Account ({order.paymentState})</span></div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-[#c5a059] text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-[#b08d4b]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="p-3 bg-white/[0.02] border border-white/5 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between text-white/70">
                <span>Original Payment:</span>
                <span className="text-emerald-400 font-bold">{order.paymentState}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Order Total:</span>
                <span className="text-white font-bold">KES {Number(order.totalAmount).toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1.5">
                Refund Amount (KES)
              </label>
              <input
                type="number"
                min="1"
                max={order.totalAmount}
                step="any"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-black/50 border border-white/15 px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#c5a059]"
                required
              />
              <span className="text-[10px] text-white/30 font-mono mt-1 block">
                Up to maximum order total of KES {Number(order.totalAmount).toLocaleString()}
              </span>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1.5">
                Reason for Refund Request <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please describe the issue (e.g. damaged seal upon delivery, delayed handover, incorrect vintage)..."
                className="w-full bg-black/50 border border-white/15 p-2.5 text-white text-xs focus:outline-none focus:border-[#c5a059]"
                required
              />
            </div>

            <div className="p-3 bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-200/80 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                All refund requests are verified against warehouse dispatches, deliverer GPS telemetry, and payment gateway logs before reversal.
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border border-white/10 text-white/60 hover:text-white text-xs font-mono uppercase"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !reason.trim()}
                className="px-4 py-2 bg-[#c5a059] hover:bg-[#b08d4b] text-black font-mono text-xs uppercase font-bold tracking-wider disabled:opacity-40"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Refund Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
