import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { Navigate } from 'react-router-dom';

type AdminTab = 'ORDERS' | 'CATALOGUE' | 'STAFF';

export const AdminDashboard = () => {
  const { user, dbUser, loading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('ORDERS');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [deliverers, setDeliverers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  const [fetching, setFetching] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    if (!user || (dbUser && dbUser.role !== 'ADMIN')) {
      setFetching(false);
      return;
    }

    user.getIdToken().then(token => {
      Promise.all([
        fetch('/api/admin/orders', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
        fetch('/api/admin/deliverers', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
        fetch('/api/admin/products', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
        fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json())
      ]).then(([ordersData, deliverersData, productsData, usersData]) => {
        if (ordersData.orders) setOrders(ordersData.orders);
        if (deliverersData.deliverers) setDeliverers(deliverersData.deliverers);
        if (productsData.products) setProducts(productsData.products);
        if (usersData.users) setUsers(usersData.users);
        setFetching(false);
      }).catch(() => setFetching(false));
    });
  }, [user, dbUser]);

  const updateRole = async (userId: number, role: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role })
      });
      setUsers(users.map(u => u.id === userId ? { ...u, role } : u));
      if (role === 'DELIVERER' && !deliverers.find(d => d.id === userId)) {
        setDeliverers([...deliverers, users.find(u => u.id === userId)!]);
      }
    } catch (e) {
      alert('Failed to update role');
    }
  };

  const updateStatus = async (orderId: number, status: string, delivererId?: number) => {
    if (!user) return;
    setUpdating(orderId);
    
    try {
      const token = await user.getIdToken();
      const body: any = { status };
      if (delivererId) body.delivererId = delivererId;

      await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      
      setOrders(orders.map(o => o.id === orderId ? { ...o, status, delivererId: delivererId || o.delivererId } : o));
    } catch (e) {
      alert('Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const updateStock = async (variantId: number, newStock: number) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/admin/variants/${variantId}/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ stock: newStock })
      });
      
      setProducts(products.map(p => ({
        ...p,
        variants: p.variants.map((v: any) => v.id === variantId ? { ...v, stock: newStock } : v)
      })));
    } catch (e) {
      alert('Failed to update stock');
    }
  };

  if (loading || fetching) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-t-2 border-[#c5a059] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || dbUser?.role !== 'ADMIN') {
    return <Navigate to="/" />;
  }

  return (
    <div className="flex-1 p-6 md:p-12 md:pt-24 h-full overflow-y-auto max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-4">
        <h2 className="text-sm uppercase tracking-[0.4em] text-[#c5a059]">Admin Dashboard</h2>
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('ORDERS')}
            className={`text-xs uppercase tracking-widest ${activeTab === 'ORDERS' ? 'text-white border-b border-[#c5a059]' : 'text-white/40 hover:text-white'} pb-1 transition-colors`}
          >
            Orders
          </button>
          <button 
            onClick={() => setActiveTab('CATALOGUE')}
            className={`text-xs uppercase tracking-widest ${activeTab === 'CATALOGUE' ? 'text-white border-b border-[#c5a059]' : 'text-white/40 hover:text-white'} pb-1 transition-colors`}
          >
            Catalogue
          </button>
          <button 
            onClick={() => setActiveTab('STAFF')}
            className={`text-xs uppercase tracking-widest ${activeTab === 'STAFF' ? 'text-white border-b border-[#c5a059]' : 'text-white/40 hover:text-white'} pb-1 transition-colors`}
          >
            Staff
          </button>
        </div>
      </div>
      
      {activeTab === 'ORDERS' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-[#111] border border-white/5 p-6">
              <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">Total Revenue</span>
              <span className="text-2xl font-serif text-[#c5a059]">
                KES {orders.filter(o => o.paymentState === 'SUCCESS').reduce((sum, o) => sum + Number(o.totalAmount), 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-[#111] border border-white/5 p-6">
              <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">Total Orders</span>
              <span className="text-2xl font-serif text-white">{orders.length}</span>
            </div>
            <div className="bg-[#111] border border-white/5 p-6">
              <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-2">Pending Fulfillment</span>
              <span className="text-2xl font-serif text-white">{orders.filter(o => ['PENDING', 'CONFIRMED'].includes(o.status)).length}</span>
            </div>
          </div>

          <div className="overflow-x-auto border border-white/5 bg-[#111]/30">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/40">
                  <th className="py-4 px-4 font-normal">Order Details</th>
                  <th className="py-4 px-4 font-normal">Amount</th>
                  <th className="py-4 px-4 font-normal">Payment</th>
                  <th className="py-4 px-4 font-normal">Status</th>
                  <th className="py-4 px-4 font-normal">Assign</th>
                  <th className="py-4 px-4 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {orders.map(order => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4 whitespace-normal min-w-[300px]">
                      <span className="block font-serif mb-1 text-base">#{order.id} <span className="text-white/40 text-xs ml-2">{new Date(order.createdAt).toLocaleDateString()}</span></span>
                      <div className="mb-2 mt-2 space-y-1">
                        {order.items?.map((item: any, idx: number) => (
                          <div key={idx} className="text-[11px] text-white/70 flex justify-between items-center bg-black/20 p-1.5 border border-white/5 rounded-sm">
                            <span><span className="text-[#c5a059]">{item.quantity}x</span> {item.product?.name}</span>
                            <span className="text-white/40">{item.variant?.volume}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] text-white/40 mt-2 flex flex-col gap-1">
                        <span className="text-[#c5a059] uppercase tracking-widest">{order.deliveryZone}</span>
                        <span className="truncate max-w-[280px]">{order.deliveryAddress}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[#c5a059] font-serif min-w-[120px]">KES {Number(order.totalAmount).toLocaleString()}</td>
                    <td className="py-4 px-4 min-w-[120px]">
                      <span className={order.paymentState === 'SUCCESS' ? 'text-green-500' : 'text-yellow-500'}>{order.paymentState}</span>
                    </td>
                    <td className="py-4 px-4 min-w-[150px]">
                      <span className="text-white/80 bg-white/10 px-2 py-1 text-[10px] tracking-wider uppercase rounded-sm border border-white/5">{order.status}</span>
                    </td>
                    <td className="py-4 px-4 min-w-[150px]">
                      <select 
                        disabled={updating === order.id}
                        className="bg-[#111] border border-white/20 text-white text-[10px] uppercase tracking-widest p-2 cursor-pointer outline-none w-full hover:border-[#c5a059] transition-colors focus:border-[#c5a059]"
                        value={order.delivererId || ''}
                        onChange={(e) => updateStatus(order.id, 'ASSIGNED', parseInt(e.target.value))}
                      >
                        <option value="">Unassigned</option>
                        {deliverers.map(d => (
                          <option key={d.id} value={d.id}>{d.email}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-4 px-4 text-right min-w-[180px]">
                      <select 
                        disabled={updating === order.id}
                        className="bg-[#111] border border-white/20 text-white text-[10px] uppercase tracking-widest p-2 cursor-pointer outline-none hover:border-[#c5a059] transition-colors focus:border-[#c5a059]"
                        value={order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="PICKUP_READY">Pickup Ready</option>
                        <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {orders.length === 0 && (
              <div className="py-12 text-center text-white/40 text-sm font-serif">
                No orders found in the system.
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'CATALOGUE' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white/5 border border-white/10 p-6">
            <div>
              <h3 className="text-lg font-serif mb-1">Product Catalogue</h3>
              <p className="text-xs text-white/50">Manage inventory, variants, and product listings.</p>
            </div>
            <button className="px-4 py-2 bg-[#c5a059] text-black text-[10px] uppercase tracking-widest font-bold hover:bg-[#d4b271] transition-colors">
              + New Product
            </button>
          </div>

          {products.map(product => (
            <div key={product.id} className="bg-white/5 border border-white/10 p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-serif mb-2">{product.name}</h3>
                  <p className="text-xs text-white/50 uppercase tracking-widest">{product.category} • {product.abv}</p>
                </div>
                <button className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors border border-white/10 px-3 py-1">
                  + Add Variant
                </button>
              </div>
              
              <div className="space-y-4">
                {product.variants?.map((variant: any) => (
                  <div key={variant.id} className="flex items-center justify-between bg-[#111] border border-white/5 p-4">
                    <div>
                      <span className="block text-sm text-white mb-1">{variant.volume}</span>
                      <span className="block text-[10px] text-white/40 uppercase tracking-widest">{variant.packaging}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-sm text-[#c5a059] mb-1">KES {Number(variant.price).toLocaleString()}</span>
                      <div className="flex items-center justify-end gap-2 text-[10px] uppercase tracking-widest text-white/50">
                        Stock: 
                        <input 
                          type="number" 
                          value={variant.stock}
                          onChange={(e) => updateStock(variant.id, parseInt(e.target.value) || 0)}
                          className="w-16 bg-transparent border-b border-[#c5a059]/50 focus:border-[#c5a059] text-white outline-none text-right px-1 py-0.5 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {(!product.variants || product.variants.length === 0) && (
                  <div className="text-xs text-white/40 italic py-4 text-center border border-white/5 border-dashed">
                    No variants configured for this product.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'STAFF' && (
        <div className="overflow-x-auto border border-white/5 bg-[#111]/30">
          <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/40">
                <th className="py-4 px-4 font-normal">User Details</th>
                <th className="py-4 px-4 font-normal">Joined</th>
                <th className="py-4 px-4 font-normal text-right">Role</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {users.map(u => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-4">
                    <span className="block text-white mb-1">{u.email}</span>
                  </td>
                  <td className="py-4 px-4 text-white/50 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <select 
                      className={`bg-[#111] border text-[10px] uppercase tracking-widest p-2 cursor-pointer outline-none ${
                        u.role === 'ADMIN' ? 'border-[#c5a059] text-[#c5a059]' : 
                        u.role === 'DELIVERER' ? 'border-blue-500/50 text-blue-400' : 
                        'border-white/20 text-white'
                      }`}
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                    >
                      <option value="CUSTOMER">Customer</option>
                      <option value="DELIVERER">Deliverer</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="py-12 text-center text-white/40 text-sm font-serif">
              No users found.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
