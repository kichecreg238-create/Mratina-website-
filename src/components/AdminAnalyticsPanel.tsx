import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  DollarSign,
  ShoppingBag,
  Truck,
  RotateCcw,
  CreditCard,
  Calendar,
  RefreshCw,
  TrendingUp,
  Activity,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Users,
  LifeBuoy
} from 'lucide-react';

export const AdminAnalyticsPanel: React.FC = () => {
  const { user } = useAuthStore();
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all' | 'custom'>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      params.append('range', range);
      if (range === 'custom' && startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }

      const res = await fetch(`/api/admin/analytics?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to load analytics data');
      }

      const data = await res.json();
      setAnalytics(data.analytics);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error fetching analytics report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user, range]);

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      alert('Please provide both start and end dates.');
      return;
    }
    fetchAnalytics();
  };

  const kpis = analytics?.kpis;
  const revenueTrends = analytics?.revenueTrends || [];
  const productPerformance = analytics?.productPerformance || [];
  const categoryBreakdown = analytics?.categoryBreakdown || [];
  const deliveryAnalytics = analytics?.deliveryAnalytics;
  const paymentAnalytics = analytics?.paymentAnalytics;
  const customerInsights = analytics?.customerInsights;
  const supportOverview = analytics?.supportOverview;

  // Calculate maximum revenue day for trend bar scaling
  const maxDayRevenue = Math.max(...revenueTrends.map((d: any) => d.revenue || 0), 1000);

  return (
    <div className="space-y-6">
      {/* Header & Date Range Filter Toolbar */}
      <div className="p-4 md:p-6 border border-white/10 bg-[#0d0d0d] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-serif uppercase tracking-[0.2em] text-white font-semibold">
              Executive Analytics & Revenue Intelligence
            </h2>
            <span className="text-[9px] px-2 py-0.5 bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/40 font-mono uppercase">
              AUTHORITATIVE LEDGER
            </span>
          </div>
          <p className="text-[11px] text-white/40 font-mono mt-0.5">
            {analytics?.period ? (
              <>
                Reporting Window: {analytics.period.startDate ? new Date(analytics.period.startDate).toLocaleDateString() : 'Beginning'} &mdash; {analytics.period.endDate ? new Date(analytics.period.endDate).toLocaleDateString() : 'Now'} ({analytics.period.range.toUpperCase()})
              </>
            ) : (
              'Real-time operational aggregation'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-black border border-white/10 p-0.5">
            {(['7d', '30d', '90d', 'all'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-xs font-mono tracking-wider transition-colors ${
                  range === r
                    ? 'bg-[#c5a059] text-black font-semibold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {r === 'all' ? 'ALL' : r.toUpperCase()}
              </button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-3 py-1 text-xs font-mono tracking-wider transition-colors ${
                range === 'custom'
                  ? 'bg-[#c5a059] text-black font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              CUSTOM
            </button>
          </div>

          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="p-2 border border-white/10 hover:border-white/30 text-white/70 hover:text-white bg-black transition-colors"
            title="Refresh analytics data"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#c5a059]' : ''} />
          </button>
        </div>
      </div>

      {/* Custom Date Form */}
      {range === 'custom' && (
        <form onSubmit={handleApplyCustomDates} className="p-4 border border-white/10 bg-black/60 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60 font-mono">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-[#111] border border-white/20 text-white text-xs px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#c5a059]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60 font-mono">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-[#111] border border-white/20 text-white text-xs px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#c5a059]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-[#c5a059] text-black text-xs font-mono font-semibold uppercase tracking-wider hover:bg-[#d5b069]"
          >
            Apply Filter
          </button>
        </form>
      )}

      {loading && !analytics ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/40 space-y-3 bg-[#0d0d0d] border border-white/5">
          <RefreshCw size={28} className="animate-spin text-[#c5a059]" />
          <p className="text-xs font-mono uppercase tracking-widest">Aggregating Authoritative Commerce Records...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-950/20 border border-red-500/30 text-red-400 text-xs font-mono">
          {error}
        </div>
      ) : (
        <>
          {/* Top KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Gross Revenue */}
            <div className="p-5 border border-white/10 bg-[#0d0d0d] space-y-2">
              <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                <span>Gross Revenue</span>
                <DollarSign className="w-4 h-4 text-[#c5a059]" />
              </div>
              <div className="text-2xl font-serif text-white font-light">
                KES {kpis?.grossRevenue?.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </div>
              <div className="text-[10px] text-white/40 font-mono flex items-center justify-between">
                <span>Net: KES {kpis?.netRevenue?.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span>
                <span className="text-emerald-400 font-bold">{kpis?.completedOrders || 0} Delivered</span>
              </div>
            </div>

            {/* Total Orders & Volume */}
            <div className="p-5 border border-white/10 bg-[#0d0d0d] space-y-2">
              <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                <span>Total Orders</span>
                <ShoppingBag className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-serif text-white font-light">
                {kpis?.totalOrders || 0}
              </div>
              <div className="text-[10px] text-white/40 font-mono flex items-center justify-between">
                <span>Pending: {kpis?.pendingOrders || 0}</span>
                <span className="text-red-400">Cancelled/Failed: {(kpis?.cancelledOrders || 0) + (kpis?.failedOrders || 0)}</span>
              </div>
            </div>

            {/* Average Order Value (AOV) */}
            <div className="p-5 border border-white/10 bg-[#0d0d0d] space-y-2">
              <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                <span>Avg Order Value (AOV)</span>
                <Activity className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-serif text-purple-300 font-light">
                KES {kpis?.averageOrderValue?.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </div>
              <div className="text-[10px] text-white/40 font-mono">
                Across verified successful checkout sessions
              </div>
            </div>

            {/* Refund Total & Deliveries */}
            <div className="p-5 border border-white/10 bg-[#0d0d0d] space-y-2">
              <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-mono tracking-wider">
                <span>Refunds Settled</span>
                <RotateCcw className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-serif text-white font-light flex items-baseline gap-2">
                <span>KES {kpis?.totalRefundsAmount?.toLocaleString() || '0'}</span>
                <span className="text-xs text-white/40 font-mono font-normal">
                  ({kpis?.totalRefundsCount || 0} cases)
                </span>
              </div>
              <div className="text-[10px] text-white/40 font-mono flex items-center justify-between">
                <span>Active Deliveries: {kpis?.activeDeliveries || 0}</span>
                <span className="text-[#c5a059]">{customerInsights?.totalRegistered || 0} Customers</span>
              </div>
            </div>
          </div>

          {/* Revenue Trend Visual Timeline */}
          <div className="p-5 md:p-6 border border-white/10 bg-[#0d0d0d] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-[#c5a059]" />
                <h3 className="text-xs uppercase tracking-wider font-mono text-white font-semibold">
                  Revenue & Order Trajectory
                </h3>
              </div>
              <span className="text-[10px] font-mono text-white/40">
                {revenueTrends.length} Reporting Intervals
              </span>
            </div>

            {revenueTrends.length === 0 ? (
              <div className="py-12 text-center text-xs text-white/40 font-mono">
                No revenue events recorded in selected window.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-2">
                  {revenueTrends.map((point: any) => {
                    const pct = Math.min(100, Math.max(4, Math.round((point.revenue / maxDayRevenue) * 100)));
                    return (
                      <div key={point.date} className="flex items-center gap-3 text-xs font-mono">
                        <span className="w-24 text-white/60 text-[11px] shrink-0">{point.date}</span>
                        <div className="flex-1 bg-white/5 h-6 rounded-none overflow-hidden relative flex items-center">
                          <div
                            className="bg-gradient-to-r from-[#c5a059]/40 to-[#c5a059] h-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                          <span className="absolute left-2 text-[10px] text-white font-medium drop-shadow">
                            {point.ordersCount} {point.ordersCount === 1 ? 'order' : 'orders'} &bull; KES {Number(point.revenue).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Two-Column Module: Delivery Zones & Payment Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Delivery Operations Breakdown */}
            <div className="border border-white/10 bg-[#0d0d0d] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center space-x-2">
                  <Truck className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs uppercase tracking-wider font-mono text-white font-semibold">
                    Delivery Fulfillment & Zones
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                  {deliveryAnalytics?.fulfillmentRate ?? 100}% Fulfillment Rate
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                <div className="p-3 bg-white/[0.02] border border-white/5">
                  <div className="text-white/40 text-[10px]">DELIVERED</div>
                  <div className="text-emerald-400 font-bold text-lg">{deliveryAnalytics?.deliveredCount ?? 0}</div>
                </div>
                <div className="p-3 bg-white/[0.02] border border-white/5">
                  <div className="text-white/40 text-[10px]">IN TRANSIT</div>
                  <div className="text-amber-400 font-bold text-lg">{deliveryAnalytics?.inTransitCount ?? 0}</div>
                </div>
                <div className="p-3 bg-white/[0.02] border border-white/5">
                  <div className="text-white/40 text-[10px]">FAILED</div>
                  <div className="text-red-400 font-bold text-lg">{deliveryAnalytics?.failedCount ?? 0}</div>
                </div>
              </div>

              {deliveryAnalytics?.zones && deliveryAnalytics.zones.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-[10px] font-mono text-white/40 uppercase">Zone Volume</div>
                  {deliveryAnalytics.zones.map((z: any) => (
                    <div key={z.zoneName} className="flex items-center justify-between text-xs font-mono p-2 bg-white/[0.02] border border-white/5">
                      <span className="text-white/80">{z.zoneName}</span>
                      <span className="text-[#c5a059] font-bold">{z.orderCount} orders &bull; KES {Number(z.revenue).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment Method Intelligence */}
            <div className="border border-white/10 bg-[#0d0d0d] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs uppercase tracking-wider font-mono text-white font-semibold">
                    Payment Gateway Performance
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-white/40">
                  {paymentAnalytics?.totalTransactions ?? 0} Transactions ({paymentAnalytics?.successRate ?? 100}% Success)
                </span>
              </div>

              {!paymentAnalytics?.providers || paymentAnalytics.providers.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/40 font-mono">
                  No payment events recorded.
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentAnalytics.providers.map((p: any) => (
                    <div key={p.provider} className="p-3.5 bg-white/[0.02] border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white">{p.provider}</span>
                          <span className="text-[10px] font-mono text-white/40">({p.transactionCount} transactions)</span>
                        </div>
                        <span className="text-xs font-mono text-[#c5a059] font-bold">
                          KES {Number(p.volume).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-white/50">
                        <span>Success: <strong className="text-emerald-400">{p.successCount}</strong></span>
                        <span>Failed: <strong className="text-red-400">{p.failedCount}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Product & Category Revenue Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Top Products by Volume & Revenue */}
            <div className="lg:col-span-2 border border-white/10 bg-[#0d0d0d] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-[#c5a059]" />
                  <h3 className="text-xs uppercase tracking-wider font-mono text-white font-semibold">
                    Product Sales & Stock Intelligence
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-white/40">
                  By Verified Sales Revenue
                </span>
              </div>

              {productPerformance.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/40 font-mono">
                  No product sales data available.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-white/10 text-white/40 text-[10px] uppercase">
                        <th className="py-2">Product</th>
                        <th className="py-2">Category</th>
                        <th className="py-2 text-right">Units Sold</th>
                        <th className="py-2 text-right">Total Revenue</th>
                        <th className="py-2 text-right">Remaining Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {productPerformance.map((p: any) => (
                        <tr key={p.productId} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 font-medium text-white">{p.productName}</td>
                          <td className="py-2.5 text-white/50 text-[10px]">{p.category}</td>
                          <td className="py-2.5 text-right text-blue-400 font-bold">{p.unitsSold}</td>
                          <td className="py-2.5 text-right text-[#c5a059] font-bold">
                            KES {Number(p.revenue).toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className={`px-2 py-0.5 text-[10px] ${
                              p.currentStock <= 5
                                ? 'bg-red-950/40 text-red-400 border border-red-500/30'
                                : 'text-white/60'
                            }`}>
                              {p.currentStock}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Category Performance & Customer Repeat Insights */}
            <div className="space-y-6">
              {/* Category Breakdown */}
              <div className="border border-white/10 bg-[#0d0d0d] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-xs uppercase tracking-wider font-mono text-white font-semibold">
                    Category Share
                  </h3>
                  <span className="text-[10px] font-mono text-white/40">
                    {categoryBreakdown.length} Categories
                  </span>
                </div>

                {categoryBreakdown.length === 0 ? (
                  <div className="py-8 text-center text-xs text-white/40 font-mono">
                    No category metrics recorded.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {categoryBreakdown.map((c: any) => (
                      <div key={c.category} className="space-y-1.5 p-3 bg-white/[0.02] border border-white/5">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="text-white font-semibold">{c.category}</span>
                          <span className="text-[#c5a059] font-bold">KES {Number(c.revenue).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-white/50">
                          <span>{c.unitsSold} units sold</span>
                          <span>{c.percentage}% revenue share</span>
                        </div>
                        <div className="w-full bg-white/5 h-1.5">
                          <div
                            className="h-full bg-[#c5a059] transition-all"
                            style={{ width: `${Math.min(100, c.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Retention Card */}
              <div className="border border-white/10 bg-[#0d0d0d] p-5 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-1.5 text-white font-semibold uppercase">
                    <Users size={14} className="text-[#c5a059]" />
                    <span>Customer Cohort</span>
                  </div>
                  <span className="text-[10px] text-white/40">{customerInsights?.totalRegistered ?? 0} Registered</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Active Ordering:</span>
                  <span className="text-white font-bold">{customerInsights?.activeOrderingCustomers ?? 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Repeat Buyers:</span>
                  <span className="text-emerald-400 font-bold">{customerInsights?.repeatCustomers ?? 0} ({customerInsights?.repeatRate ?? 0}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Support Inquiries:</span>
                  <span className="text-purple-400 font-bold">{supportOverview?.totalTickets ?? 0} ({supportOverview?.resolutionRate ?? 100}% Resolved)</span>
                </div>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};
