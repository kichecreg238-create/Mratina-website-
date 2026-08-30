import { db } from '../db/index.ts';
import {
  orders,
  orderItems,
  variants,
  products,
  payments,
  refundRequests,
  deliveries,
  users,
  supportTickets,
  deliveryZones,
  productViews,
  reviews,
} from '../db/schema.ts';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';

export interface AnalyticsDateFilter {
  range?: '7d' | '30d' | '90d' | 'all' | 'custom';
  startDate?: string;
  endDate?: string;
}

export interface ProductPerformanceItem {
  productId: number;
  productName: string;
  category: string;
  views: number;
  distinctOrdersCount: number;
  unitsSold: number;
  revenue: number;
  conversionRate: number; // Definition: (distinctOrdersCount / views) * 100
  averageRating: number | null;
  approvedReviewCount: number;
  currentStock: number;
}

export interface DelivererPerformanceItem {
  delivererId: number;
  delivererEmail: string;
  assignedDeliveries: number;
  completedDeliveries: number;
  failedDeliveries: number;
  activeDeliveries: number;
  completionRate: number;
  averageDeliveryMinutes: number | null;
}

export interface AnalyticsSummary {
  period: {
    range: string;
    startDate: string | null;
    endDate: string | null;
  };
  kpis: {
    grossRevenue: number;
    netRevenue: number;
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    failedOrders: number;
    pendingOrders: number;
    averageOrderValue: number;
    totalRefundsAmount: number;
    totalRefundsCount: number;
    activeDeliveries: number;
    totalCustomers: number;
  };
  revenueTrends: Array<{
    date: string;
    revenue: number;
    ordersCount: number;
    completedCount: number;
  }>;
  productPerformance: ProductPerformanceItem[];
  categoryBreakdown: Array<{
    category: string;
    unitsSold: number;
    revenue: number;
    percentage: number;
  }>;
  deliveryAnalytics: {
    totalDeliveries: number;
    deliveredCount: number;
    failedCount: number;
    inTransitCount: number;
    fulfillmentRate: number;
    averageDeliveryMinutes: number | null;
    averageDeliveryTimeFormatted: string;
    zones: Array<{
      zoneName: string;
      orderCount: number;
      revenue: number;
    }>;
    delivererPerformance: DelivererPerformanceItem[];
  };
  paymentAnalytics: {
    totalTransactions: number;
    successRate: number;
    providers: Array<{
      provider: string;
      transactionCount: number;
      volume: number;
      successCount: number;
      failedCount: number;
    }>;
  };
  customerInsights: {
    totalRegistered: number;
    activeOrderingCustomers: number;
    repeatCustomers: number;
    repeatRate: number;
  };
  supportOverview: {
    totalTickets: number;
    openTickets: number;
    resolvedTickets: number;
    resolutionRate: number;
    categoryBreakdown: Array<{
      category: string;
      count: number;
    }>;
  };
}

export class AnalyticsService {
  /**
   * Resolves date boundary timestamps from filter inputs safely server-side.
   */
  private resolveDateBoundaries(filter: AnalyticsDateFilter): { start: Date | null; end: Date | null; label: string } {
    const range = filter.range || '30d';
    const now = new Date();

    if (range === '7d') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { start, end: now, label: 'Last 7 Days' };
    }

    if (range === '30d') {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return { start, end: now, label: 'Last 30 Days' };
    }

    if (range === '90d') {
      const start = new Date(now);
      start.setDate(now.getDate() - 90);
      return { start, end: now, label: 'Last 90 Days' };
    }

