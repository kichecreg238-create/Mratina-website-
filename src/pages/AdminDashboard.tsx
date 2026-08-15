import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { Navigate } from 'react-router-dom';

type AdminTab = 'ORDERS' | 'CATALOGUE' | 'STAFF' | 'DELIVERY_ZONES';

export const AdminDashboard = () => {
  const { user, dbUser, loading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('ORDERS');
  
  const [orders, setOrders] = useState<any[]>([]);
  const [deliverers, setDeliverers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
  
  const [fetching, setFetching] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  const [showProductModal, setShowProductModal] = useState(false);
  const [showVariantModalFor, setShowVariantModalFor] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', category: 'WINE', brand: '', origin: '', abv: '', description: '', imageBase64: '', isCustomisable: false });
  const [newVariant, setNewVariant] = useState({ volume: '750ml', price: '', stock: 0, packaging: 'Bottle' });

  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZone, setEditingZone] = useState<any | null>(null);
  const [newZone, setNewZone] = useState({ name: '', fee: '', isActive: true, isAcceptingOrders: true });

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
        fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
        fetch('/api/admin/delivery-zones', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json())
      ]).then(([ordersData, deliverersData, productsData, usersData, zonesData]) => {
        if (ordersData.orders) setOrders(ordersData.orders);
        if (deliverersData.deliverers) setDeliverers(deliverersData.deliverers);
        if (productsData.products) setProducts(productsData.products);
        if (usersData.users) setUsers(usersData.users);
        if (zonesData.zones) setDeliveryZones(zonesData.zones);
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
      
      setOrders(orders.map(o => o.id === orderId ? { 
        ...o, 
        status, 
        delivererId: delivererId || o.delivererId,
        delivery: { ...(o.delivery || {}), status }
      } : o));
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

  const createProduct = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newProduct)
      });
      const data = await res.json();
      if (data.success) {
        setProducts([{ ...data.product, variants: [] }, ...products]);
        setShowProductModal(false);
        setNewProduct({ name: '', category: 'WINE', brand: '', origin: '', abv: '', description: '', imageBase64: '', isCustomisable: false });
      }
    } catch (e) {
      alert('Failed to create product');
    }
  };

  const createVariant = async () => {
    if (!user || !showVariantModalFor) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/products/${showVariantModalFor}/variants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newVariant)
      });
      const data = await res.json();
      if (data.success) {
        setProducts(products.map(p => p.id === showVariantModalFor ? { ...p, variants: [...p.variants, data.variant] } : p));
        setShowVariantModalFor(null);
        setNewVariant({ volume: '750ml', price: '', stock: 0, packaging: 'Bottle' });
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Failed to create variant');
    }
  };

  const saveZone = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const url = editingZone ? `/api/admin/delivery-zones/${editingZone.id}` : '/api/admin/delivery-zones';
      const method = editingZone ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newZone)
      });
      const data = await res.json();
      
      if (data.success) {
        if (editingZone) {
          setDeliveryZones(deliveryZones.map(z => z.id === editingZone.id ? data.zone : z));
        } else {
          setDeliveryZones([...deliveryZones, data.zone]);
        }
        setShowZoneModal(false);
        setEditingZone(null);
        setNewZone({ name: '', fee: '', isActive: true, isAcceptingOrders: true });
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Failed to save delivery zone');
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
          <button 
            onClick={() => setActiveTab('DELIVERY_ZONES')}
            className={`text-xs uppercase tracking-widest ${activeTab === 'DELIVERY_ZONES' ? 'text-white border-b border-[#c5a059]' : 'text-white/40 hover:text-white'} pb-1 transition-colors`}
          >
            Delivery Zones
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
                      <div className="flex flex-col gap-1">
                        <span className="text-white/80 bg-white/10 px-2 py-1 text-[10px] tracking-wider uppercase rounded-sm border border-white/5 inline-block w-fit">O: {order.status}</span>
                        <span className="text-[#c5a059] bg-[#c5a059]/10 px-2 py-1 text-[10px] tracking-wider uppercase rounded-sm border border-[#c5a059]/20 inline-block w-fit">D: {order.delivery?.status || 'UNASSIGNED'}</span>
                      </div>
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
                        value={order.delivery?.status || order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                      >
                        <option value="UNASSIGNED">Unassigned</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="ACCEPTED">Accepted</option>
                        <option value="PICKUP_READY">Pickup Ready</option>
                        <option value="PICKED_UP">Picked Up</option>
                        <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="FAILED">Failed</option>
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
            <button 
              onClick={() => setShowProductModal(true)}
              className="px-4 py-2 bg-[#c5a059] text-black text-[10px] uppercase tracking-widest font-bold hover:bg-[#d4b271] transition-colors"
            >
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
                <button 
                  onClick={() => setShowVariantModalFor(product.id)}
                  className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors border border-white/10 px-3 py-1"
                >
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

      {showProductModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 p-8 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-serif">New Product</h3>
              <button onClick={() => setShowProductModal(false)} className="text-white/50 hover:text-white">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Name</label>
                <input type="text" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Category</label>
                  <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none">
                    <option value="WINE">Wine</option>
                    <option value="BEER">Beer</option>
                    <option value="SPIRITS">Spirits</option>
                    <option value="MIXER">Mixer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Brand</label>
                  <input type="text" value={newProduct.brand} onChange={e => setNewProduct({...newProduct, brand: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Origin</label>
                  <input type="text" value={newProduct.origin} onChange={e => setNewProduct({...newProduct, origin: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">ABV (%)</label>
                  <input type="text" value={newProduct.abv} onChange={e => setNewProduct({...newProduct, abv: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Description</label>
                <textarea rows={3} value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none"></textarea>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="customisable" checked={newProduct.isCustomisable} onChange={e => setNewProduct({...newProduct, isCustomisable: e.target.checked})} className="accent-[#c5a059]" />
                <label htmlFor="customisable" className="text-sm text-white/80">Allow customization / engraving</label>
              </div>

              <button onClick={createProduct} className="w-full py-3 mt-4 bg-[#c5a059] text-black text-[10px] uppercase tracking-widest font-bold hover:bg-[#d4b271] transition-colors">
                Create Product
              </button>
            </div>
          </div>
        </div>
      )}

      {showVariantModalFor !== null && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 p-8 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-serif">Add Variant</h3>
              <button onClick={() => setShowVariantModalFor(null)} className="text-white/50 hover:text-white">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Volume (e.g. 750ml, 1L)</label>
                <input type="text" value={newVariant.volume} onChange={e => setNewVariant({...newVariant, volume: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
              </div>
              
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Price (KES)</label>
                <input type="number" value={newVariant.price} onChange={e => setNewVariant({...newVariant, price: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Initial Stock</label>
                <input type="number" value={newVariant.stock} onChange={e => setNewVariant({...newVariant, stock: parseInt(e.target.value) || 0})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Packaging (e.g. Bottle, Can, Keg)</label>
                <input type="text" value={newVariant.packaging} onChange={e => setNewVariant({...newVariant, packaging: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
              </div>

              <button onClick={createVariant} className="w-full py-3 mt-4 bg-[#c5a059] text-black text-[10px] uppercase tracking-widest font-bold hover:bg-[#d4b271] transition-colors">
                Add Variant
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'DELIVERY_ZONES' && (
        <div className="bg-[#111] border border-white/5">
          <div className="flex justify-between items-center p-6 border-b border-white/5">
            <h3 className="text-xl font-serif">Delivery Zones</h3>
            <button 
              onClick={() => {
                setEditingZone(null);
                setNewZone({ name: '', fee: '', isActive: true, isAcceptingOrders: true });
                setShowZoneModal(true);
              }}
              className="text-[10px] uppercase tracking-widest bg-[#c5a059] text-black px-4 py-2 font-bold hover:bg-[#d4b271] transition-colors"
            >
              + New Zone
            </button>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
                <th className="py-4 px-6 font-normal">Zone Name</th>
                <th className="py-4 px-6 font-normal">Delivery Fee</th>
                <th className="py-4 px-6 font-normal">Status</th>
                <th className="py-4 px-6 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {deliveryZones.map(zone => (
                <tr key={zone.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-6 font-serif">{zone.name}</td>
                  <td className="py-4 px-6 text-[#c5a059]">KES {Number(zone.fee)}</td>
                  <td className="py-4 px-6">
                    <div className="flex flex-col gap-1 text-[10px] uppercase tracking-widest">
                      <span className={zone.isActive ? 'text-green-500' : 'text-red-500'}>
                        {zone.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className={zone.isAcceptingOrders ? 'text-blue-400' : 'text-orange-500'}>
                        {zone.isAcceptingOrders ? 'Accepting Orders' : 'At Capacity'}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button 
                      onClick={() => {
                        setEditingZone(zone);
                        setNewZone({
                          name: zone.name,
                          fee: Number(zone.fee).toString(),
                          isActive: zone.isActive,
                          isAcceptingOrders: zone.isAcceptingOrders
                        });
                        setShowZoneModal(true);
                      }}
                      className="text-[10px] uppercase tracking-widest text-[#c5a059] hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deliveryZones.length === 0 && (
            <div className="py-12 text-center flex flex-col items-center">
              <span className="text-white/40 text-sm font-serif mb-4">No delivery zones configured.</span>
              <button 
                onClick={() => {
                  setEditingZone(null);
                  setNewZone({ name: 'Kakamega Town & Environs', fee: '150', isActive: true, isAcceptingOrders: true });
                  setShowZoneModal(true);
                }}
                className="border border-[#c5a059] text-[#c5a059] hover:bg-[#c5a059]/10 px-4 py-2 text-[10px] uppercase tracking-widest transition-colors"
              >
                Setup Initial Kakamega Service Area
              </button>
            </div>
          )}
        </div>
      )}

      {showZoneModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 p-8 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-serif">{editingZone ? 'Edit Zone' : 'New Zone'}</h3>
              <button onClick={() => setShowZoneModal(false)} className="text-white/50 hover:text-white">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Zone Name</label>
                <input type="text" value={newZone.name} onChange={e => setNewZone({...newZone, name: e.target.value})} placeholder="e.g. Nairobi CBD" className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
              </div>
              
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Delivery Fee (KES)</label>
                <input type="number" value={newZone.fee} onChange={e => setNewZone({...newZone, fee: e.target.value})} className="w-full bg-white/5 border border-white/10 p-3 text-sm text-white focus:border-[#c5a059] outline-none" />
              </div>

              <div className="flex items-center gap-2 mt-4">
                <input type="checkbox" id="isActive" checked={newZone.isActive} onChange={e => setNewZone({...newZone, isActive: e.target.checked})} className="accent-[#c5a059]" />
                <label htmlFor="isActive" className="text-sm text-white/80">Active (Visible to customers)</label>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="isAccepting" checked={newZone.isAcceptingOrders} onChange={e => setNewZone({...newZone, isAcceptingOrders: e.target.checked})} className="accent-[#c5a059]" />
                <label htmlFor="isAccepting" className="text-sm text-white/80">Accepting Orders (Capacity available)</label>
              </div>

              <button onClick={saveZone} className="w-full py-3 mt-4 bg-[#c5a059] text-black text-[10px] uppercase tracking-widest font-bold hover:bg-[#d4b271] transition-colors">
                {editingZone ? 'Save Changes' : 'Create Zone'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
