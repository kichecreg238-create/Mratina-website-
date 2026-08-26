import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  DollarSign,
  Layers,
  ShoppingBag,
  Truck,
  CreditCard,
  Users,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  X,
  RefreshCw,
  Plus,
  Edit2,
  ChevronRight,
  AlertCircle,
  Check,
  MapPin,
  Activity,
  FileText,
  Lock,
  Sliders
} from 'lucide-react';

import { AdminCMSPanel } from '../components/AdminCMSPanel.tsx';

export type AdminTab =
  | 'OVERVIEW'
  | 'ORDERS'
  | 'CATALOGUE'
  | 'PRICING'
  | 'INVENTORY'
  | 'DELIVERY'
  | 'PAYMENTS'
  | 'STAFF'
  | 'CMS'
  | 'AUDIT';

export const AdminDashboard = () => {
  const { user, dbUser, loading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');

  // Operational Data States
  const [overview, setOverview] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [deliverers, setDeliverers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);

  const [fetching, setFetching] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Orders Tab Filters
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<string>('ALL');
  const [orderDelivererFilter, setOrderDelivererFilter] = useState<string>('ALL');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');

  // Payments Tab Filters
  const [paymentProviderFilter, setPaymentProviderFilter] = useState<string>('ALL');
  const [paymentStateFilter, setPaymentStateFilter] = useState<string>('ALL');

  // Audit Tab Filters
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>('ALL');
  const [auditOrderSearch, setAuditOrderSearch] = useState<string>('');

  // Modals & Deep Views
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [statusTransition, setStatusTransition] = useState<string>('');
  const [transitionReason, setTransitionReason] = useState<string>('');

  // Exception Form
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionType, setExceptionType] = useState('STOCK_DISCREPANCY');
  const [exceptionDetails, setExceptionDetails] = useState('');
  const [exceptionAction, setExceptionAction] = useState('');
  const [submittingException, setSubmittingException] = useState(false);

  // Product Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'WINE',
    origin: '',
    abv: '',
    description: '',
    imageUrl: '',
    isActive: true
  });

  // Variant Modal
  const [showVariantModalFor, setShowVariantModalFor] = useState<number | null>(null);
  const [variantForm, setVariantForm] = useState({
    volume: '750ml',
    packaging: 'Bottle',
    price: '',
    stock: 10
  });

  // Zone Modal
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingZone, setEditingZone] = useState<any | null>(null);
  const [zoneForm, setZoneForm] = useState({
    name: '',
    fee: '',
    isActive: true,
    isAcceptingOrders: true
  });

  // Price Edit Modal
  const [editingPriceVariant, setEditingPriceVariant] = useState<any | null>(null);
  const [newPriceValue, setNewPriceValue] = useState<string>('');

  // Stock Edit Modal
  const [editingStockVariant, setEditingStockVariant] = useState<any | null>(null);
  const [newStockValue, setNewStockValue] = useState<number>(0);

  const loadData = async () => {
    if (!user || (dbUser && dbUser.role !== 'ADMIN')) {
      setFetching(false);
      return;
    }

    try {
      setErrorMsg(null);
      const token = await user.getIdToken();
      const headers = { 'Authorization': `Bearer ${token}` };

      const [
        overviewRes,
        ordersRes,
        deliverersRes,
        productsRes,
        usersRes,
        zonesRes,
        paymentsRes,
        auditRes
      ] = await Promise.all([
        fetch('/api/admin/overview', { headers }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/orders', { headers }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/deliverers', { headers }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/products', { headers }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/users', { headers }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/delivery-zones', { headers }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/payments', { headers }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/audit-logs', { headers }).then(r => r.json()).catch(() => ({}))
      ]);

      if (overviewRes.metrics) setOverview(overviewRes);
      if (ordersRes.orders) setOrders(ordersRes.orders);
      if (deliverersRes.deliverers) setDeliverers(deliverersRes.deliverers);
      if (productsRes.products) setProducts(productsRes.products);
      if (usersRes.users) setUsersList(usersRes.users);
      if (zonesRes.zones) setDeliveryZones(zonesRes.zones);
      if (paymentsRes.payments) setPaymentsList(paymentsRes.payments);
      if (auditRes.auditLogs) setAuditLogsList(auditRes.auditLogs);

      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error('Failed to load admin data:', e);
      setErrorMsg('Failed to synchronize operational data. Check network or permissions.');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, dbUser]);

  // If still checking authentication
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#050505] text-white">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin text-[#c5a059]" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Verifying administrative credentials...</p>
        </div>
      </div>
    );
  }

  // Authoritative Role Protection: Deny if not ADMIN
  if (!user || (dbUser && dbUser.role !== 'ADMIN')) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#050505] p-6">
        <div className="max-w-md w-full border border-red-500/20 bg-red-950/10 p-8 rounded-none text-center space-y-6">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto border border-red-500/30">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-serif text-white tracking-wider">Access Restricted</h2>
            <p className="text-xs text-white/60 leading-relaxed">
              The Operational Control Center requires authoritative <span className="text-red-400 font-semibold">ADMIN</span> credentials. Your current role is <span className="text-white font-mono uppercase">[{dbUser?.role || 'CUSTOMER'}]</span>.
            </p>
          </div>
          <a
            href="/"
            className="inline-block w-full py-3 bg-white/5 border border-white/10 hover:border-white/30 text-xs tracking-[0.2em] uppercase text-white transition-colors"
          >
            Return to Storefront
          </a>
        </div>
      </div>
    );
  }

  // --- Order Operational Actions ---
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

    setUpdatingId(orderId);
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

      await loadData();
      await openOrderOperations(orderId);
    } catch (err: any) {
      alert(err.message || 'Status transition failed');
    } finally {
      setUpdatingId(null);
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
      await loadData();
      await openOrderOperations(selectedOrderDetails.id);
    } catch (err: any) {
      alert(err.message || 'Failed to record exception');
    } finally {
      setSubmittingException(false);
    }
  };

  const assignDelivererToOrder = async (orderId: number, delivererId: number | null) => {
    if (!user) return;
    setUpdatingId(orderId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ delivererId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update deliverer assignment');
      await loadData();
      if (selectedOrderDetails?.id === orderId) {
        await openOrderOperations(orderId);
      }
    } catch (err: any) {
      alert(err.message || 'Assignment failed');
    } finally {
      setUpdatingId(null);
    }
  };

  // --- Product & Variant Mutations ---
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !productForm.name.trim()) return;

    try {
      const token = await user.getIdToken();
      const url = editingProduct ? `/api/admin/products/${editingProduct.id}` : '/api/admin/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(productForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save product');

      setShowProductModal(false);
      setEditingProduct(null);
      setProductForm({ name: '', category: 'WINE', origin: '', abv: '', description: '', imageUrl: '', isActive: true });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Product save failed');
    }
  };

  const toggleProductActive = async (productId: number) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/products/${productId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Toggle failed');
      await loadData();
    } catch (e) {
      alert('Failed to toggle product active status');
    }
  };

  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !showVariantModalFor || !variantForm.price) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/products/${showVariantModalFor}/variants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          volume: variantForm.volume,
          packaging: variantForm.packaging,
          price: Number(variantForm.price),
          stock: Number(variantForm.stock)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add variant');

      setShowVariantModalFor(null);
      setVariantForm({ volume: '750ml', packaging: 'Bottle', price: '', stock: 10 });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Variant save failed');
    }
  };

  const toggleVariantActive = async (variantId: number) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/variants/${variantId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Toggle failed');
      await loadData();
    } catch (e) {
      alert('Failed to toggle variant status');
    }
  };

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingPriceVariant || !newPriceValue) return;

    const numPrice = Number(newPriceValue);
    if (isNaN(numPrice) || numPrice <= 0) {
      alert('Price must be a valid positive number');
      return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/variants/${editingPriceVariant.id}/price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ price: numPrice })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update price');

      setEditingPriceVariant(null);
      setNewPriceValue('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Price update failed');
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingStockVariant) return;

    const numStock = Number(newStockValue);
    if (isNaN(numStock) || numStock < 0) {
      alert('Stock must be a non-negative integer');
      return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/variants/${editingStockVariant.id}/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ stock: numStock })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update stock');

      setEditingStockVariant(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Stock update failed');
    }
  };

  // --- Delivery Zone Actions ---
  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !zoneForm.name.trim() || !zoneForm.fee) return;

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
        body: JSON.stringify({
          name: zoneForm.name.trim(),
          fee: Number(zoneForm.fee),
          isActive: zoneForm.isActive,
          isAcceptingOrders: zoneForm.isAcceptingOrders
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save delivery zone');

      setShowZoneModal(false);
      setEditingZone(null);
      setZoneForm({ name: '', fee: '', isActive: true, isAcceptingOrders: true });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Zone save failed');
    }
  };

  // --- Staff / Deliverers Actions ---
  const handleUpdateRole = async (userId: number, role: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role })
      });
      if (!res.ok) throw new Error('Role update failed');
      await loadData();
    } catch (e) {
      alert('Failed to update user role');
    }
  };

  const handleToggleDelivererAvailability = async (delivererId: number, currentAvailable: boolean) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/deliverers/${delivererId}/availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isAvailable: !currentAvailable })
      });
      if (!res.ok) throw new Error('Availability update failed');
      await loadData();
    } catch (e) {
      alert('Failed to update deliverer availability');
    }
  };

  // --- Filtered Orders ---
  const filteredOrders = orders.filter(order => {
    const matchesStatus = orderStatusFilter === 'ALL' || order.status === orderStatusFilter;
    const matchesPayment = orderPaymentFilter === 'ALL' || order.paymentState === orderPaymentFilter;
    const matchesDeliverer = orderDelivererFilter === 'ALL' ||
      (orderDelivererFilter === 'UNASSIGNED' && !order.delivererId) ||
      (order.delivererId && order.delivererId.toString() === orderDelivererFilter);

    const matchesSearch = !orderSearchQuery.trim() ||
      order.id.toString().includes(orderSearchQuery.toLowerCase()) ||
      (order.customerEmail && order.customerEmail.toLowerCase().includes(orderSearchQuery.toLowerCase())) ||
      (order.deliveryAddress && order.deliveryAddress.toLowerCase().includes(orderSearchQuery.toLowerCase())) ||
      (order.deliveryZone && order.deliveryZone.toLowerCase().includes(orderSearchQuery.toLowerCase()));

    return matchesStatus && matchesPayment && matchesDeliverer && matchesSearch;
  });

  // --- Filtered Payments ---
  const filteredPayments = paymentsList.filter(payment => {
    const matchesProvider = paymentProviderFilter === 'ALL' || payment.provider === paymentProviderFilter;
    const matchesState = paymentStateFilter === 'ALL' || payment.status === paymentStateFilter;
    return matchesProvider && matchesState;
  });

  // --- Filtered Audit Logs ---
  const filteredAuditLogs = auditLogsList.filter(log => {
    const matchesAction = auditActionFilter === 'ALL' || log.action === auditActionFilter;
    const matchesRole = auditRoleFilter === 'ALL' || log.actorRole === auditRoleFilter;
    const matchesSearch = !auditOrderSearch.trim() ||
      log.orderId?.toString().includes(auditOrderSearch.trim()) ||
      (log.reason && log.reason.toLowerCase().includes(auditOrderSearch.toLowerCase())) ||
      (log.actorEmail && log.actorEmail.toLowerCase().includes(auditOrderSearch.toLowerCase()));
    return matchesAction && matchesRole && matchesSearch;
  });

  // All Variants flat list for Pricing and Inventory tabs
  const allVariantsList = products.flatMap(p =>
    (p.variants || []).map((v: any) => ({
      ...v,
      productName: p.name,
      productCategory: p.category,
      productActive: p.isActive
    }))
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#e0e0e0] overflow-y-auto">
      {/* Top Operational Header */}
      <header className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/10 px-4 md:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 border border-[#c5a059]/40 bg-[#c5a059]/10 flex items-center justify-center text-[#c5a059]">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-semibold tracking-[0.2em] uppercase text-white font-mono">
                Control Center
              </h1>
              <span className="text-[9px] px-2 py-0.5 bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/40 font-mono uppercase">
                ADMIN AUTHORIZED
              </span>
            </div>
            <p className="text-[10px] text-white/40 tracking-wider">
              Authoritative Operations & Ledger — Mratina
            </p>
          </div>
        </div>

        {/* Sync & Admin Identity */}
        <div className="flex items-center space-x-4 self-end sm:self-auto text-xs">
          {lastRefreshed && (
            <span className="text-[10px] text-white/40 font-mono hidden md:inline-block">
              Synced {lastRefreshed}
            </span>
          )}
          <button
            onClick={loadData}
            disabled={fetching}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/5 border border-white/10 hover:border-[#c5a059]/50 hover:bg-[#c5a059]/10 text-white/80 hover:text-white transition-all text-xs tracking-wider font-mono disabled:opacity-50"
            title="Refresh All Operational Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin text-[#c5a059]' : ''}`} />
            <span>Sync</span>
          </button>
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-white/50 block font-mono">
              {dbUser?.email || user.email}
            </span>
          </div>
        </div>
      </header>

      {/* Navigation Tab Bar */}
      <nav className="border-b border-white/10 bg-[#080808] px-4 md:px-8 py-2 overflow-x-auto scrollbar-none flex items-center space-x-1">
        {[
          { id: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard },
          { id: 'ORDERS', label: 'Orders', icon: ShoppingBag, count: orders.length },
          { id: 'CATALOGUE', label: 'Catalogue', icon: Package, count: products.length },
          { id: 'PRICING', label: 'Pricing', icon: DollarSign },
          { id: 'INVENTORY', label: 'Inventory', icon: Layers, badge: overview?.metrics?.lowStockCount ? `${overview.metrics.lowStockCount} Low` : null },
          { id: 'DELIVERY', label: 'Delivery', icon: Truck, count: overview?.metrics?.activeDeliveries },
          { id: 'PAYMENTS', label: 'Payments', icon: CreditCard, count: paymentsList.length },
          { id: 'STAFF', label: 'Staff / Deliverers', icon: Users, count: deliverers.length },
          { id: 'CMS', label: 'CMS & Visuals', icon: Sliders },
          { id: 'AUDIT', label: 'Audit Ledger', icon: FileText, count: auditLogsList.length }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`flex items-center space-x-2 px-3.5 py-2 text-xs font-mono tracking-wider uppercase whitespace-nowrap transition-all border-b-2 -mb-[9px] ${
                isActive
                  ? 'border-[#c5a059] text-white bg-white/5'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.02]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#c5a059]' : 'text-white/40'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-none ml-1">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main Content Body */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
        {errorMsg && (
          <div className="p-4 border border-red-500/30 bg-red-950/20 text-red-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={loadData} className="underline text-white hover:text-[#c5a059]">Retry</button>
          </div>
        )}

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            {/* Operational KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border border-white/10 bg-[#0d0d0d] space-y-2">
                <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                  <span>Active Orders</span>
                  <Activity className="w-3.5 h-3.5 text-[#c5a059]" />
                </div>
                <div className="text-2xl font-serif text-white font-light">
                  {overview?.metrics?.activeOrders ?? 0}
                </div>
                <div className="text-[10px] text-white/40">
                  {overview?.metrics?.pendingOrders ?? 0} pending confirmation
                </div>
              </div>

              <div className="p-4 border border-white/10 bg-[#0d0d0d] space-y-2">
                <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                  <span>Active Deliveries</span>
                  <Truck className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-2xl font-serif text-white font-light">
                  {overview?.metrics?.activeDeliveries ?? 0}
                </div>
                <div className="text-[10px] text-white/40">
                  {overview?.metrics?.availableDeliverers ?? 0} of {overview?.metrics?.totalDeliverers ?? 0} deliverers available
                </div>
              </div>

              <div className="p-4 border border-white/10 bg-[#0d0d0d] space-y-2">
                <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                  <span>Total Revenue</span>
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-2xl font-serif text-emerald-400 font-light">
                  KES {overview?.metrics?.totalRevenue ?? '0.00'}
                </div>
                <div className="text-[10px] text-white/40">
                  {overview?.paymentStats?.SUCCESS ?? 0} verified transactions
                </div>
              </div>

              <div className="p-4 border border-white/10 bg-[#0d0d0d] space-y-2">
                <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                  <span>Low Stock Items</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-2xl font-serif text-amber-400 font-light">
                  {overview?.metrics?.lowStockCount ?? 0}
                </div>
                <div className="text-[10px] text-white/40">
                  Threshold: under 10 units
                </div>
              </div>
            </div>

            {/* Attention & Dispatch Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Attention Orders */}
              <div className="border border-white/10 bg-[#0d0d0d] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs uppercase tracking-wider font-mono text-white font-semibold">
                      Orders Requiring Action
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-white/40">
                    {overview?.attentionOrders?.length || 0} issues
                  </span>
                </div>

                {overview?.attentionOrders && overview.attentionOrders.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {overview.attentionOrders.map((order: any) => (
                      <div
                        key={order.id}
                        onClick={() => {
                          setActiveTab('ORDERS');
                          openOrderOperations(order.id);
                        }}
                        className="p-3 border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#c5a059]/40 cursor-pointer transition-all flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono text-white font-semibold">#{order.id}</span>
                            <span className="text-[10px] px-1.5 py-0.2 font-mono bg-red-950/40 text-red-400 border border-red-500/20">
                              {order.status}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 font-mono bg-white/5 text-white/60">
                              Pay: {order.paymentState}
                            </span>
                          </div>
                          <p className="text-[11px] text-white/50 truncate max-w-xs">
                            {order.deliveryAddress} ({order.deliveryZone || 'Standard'})
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/30" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-white/40 space-y-2">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                    <p>All active orders are moving through valid lifecycles.</p>
                  </div>
                )}
              </div>

              {/* Low Stock Items Alert */}
              <div className="border border-white/10 bg-[#0d0d0d] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs uppercase tracking-wider font-mono text-white font-semibold">
                      Low Inventory Warnings
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('INVENTORY')}
                    className="text-[10px] font-mono text-[#c5a059] hover:underline"
                  >
                    View All Stock →
                  </button>
                </div>

                {overview?.lowStockItems && overview.lowStockItems.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {overview.lowStockItems.map((item: any) => (
                      <div
                        key={item.id}
                        className="p-3 border border-white/5 bg-white/[0.02] flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">{item.productName}</div>
                          <div className="text-[10px] text-white/40 font-mono">
                            {item.volume} • {item.packaging}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 border ${
                            item.stock === 0
                              ? 'bg-red-950/40 text-red-400 border-red-500/30'
                              : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                          }`}>
                            {item.stock} left
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-white/40 space-y-2">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                    <p>All product variants have healthy inventory thresholds.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Navigation Banner */}
            <div className="border border-white/10 bg-[#0a0a0a] p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-white/60">
                <span className="text-white font-semibold">Quick Jump:</span> Manage inventory, set authoritative prices, or dispatch deliveries.
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('ORDERS')}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white font-mono tracking-wider uppercase"
                >
                  Manage Orders
                </button>
                <button
                  onClick={() => setActiveTab('PRICING')}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white font-mono tracking-wider uppercase"
                >
                  Edit Pricing
                </button>
                <button
                  onClick={() => setActiveTab('DELIVERY')}
                  className="px-3 py-1.5 bg-[#c5a059]/20 hover:bg-[#c5a059]/30 border border-[#c5a059]/40 text-xs text-[#c5a059] font-mono tracking-wider uppercase"
                >
                  Dispatch Deliveries
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. ORDERS TAB (Module 15 Operational Controls) */}
        {activeTab === 'ORDERS' && (
          <div className="space-y-4">
            {/* Filter Toolbar */}
            <div className="p-4 border border-white/10 bg-[#0d0d0d] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Search by Order ID, Customer Email, Address, Landmark..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 pl-9 pr-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="bg-black border border-white/10 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ALL">Status: All</option>
                  <option value="PENDING">PENDING</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="PICKUP_READY">PICKUP_READY</option>
                  <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="CANCELLED">CANCELLED</option>
                  <option value="FAILED">FAILED</option>
                </select>

                <select
                  value={orderPaymentFilter}
                  onChange={(e) => setOrderPaymentFilter(e.target.value)}
                  className="bg-black border border-white/10 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ALL">Payment: All</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="PENDING">PENDING</option>
                  <option value="INITIATED">INITIATED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="REFUNDED">REFUNDED</option>
                </select>

                <select
                  value={orderDelivererFilter}
                  onChange={(e) => setOrderDelivererFilter(e.target.value)}
                  className="bg-black border border-white/10 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ALL">Deliverer: All</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  {deliverers.map(d => (
                    <option key={d.id} value={d.id.toString()}>
                      {d.email} {d.isAvailable ? '• Available' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Orders Table */}
            <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Payment</th>
                    <th className="p-3">Delivery Dispatch</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 text-white font-bold">#{order.id}</td>
                        <td className="p-3 text-white/80 font-sans text-xs">
                          {order.customerEmail || 'Guest'}
                        </td>
                        <td className="p-3 text-emerald-400 font-semibold">
                          KES {Number(order.totalAmount).toFixed(2)}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] border ${
                            order.status === 'DELIVERED' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' :
                            order.status === 'CANCELLED' ? 'bg-red-950/40 text-red-400 border-red-500/30' :
                            order.status === 'FAILED' ? 'bg-rose-950/40 text-rose-400 border-rose-500/30' :
                            'bg-amber-950/40 text-amber-300 border-amber-500/30'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] border ${
                            order.paymentState === 'SUCCESS' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' :
                            order.paymentState === 'FAILED' ? 'bg-red-950/40 text-red-400 border-red-500/30' :
                            'bg-white/5 text-white/60 border-white/10'
                          }`}>
                            {order.paymentState}
                          </span>
                        </td>
                        <td className="p-3">
                          <select
                            value={order.delivererId || ''}
                            onChange={(e) => assignDelivererToOrder(order.id, e.target.value ? parseInt(e.target.value) : null)}
                            disabled={updatingId === order.id || ['DELIVERED', 'CANCELLED', 'FAILED'].includes(order.status)}
                            className="bg-black/60 border border-white/10 text-[10px] px-2 py-1 text-white/80 focus:outline-none focus:border-[#c5a059] disabled:opacity-40"
                          >
                            <option value="">-- Unassigned --</option>
                            {deliverers.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.email} {d.isAvailable ? '• Available' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-white/40 text-[10px]">
                          {new Date(order.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => openOrderOperations(order.id)}
                            className="px-2.5 py-1 bg-white/5 hover:bg-[#c5a059]/20 border border-white/10 hover:border-[#c5a059]/40 text-white hover:text-[#c5a059] transition-all text-[10px] uppercase tracking-wider"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-white/40 font-sans text-xs">
                        No orders match the specified filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. CATALOGUE TAB */}
        {activeTab === 'CATALOGUE' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">Catalogue Records</h2>
                <p className="text-xs text-white/40">Manage products, origins, categories, ABV and associated variant packs.</p>
              </div>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProductForm({ name: '', category: 'WINE', origin: '', abv: '', description: '', imageUrl: '', isActive: true });
                  setShowProductModal(true);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#c5a059]/20 hover:bg-[#c5a059]/30 border border-[#c5a059]/40 text-[#c5a059] text-xs font-mono uppercase tracking-wider transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>New Product</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => (
                <div
                  key={product.id}
                  className={`border ${product.isActive ? 'border-white/10 bg-[#0d0d0d]' : 'border-red-950/40 bg-black/40 opacity-70'} p-5 space-y-4 flex flex-col justify-between`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[9px] px-1.5 py-0.5 font-mono bg-white/5 text-[#c5a059] border border-white/10 uppercase">
                          {product.category}
                        </span>
                        <h3 className="text-sm font-bold text-white mt-1 font-serif">{product.name}</h3>
                        <p className="text-[10px] text-white/40 font-mono">
                          {product.origin || 'Kenya'} • {product.abv || 'N/A'} ABV
                        </p>
                      </div>
                      <button
                        onClick={() => toggleProductActive(product.id)}
                        className={`text-[9px] px-2 py-0.5 border font-mono uppercase ${
                          product.isActive
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-950/40 text-red-400 border-red-500/30'
                        }`}
                        title="Click to toggle product active status"
                      >
                        {product.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </div>

                    <p className="text-xs text-white/60 line-clamp-2">{product.description || 'No description provided.'}</p>

                    {/* Variants Mini List */}
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-white/40 font-mono">
                        <span>Variants ({product.variants?.length || 0})</span>
                        <button
                          onClick={() => {
                            setShowVariantModalFor(product.id);
                            setVariantForm({ volume: '750ml', packaging: 'Bottle', price: '', stock: 10 });
                          }}
                          className="text-[#c5a059] hover:underline"
                        >
                          + Add Variant
                        </button>
                      </div>
                      <div className="space-y-1">
                        {product.variants?.map((v: any) => (
                          <div key={v.id} className="flex items-center justify-between text-xs p-1.5 bg-white/[0.02] border border-white/5 font-mono">
                            <span className="text-white/80">{v.volume} ({v.packaging})</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-emerald-400 font-bold">KES {Number(v.price).toFixed(2)}</span>
                              <span className="text-[10px] text-white/40">({v.stock} in stock)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-end space-x-2">
                    <button
                      onClick={() => {
                        setEditingProduct(product);
                        setProductForm({
                          name: product.name,
                          category: product.category,
                          origin: product.origin || '',
                          abv: product.abv || '',
                          description: product.description || '',
                          imageUrl: product.imageUrl || '',
                          isActive: product.isActive
                        });
                        setShowProductModal(true);
                      }}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white font-mono uppercase tracking-wider flex items-center space-x-1"
                    >
                      <Edit2 className="w-3 h-3 text-[#c5a059]" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. PRICING TAB */}
        {activeTab === 'PRICING' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">Authoritative Pricing Controls</h2>
                <p className="text-xs text-white/40">Manage base rates, packaging surcharges, and unit prices enforced server-side.</p>
              </div>
            </div>

            <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Volume</th>
                    <th className="p-3">Packaging Type</th>
                    <th className="p-3">Current Price</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {allVariantsList.map(variant => (
                    <tr key={variant.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-white font-bold font-sans text-xs">{variant.productName}</td>
                      <td className="p-3 text-white/60">{variant.productCategory}</td>
                      <td className="p-3 text-white/80">{variant.volume}</td>
                      <td className="p-3 text-white/80">{variant.packaging}</td>
                      <td className="p-3 text-emerald-400 font-bold text-xs">
                        KES {Number(variant.price).toFixed(2)}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleVariantActive(variant.id)}
                          className={`text-[9px] px-2 py-0.5 border uppercase ${
                            variant.isActive
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-950/40 text-red-400 border-red-500/30'
                          }`}
                        >
                          {variant.isActive ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setEditingPriceVariant(variant);
                            setNewPriceValue(variant.price.toString());
                          }}
                          className="px-2.5 py-1 bg-white/5 hover:bg-[#c5a059]/20 border border-white/10 hover:border-[#c5a059]/40 text-white hover:text-[#c5a059] transition-all text-[10px] uppercase tracking-wider"
                        >
                          Adjust Price
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. INVENTORY TAB */}
        {activeTab === 'INVENTORY' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">Stock Control Center</h2>
                <p className="text-xs text-white/40">Real-time stock balance across variants with atomic adjustments.</p>
              </div>
            </div>

            <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                    <th className="p-3">Product</th>
                    <th className="p-3">Volume & Pack</th>
                    <th className="p-3">Stock Units</th>
                    <th className="p-3">Inventory Health</th>
                    <th className="p-3 text-right">Adjust Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {allVariantsList.map(variant => {
                    const isOut = variant.stock === 0;
                    const isLow = variant.stock > 0 && variant.stock < 10;
                    return (
                      <tr key={variant.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 text-white font-bold font-sans text-xs">{variant.productName}</td>
                        <td className="p-3 text-white/70">{variant.volume} • {variant.packaging}</td>
                        <td className="p-3 text-white font-bold text-xs">{variant.stock}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] border ${
                            isOut ? 'bg-red-950/40 text-red-400 border-red-500/30' :
                            isLow ? 'bg-amber-950/40 text-amber-300 border-amber-500/30' :
                            'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {isOut ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'HEALTHY'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setEditingStockVariant(variant);
                              setNewStockValue(variant.stock);
                            }}
                            className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] uppercase tracking-wider"
                          >
                            Set Stock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. DELIVERY TAB */}
        {activeTab === 'DELIVERY' && (
          <div className="space-y-6">
            {/* Zones Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">Delivery Zones & Fees</h2>
                  <p className="text-xs text-white/40">Authoritative zone coverage, serviceability gates, and fee schedules.</p>
                </div>
                <button
                  onClick={() => {
                    setEditingZone(null);
                    setZoneForm({ name: '', fee: '', isActive: true, isAcceptingOrders: true });
                    setShowZoneModal(true);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#c5a059]/20 hover:bg-[#c5a059]/30 border border-[#c5a059]/40 text-[#c5a059] text-xs font-mono uppercase tracking-wider transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Delivery Zone</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deliveryZones.map(zone => (
                  <div key={zone.id} className="p-4 border border-white/10 bg-[#0d0d0d] space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <MapPin className="w-4 h-4 text-[#c5a059]" />
                        <span className="text-xs font-bold text-white font-mono">{zone.name}</span>
                      </div>
                      <span className="text-xs font-mono text-emerald-400 font-bold">
                        KES {Number(zone.fee).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] font-mono">
                      <span className="text-white/40">Status:</span>
                      <div className="flex items-center space-x-1.5">
                        <span className={`px-1.5 py-0.2 border ${zone.isActive ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'}`}>
                          {zone.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span className={`px-1.5 py-0.2 border ${zone.isAcceptingOrders ? 'text-blue-400 border-blue-500/30' : 'text-amber-400 border-amber-500/30'}`}>
                          {zone.isAcceptingOrders ? 'Accepting' : 'Paused'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => {
                          setEditingZone(zone);
                          setZoneForm({
                            name: zone.name,
                            fee: zone.fee.toString(),
                            isActive: zone.isActive,
                            isAcceptingOrders: zone.isAcceptingOrders
                          });
                          setShowZoneModal(true);
                        }}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white font-mono uppercase"
                      >
                        Edit Zone
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Deliveries Monitor */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">Active Dispatch Stream</h2>
              <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                      <th className="p-3">Order ID</th>
                      <th className="p-3">Destination</th>
                      <th className="p-3">Zone</th>
                      <th className="p-3">Assigned Deliverer</th>
                      <th className="p-3">Delivery Status</th>
                      <th className="p-3 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                    {orders.filter(o => o.delivery).map(order => (
                      <tr key={order.id} className="hover:bg-white/[0.02]">
                        <td className="p-3 text-white font-bold">#{order.id}</td>
                        <td className="p-3 text-white/80 font-sans text-xs">{order.deliveryAddress}</td>
                        <td className="p-3 text-white/60">{order.deliveryZone || 'Standard'}</td>
                        <td className="p-3">
                          {order.delivererId ? (
                            <span className="text-[#c5a059]">Deliverer #{order.delivererId}</span>
                          ) : (
                            <span className="text-amber-400">Unassigned</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 text-[9px] border bg-white/5 border-white/10 text-white/80">
                            {order.delivery?.status || 'UNASSIGNED'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => openOrderOperations(order.id)}
                            className="px-2 py-1 bg-white/5 hover:bg-[#c5a059]/20 border border-white/10 text-[10px] text-white uppercase"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 7. PAYMENTS TAB */}
        {activeTab === 'PAYMENTS' && (
          <div className="space-y-4">
            <div className="p-4 border border-white/10 bg-[#0d0d0d] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">Payment Audit Records</h2>
                <p className="text-xs text-white/40">Verified gateway logs and provider transaction references.</p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={paymentProviderFilter}
                  onChange={(e) => setPaymentProviderFilter(e.target.value)}
                  className="bg-black border border-white/10 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ALL">Provider: All</option>
                  <option value="M-PESA">M-PESA</option>
                  <option value="AIRTEL_MONEY">AIRTEL_MONEY</option>
                </select>

                <select
                  value={paymentStateFilter}
                  onChange={(e) => setPaymentStateFilter(e.target.value)}
                  className="bg-black border border-white/10 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ALL">State: All</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="PENDING">PENDING</option>
                  <option value="INITIATED">INITIATED</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>
            </div>

            <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                    <th className="p-3">Payment ID</th>
                    <th className="p-3">Linked Order</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Provider</th>
                    <th className="p-3">Provider Ref / Receipt</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {filteredPayments.length > 0 ? (
                    filteredPayments.map(p => (
                      <tr key={p.id} className="hover:bg-white/[0.02]">
                        <td className="p-3 text-white font-bold">#{p.id}</td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              setActiveTab('ORDERS');
                              openOrderOperations(p.orderId);
                            }}
                            className="text-[#c5a059] hover:underline font-bold"
                          >
                            Order #{p.orderId}
                          </button>
                        </td>
                        <td className="p-3 text-white/80 font-sans text-xs">{p.customerEmail || 'Guest'}</td>
                        <td className="p-3 text-white/70">{p.provider}</td>
                        <td className="p-3 text-white/60 font-mono">{p.providerReference || 'Pending verification'}</td>
                        <td className="p-3 text-emerald-400 font-bold">KES {Number(p.amount).toFixed(2)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] border ${
                            p.status === 'SUCCESS' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' :
                            p.status === 'FAILED' ? 'bg-red-950/40 text-red-400 border-red-500/30' :
                            'bg-amber-950/40 text-amber-300 border-amber-500/30'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3 text-white/40 text-[10px]">
                          {new Date(p.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-white/40 font-sans text-xs">
                        No payment records matching the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. STAFF / DELIVERERS TAB */}
        {activeTab === 'STAFF' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">Staff Accounts & Deliverer Roster</h2>
                <p className="text-xs text-white/40">Role assignments, delivery availability, and staff permissions.</p>
              </div>
            </div>

            <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                    <th className="p-3">User ID</th>
                    <th className="p-3">Email Address</th>
                    <th className="p-3">Current Role</th>
                    <th className="p-3">Deliverer Availability</th>
                    <th className="p-3 text-right">Role Assignment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {usersList.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 text-white font-bold">#{u.id}</td>
                      <td className="p-3 text-white/90 font-sans text-xs">{u.email}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-[9px] border ${
                          u.role === 'ADMIN' ? 'bg-[#c5a059]/20 text-[#c5a059] border-[#c5a059]/40' :
                          u.role === 'DELIVERER' ? 'bg-blue-950/40 text-blue-400 border-blue-500/30' :
                          'bg-white/5 text-white/60 border-white/10'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3">
                        {u.role === 'DELIVERER' ? (
                          <button
                            onClick={() => handleToggleDelivererAvailability(u.id, u.isAvailable)}
                            className={`px-2 py-0.5 text-[9px] border uppercase ${
                              u.isAvailable
                                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                                : 'bg-red-950/40 text-red-400 border-red-500/30'
                            }`}
                          >
                            {u.isAvailable ? 'Available' : 'Unavailable'} (Toggle)
                          </button>
                        ) : (
                          <span className="text-white/30 text-[10px]">N/A</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                          className="bg-black/60 border border-white/10 text-[10px] px-2 py-1 text-white/80 focus:outline-none focus:border-[#c5a059]"
                        >
                          <option value="CUSTOMER">CUSTOMER</option>
                          <option value="DELIVERER">DELIVERER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. AUDIT LEDGER TAB */}
        {activeTab === 'AUDIT' && (
          <div className="space-y-4">
            <div className="p-4 border border-white/10 bg-[#0d0d0d] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Filter by Order ID, Actor Email, or Reason keyword..."
                  value={auditOrderSearch}
                  onChange={(e) => setAuditOrderSearch(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 pl-9 pr-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="bg-black border border-white/10 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ALL">Action: All</option>
                  <option value="STATUS_CHANGE">STATUS_CHANGE</option>
                  <option value="PAYMENT_STATE_CHANGE">PAYMENT_STATE_CHANGE</option>
                  <option value="DELIVERY_CHANGE">DELIVERY_CHANGE</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="EXCEPTION">EXCEPTION</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>

                <select
                  value={auditRoleFilter}
                  onChange={(e) => setAuditRoleFilter(e.target.value)}
                  className="bg-black border border-white/10 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                >
                  <option value="ALL">Actor Role: All</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="DELIVERER">DELIVERER</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                </select>
              </div>
            </div>

            <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                    <th className="p-3">Audit ID</th>
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Actor Role</th>
                    <th className="p-3">Actor Email</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Transition</th>
                    <th className="p-3">Reason / Details</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {filteredAuditLogs.length > 0 ? (
                    filteredAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="p-3 text-white font-bold">#{log.id}</td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              setActiveTab('ORDERS');
                              openOrderOperations(log.orderId);
                            }}
                            className="text-[#c5a059] hover:underline"
                          >
                            Order #{log.orderId}
                          </button>
                        </td>
                        <td className="p-3">
                          <span className={`px-1.5 py-0.2 text-[9px] border ${
                            log.actorRole === 'ADMIN' ? 'bg-[#c5a059]/20 text-[#c5a059] border-[#c5a059]/40' :
                            log.actorRole === 'SYSTEM' ? 'bg-purple-950/40 text-purple-400 border-purple-500/30' :
                            log.actorRole === 'DELIVERER' ? 'bg-blue-950/40 text-blue-400 border-blue-500/30' :
                            'bg-white/5 text-white/60 border-white/10'
                          }`}>
                            {log.actorRole}
                          </span>
                        </td>
                        <td className="p-3 text-white/70 font-sans text-xs">{log.actorEmail || 'System Process'}</td>
                        <td className="p-3 text-white font-bold">{log.action}</td>
                        <td className="p-3 text-white/60">
                          {log.fromState ? `${log.fromState} → ${log.toState}` : log.toState || 'N/A'}
                        </td>
                        <td className="p-3 text-white/80 font-sans text-xs max-w-xs truncate">
                          {log.reason || '—'}
                        </td>
                        <td className="p-3 text-white/40 text-[10px]">
                          {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-white/40 font-sans text-xs">
                        No audit ledger records match the query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 10. CMS & VISUAL CONTENT CONTROL TAB */}
        {activeTab === 'CMS' && (
          <div className="space-y-6">
            <div className="border-b border-white/10 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-serif text-white uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#c5a059]" />
                  Visual Content & Storefront CMS
                </h2>
                <p className="text-xs text-white/50 mt-1">
                  Manage draft & published banners, narrative blocks, and branding controls safely.
                </p>
              </div>
            </div>
            <AdminCMSPanel />
          </div>
        )}
      </main>

      {/* --- MODAL 1: Deep Order Operations & Audit Timeline Modal --- */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 md:p-6 border-b border-white/10 flex items-center justify-between bg-[#080808]">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-serif text-white tracking-wider">
                    Order Operations #{selectedOrderDetails.id}
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 font-mono bg-white/5 text-[#c5a059] border border-white/10 uppercase">
                    {selectedOrderDetails.status}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 font-mono mt-0.5">
                  Placed: {new Date(selectedOrderDetails.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="text-white/40 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 md:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Order Meta Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 border border-white/5 bg-white/[0.02] space-y-1">
                  <span className="text-[10px] text-white/40 uppercase font-mono">Customer Information</span>
                  <div className="text-white font-semibold">{selectedOrderDetails.customer?.email || 'Guest User'}</div>
                  <div className="text-[10px] text-white/50 font-mono">ID #{selectedOrderDetails.userId}</div>
                </div>

                <div className="p-3 border border-white/5 bg-white/[0.02] space-y-1">
                  <span className="text-[10px] text-white/40 uppercase font-mono">Payment State</span>
                  <div className="text-emerald-400 font-semibold font-mono text-sm">
                    {selectedOrderDetails.paymentState} (KES {Number(selectedOrderDetails.totalAmount).toFixed(2)})
                  </div>
                  <div className="text-[10px] text-white/50 font-mono">
                    Fee: KES {Number(selectedOrderDetails.deliveryFee || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-3 border border-white/5 bg-white/[0.02] space-y-1">
                  <span className="text-[10px] text-white/40 uppercase font-mono">Delivery Dispatch</span>
                  <div className="text-white font-semibold">
                    {selectedOrderDetails.deliverer ? selectedOrderDetails.deliverer.email : 'Unassigned'}
                  </div>
                  <div className="text-[10px] text-white/50 font-mono">
                    Zone: {selectedOrderDetails.deliveryZone || 'Standard'}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-mono text-white/50 tracking-wider">Ordered Items</span>
                <div className="border border-white/5 divide-y divide-white/5 bg-white/[0.01]">
                  {selectedOrderDetails.items?.map((item: any) => (
                    <div key={item.id} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white font-serif">{item.product?.name || 'Drink'}</div>
                        <div className="text-[10px] text-white/40 font-mono">
                          {item.variant?.volume} • {item.variant?.packaging}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-white">Qty: {item.quantity}</div>
                        <div className="text-emerald-400">KES {Number(item.priceAtPurchase).toFixed(2)} each</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Authoritative State Transition Controls */}
              <div className="p-4 border border-[#c5a059]/30 bg-[#c5a059]/5 space-y-3">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 text-[#c5a059]" />
                  <h4 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                    Authoritative State Transition
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-white/50 uppercase font-mono block mb-1">Target Status</label>
                    <select
                      value={statusTransition}
                      onChange={(e) => setStatusTransition(e.target.value)}
                      className="w-full bg-black border border-white/10 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                    >
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

                  <div>
                    <label className="text-[10px] text-white/50 uppercase font-mono block mb-1">
                      Reason / Operational Note {['FAILED', 'CANCELLED'].includes(statusTransition) && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Customer requested cancellation / Stock discrepancy"
                      value={transitionReason}
                      onChange={(e) => setTransitionReason(e.target.value)}
                      className="w-full bg-black border border-white/10 px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#c5a059]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setShowExceptionForm(!showExceptionForm)}
                    className="text-[10px] text-[#c5a059] hover:underline font-mono uppercase"
                  >
                    {showExceptionForm ? '— Hide Incident Logger' : '+ Log Operational Incident / Note'}
                  </button>

                  <button
                    onClick={() => handleStatusTransition(selectedOrderDetails.id)}
                    disabled={updatingId === selectedOrderDetails.id}
                    className="px-4 py-2 bg-[#c5a059] text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-[#d6b26a] transition-all disabled:opacity-50"
                  >
                    {updatingId === selectedOrderDetails.id ? 'Applying...' : 'Execute Transition'}
                  </button>
                </div>
              </div>

              {/* Exception Logger Form */}
              {showExceptionForm && (
                <form onSubmit={handleLogException} className="p-4 border border-amber-500/30 bg-amber-950/10 space-y-3">
                  <h5 className="text-xs font-mono uppercase text-amber-300 font-bold">Log Order Incident / Exception</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-white/50 uppercase font-mono block mb-1">Incident Type</label>
                      <select
                        value={exceptionType}
                        onChange={(e) => setExceptionType(e.target.value)}
                        className="w-full bg-black border border-white/10 px-3 py-1.5 text-xs text-white font-mono"
                      >
                        <option value="STOCK_DISCREPANCY">Stock Discrepancy</option>
                        <option value="CUSTOMER_REQUEST">Customer Delay/Instruction</option>
                        <option value="LANDMARK_CLARIFICATION">Landmark Clarification</option>
                        <option value="DELIVERER_REASSIGNMENT">Deliverer Reassignment</option>
                        <option value="PAYMENT_INVESTIGATION">Payment Inquiry</option>
                        <option value="OTHER">Other Operational Incident</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 uppercase font-mono block mb-1">Action Taken</label>
                      <input
                        type="text"
                        placeholder="Action taken to remediate..."
                        value={exceptionAction}
                        onChange={(e) => setExceptionAction(e.target.value)}
                        className="w-full bg-black border border-white/10 px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 uppercase font-mono block mb-1">Detailed Description *</label>
                    <textarea
                      rows={2}
                      placeholder="Explain the incident accurately for the immutable audit ledger..."
                      value={exceptionDetails}
                      onChange={(e) => setExceptionDetails(e.target.value)}
                      className="w-full bg-black border border-white/10 p-2 text-xs text-white"
                      required
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingException}
                      className="px-3 py-1.5 bg-amber-500 text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-amber-400"
                    >
                      {submittingException ? 'Recording...' : 'Record Incident'}
                    </button>
                  </div>
                </form>
              )}

              {/* Chronological Audit Trail */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-mono text-white/50 tracking-wider">Immutable Audit Trail</span>
                <div className="border border-white/5 bg-white/[0.01] divide-y divide-white/5 font-mono text-[11px] max-h-60 overflow-y-auto">
                  {selectedOrderDetails.auditLogs?.map((log: any) => (
                    <div key={log.id} className="p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-bold">{log.action}</span>
                          <span className="text-[9px] px-1.5 py-0.2 bg-white/5 text-[#c5a059] border border-white/10">
                            {log.actorRole}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/40">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-white/70 font-sans text-xs">
                        {log.fromState && log.toState ? `${log.fromState} → ${log.toState}` : ''} {log.reason && `— ${log.reason}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Product Create / Edit Modal --- */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-serif text-white tracking-wider">
                {editingProduct ? 'Edit Product' : 'Create New Product'}
              </h3>
              <button onClick={() => setShowProductModal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-[10px] text-white/50 uppercase block mb-1">Product Name *</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="e.g. Muratina Reserve Extra Dry"
                  className="w-full bg-black border border-white/10 px-3 py-2 text-white font-sans focus:outline-none focus:border-[#c5a059]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/50 uppercase block mb-1">Category *</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full bg-black border border-white/10 px-3 py-2 text-white focus:outline-none focus:border-[#c5a059]"
                  >
                    <option value="WINE">WINE</option>
                    <option value="BEER">BEER</option>
                    <option value="SPIRITS">SPIRITS</option>
                    <option value="MIXER">MIXER</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-white/50 uppercase block mb-1">ABV (%)</label>
                  <input
                    type="text"
                    value={productForm.abv}
                    onChange={(e) => setProductForm({ ...productForm, abv: e.target.value })}
                    placeholder="e.g. 12.5%"
                    className="w-full bg-black border border-white/10 px-3 py-2 text-white focus:outline-none focus:border-[#c5a059]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-white/50 uppercase block mb-1">Origin / Region</label>
                <input
                  type="text"
                  value={productForm.origin}
                  onChange={(e) => setProductForm({ ...productForm, origin: e.target.value })}
                  placeholder="e.g. Mount Kenya Highlands"
                  className="w-full bg-black border border-white/10 px-3 py-2 text-white font-sans focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/50 uppercase block mb-1">Description</label>
                <textarea
                  rows={3}
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  placeholder="Tasting notes and production methodology..."
                  className="w-full bg-black border border-white/10 p-2 text-white font-sans focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="prodActive"
                  checked={productForm.isActive}
                  onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })}
                  className="rounded-none bg-black border-white/20"
                />
                <label htmlFor="prodActive" className="text-xs text-white cursor-pointer">
                  Product is Active & Publicly Listed
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#c5a059] text-black font-bold uppercase tracking-wider hover:bg-[#d6b26a]"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: Add Variant Modal --- */}
      {showVariantModalFor && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-serif text-white tracking-wider">Add Variant</h3>
              <button onClick={() => setShowVariantModalFor(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVariant} className="space-y-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/50 uppercase block mb-1">Volume *</label>
                  <input
                    type="text"
                    value={variantForm.volume}
                    onChange={(e) => setVariantForm({ ...variantForm, volume: e.target.value })}
                    placeholder="e.g. 750ml, 1L"
                    className="w-full bg-black border border-white/10 px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 uppercase block mb-1">Packaging *</label>
                  <input
                    type="text"
                    value={variantForm.packaging}
                    onChange={(e) => setVariantForm({ ...variantForm, packaging: e.target.value })}
                    placeholder="e.g. Glass Bottle, Gift Box"
                    className="w-full bg-black border border-white/10 px-3 py-2 text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/50 uppercase block mb-1">Price (KES) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={variantForm.price}
                    onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })}
                    placeholder="e.g. 2500"
                    className="w-full bg-black border border-white/10 px-3 py-2 text-emerald-400 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 uppercase block mb-1">Initial Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={variantForm.stock}
                    onChange={(e) => setVariantForm({ ...variantForm, stock: parseInt(e.target.value) || 0 })}
                    className="w-full bg-black border border-white/10 px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowVariantModalFor(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#c5a059] text-black font-bold uppercase tracking-wider hover:bg-[#d6b26a]"
                >
                  Add Variant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Delivery Zone Create / Edit Modal --- */}
      {showZoneModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-serif text-white tracking-wider">
                {editingZone ? 'Edit Delivery Zone' : 'Create Delivery Zone'}
              </h3>
              <button onClick={() => setShowZoneModal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveZone} className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-[10px] text-white/50 uppercase block mb-1">Zone Name *</label>
                <input
                  type="text"
                  value={zoneForm.name}
                  onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                  placeholder="e.g. Westlands & Kilimani"
                  className="w-full bg-black border border-white/10 px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-white/50 uppercase block mb-1">Delivery Fee (KES) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={zoneForm.fee}
                  onChange={(e) => setZoneForm({ ...zoneForm, fee: e.target.value })}
                  placeholder="e.g. 250"
                  className="w-full bg-black border border-white/10 px-3 py-2 text-emerald-400 font-bold"
                  required
                />
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="zoneActive"
                    checked={zoneForm.isActive}
                    onChange={(e) => setZoneForm({ ...zoneForm, isActive: e.target.checked })}
                    className="rounded-none bg-black"
                  />
                  <label htmlFor="zoneActive" className="text-white cursor-pointer">
                    Zone is Active
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="zoneAccepting"
                    checked={zoneForm.isAcceptingOrders}
                    onChange={(e) => setZoneForm({ ...zoneForm, isAcceptingOrders: e.target.checked })}
                    className="rounded-none bg-black"
                  />
                  <label htmlFor="zoneAccepting" className="text-white cursor-pointer">
                    Accepting Instant Orders
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowZoneModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#c5a059] text-black font-bold uppercase tracking-wider hover:bg-[#d6b26a]"
                >
                  Save Zone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 5: Price Adjustment Modal --- */}
      {editingPriceVariant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-serif text-white tracking-wider">Adjust Authoritative Price</h3>
              <button onClick={() => setEditingPriceVariant(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <div className="text-white font-bold">{editingPriceVariant.productName}</div>
              <div className="text-white/50 font-mono">{editingPriceVariant.volume} • {editingPriceVariant.packaging}</div>
            </div>

            <form onSubmit={handleUpdatePrice} className="space-y-4 font-mono text-xs">
              <div>
                <label className="text-[10px] text-white/50 uppercase block mb-1">New Price (KES) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={newPriceValue}
                  onChange={(e) => setNewPriceValue(e.target.value)}
                  className="w-full bg-black border border-white/10 px-3 py-2 text-emerald-400 font-bold text-sm focus:outline-none focus:border-[#c5a059]"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPriceVariant(null)}
                  className="px-3 py-1.5 bg-white/5 text-white uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#c5a059] text-black font-bold uppercase hover:bg-[#d6b26a]"
                >
                  Update Price
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 6: Stock Adjustment Modal --- */}
      {editingStockVariant && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-serif text-white tracking-wider">Set Inventory Stock</h3>
              <button onClick={() => setEditingStockVariant(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <div className="text-white font-bold">{editingStockVariant.productName}</div>
              <div className="text-white/50 font-mono">{editingStockVariant.volume} • {editingStockVariant.packaging}</div>
            </div>

            <form onSubmit={handleUpdateStock} className="space-y-4 font-mono text-xs">
              <div>
                <label className="text-[10px] text-white/50 uppercase block mb-1">Available Units *</label>
                <input
                  type="number"
                  min="0"
                  value={newStockValue}
                  onChange={(e) => setNewStockValue(parseInt(e.target.value) || 0)}
                  className="w-full bg-black border border-white/10 px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-[#c5a059]"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStockVariant(null)}
                  className="px-3 py-1.5 bg-white/5 text-white uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#c5a059] text-black font-bold uppercase hover:bg-[#d6b26a]"
                >
                  Save Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
