import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { Navigate } from 'react-router-dom';
import { Package, Clock, CheckCircle, Truck, XCircle, AlertCircle, Eye, X, ChevronRight, Star, RotateCcw, LifeBuoy } from 'lucide-react';
import { ProductModal } from '../components/ProductModal.tsx';
import { CustomerRefundModal } from '../components/CustomerRefundModal.tsx';
import { CustomerSupportModal } from '../components/CustomerSupportModal.tsx';

export const OrderHistory = () => {
  const { user, dbUser, loading } = useAuthStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [reviewingProduct, setReviewingProduct] = useState<any | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Module 19: Refund & Support Modals State
  const [refundingOrder, setRefundingOrder] = useState<any | null>(null);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportOrderId, setSupportOrderId] = useState<number | undefined>(undefined);

  const fetchOrders = () => {
    if (!user) {
      setFetching(false);
      return;
    }

    user.getIdToken().then(token => {
      fetch('/api/orders/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.orders) setOrders(data.orders);
        setFetching(false);
      })
      .catch(() => setFetching(false));
    });
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const handleOpenDetails = async (orderId: number) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.order) {
        setSelectedOrder(data.order);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !cancellingOrder || !cancelReason.trim()) return;

    setIsSubmittingCancel(true);
    setCancelError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/orders/${cancellingOrder.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: cancelReason.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel order');
      }

      setShowCancelModal(false);
      setCancellingOrder(null);
      setCancelReason('');
      fetchOrders();
      if (selectedOrder?.id === cancellingOrder.id) {
        setSelectedOrder(null);
      }
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel order');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-t-2 border-[#c5a059] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" />;

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
      case 'PROCESSING':
        return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider">{status}</span>;
      case 'PICKUP_READY':
      case 'OUT_FOR_DELIVERY':
        return <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider">{status.replace(/_/g, ' ')}</span>;
      case 'DELIVERED':
        return <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider">DELIVERED</span>;
      case 'CANCELLED':
      case 'FAILED':
        return <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider">{status}</span>;
      default:
        return <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider">{status}</span>;
    }
  };

  const getPaymentBadge = (state: string) => {
    switch (state) {
      case 'SUCCESS':
        return <span className="text-green-400 font-mono text-xs">SUCCESS</span>;
      case 'REFUNDED':
        return <span className="text-blue-400 font-mono text-xs">REFUNDED</span>;
      case 'FAILED':
        return <span className="text-red-400 font-mono text-xs">FAILED</span>;
      default:
        return <span className="text-yellow-400 font-mono text-xs">{state}</span>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-12 md:pt-24 max-w-5xl w-full mx-auto h-full">
      <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-4">
        <div>
          <h2 className="text-sm uppercase tracking-[0.4em] text-[#c5a059] mb-1">Vault Access</h2>
          <p className="text-xs text-white/50">Order History & Operations Tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSupportOrderId(undefined);
              setSupportModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/40 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors"
          >
            <LifeBuoy size={14} /> Support Desk
          </button>
          <div className="text-xs text-white/40 font-mono hidden sm:block">
            {orders.length} {orders.length === 1 ? 'Record' : 'Records'}
          </div>
        </div>
      </div>
      
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[#111]/80 border border-white/5 p-12">
          <div className="w-16 h-16 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/30 flex items-center justify-center mb-4">
            <Package size={30} className="text-[#c5a059]" />
          </div>
          <h3 className="text-base font-serif text-white mb-1">No Orders Found in Your History</h3>
          <p className="text-xs text-white/50 max-w-sm mb-6 font-serif">Your cellar reservations, delivery milestones, and tasting notes will appear here once an order is placed.</p>
          <a
            href="/"
            className="px-6 py-2.5 bg-[#c5a059] text-black text-xs font-mono uppercase font-bold tracking-widest hover:bg-[#d4b271] transition-colors"
          >
            Explore Collection
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map(order => {
            const canCancel = ['PENDING', 'CONFIRMED'].includes(order.status) && 
              (!order.delivery || !['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.delivery.status));

            // Determine tracking progress step
            let stepIndex = 0;
            if (['CONFIRMED', 'PROCESSING'].includes(order.status)) stepIndex = 1;
            if (['PICKUP_READY', 'OUT_FOR_DELIVERY'].includes(order.status) || order.delivery?.status === 'OUT_FOR_DELIVERY') stepIndex = 2;
            if (order.status === 'DELIVERED') stepIndex = 3;
            if (['CANCELLED', 'FAILED'].includes(order.status)) stepIndex = -1;

            return (
              <div key={order.id} className="bg-gradient-to-b from-[#141414] to-[#0c0c0c] border border-white/10 p-6 transition-all hover:border-[#c5a059]/30 shadow-lg">
                <div className="flex flex-wrap justify-between items-start gap-4 mb-6 border-b border-white/5 pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-base font-serif text-white font-medium">Order #{order.id}</span>
                      {getOrderStatusBadge(order.status)}
                    </div>
                    <span className="text-xs text-white/40 font-mono">{new Date(order.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-serif text-[#c5a059] font-medium block mb-1">KES {Number(order.totalAmount).toLocaleString()}</span>
                    <div className="flex items-center justify-end gap-2 text-[10px] font-mono text-white/60">
                      <span className="uppercase text-white/40">Payment:</span>
                      {getPaymentBadge(order.paymentState)}
                    </div>
                  </div>
                </div>

                {/* Visual Order Lifecycle Stepper (for non-cancelled orders) */}
                {stepIndex >= 0 && (
                  <div className="mb-6 bg-black/40 p-4 border border-white/5">
                    <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono uppercase tracking-wider mb-2">
                      <span className={stepIndex >= 0 ? "text-[#c5a059] font-bold" : "text-white/30"}>1. Placed</span>
                      <span className={stepIndex >= 1 ? "text-[#c5a059] font-bold" : "text-white/30"}>2. Cellar Prep</span>
                      <span className={stepIndex >= 2 ? "text-[#c5a059] font-bold" : "text-white/30"}>3. Dispatched</span>
                      <span className={stepIndex >= 3 ? "text-[#00ff88] font-bold" : "text-white/30"}>4. Delivered</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-gradient-to-r from-[#c5a059] to-[#00ff88] h-full transition-all duration-500" 
                        style={{ width: `${((stepIndex + 1) / 4) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {order.items && order.items.length > 0 && (
                  <div className="mb-6 space-y-2">
                    {order.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs bg-black/30 p-3 border border-white/5">
                        <div className="flex flex-col">
                          <span className="text-white/90 font-medium font-serif">{item.product?.name}</span>
                          <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono">{item.variant?.volume} • {item.variant?.packaging}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right font-mono">
                            <span className="text-[#c5a059] font-bold">{item.quantity}x</span>
                            <span className="text-white/40 text-[10px] ml-2">@ KES {Number(item.priceAtPurchase).toLocaleString()}</span>
                          </div>
                          {order.status === 'DELIVERED' && item.product && (
                            <button
                              onClick={() => setReviewingProduct(item.product)}
                              className="px-2.5 py-1 bg-[#c5a059]/10 hover:bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30 text-[10px] uppercase font-mono tracking-wider flex items-center gap-1 transition-colors"
                            >
                              <Star size={11} className="fill-current" />
                              Review Product
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/5 text-xs text-white/60">
                  <div className="space-y-1">
                    <p><span className="text-white/40 uppercase tracking-widest text-[10px]">Zone:</span> <span className="text-white/80">{order.deliveryZone}</span> • {order.deliveryAddress}</p>
                    {order.delivery && (
                      <p><span className="text-white/40 uppercase tracking-widest text-[10px]">Delivery State:</span> <span className="text-purple-400 uppercase font-mono text-[11px]">{order.delivery.status.replace(/_/g, ' ')}</span></p>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Support Button */}
                    <button
                      onClick={() => {
                        setSupportOrderId(order.id);
                        setSupportModalOpen(true);
                      }}
                      className="text-xs uppercase font-mono tracking-wider px-2.5 py-1.5 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1"
                    >
                      <LifeBuoy size={12} /> Support
                    </button>

                    {/* Request Refund Button (if eligible) */}
                    {order.paymentState === 'SUCCESS' && ['DELIVERED', 'CANCELLED'].includes(order.status) && (
                      <button
                        onClick={() => setRefundingOrder(order)}
                        className="text-xs uppercase font-mono tracking-wider px-2.5 py-1.5 border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors flex items-center gap-1"
                      >
                        <RotateCcw size={12} /> Request Refund
                      </button>
                    )}

                    {order.paymentState === 'REFUNDED' && (
                      <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-1 bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
                        Refund Settled
                      </span>
                    )}

                    {canCancel && (
                      <button
                        onClick={() => {
                          setCancellingOrder(order);
                          setCancelReason('');
                          setCancelError(null);
                          setShowCancelModal(true);
                        }}
                        className="text-xs uppercase tracking-widest px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Cancel Order
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenDetails(order.id)}
                      className="text-xs uppercase tracking-widest px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5"
                    >
                      <Eye size={14} /> Operations Log
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Customer Refund Modal (Module 19) */}
      {refundingOrder && (
        <CustomerRefundModal
          order={refundingOrder}
          onClose={() => setRefundingOrder(null)}
          onSuccess={() => {
            fetchOrders();
          }}
        />
      )}

      {/* Customer Support Modal (Module 19) */}
      {supportModalOpen && (
        <CustomerSupportModal
          initialOrderId={supportOrderId}
          onClose={() => {
            setSupportModalOpen(false);
            setSupportOrderId(undefined);
          }}
        />
      )}

      {/* Deep Order Details & Timeline Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/20 w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 md:p-8 relative">
            <button 
              onClick={() => setSelectedOrder(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="border-b border-white/10 pb-4 mb-6">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-serif text-white">Order #{selectedOrder.id} Operations</h3>
                {getOrderStatusBadge(selectedOrder.status)}
              </div>
              <p className="text-xs text-white/40">Placed on {new Date(selectedOrder.createdAt).toLocaleString()}</p>
            </div>

            {/* Status overview cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-black/40 border border-white/5 p-3">
                <span className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Order Status</span>
                <span className="text-xs font-mono text-white/90">{selectedOrder.status}</span>
              </div>
              <div className="bg-black/40 border border-white/5 p-3">
                <span className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Payment State</span>
                <span className={`text-xs font-mono ${selectedOrder.paymentState === 'SUCCESS' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {selectedOrder.paymentState}
                </span>
              </div>
              <div className="bg-black/40 border border-white/5 p-3">
                <span className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Delivery State</span>
                <span className="text-xs font-mono text-purple-400">
                  {selectedOrder.delivery?.status || 'UNASSIGNED'}
                </span>
              </div>
            </div>

            {/* Order Items */}
            <div className="mb-6">
              <h4 className="text-xs uppercase tracking-widest text-white/60 mb-3">Purchased Items</h4>
              <div className="space-y-2">
                {selectedOrder.items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center bg-black/20 p-2.5 border border-white/5 text-xs">
                    <div>
                      <span className="text-white/90 font-medium block">{item.product?.name}</span>
                      <span className="text-[10px] text-white/40 uppercase">{item.variant?.volume} • {item.variant?.packaging}</span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-[#c5a059] mr-3">{item.quantity}x</span>
                      <span className="text-white/70">KES {(Number(item.priceAtPurchase) * item.quantity).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-xs font-serif">
                <span className="text-white/60">Grand Total (incl. Delivery)</span>
                <span className="text-[#c5a059] text-sm">KES {Number(selectedOrder.totalAmount).toLocaleString()}</span>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-3 bg-black/40 border border-white/5 mb-6 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-mono text-white/50">Concierge Services</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const orderId = selectedOrder.id;
                    setSelectedOrder(null);
                    setSupportOrderId(orderId);
                    setSupportModalOpen(true);
                  }}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-mono uppercase border border-white/10 flex items-center gap-1"
                >
                  <LifeBuoy size={12} /> Contact Support
                </button>
                {selectedOrder.paymentState === 'SUCCESS' && ['DELIVERED', 'CANCELLED'].includes(selectedOrder.status) && (
                  <button
                    onClick={() => {
                      const order = selectedOrder;
                      setSelectedOrder(null);
                      setRefundingOrder(order);
                    }}
                    className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-mono uppercase border border-amber-500/30 flex items-center gap-1"
                  >
                    <RotateCcw size={12} /> Request Refund
                  </button>
                )}
              </div>
            </div>

            {/* Audit & Status Timeline */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-white/60 mb-3">Event Timeline</h4>
              {selectedOrder.auditLogs && selectedOrder.auditLogs.length > 0 ? (
                <div className="border-l border-white/10 ml-3 pl-4 space-y-4">
                  {selectedOrder.auditLogs.map((log: any, idx: number) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#c5a059]"></div>
                      <div className="text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-white/90 uppercase text-[10px] tracking-wider">{log.action.replace(/_/g, ' ')}</span>
                          {log.toState && (
                            <span className="text-white/40 text-[10px]">→ <span className="text-white/70">{log.toState}</span></span>
                          )}
                        </div>
                        <span className="text-[10px] text-white/40 block">{new Date(log.createdAt).toLocaleString()}</span>
                        {log.reason && (
                          <p className="text-xs text-white/60 italic mt-1 bg-black/40 p-2 border border-white/5">{log.reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40 italic">No events recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Cancel Modal */}
      {showCancelModal && cancellingOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/20 w-full max-w-md p-6">
            <h3 className="text-base font-serif text-white mb-2">Cancel Order #{cancellingOrder.id}</h3>
            <p className="text-xs text-white/50 mb-4">
              Cancelling this order will restore reserved product stocks. Please provide a reason for cancellation.
            </p>

            {cancelError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 mb-4">
                {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelSubmit}>
              <div className="mb-6">
                <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">
                  Cancellation Reason (Required)
                </label>
                <textarea
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g., Ordered wrong vintage, change of plans, etc."
                  rows={3}
                  className="w-full bg-black/50 border border-white/20 p-3 text-xs text-white focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSubmittingCancel}
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 text-xs uppercase tracking-widest text-white/60 hover:text-white"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel || !cancelReason.trim()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs uppercase tracking-widest font-medium"
                >
                  {isSubmittingCancel ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewingProduct && (
        <ProductModal
          product={reviewingProduct}
          onClose={() => {
            setReviewingProduct(null);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
};
