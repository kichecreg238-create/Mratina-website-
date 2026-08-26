import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { Navigate } from 'react-router-dom';
import { Package, Search, Filter, Eye, AlertTriangle, CheckCircle, Clock, XCircle, Truck, X, RefreshCw } from 'lucide-react';

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

  // Orders Filter State
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Deep Order Operations Modal
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [statusTransition, setStatusTransition] = useState<string>('');
  const [transitionReason, setTransitionReason] = useState<string>('');
  
  // Exception logging form
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionType, setExceptionType] = useState('STOCK_DISCREPANCY');
  const [exceptionDetails, setExceptionDetails] = useState('');
  const [exceptionAction, setExceptionAction] = useState('');
  const [submittingException, setSubmittingException] = useState(false);

  const [showProductModal, setShowProductModal] = useState(false);
  const [showVariantModalFor, setShowVariantModalFor] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', category: 'WINE', brand: '', origin: '', abv: '', description: '', imageBase64: '', isCustomisable: false });
  const [newVariant, setNewVariant] = useState({ volume: '750ml', price: '', stock: 0, packaging: 'Bottle' });

  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZone, setEditingZone] = useState<any | null>(null);
  const [newZone, setNewZone] = useState({ name: '', fee: '', isActive: true, isAcceptingOrders: true });

  const loadData = () => {
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
  };

  useEffect(() => {
    loadData();
  }, [user, dbUser]);

  const openOrderOperations = async (orderId: number) => {
    if (!user) return;
    setLoadingDetails(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.order) {
        setSelectedOrderDetails(data.order);
        setStatusTransition(data.order.status);
        setTransitionReason('');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to load order operational details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleStatusTransition = async (orderId: number) => {
    if (!user || !statusTransition) return;
    
    if (['FAILED', 'CANCELLED'].includes(statusTransition) && !transitionReason.trim()) {
      alert('A reason is mandatory when transitioning to Cancelled or Failed');
      return;
    }

    setUpdating(orderId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/order-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: statusTransition,
          reason: transitionReason.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update status');
      }

      loadData();
      await openOrderOperations(orderId);
    } catch (err: any) {
      alert(err.message || 'Status transition failed');
    } finally {
      setUpdating(null);
    }
  };

  const handleLogException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedOrderDetails || !exceptionDetails.trim()) return;

    setSubmittingException(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${selectedOrderDetails.id}/exception`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          exceptionType,
          details: exceptionDetails.trim(),
          actionTaken: exceptionAction.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log exception');

      setShowExceptionForm(false);
      setExceptionDetails('');
      setExceptionAction('');
      await openOrderOperations(selectedOrderDetails.id);
    } catch (err: any) {
      alert(err.message || 'Failed to record exception');
    } finally {
      setSubmittingException(false);
    }
  };

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

  const updateDeliveryStatus = async (orderId: number, status: string, delivererId?: number) => {
    if (!user) return;
    setUpdating(orderId);
    
    let failureReason = undefined;
    if (status === 'FAILED' || status === 'CANCELLED') {
      const reason = prompt("Please provide a reason for failure/cancellation:");
      if (!reason) {
        setUpdating(null);
        return;
      }
      failureReason = reason;
    }

    try {
      const token = await user.getIdToken();
      const body: any = { status, failureReason };
      if (delivererId !== undefined) body.delivererId = delivererId;

      await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      
      loadData();
      if (selectedOrderDetails?.id === orderId) {
        await openOrderOperations(orderId);
      }
    } catch (e) {
      alert('Failed to update delivery status');
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
    if (!user || showVariantModalFor === null) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/variants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          productId: showVariantModalFor,
          ...newVariant,
          stock: Number(newVariant.stock),
          price: Number(newVariant.price)
        })
      });
      const data = await res.json();
      if (data.success) {
        setProducts(products.map(p => {
          if (p.id === showVariantModalFor) {
            return { ...p, variants: [...(p.variants || []), data.variant] };
          }
          return p;
        }));
        setShowVariantModalFor(null);
        setNewVariant({ volume: '750ml', price: '', stock: 0, packaging: 'Bottle' });
      }
    } catch (e) {
      alert('Failed to create variant');
    }
  };

  const saveZone = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const url = editingZone 
        ? `/api/admin/delivery-zones/${editingZone.id}`
        : '/api/admin/delivery-zones';
      const method = editingZone ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...newZone,
          fee: Number(newZone.fee)
        })
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

  // Filtered orders calculation
  const filteredOrders = orders.filter(order => {
    if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
    if (paymentFilter !== 'ALL' && order.paymentState !== paymentFilter) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const matchesId = order.id.toString().includes(query);
      const matchesEmail = order.customerEmail?.toLowerCase().includes(query);
      const matchesZone = order.deliveryZone?.toLowerCase().includes(query);
      const matchesAddress = order.deliveryAddress?.toLowerCase().includes(query);
      if (!matchesId && !matchesEmail && !matchesZone && !matchesAddress) return false;
    }
    return true;
  });

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
        <div>
          <h2 className="text-sm uppercase tracking-[0.4em] text-[#c5a059] mb-1">Mratina Operations</h2>
          <p className="text-xs text-white/40">Administration & Order Lifecycle Management</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('ORDERS')}
            className={`text-xs uppercase tracking-widest ${activeTab === 'ORDERS' ? 'text-white border-b border-[#c5a059]' : 'text-white/40 hover:text-white'} pb-1 transition-colors`}
          >
            Order Operations
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
            Staff & RBAC
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#111] border border-white/5 p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Total Revenue</span>
              <span className="text-xl font-serif text-[#c5a059]">
                KES {orders.filter(o => o.paymentState === 'SUCCESS').reduce((sum, o) => sum + Number(o.totalAmount), 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-[#111] border border-white/5 p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Total Orders</span>
              <span className="text-xl font-serif text-white">{orders.length}</span>
            </div>
            <div className="bg-[#111] border border-white/5 p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Pending Processing</span>
              <span className="text-xl font-serif text-white">{orders.filter(o => ['PENDING', 'CONFIRMED', 'PROCESSING'].includes(o.status)).length}</span>
            </div>
            <div className="bg-[#111] border border-white/5 p-4">
              <span className="text-[9px] uppercase tracking-widest text-white/40 block mb-1">Active Deliveries</span>
              <span className="text-xl font-serif text-purple-400">{orders.filter(o => ['PICKUP_READY', 'OUT_FOR_DELIVERY'].includes(o.status)).length}</span>
            </div>
          </div>

          {/* Operational Filters Toolbar */}
          <div className="bg-[#111] border border-white/10 p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white">
                <Search size={14} className="text-white/40" />
                <input 
                  type="text" 
                  placeholder="Search by ID, email, zone..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent outline-none text-xs text-white placeholder-white/30 w-44 md:w-56"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-white/40">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-black/40 border border-white/10 text-white text-xs px-2 py-1.5 outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="PICKUP_READY">PICKUP_READY</option>
                  <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="CANCELLED">CANCELLED</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-white/40">Payment:</span>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="bg-black/40 border border-white/10 text-white text-xs px-2 py-1.5 outline-none"
                >
                  <option value="ALL">All Payments</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="PENDING">PENDING</option>
                  <option value="INITIATED">INITIATED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="REFUNDED">REFUNDED</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-white/40 font-mono">
              Showing {filteredOrders.length} of {orders.length} orders
            </div>
          </div>

          <div className="overflow-x-auto border border-white/5 bg-[#111]/30">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[850px]">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/40">
                  <th className="py-4 px-4 font-normal">Order & Customer</th>
                  <th className="py-4 px-4 font-normal">Amount</th>
                  <th className="py-4 px-4 font-normal">Payment State</th>
                  <th className="py-4 px-4 font-normal">Order Status</th>
                  <th className="py-4 px-4 font-normal">Deliverer</th>
                  <th className="py-4 px-4 font-normal text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4 whitespace-normal min-w-[260px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-serif text-white font-medium">#{order.id}</span>
                        <span className="text-white/40 text-xs">{new Date(order.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-xs text-white/80">{order.customerEmail || 'Guest Customer'}</div>
                      <div className="text-[10px] text-white/40 mt-1 truncate max-w-[240px]">
                        <span className="text-[#c5a059] uppercase">{order.deliveryZone}</span> • {order.deliveryAddress}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-[#c5a059] font-serif font-medium min-w-[110px]">
                      KES {Number(order.totalAmount).toLocaleString()}
                    </td>

                    <td className="py-4 px-4 min-w-[110px]">
                      <span className={`text-xs font-mono px-2 py-0.5 border ${
                        order.paymentState === 'SUCCESS' ? 'text-green-400 border-green-500/20 bg-green-500/10' :
                        order.paymentState === 'REFUNDED' ? 'text-blue-400 border-blue-500/20 bg-blue-500/10' :
                        'text-yellow-400 border-yellow-500/20 bg-yellow-500/10'
                      }`}>
                        {order.paymentState}
                      </span>
                    </td>

                    <td className="py-4 px-4 min-w-[140px]">
                      <div className="flex flex-col gap-1">
                        <span className="text-white/90 font-mono text-[11px] uppercase">{order.status}</span>
                        <span className="text-purple-400 text-[10px] uppercase font-mono tracking-wider">
                          D: {order.delivery?.status || 'UNASSIGNED'}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-4 min-w-[160px]">
                      <select 
                        disabled={updating === order.id}
                        className="bg-[#111] border border-white/20 text-white text-[10px] uppercase tracking-widest p-2 cursor-pointer outline-none w-full hover:border-[#c5a059] transition-colors focus:border-[#c5a059]"
                        value={order.delivererId || ''}
                        onChange={(e) => updateDeliveryStatus(order.id, 'ASSIGNED', parseInt(e.target.value))}
                      >
                        <option value="">Unassigned</option>
                        {deliverers.map(d => (
                          <option key={d.id} value={d.id}>{d.email} {d.isAvailable ? '(Available)' : '(Unavailable)'}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-4 px-4 text-right min-w-[120px]">
                      <button
                        onClick={() => openOrderOperations(order.id)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs uppercase tracking-widest inline-flex items-center gap-1.5 transition-colors border border-white/5"
                      >
                        <Eye size={13} /> Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredOrders.length === 0 && (
              <div className="py-12 text-center text-white/40 text-sm font-serif">
                No matching orders found.
              </div>
            )}
          </div>
        </>
      )}

      {/* DEEP ORDER OPERATIONS & AUDIT TRAIL MODAL */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/20 w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 md:p-8 relative">
            <button 
              onClick={() => setSelectedOrderDetails(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white"
            >
              <X size={20} />
            </button>

            {/* Header */}
            <div className="border-b border-white/10 pb-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-xl font-serif text-white">Order #{selectedOrderDetails.id} Operations</h3>
                    <span className="bg-white/10 text-white border border-white/20 px-2 py-0.5 text-xs uppercase font-mono">
                      {selectedOrderDetails.status}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">
                    Placed on {new Date(selectedOrderDetails.createdAt).toLocaleString()} by {selectedOrderDetails.customer?.email || 'Customer'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-serif text-[#c5a059] block">
                    KES {Number(selectedOrderDetails.totalAmount).toLocaleString()}
                  </span>
                  <span className="text-xs text-white/40 font-mono">
                    Delivery Fee: KES {Number(selectedOrderDetails.deliveryFee || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Separate State Machine Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-black/40 border border-white/10 p-4">
                <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Authoritative Order State</span>
                <span className="text-sm font-mono text-white block mb-2">{selectedOrderDetails.status}</span>
                <div className="text-[11px] text-white/60">
                  Controls lifecycle status & customer visibility.
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 p-4">
                <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Payment State</span>
                <span className={`text-sm font-mono block mb-2 ${
                  selectedOrderDetails.paymentState === 'SUCCESS' ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  {selectedOrderDetails.paymentState}
                </span>
                <div className="text-[11px] text-white/60">
                  {selectedOrderDetails.payments?.length || 0} transaction attempt(s) logged.
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 p-4">
                <span className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Delivery State</span>
                <span className="text-sm font-mono text-purple-400 block mb-2">
                  {selectedOrderDetails.delivery?.status || 'UNASSIGNED'}
                </span>
                <div className="text-[11px] text-white/60">
                  Deliverer: {selectedOrderDetails.deliverer?.email || 'Unassigned'}
                </div>
              </div>
            </div>

            {/* Transition Controls & Incident Logging */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Order State Transition Control */}
              <div className="bg-black/30 border border-white/10 p-4">
                <h4 className="text-xs uppercase tracking-widest text-[#c5a059] mb-3">Order Status Transition</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Select Target Status</label>
                    <select
                      value={statusTransition}
                      onChange={(e) => setStatusTransition(e.target.value)}
                      className="w-full bg-[#111] border border-white/20 p-2 text-xs text-white outline-none focus:border-[#c5a059]"
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="CONFIRMED">CONFIRMED</option>
                      <option value="PROCESSING">PROCESSING</option>
                      <option value="PICKUP_READY">PICKUP_READY</option>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                      <option value="DELIVERED">DELIVERED</option>
                      <option value="CANCELLED">CANCELLED (Restores Stock)</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">
                      Reason / Note {['CANCELLED', 'FAILED'].includes(statusTransition) && <span className="text-red-400">*</span>}
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. Prepared and packaged, customer request, etc."
                      value={transitionReason}
                      onChange={(e) => setTransitionReason(e.target.value)}
                      className="w-full bg-[#111] border border-white/20 p-2 text-xs text-white outline-none focus:border-[#c5a059]"
                    />
                  </div>

                  <button
                    disabled={updating === selectedOrderDetails.id || statusTransition === selectedOrderDetails.status}
                    onClick={() => handleStatusTransition(selectedOrderDetails.id)}
                    className="w-full py-2 bg-[#c5a059] disabled:opacity-40 text-black text-[10px] uppercase tracking-widest font-bold hover:bg-[#d4b271] transition-colors"
                  >
                    {updating === selectedOrderDetails.id ? 'Updating...' : 'Execute Status Transition'}
                  </button>
                </div>
              </div>

              {/* Operational Exception Logging */}
              <div className="bg-black/30 border border-white/10 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs uppercase tracking-widest text-red-400">Operational Exceptions & Incidents</h4>
                  <button
                    onClick={() => setShowExceptionForm(!showExceptionForm)}
                    className="text-[10px] uppercase tracking-widest text-white/60 hover:text-white border border-white/10 px-2 py-1"
                  >
                    {showExceptionForm ? 'Cancel' : '+ Log Exception'}
                  </button>
                </div>

                {showExceptionForm ? (
                  <form onSubmit={handleLogException} className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Exception Category</label>
                      <select
                        value={exceptionType}
                        onChange={(e) => setExceptionType(e.target.value)}
                        className="w-full bg-[#111] border border-white/20 p-2 text-xs text-white outline-none"
                      >
                        <option value="STOCK_DISCREPANCY">Stock Discrepancy</option>
                        <option value="CUSTOMER_DELAY">Customer Requested Delay</option>
                        <option value="ADDRESS_LANDMARK_ISSUE">Address / Landmark Issue</option>
                        <option value="DELIVERER_REASSIGNMENT">Deliverer Issue</option>
                        <option value="PAYMENT_QUERY">Payment Query</option>
                        <option value="OTHER">Other Operational Incident</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Incident Details</label>
                      <textarea
                        required
                        rows={2}
                        value={exceptionDetails}
                        onChange={(e) => setExceptionDetails(e.target.value)}
                        placeholder="Detailed operational explanation..."
                        className="w-full bg-[#111] border border-white/20 p-2 text-xs text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Action Taken</label>
                      <input
                        type="text"
                        value={exceptionAction}
                        onChange={(e) => setExceptionAction(e.target.value)}
                        placeholder="e.g. Replaced vintage, called customer, etc."
                        className="w-full bg-[#111] border border-white/20 p-2 text-xs text-white outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingException || !exceptionDetails.trim()}
                      className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-[10px] uppercase tracking-widest font-bold"
                    >
                      {submittingException ? 'Saving...' : 'Record Incident to Audit Log'}
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-white/50 leading-relaxed">
                    Log operational exceptions such as stock adjustments, customer delivery timing modifications, or address clarifications into the permanent audit ledger.
                  </p>
                )}
              </div>
            </div>

            {/* Delivery & Items Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <h4 className="text-xs uppercase tracking-widest text-white/60 mb-3">Purchased Items</h4>
                <div className="space-y-2">
                  {selectedOrderDetails.items?.map((item: any, idx: number) => (
                    <div key={idx} className="bg-black/20 p-2.5 border border-white/5 flex justify-between items-center text-xs">
                      <div>
                        <span className="text-white font-medium block">{item.product?.name}</span>
                        <span className="text-[10px] text-white/40 uppercase">{item.variant?.volume} • {item.variant?.packaging}</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-[#c5a059] mr-2">{item.quantity}x</span>
                        <span className="text-white/60">@ KES {Number(item.priceAtPurchase).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs uppercase tracking-widest text-white/60 mb-3">Delivery Logistics</h4>
                <div className="bg-black/20 p-3 border border-white/5 space-y-2 text-xs text-white/70">
                  <p><span className="text-white/40 uppercase text-[10px]">Zone:</span> <span className="text-[#c5a059] font-medium">{selectedOrderDetails.deliveryZone}</span></p>
                  <p><span className="text-white/40 uppercase text-[10px]">Address:</span> {selectedOrderDetails.deliveryAddress}</p>
                  {selectedOrderDetails.landmark && (
                    <p><span className="text-white/40 uppercase text-[10px]">Landmark:</span> {selectedOrderDetails.landmark}</p>
                  )}
                  {selectedOrderDetails.deliveryInstructions && (
                    <p><span className="text-white/40 uppercase text-[10px]">Instructions:</span> {selectedOrderDetails.deliveryInstructions}</p>
                  )}
                  {selectedOrderDetails.delivery?.failureReason && (
                    <p className="text-red-400 bg-red-500/10 p-2 border border-red-500/20 mt-2">
                      <span className="uppercase text-[9px] block">Delivery Exception Note:</span>
                      {selectedOrderDetails.delivery.failureReason}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Chronological Audit Log Trail */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-white/60 mb-4 flex items-center gap-2">
                <Clock size={14} className="text-[#c5a059]" /> Immutable Operations Audit Ledger
              </h4>
              <div className="border border-white/10 bg-black/40 p-4 space-y-4 max-h-60 overflow-y-auto">
                {selectedOrderDetails.auditLogs && selectedOrderDetails.auditLogs.length > 0 ? (
                  selectedOrderDetails.auditLogs.map((log: any, idx: number) => (
                    <div key={idx} className="border-b border-white/5 pb-3 last:border-0 last:pb-0 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 border ${
                            log.actorRole === 'ADMIN' ? 'text-[#c5a059] border-[#c5a059]/30 bg-[#c5a059]/10' :
                            log.actorRole === 'CUSTOMER' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' :
                            log.actorRole === 'DELIVERER' ? 'text-purple-400 border-purple-500/30 bg-purple-500/10' :
                            'text-white/60 border-white/20 bg-white/5'
                          }`}>
                            {log.actorRole}
                          </span>
                          <span className="font-mono text-white/90 uppercase text-[11px] font-medium">
                            {log.action.replace(/_/g, ' ')}
                          </span>
                          {log.fromState && log.toState && (
                            <span className="text-white/40 text-[10px]">
                              ({log.fromState} → <span className="text-white/90">{log.toState}</span>)
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-white/40 font-mono">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      
                      {log.actorEmail && (
                        <span className="text-[10px] text-white/40 block mb-1">Actor: {log.actorEmail}</span>
                      )}

                      {log.reason && (
                        <p className="text-white/70 italic text-[11px] bg-black/30 p-2 border border-white/5 mt-1">
                          {log.reason}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/40 italic py-2">No audit logs recorded for this order.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CATALOGUE TAB */}
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

      {/* STAFF & RBAC TAB */}
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

      {/* PRODUCT CREATION MODAL */}
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

      {/* VARIANT CREATION MODAL */}
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

      {/* DELIVERY ZONES TAB */}
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
