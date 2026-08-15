import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { Navigate } from 'react-router-dom';
import { Package, Clock, CheckCircle, Truck, XCircle } from 'lucide-react';

export const OrderHistory = () => {
  const { user, dbUser, loading } = useAuthStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
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
  }, [user]);

  if (loading || fetching) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-t-2 border-[#c5a059] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" />;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return <Clock className="text-yellow-500" size={16} />;
      case 'DELIVERED': return <CheckCircle className="text-green-500" size={16} />;
      case 'OUT_FOR_DELIVERY': return <Truck className="text-blue-500" size={16} />;
      case 'FAILED':
      case 'CANCELLED': return <XCircle className="text-red-500" size={16} />;
      default: return <Package className="text-white/50" size={16} />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-12 md:pt-24 max-w-4xl w-full mx-auto h-full">
      <h2 className="text-sm uppercase tracking-[0.4em] text-[#c5a059] mb-8 border-b border-white/5 pb-4">Vault Access / Order History</h2>
      
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center opacity-50">
          <Package size={48} className="mb-4 text-[#c5a059]" />
          <p className="text-sm font-serif">No orders found in your history.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map(order => {
            const displayStatus = order.delivery?.status || order.status;
            return (
              <div key={order.id} className="bg-white/5 border border-white/10 p-6">
                <div className="flex justify-between items-start mb-6 border-b border-white/5 pb-4">
                  <div>
                    <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-1">Order #{order.id}</span>
                    <span className="text-sm font-serif">{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-[#c5a059] block mb-1">KES {Number(order.totalAmount).toLocaleString()}</span>
                    <span className="text-[10px] flex items-center justify-end gap-1 uppercase tracking-widest text-white/70">
                      {getStatusIcon(displayStatus)} {displayStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="mb-6 space-y-3">
                    {order.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <div className="flex flex-col">
                          <span className="text-white/90">{item.product?.name}</span>
                          <span className="text-[10px] text-white/40 uppercase tracking-widest">{item.variant?.volume} • {item.variant?.packaging}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-white/60 text-xs">{item.quantity}x</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="text-xs text-white/60 leading-relaxed border-t border-white/5 pt-4">
                  <p className="mb-2"><span className="text-white/40 uppercase tracking-widest">Delivery:</span> {order.deliveryZone} - {order.deliveryAddress}</p>
                  <p><span className="text-white/40 uppercase tracking-widest">Payment State:</span> <span className={order.paymentState === 'SUCCESS' ? 'text-green-500' : 'text-yellow-500'}>{order.paymentState}</span></p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