    if (range === 'custom' && filter.startDate) {
      const parsedStart = new Date(filter.startDate);
      const parsedEnd = filter.endDate ? new Date(filter.endDate) : now;
      if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
        // Set end of day for endDate
        parsedEnd.setHours(23, 59, 59, 999);
        return {
          start: parsedStart,
          end: parsedEnd,
          label: `${parsedStart.toISOString().split('T')[0]} to ${parsedEnd.toISOString().split('T')[0]}`,
        };
      }
    }

    // Default: All Time
    return { start: null, end: null, label: 'All Time' };
  }

  /**
   * Records a product view event in the database.
   */
  async recordProductView(params: { productId: number; sessionId?: string; userId?: number }) {
    try {
      const { productId, sessionId, userId } = params;

      // Ensure product exists
      const prodRes = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
      if (prodRes.length === 0) return null;

      // Throttle: Don't record multiple views from the same session/user within 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentViews = await db.select({ id: productViews.id })
        .from(productViews)
        .where(
          and(
            eq(productViews.productId, productId),
            sessionId ? eq(productViews.sessionId, sessionId) : undefined,
            userId ? eq(productViews.userId, userId) : undefined,
            gte(productViews.createdAt, tenMinutesAgo)
          )
        )
        .limit(1);

      if (recentViews.length > 0) {
        return null; // Throttled
      }

      const [view] = await db.insert(productViews).values({
        productId,
        sessionId: sessionId || null,
        userId: userId || null,
      }).returning();

      return view;
    } catch (err) {
      console.error('[AnalyticsService] Failed to record product view:', err);
      return null;
    }
  }

  /**
   * Computes authoritative analytics from persisted relational data.
   */
  async getAnalytics(filter: AnalyticsDateFilter = {}): Promise<AnalyticsSummary> {
    const { start, end, label } = this.resolveDateBoundaries(filter);

    // 1. Fetch Orders within date range
    let allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));

    if (start && end) {
      allOrders = allOrders.filter(o => {
        if (!o.createdAt) return false;
        const d = new Date(o.createdAt);
        return d >= start && d <= end;
      });
    }

    // 2. Fetch all Order Items for relevant orders
    const orderIds = allOrders.map(o => o.id);
    let allOrderItems: any[] = [];
    if (orderIds.length > 0) {
      allOrderItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));
    }

    // 3. Fetch Catalogue Products and Variants
    const allProducts = await db.select().from(products);
    const allVariants = await db.select().from(variants);

    // Map for quick product/variant lookup
    const variantMap = new Map(allVariants.map(v => [v.id, v]));
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    // 4. Fetch Payments
    let allPayments = await db.select().from(payments);
    if (start && end) {
      allPayments = allPayments.filter(p => {
        if (!p.createdAt) return false;
        const d = new Date(p.createdAt);
        return d >= start && d <= end;
      });
    }

    // 5. Fetch Refunds
    let allRefunds = await db.select().from(refundRequests);
    if (start && end) {
      allRefunds = allRefunds.filter(r => {
        if (!r.createdAt) return false;
        const d = new Date(r.createdAt);
        return d >= start && d <= end;
      });
    }

    // 6. Fetch Deliveries
    let allDeliveries = await db.select().from(deliveries);
    if (start && end) {
      allDeliveries = allDeliveries.filter(d => {
        if (!d.createdAt) return false;
        const dDate = new Date(d.createdAt);
        return dDate >= start && dDate <= end;
      });
    }

    // 7. Fetch Product Views
    let allProductViews: any[] = [];
    try {
      allProductViews = await db.select().from(productViews);
      if (start && end) {
        allProductViews = allProductViews.filter(v => {
          if (!v.createdAt) return false;
          const vDate = new Date(v.createdAt);
          return vDate >= start && vDate <= end;
        });
      }
    } catch (err) {
      console.warn('[AnalyticsService] productViews query error or table initializing:', err);
    }

    // 8. Fetch Approved Reviews (Module 18 source of truth)
    const approvedReviews = await db.select().from(reviews).where(eq(reviews.isApproved, true));

    // 9. Fetch Users & Support Tickets
    const allUsers = await db.select().from(users);
    let allTickets = await db.select().from(supportTickets);
    if (start && end) {
      allTickets = allTickets.filter(t => {
        if (!t.createdAt) return false;
        const d = new Date(t.createdAt);
        return d >= start && d <= end;
      });
    }

    // --- KPI CALCULATIONS ---
    const totalOrders = allOrders.length;
    const completedOrders = allOrders.filter(o => o.status === 'DELIVERED').length;
    const cancelledOrders = allOrders.filter(o => o.status === 'CANCELLED').length;
    const failedOrders = allOrders.filter(o => o.status === 'FAILED').length;
    const pendingOrders = allOrders.filter(o => o.status === 'PENDING').length;

    // Gross Revenue from orders with SUCCESS payment state
    const successfulOrders = allOrders.filter(o => o.paymentState === 'SUCCESS');
    const grossRevenue = successfulOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    // Completed / Approved Refunds Amount
    const completedRefunds = allRefunds.filter(r => ['APPROVED', 'COMPLETED'].includes(r.status));
    const totalRefundsAmount = completedRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const netRevenue = Math.max(0, grossRevenue - totalRefundsAmount);

    const averageOrderValue = successfulOrders.length > 0
      ? grossRevenue / successfulOrders.length
      : 0;

    const activeDeliveries = allDeliveries.filter(d =>
      ['ASSIGNED', 'ACCEPTED', 'PICKUP_READY', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(d.status)
    ).length;

    // --- DAILY REVENUE TRENDS ---
    const dailyMap = new Map<string, { revenue: number; ordersCount: number; completedCount: number }>();

    for (const order of allOrders) {
      if (!order.createdAt) continue;
      const dateKey = new Date(order.createdAt).toISOString().split('T')[0];
      const entry = dailyMap.get(dateKey) || { revenue: 0, ordersCount: 0, completedCount: 0 };
      entry.ordersCount += 1;
      if (order.paymentState === 'SUCCESS') {
        entry.revenue += Number(order.totalAmount || 0);
      }
      if (order.status === 'DELIVERED') {
        entry.completedCount += 1;
      }
      dailyMap.set(dateKey, entry);
    }

    const revenueTrends = Array.from(dailyMap.entries())
      .map(([date, val]) => ({
        date,
        revenue: Number(val.revenue.toFixed(2)),
        ordersCount: val.ordersCount,
        completedCount: val.completedCount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // --- PRODUCT & CATEGORY PERFORMANCE WITH VIEWS & CONVERSION ---
    const productStatsMap = new Map<number, { unitsSold: number; revenue: number; distinctOrderIds: Set<number> }>();
    const categoryStatsMap = new Map<string, { unitsSold: number; revenue: number }>();

    for (const item of allOrderItems) {
      const variant = variantMap.get(item.variantId);
      if (!variant) continue;
      const product = productMap.get(variant.productId);
      if (!product) continue;

      const units = item.quantity;
      const lineRevenue = units * Number(item.priceAtPurchase || variant.price);

      // Product grouping
      const pStats = productStatsMap.get(product.id) || { unitsSold: 0, revenue: 0, distinctOrderIds: new Set<number>() };
      pStats.unitsSold += units;
      pStats.revenue += lineRevenue;
      pStats.distinctOrderIds.add(item.orderId);
      productStatsMap.set(product.id, pStats);

      // Category grouping
      const catKey = product.category || 'OTHER';
      const cStats = categoryStatsMap.get(catKey) || { unitsSold: 0, revenue: 0 };
      cStats.unitsSold += units;
      cStats.revenue += lineRevenue;
      categoryStatsMap.set(catKey, cStats);
    }

    // Aggregate Product Views
    const productViewCountMap = new Map<number, number>();
    for (const pv of allProductViews) {
      productViewCountMap.set(pv.productId, (productViewCountMap.get(pv.productId) || 0) + 1);
    }

    // Aggregate Approved Reviews per product
    const productReviewsMap = new Map<number, { count: number; totalRating: number }>();
    for (const rev of approvedReviews) {
      const entry = productReviewsMap.get(rev.productId) || { count: 0, totalRating: 0 };
      entry.count += 1;
      entry.totalRating += rev.rating;
      productReviewsMap.set(rev.productId, entry);
    }

    const productPerformance: ProductPerformanceItem[] = allProducts
      .map(prod => {
        const stats = productStatsMap.get(prod.id) || { unitsSold: 0, revenue: 0, distinctOrderIds: new Set<number>() };
        const relatedVariants = allVariants.filter(v => v.productId === prod.id);
        const totalStock = relatedVariants.reduce((sum, v) => sum + v.stock, 0);
        const views = productViewCountMap.get(prod.id) || 0;
        const distinctOrders = stats.distinctOrderIds.size;

        /**
         * Conversion Rate Definition:
         * (Distinct Orders Containing Product / Recorded Views) * 100
         * If views > 0, returns the calculated percentage.
         * If views === 0 but orders exist, conversion is 100%.
         * Otherwise returns 0.
         */
        const conversionRate = views > 0
          ? Number(((distinctOrders / views) * 100).toFixed(1))
          : distinctOrders > 0 ? 100 : 0;

        const revData = productReviewsMap.get(prod.id);
        const averageRating = revData && revData.count > 0
          ? Number((revData.totalRating / revData.count).toFixed(1))
          : null;

        return {
          productId: prod.id,
          productName: prod.name,
          category: prod.category || 'OTHER',
          views,
          distinctOrdersCount: distinctOrders,
          unitsSold: stats.unitsSold,
          revenue: Number(stats.revenue.toFixed(2)),
          conversionRate,
          averageRating,
          approvedReviewCount: revData ? revData.count : 0,
          currentStock: totalStock,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const totalCategoryRevenue = Array.from(categoryStatsMap.values()).reduce((sum, c) => sum + c.revenue, 0);
    const categoryBreakdown = Array.from(categoryStatsMap.entries())
      .map(([category, stats]) => ({
        category,
        unitsSold: stats.unitsSold,
        revenue: Number(stats.revenue.toFixed(2)),
        percentage: totalCategoryRevenue > 0 ? Number(((stats.revenue / totalCategoryRevenue) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // --- DELIVERY & ZONE PERFORMANCE & AVERAGE DELIVERY TIME ---
    const zoneMap = new Map<string, { orderCount: number; revenue: number }>();
    for (const order of allOrders) {
      const zName = order.deliveryZone || 'Standard Kakamega';
      const zEntry = zoneMap.get(zName) || { orderCount: 0, revenue: 0 };
      zEntry.orderCount += 1;
      if (order.paymentState === 'SUCCESS') {
        zEntry.revenue += Number(order.totalAmount || 0);
      }
      zoneMap.set(zName, zEntry);
    }

    const deliveredDeliveries = allDeliveries.filter(d => d.status === 'DELIVERED');
    const failedDeliveries = allDeliveries.filter(d => d.status === 'FAILED').length;
    const inTransitDeliveries = allDeliveries.filter(d => ['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(d.status)).length;
    const totalDeliveries = allDeliveries.length;
    const fulfillmentRate = totalDeliveries > 0
      ? Number(((deliveredDeliveries.length / totalDeliveries) * 100).toFixed(1))
      : 100;

    // Calculate Average Delivery Time from authoritative timestamps
    let totalDeliveryDurationMinutes = 0;
    let validDeliveryTimestampCount = 0;

    for (const d of deliveredDeliveries) {
      if (d.deliveredAt) {
        const startTs = d.pickedUpAt || d.outForDeliveryAt || d.acceptedAt || d.assignedAt || d.createdAt;
        if (startTs) {
          const duration = (new Date(d.deliveredAt).getTime() - new Date(startTs).getTime()) / (1000 * 60);
          if (duration > 0 && duration < 10080) { // Filter unrealistic outliers (> 7 days)
            totalDeliveryDurationMinutes += duration;
            validDeliveryTimestampCount += 1;
          }
        }
      }
    }

    const averageDeliveryMinutes = validDeliveryTimestampCount > 0
      ? Math.round(totalDeliveryDurationMinutes / validDeliveryTimestampCount)
      : null;

    const averageDeliveryTimeFormatted = averageDeliveryMinutes !== null
      ? (averageDeliveryMinutes >= 60
          ? `${Math.floor(averageDeliveryMinutes / 60)}h ${averageDeliveryMinutes % 60}m`
          : `${averageDeliveryMinutes} mins`)
      : 'Unavailable (Pending delivered runs)';

    const deliveryZonesData = Array.from(zoneMap.entries())
      .map(([zoneName, stats]) => ({
        zoneName,
        orderCount: stats.orderCount,
        revenue: Number(stats.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.orderCount - a.orderCount);

    // --- DELIVERER PERFORMANCE BREAKDOWN ---
    const delivererUsers = allUsers.filter(u => u.role === 'DELIVERER');
    const delivererDeliveriesMap = new Map<number, typeof allDeliveries>();

    for (const d of allDeliveries) {
      if (d.delivererId) {
        const list = delivererDeliveriesMap.get(d.delivererId) || [];
        list.push(d);
        delivererDeliveriesMap.set(d.delivererId, list);
      }
    }

    const delivererPerformance: DelivererPerformanceItem[] = delivererUsers.map(u => {
      const userDeliveries = delivererDeliveriesMap.get(u.id) || [];
      const assigned = userDeliveries.length;
      const completed = userDeliveries.filter(d => d.status === 'DELIVERED').length;
      const failed = userDeliveries.filter(d => d.status === 'FAILED').length;
      const active = userDeliveries.filter(d => ['ASSIGNED', 'ACCEPTED', 'PICKUP_READY', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(d.status)).length;
      const compRate = assigned > 0 ? Number(((completed / assigned) * 100).toFixed(1)) : 100;

      // Deliverer-specific average delivery duration
      let userTotalDuration = 0;
      let userValidCount = 0;
      for (const d of userDeliveries.filter(d => d.status === 'DELIVERED')) {
        if (d.deliveredAt) {
          const sTime = d.pickedUpAt || d.outForDeliveryAt || d.acceptedAt || d.assignedAt || d.createdAt;
          if (sTime) {
            const dur = (new Date(d.deliveredAt).getTime() - new Date(sTime).getTime()) / (1000 * 60);
            if (dur > 0 && dur < 10080) {
              userTotalDuration += dur;
              userValidCount += 1;
            }
          }
        }
      }

      const avgDur = userValidCount > 0 ? Math.round(userTotalDuration / userValidCount) : null;

      return {
        delivererId: u.id,
        delivererEmail: u.email,
        assignedDeliveries: assigned,
        completedDeliveries: completed,
        failedDeliveries: failed,
        activeDeliveries: active,
        completionRate: compRate,
        averageDeliveryMinutes: avgDur,
      };
    }).sort((a, b) => b.completedDeliveries - a.completedDeliveries);

    // --- PAYMENT PROVIDERS ANALYTICS ---
    const providerMap = new Map<string, { transactionCount: number; volume: number; successCount: number; failedCount: number }>();

    for (const p of allPayments) {
      const pName = p.provider || 'M-PESA';
      const pEntry = providerMap.get(pName) || { transactionCount: 0, volume: 0, successCount: 0, failedCount: 0 };
      pEntry.transactionCount += 1;
      pEntry.volume += Number(p.amount || 0);
      if (p.status === 'SUCCESS') {
        pEntry.successCount += 1;
      } else if (p.status === 'FAILED') {
        pEntry.failedCount += 1;
      }
      providerMap.set(pName, pEntry);
    }

    const successfulPaymentsCount = allPayments.filter(p => p.status === 'SUCCESS').length;
    const paymentSuccessRate = allPayments.length > 0
      ? Number(((successfulPaymentsCount / allPayments.length) * 100).toFixed(1))
      : 100;

    const paymentProviders = Array.from(providerMap.entries()).map(([provider, stats]) => ({
      provider,
      transactionCount: stats.transactionCount,
      volume: Number(stats.volume.toFixed(2)),
      successCount: stats.successCount,
      failedCount: stats.failedCount,
    }));

    // --- CUSTOMER INSIGHTS ---
    const customerOrderCountMap = new Map<number, number>();
    for (const o of allOrders) {
      customerOrderCountMap.set(o.userId, (customerOrderCountMap.get(o.userId) || 0) + 1);
    }

    const activeOrderingCustomers = customerOrderCountMap.size;
    const repeatCustomers = Array.from(customerOrderCountMap.values()).filter(c => c > 1).length;
    const repeatRate = activeOrderingCustomers > 0
      ? Number(((repeatCustomers / activeOrderingCustomers) * 100).toFixed(1))
      : 0;

    // --- SUPPORT TICKETS OVERVIEW ---
    const openTickets = allTickets.filter(t => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length;
    const resolvedTickets = allTickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status)).length;
    const supportCategoryMap = new Map<string, number>();

    for (const ticket of allTickets) {
      const cat = ticket.category || 'OTHER';
      supportCategoryMap.set(cat, (supportCategoryMap.get(cat) || 0) + 1);
    }

    const supportCategoryBreakdown = Array.from(supportCategoryMap.entries()).map(([category, count]) => ({
      category,
      count,
    }));

    return {
      period: {
        range: label,
        startDate: start ? start.toISOString() : null,
        endDate: end ? end.toISOString() : null,
      },
      kpis: {
        grossRevenue: Number(grossRevenue.toFixed(2)),
        netRevenue: Number(netRevenue.toFixed(2)),
        totalOrders,
        completedOrders,
        cancelledOrders,
        failedOrders,
        pendingOrders,
        averageOrderValue: Number(averageOrderValue.toFixed(2)),
        totalRefundsAmount: Number(totalRefundsAmount.toFixed(2)),
        totalRefundsCount: completedRefunds.length,
        activeDeliveries,
        totalCustomers: allUsers.filter(u => u.role === 'CUSTOMER').length,
      },
      revenueTrends,
      productPerformance,
      categoryBreakdown,
      deliveryAnalytics: {
        totalDeliveries,
        deliveredCount: deliveredDeliveries.length,
        failedCount: failedDeliveries,
        inTransitCount: inTransitDeliveries,
        fulfillmentRate,
        averageDeliveryMinutes,
        averageDeliveryTimeFormatted,
        zones: deliveryZonesData,
        delivererPerformance,
      },
      paymentAnalytics: {
        totalTransactions: allPayments.length,
        successRate: paymentSuccessRate,
        providers: paymentProviders,
      },
      customerInsights: {
        totalRegistered: allUsers.length,
        activeOrderingCustomers,
        repeatCustomers,
        repeatRate,
      },
      supportOverview: {
        totalTickets: allTickets.length,
        openTickets,
        resolvedTickets,
        resolutionRate: allTickets.length > 0
          ? Number(((resolvedTickets / allTickets.length) * 100).toFixed(1))
          : 100,
        categoryBreakdown: supportCategoryBreakdown,
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
