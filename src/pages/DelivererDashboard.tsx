import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { Navigate } from 'react-router-dom';
import { MapPin, Navigation } from 'lucide-react';

export const DelivererDashboard = () => {
  const { user, dbUser, loading } = useAuthStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user || (dbUser && dbUser.role !== 'DELIVERER')) {
      setFetching(false);
      return;
    }

    user.getIdToken().then(token => {
      fetch('/api/deliverer/assignments', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.orders) setOrders(data.orders);
        setFetching(false);
      })
      .catch(() => setFetching(false));
    });
  }, [user, dbUser]);

  const updateStatus = async (orderId: number, status: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update status');
        return;
      }
      
      setOrders(orders.map(o => o.id === orderId ? { 
        ...o, 
        delivery: o.delivery ? { ...o.delivery, status } : { status }
      } : o));
    } catch (e) {
      alert('Failed to update status');
    }
  };

  if (loading || fetching) return null;
  if (!user || dbUser?.role !== 'DELIVERER') return <Navigate to="/" />;

  return (
    <div className="flex-1 flex flex-col p-6 md:p-12 md:pt-24 h-full overflow-y-auto">
      <h2 className="text-sm uppercase tracking-[0.4em] text-[#c5a059] mb-8 border-b border-white/5 pb-4">Dispatch / Active Assignments</h2>
      
      {orders.length === 0 ? (
        <div className="py-24 text-center text-white/40 text-sm font-serif">
          No active assignments.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map(order => {
            const deliveryStatus = order.delivery?.status || 'UNKNOWN';
            return (
              <div key={order.id} className="bg-white/5 border border-white/10 p-6 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Order #{order.id}</span>
                  <span className="text-[10px] uppercase tracking-widest text-[#c5a059] bg-[#c5a059]/10 px-2 py-1">{deliveryStatus}</span>
                </div>
                
                <div className="flex-1 mb-6">
                  <div className="mb-4 bg-[#111] border border-white/5 p-3 space-y-2">
                    <h4 className="text-[9px] uppercase tracking-widest text-white/40 mb-2">Package Contents</h4>
                    {order.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-white/80">{item.quantity}x {item.product?.name}</span>
                        <span className="text-white/50">{item.variant?.volume}</span>
                      </div>
                    ))}
                  </div>

                  <p className="flex items-start gap-2 text-sm text-white/80 leading-relaxed mb-4">
                    <MapPin size={16} className="text-[#c5a059] shrink-0 mt-1" />
                    <span>
                      <span className="block text-[10px] text-[#c5a059] uppercase tracking-widest mb-1">{order.deliveryZone}</span>
                      {order.deliveryAddress}
                      {order.landmark && <span className="block mt-1 text-white/50 text-xs">Landmark: {order.landmark}</span>}
                    </span>
                  </p>
                  {order.deliveryInstructions && (
                    <p className="text-xs text-white/50 italic p-3 bg-black/50 border border-white/5">"{order.deliveryInstructions}"</p>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {deliveryStatus === 'ASSIGNED' && (
                    <button onClick={() => updateStatus(order.id, 'ACCEPTED')} className="flex-1 py-3 border border-[#c5a059] text-[#c5a059] font-bold text-[9px] uppercase tracking-widest hover:bg-[#c5a059]/10">
                      Accept Order
                    </button>
                  )}
                  {deliveryStatus === 'ACCEPTED' && (
                    <button onClick={() => updateStatus(order.id, 'PICKUP_READY')} className="flex-1 py-3 border border-white/20 text-[9px] uppercase tracking-widest hover:bg-white/5">
                      Arrived at Depot
                    </button>
                  )}
                  {deliveryStatus === 'PICKUP_READY' && (
                    <button onClick={() => updateStatus(order.id, 'PICKED_UP')} className="flex-1 py-3 bg-[#c5a059] text-black font-bold text-[9px] uppercase tracking-widest hover:bg-[#d4b271]">
                      Package Picked Up
                    </button>
                  )}
                  {deliveryStatus === 'PICKED_UP' && (
                    <button onClick={() => updateStatus(order.id, 'OUT_FOR_DELIVERY')} className="flex-1 py-3 bg-blue-600 text-white font-bold text-[9px] uppercase tracking-widest hover:bg-blue-500">
                      Start Navigation
                    </button>
                  )}
                  {deliveryStatus === 'OUT_FOR_DELIVERY' && (
                    <button onClick={() => updateStatus(order.id, 'DELIVERED')} className="flex-1 py-3 bg-green-600 text-white font-bold text-[9px] uppercase tracking-widest hover:bg-green-500">
                      Mark Delivered
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
