import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, requireRole, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser, getUserByUid } from "./src/db/users.ts";
import { getActiveProducts, createOrder } from "./src/db/commerce.ts";
import { db } from "./src/db/index.ts";
import { orders, products, variants, users, orderItems, reviews, deliveryZones, deliveries, payments, orderAuditLogs } from "./src/db/schema.ts";
import { eq, desc, inArray, and, or, ilike, sql } from "drizzle-orm";
import { paymentService, isValidProvider } from "./src/services/payment.ts";
import { orderOperationsService, OrderStatus } from "./src/services/orderOperations.ts";
import { cmsService } from "./src/services/cmsService.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Auth sync
  app.post("/api/auth/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { uid, email } = req.user!;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await getOrCreateUser(uid, email);
      res.json({ success: true, user });
    } catch (error: any) {
      console.error("Auth sync failed:", error);
      res.status(500).json({ error: error.message || "Failed to sync user" });
    }
  });

  // Get current user profile
  app.get("/api/users/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getUserByUid(req.user!.uid);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ user });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  // Get products (Public)
  app.get("/api/products", async (req, res) => {
    try {
      const activeProducts = await getActiveProducts();
      res.json({ products: activeProducts });
    } catch (error: any) {
      console.error("Failed to fetch products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  // Create order (Customer)
  app.post("/api/orders", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { items, deliveryAddress, deliveryZoneId, deliveryInstructions, landmark } = req.body;
      if (!items || !items.length || !deliveryAddress || !deliveryZoneId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const user = await getUserByUid(req.user!.uid);
      if (!user) {
        return res.status(404).json({ error: "User not found in DB" });
      }

      const order = await createOrder(user.id, items, deliveryAddress, Number(deliveryZoneId), deliveryInstructions, landmark);
      res.json({ success: true, order });
    } catch (error: any) {
      console.error("Order creation failed:", error);
      res.status(400).json({ error: error.message || "Failed to create order" });
    }
  });

  // Get active delivery zones (Public)
  app.get("/api/delivery-zones", async (req, res) => {
    try {
      const activeZones = await db.select().from(deliveryZones).where(eq(deliveryZones.isActive, true));
      res.json({ zones: activeZones });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch delivery zones" });
    }
  });

  // Serviceability Check (Public/Customer)
  app.post("/api/serviceability/check", async (req, res) => {
    try {
      const { zoneId } = req.body;
      if (!zoneId) {
        return res.status(400).json({ error: "Missing zoneId" });
      }
      
      const zoneRes = await db.select().from(deliveryZones).where(eq(deliveryZones.id, Number(zoneId)));
      const zone = zoneRes[0];
      
      if (!zone) {
        return res.status(404).json({ error: "Delivery zone not found" });
      }
      
      res.json({
        isServiceable: zone.isActive,
        fee: zone.fee,
        isAcceptingOrders: zone.isAcceptingOrders,
        zoneName: zone.name
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Serviceability check failed" });
    }
  });

  // Get User Order History
  app.get("/api/orders/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getUserByUid(req.user!.uid);
      const userOrders = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt));
      
      const orderIds = userOrders.map(o => o.id);
      let items: any[] = [];
      let deliveryRecords: any[] = [];
      let paymentRecords: any[] = [];
      if (orderIds.length > 0) {
        items = await db.select({
          orderId: orderItems.orderId,
          quantity: orderItems.quantity,
          priceAtPurchase: orderItems.priceAtPurchase,
          variant: variants,
          product: products
        })
        .from(orderItems)
        .leftJoin(variants, eq(orderItems.variantId, variants.id))
        .leftJoin(products, eq(variants.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

        deliveryRecords = await db.select().from(deliveries).where(inArray(deliveries.orderId, orderIds));
        paymentRecords = await db.select().from(payments).where(inArray(payments.orderId, orderIds)).orderBy(desc(payments.createdAt));
      }

      const ordersWithItems = userOrders.map(order => ({
        ...order,
        items: items.filter(i => i.orderId === order.id),
        delivery: deliveryRecords.find(d => d.orderId === order.id) || null,
        payments: paymentRecords.filter(p => p.orderId === order.id)
      }));

      res.json({ orders: ordersWithItems });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // Get Single Order (Customer / Admin - Enforces Ownership)
  app.get("/api/orders/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const user = await getUserByUid(req.user!.uid);
      if (!user) return res.status(404).json({ error: "User not found" });

      const orderDetails = await orderOperationsService.getOrderById(orderId, user);
      if (!orderDetails) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json({ order: orderDetails });
    } catch (error: any) {
      console.error("Fetch order failed:", error);
      if (error.message?.includes("Unauthorized")) {
        return res.status(403).json({ error: "Unauthorized access to order" });
      }
      res.status(500).json({ error: error.message || "Failed to fetch order" });
    }
  });

  // Cancel Order by Customer
  app.post("/api/orders/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const { reason } = req.body;
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: "A cancellation reason is required" });
      }

      const user = await getUserByUid(req.user!.uid);
      if (!user) return res.status(404).json({ error: "User not found" });

      const updatedOrder = await orderOperationsService.cancelOrderByCustomer({
        orderId,
        userId: user.id,
        reason: reason.trim()
      });

      res.json({ success: true, order: updatedOrder });
    } catch (error: any) {
      console.error("Cancel order failed:", error);
      res.status(400).json({ error: error.message || "Failed to cancel order" });
    }
  });

  // --- ADMIN DELIVERY ZONES ---
  app.get("/api/admin/delivery-zones", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const allZones = await db.select().from(deliveryZones).orderBy(deliveryZones.id);
      res.json({ zones: allZones });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch delivery zones" });
    }
  });

  app.post("/api/admin/delivery-zones", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const { name, fee, isActive, isAcceptingOrders } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Zone name is required" });
      }
      
      const numericFee = Number(fee);
      if (isNaN(numericFee) || numericFee < 0) {
        return res.status(400).json({ error: "Fee must be a valid non-negative number" });
      }
      
      const [newZone] = await db.insert(deliveryZones).values({
        name: name.trim(),
        fee: numericFee.toString(),
        isActive: Boolean(isActive),
        isAcceptingOrders: Boolean(isAcceptingOrders)
      }).returning();
      
      res.json({ success: true, zone: newZone });
    } catch (error: any) {
      console.error(error);
      if (error.code === '23505') { // Postgres unique violation
        return res.status(400).json({ error: "A zone with this name already exists" });
      }
      res.status(500).json({ error: "Failed to create delivery zone" });
    }
  });

  app.put("/api/admin/delivery-zones/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const zoneId = parseInt(req.params.id);
      if (isNaN(zoneId)) return res.status(400).json({ error: "Invalid zone ID" });
      
      const { name, fee, isActive, isAcceptingOrders } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Zone name is required" });
      }
      
      const numericFee = Number(fee);
      if (isNaN(numericFee) || numericFee < 0) {
        return res.status(400).json({ error: "Fee must be a valid non-negative number" });
      }
      
      const [updatedZone] = await db.update(deliveryZones)
        .set({
          name: name.trim(),
          fee: numericFee.toString(),
          isActive: Boolean(isActive),
          isAcceptingOrders: Boolean(isAcceptingOrders),
          updatedAt: new Date()
        })
        .where(eq(deliveryZones.id, zoneId))
        .returning();
        
      if (!updatedZone) {
        return res.status(404).json({ error: "Delivery zone not found" });
      }
      
      res.json({ success: true, zone: updatedZone });
    } catch (error: any) {
      console.error(error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "A zone with this name already exists" });
      }
      res.status(500).json({ error: "Failed to update delivery zone" });
    }
  });

  // --- ADMIN APIs ---
  app.get("/api/admin/orders", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const { status, paymentState, delivererId, search } = req.query;

      let allOrders = await db.select({
        order: orders,
        customerEmail: users.email
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .orderBy(desc(orders.createdAt));

      if (status && typeof status === 'string') {
        allOrders = allOrders.filter(row => row.order.status === status);
      }
      if (paymentState && typeof paymentState === 'string') {
        allOrders = allOrders.filter(row => row.order.paymentState === paymentState);
      }
      if (delivererId && typeof delivererId === 'string') {
        allOrders = allOrders.filter(row => row.order.delivererId === parseInt(delivererId));
      }
      if (search && typeof search === 'string' && search.trim().length > 0) {
        const query = search.trim().toLowerCase();
        allOrders = allOrders.filter(row => 
          row.order.id.toString().includes(query) ||
          (row.customerEmail && row.customerEmail.toLowerCase().includes(query)) ||
          (row.order.deliveryAddress && row.order.deliveryAddress.toLowerCase().includes(query)) ||
          (row.order.deliveryZone && row.order.deliveryZone.toLowerCase().includes(query)) ||
          (row.order.landmark && row.order.landmark.toLowerCase().includes(query))
        );
      }
      
      const orderIds = allOrders.map(o => o.order.id);
      let items: any[] = [];
      let deliveryRecords: any[] = [];
      let paymentRecords: any[] = [];
      if (orderIds.length > 0) {
        items = await db.select({
          orderId: orderItems.orderId,
          quantity: orderItems.quantity,
          priceAtPurchase: orderItems.priceAtPurchase,
          variant: variants,
          product: products
        })
        .from(orderItems)
        .leftJoin(variants, eq(orderItems.variantId, variants.id))
        .leftJoin(products, eq(variants.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));

        deliveryRecords = await db.select().from(deliveries).where(inArray(deliveries.orderId, orderIds));
        paymentRecords = await db.select().from(payments).where(inArray(payments.orderId, orderIds)).orderBy(desc(payments.createdAt));
      }

      const ordersWithItems = allOrders.map(({ order, customerEmail }) => ({
        ...order,
        customerEmail,
        items: items.filter(i => i.orderId === order.id),
        delivery: deliveryRecords.find(d => d.orderId === order.id) || null,
        payments: paymentRecords.filter(p => p.orderId === order.id)
      }));

      res.json({ orders: ordersWithItems });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Get Deep Order Details (Admin)
  app.get("/api/admin/orders/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const user = await getUserByUid(req.user!.uid);
      const orderDetails = await orderOperationsService.getOrderById(orderId, user);
      if (!orderDetails) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json({ order: orderDetails });
    } catch (error: any) {
      console.error("Admin fetch order details failed:", error);
      res.status(500).json({ error: error.message || "Failed to fetch order details" });
    }
  });

  // Authoritative Order Status Transition (Admin)
  app.post("/api/admin/orders/:id/order-status", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const { status, reason, metadata } = req.body;
      if (!status) return res.status(400).json({ error: "New status is required" });

      const user = await getUserByUid(req.user!.uid);
      const updatedOrder = await orderOperationsService.transitionOrderStatus({
        orderId,
        newStatus: status as OrderStatus,
        actor: user,
        reason,
        metadata
      });

      res.json({ success: true, order: updatedOrder });
    } catch (error: any) {
      console.error("Order status transition failed:", error);
      res.status(400).json({ error: error.message || "Failed to transition order status" });
    }
  });

  // Record Operational Exception / Note (Admin)
  app.post("/api/admin/orders/:id/exception", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const { exceptionType, details, actionTaken } = req.body;
      if (!exceptionType || !details) {
        return res.status(400).json({ error: "Exception type and details are required" });
      }

      const user = await getUserByUid(req.user!.uid);
      const audit = await orderOperationsService.recordOrderException({
        orderId,
        actor: user,
        exceptionType,
        details,
        actionTaken
      });

      res.json({ success: true, audit });
    } catch (error: any) {
      console.error("Record exception failed:", error);
      res.status(400).json({ error: error.message || "Failed to record exception" });
    }
  });

  // Admin Cancel Order
  app.post("/api/admin/orders/:id/cancel", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const { reason } = req.body;
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: "A cancellation reason is required" });
      }

      const user = await getUserByUid(req.user!.uid);
      const updatedOrder = await orderOperationsService.transitionOrderStatus({
        orderId,
        newStatus: 'CANCELLED',
        actor: user,
        reason: reason.trim(),
        metadata: { initiatedBy: 'ADMIN_OVERRIDE' }
      });

      res.json({ success: true, order: updatedOrder });
    } catch (error: any) {
      console.error("Admin cancel failed:", error);
      res.status(400).json({ error: error.message || "Failed to cancel order" });
    }
  });

  app.get("/api/admin/deliverers", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const allDeliverers = await db.select().from(users).where(eq(users.role, 'DELIVERER'));
      res.json({ deliverers: allDeliverers });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch deliverers" });
    }
  });

  app.get("/api/admin/users", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      res.json({ users: allUsers });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:id/role", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });
      const { role } = req.body;
      const validRoles = ['CUSTOMER', 'ADMIN', 'DELIVERER'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role specified" });
      }
      await db.update(users).set({ role }).where(eq(users.id, userId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  app.post("/api/admin/deliverers/:id/availability", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const delivererId = parseInt(req.params.id);
      if (isNaN(delivererId)) return res.status(400).json({ error: "Invalid deliverer ID" });
      const { isAvailable } = req.body;
      await db.update(users).set({ isAvailable: Boolean(isAvailable) }).where(and(eq(users.id, delivererId), eq(users.role, 'DELIVERER')));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update deliverer availability" });
    }
  });

  // --- ADMIN OVERVIEW API ---
  app.get("/api/admin/overview", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const allOrders = await db.select().from(orders);
      const allVariants = await db.select({
        variant: variants,
        product: products
      })
      .from(variants)
      .leftJoin(products, eq(variants.productId, products.id));
      
      const allDeliverers = await db.select().from(users).where(eq(users.role, 'DELIVERER'));
      const activeDeliveriesList = await db.select().from(deliveries).where(inArray(deliveries.status, ['ASSIGNED', 'ACCEPTED', 'PICKUP_READY', 'PICKED_UP', 'OUT_FOR_DELIVERY']));
      
      const totalOrders = allOrders.length;
      const pendingOrders = allOrders.filter(o => o.status === 'PENDING').length;
      const activeOrders = allOrders.filter(o => ['CONFIRMED', 'PROCESSING', 'PICKUP_READY', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
      const deliveredOrders = allOrders.filter(o => o.status === 'DELIVERED').length;
      const cancelledOrders = allOrders.filter(o => o.status === 'CANCELLED').length;
      const failedOrders = allOrders.filter(o => o.status === 'FAILED').length;

      // Calculate total revenue from SUCCESS payments
      const totalRevenue = allOrders
        .filter(o => o.paymentState === 'SUCCESS')
        .reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

      // Payment states breakdown
      const paymentStats = {
        SUCCESS: allOrders.filter(o => o.paymentState === 'SUCCESS').length,
        PENDING: allOrders.filter(o => o.paymentState === 'PENDING').length,
        INITIATED: allOrders.filter(o => o.paymentState === 'INITIATED').length,
        FAILED: allOrders.filter(o => o.paymentState === 'FAILED').length,
        REFUNDED: allOrders.filter(o => o.paymentState === 'REFUNDED').length,
      };

      // Deliverer capacity
      const availableDeliverers = allDeliverers.filter(d => d.isAvailable).length;

      // Low stock variants (stock < 10)
      const lowStockItems = allVariants
        .filter(v => v.variant.stock < 10)
        .map(v => ({
          id: v.variant.id,
          productId: v.variant.productId,
          productName: v.product?.name || 'Unknown Product',
          volume: v.variant.volume,
          packaging: v.variant.packaging,
          stock: v.variant.stock,
          price: v.variant.price,
          isActive: v.variant.isActive
        }));

      // Orders requiring attention: failed orders, failed payments, unassigned active orders
      const attentionOrders = allOrders.filter(o => 
        o.status === 'FAILED' || 
        o.paymentState === 'FAILED' || 
        (o.status === 'CONFIRMED' && !o.delivererId)
      ).slice(0, 8);

      res.json({
        metrics: {
          totalOrders,
          pendingOrders,
          activeOrders,
          deliveredOrders,
          cancelledOrders,
          failedOrders,
          totalRevenue: totalRevenue.toFixed(2),
          activeDeliveries: activeDeliveriesList.length,
          totalDeliverers: allDeliverers.length,
          availableDeliverers,
          lowStockCount: lowStockItems.length,
        },
        paymentStats,
        lowStockItems: lowStockItems.slice(0, 10),
        attentionOrders
      });
    } catch (error) {
      console.error("Admin overview failed:", error);
      res.status(500).json({ error: "Failed to generate overview metrics" });
    }
  });

  // --- ADMIN PAYMENTS API ---
  app.get("/api/admin/payments", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const { provider, status } = req.query;

      let paymentRows = await db.select({
        payment: payments,
        order: orders,
        customerEmail: users.email
      })
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .leftJoin(users, eq(orders.userId, users.id))
      .orderBy(desc(payments.createdAt));

      if (provider && typeof provider === 'string' && provider !== 'ALL') {
        paymentRows = paymentRows.filter(r => r.payment.provider === provider);
      }
      if (status && typeof status === 'string' && status !== 'ALL') {
        paymentRows = paymentRows.filter(r => r.payment.status === status);
      }

      const formatted = paymentRows.map(r => ({
        ...r.payment,
        orderTotal: r.order?.totalAmount,
        orderStatus: r.order?.status,
        orderZone: r.order?.deliveryZone,
        customerEmail: r.customerEmail
      }));

      res.json({ payments: formatted });
    } catch (error) {
      console.error("Fetch payments failed:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // --- ADMIN AUDIT LOGS API ---
  app.get("/api/admin/audit-logs", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const { orderId, action, actorRole } = req.query;

      let logs = await db.select({
        audit: orderAuditLogs,
        actorEmail: users.email,
        orderStatus: orders.status,
        orderTotal: orders.totalAmount
      })
      .from(orderAuditLogs)
      .leftJoin(users, eq(orderAuditLogs.actorId, users.id))
      .leftJoin(orders, eq(orderAuditLogs.orderId, orders.id))
      .orderBy(desc(orderAuditLogs.createdAt))
      .limit(150);

      if (orderId && typeof orderId === 'string' && !isNaN(parseInt(orderId))) {
        logs = logs.filter(l => l.audit.orderId === parseInt(orderId));
      }
      if (action && typeof action === 'string' && action !== 'ALL') {
        logs = logs.filter(l => l.audit.action === action);
      }
      if (actorRole && typeof actorRole === 'string' && actorRole !== 'ALL') {
        logs = logs.filter(l => l.audit.actorRole === actorRole);
      }

      const formatted = logs.map(l => ({
        ...l.audit,
        actorEmail: l.actorEmail,
        orderStatus: l.orderStatus,
        orderTotal: l.orderTotal
      }));

      res.json({ auditLogs: formatted });
    } catch (error) {
      console.error("Fetch audit logs failed:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ===================================================
  // --- MODULE 17: CMS / VISUAL & CONTENT CONTROL ---
  // ===================================================

  // 1. Storefront Public Published CMS Content (Public / Guest accessible)
  app.get("/api/cms/content", async (req, res) => {
    try {
      const content = await cmsService.getPublishedStorefrontContent();
      res.json(content);
    } catch (error: any) {
      console.error("Failed to fetch public CMS content:", error);
      // Fallback empty data gracefully on error so storefront continues working
      res.json({
        banners: [],
        blocks: [],
        blocksBySection: {},
        visualSettings: {
          site_title: 'MRATINA',
          tagline: 'Sacred Kenyan Craft & Terroir',
          hero_badge: 'Featured Release',
          accent_theme: 'gold',
          concierge_delivery_note: 'Available in Nairobi & Environs within 90 mins',
          heritage_year: 'Since 2021',
          announcement_banner_active: 'false',
          announcement_banner_text: 'Complimentary sommelier gift packaging on orders above KES 5,000',
          announcement_banner_url: '/'
        }
      });
    }
  });

  // 2. Admin Banners Endpoints
  app.get("/api/admin/cms/banners", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const banners = await cmsService.getAllBanners();
      res.json({ banners });
    } catch (error: any) {
      console.error("Failed to fetch CMS banners:", error);
      res.status(500).json({ error: error.message || "Failed to fetch banners" });
    }
  });

  app.post("/api/admin/cms/banners", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const user = await getUserByUid(req.user!.uid);
      const newBanner = await cmsService.createBanner(req.body, user.id);
      res.json({ success: true, banner: newBanner });
    } catch (error: any) {
      console.error("Failed to create CMS banner:", error);
      res.status(400).json({ error: error.message || "Failed to create banner" });
    }
  });

  app.put("/api/admin/cms/banners/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const bannerId = parseInt(req.params.id);
      if (isNaN(bannerId)) return res.status(400).json({ error: "Invalid banner ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.updateBanner(bannerId, req.body, user.id);
      res.json({ success: true, banner: updated });
    } catch (error: any) {
      console.error("Failed to update CMS banner:", error);
      res.status(400).json({ error: error.message || "Failed to update banner" });
    }
  });

  app.post("/api/admin/cms/banners/:id/publish", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const bannerId = parseInt(req.params.id);
      if (isNaN(bannerId)) return res.status(400).json({ error: "Invalid banner ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.setBannerPublishStatus(bannerId, 'PUBLISHED', user.id);
      res.json({ success: true, banner: updated });
    } catch (error: any) {
      console.error("Failed to publish banner:", error);
      res.status(400).json({ error: error.message || "Failed to publish banner" });
    }
  });

  app.post("/api/admin/cms/banners/:id/unpublish", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const bannerId = parseInt(req.params.id);
      if (isNaN(bannerId)) return res.status(400).json({ error: "Invalid banner ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.setBannerPublishStatus(bannerId, 'DRAFT', user.id);
      res.json({ success: true, banner: updated });
    } catch (error: any) {
      console.error("Failed to unpublish banner:", error);
      res.status(400).json({ error: error.message || "Failed to unpublish banner" });
    }
  });

  app.post("/api/admin/cms/banners/:id/toggle", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const bannerId = parseInt(req.params.id);
      if (isNaN(bannerId)) return res.status(400).json({ error: "Invalid banner ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.toggleBannerActive(bannerId, user.id);
      res.json({ success: true, banner: updated });
    } catch (error: any) {
      console.error("Failed to toggle banner active state:", error);
      res.status(400).json({ error: error.message || "Failed to toggle banner active state" });
    }
  });

  app.delete("/api/admin/cms/banners/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const bannerId = parseInt(req.params.id);
      if (isNaN(bannerId)) return res.status(400).json({ error: "Invalid banner ID" });

      const user = await getUserByUid(req.user!.uid);
      const result = await cmsService.deleteBanner(bannerId, user.id);
      res.json(result);
    } catch (error: any) {
      console.error("Failed to delete banner:", error);
      res.status(400).json({ error: error.message || "Failed to delete banner" });
    }
  });

  // 3. Admin Content Blocks Endpoints
  app.get("/api/admin/cms/blocks", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const blocks = await cmsService.getAllContentBlocks();
      res.json({ blocks });
    } catch (error: any) {
      console.error("Failed to fetch CMS content blocks:", error);
      res.status(500).json({ error: error.message || "Failed to fetch content blocks" });
    }
  });

  app.post("/api/admin/cms/blocks", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const user = await getUserByUid(req.user!.uid);
      const newBlock = await cmsService.createContentBlock(req.body, user.id);
      res.json({ success: true, block: newBlock });
    } catch (error: any) {
      console.error("Failed to create CMS block:", error);
      res.status(400).json({ error: error.message || "Failed to create content block" });
    }
  });

  app.put("/api/admin/cms/blocks/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const blockId = parseInt(req.params.id);
      if (isNaN(blockId)) return res.status(400).json({ error: "Invalid block ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.updateContentBlock(blockId, req.body, user.id);
      res.json({ success: true, block: updated });
    } catch (error: any) {
      console.error("Failed to update CMS block:", error);
      res.status(400).json({ error: error.message || "Failed to update content block" });
    }
  });

  app.post("/api/admin/cms/blocks/:id/publish", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const blockId = parseInt(req.params.id);
      if (isNaN(blockId)) return res.status(400).json({ error: "Invalid block ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.setBlockPublishStatus(blockId, 'PUBLISHED', user.id);
      res.json({ success: true, block: updated });
    } catch (error: any) {
      console.error("Failed to publish block:", error);
      res.status(400).json({ error: error.message || "Failed to publish content block" });
    }
  });

  app.post("/api/admin/cms/blocks/:id/unpublish", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const blockId = parseInt(req.params.id);
      if (isNaN(blockId)) return res.status(400).json({ error: "Invalid block ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.setBlockPublishStatus(blockId, 'DRAFT', user.id);
      res.json({ success: true, block: updated });
    } catch (error: any) {
      console.error("Failed to unpublish block:", error);
      res.status(400).json({ error: error.message || "Failed to unpublish content block" });
    }
  });

  app.post("/api/admin/cms/blocks/:id/toggle", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const blockId = parseInt(req.params.id);
      if (isNaN(blockId)) return res.status(400).json({ error: "Invalid block ID" });

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.toggleBlockActive(blockId, user.id);
      res.json({ success: true, block: updated });
    } catch (error: any) {
      console.error("Failed to toggle block active state:", error);
      res.status(400).json({ error: error.message || "Failed to toggle content block active state" });
    }
  });

  app.delete("/api/admin/cms/blocks/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const blockId = parseInt(req.params.id);
      if (isNaN(blockId)) return res.status(400).json({ error: "Invalid block ID" });

      const user = await getUserByUid(req.user!.uid);
      const result = await cmsService.deleteBlock(blockId, user.id);
      res.json(result);
    } catch (error: any) {
      console.error("Failed to delete content block:", error);
      res.status(400).json({ error: error.message || "Failed to delete content block" });
    }
  });

  // 4. Admin Visual Settings Endpoints
  app.get("/api/admin/cms/visual-settings", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const settings = await cmsService.getAllVisualSettings();
      res.json({ settings });
    } catch (error: any) {
      console.error("Failed to fetch visual settings:", error);
      res.status(500).json({ error: error.message || "Failed to fetch visual settings" });
    }
  });

  app.put("/api/admin/cms/visual-settings", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const { settings } = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: "Settings object is required" });
      }

      const user = await getUserByUid(req.user!.uid);
      const updated = await cmsService.updateVisualSettings(settings, user.id);
      res.json({ success: true, settings: updated });
    } catch (error: any) {
      console.error("Failed to update visual settings:", error);
      res.status(400).json({ error: error.message || "Failed to update visual settings" });
    }
  });

  // 5. Admin CMS Audit Logs Endpoint
  app.get("/api/admin/cms/audit-logs", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const logs = await cmsService.getCMSAuditLogs(100);
      res.json({ logs });
    } catch (error: any) {
      console.error("Failed to fetch CMS audit logs:", error);
      res.status(500).json({ error: error.message || "Failed to fetch CMS audit logs" });
    }
  });

  // --- ADMIN CATALOGUE APIs ---
  app.get("/api/admin/products", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const allProducts = await db.select().from(products).orderBy(desc(products.createdAt));
      const allVariants = await db.select().from(variants);
      
      const combined = allProducts.map(p => ({
        ...p,
        variants: allVariants.filter(v => v.productId === p.id)
      }));
      res.json({ products: combined });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/admin/products", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const { name, category, brand, origin, abv, description, imageBase64 } = req.body;
      
      // Validation
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Product name is required" });
      }
      if (name.length > 200) {
        return res.status(400).json({ error: "Product name is too long" });
      }
      
      const validCategories = ["WINE", "BEER", "SPIRITS", "MIXER", "OTHER"];
      if (!category || !validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid product category" });
      }
      
      const [newProduct] = await db.insert(products).values({
        name: name.trim(),
        category,
        origin: origin?.trim() || null,
        abv: abv ? String(abv).trim() : null,
        description: description?.trim() || null,
        imageUrl: imageBase64 || null,
        isActive: true
      }).returning();
      
      res.json({ success: true, product: newProduct });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.put("/api/admin/products/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) return res.status(400).json({ error: "Invalid product ID" });

      const { name, category, origin, abv, description, imageUrl, isActive } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Product name is required" });
      }

      const validCategories = ["WINE", "BEER", "SPIRITS", "MIXER", "OTHER"];
      if (category && !validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid product category" });
      }

      const [updatedProduct] = await db.update(products)
        .set({
          name: name.trim(),
          category: category || undefined,
          origin: origin !== undefined ? (origin?.trim() || null) : undefined,
          abv: abv !== undefined ? (abv ? String(abv).trim() : null) : undefined,
          description: description !== undefined ? (description?.trim() || null) : undefined,
          imageUrl: imageUrl !== undefined ? imageUrl : undefined,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        })
        .where(eq(products.id, productId))
        .returning();

      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      res.json({ success: true, product: updatedProduct });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.post("/api/admin/products/:id/toggle", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) return res.status(400).json({ error: "Invalid product ID" });

      const productRes = await db.select().from(products).where(eq(products.id, productId));
      if (productRes.length === 0) return res.status(404).json({ error: "Product not found" });

      const [updated] = await db.update(products)
        .set({ isActive: !productRes[0].isActive })
        .where(eq(products.id, productId))
        .returning();

      res.json({ success: true, product: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle product status" });
    }
  });

  app.post("/api/admin/products/:id/variants", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      const { volume, price, stock, packaging } = req.body;
      
      // Validation
      if (!volume || typeof volume !== 'string' || volume.trim().length === 0) {
        return res.status(400).json({ error: "Volume is required" });
      }
      if (!packaging || typeof packaging !== 'string' || packaging.trim().length === 0) {
        return res.status(400).json({ error: "Packaging type is required" });
      }
      
      const numericPrice = Number(price);
      if (isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ error: "Price must be a valid number greater than zero" });
      }
      
      const numericStock = parseInt(stock);
      if (isNaN(numericStock) || numericStock < 0) {
        return res.status(400).json({ error: "Stock must be a valid non-negative integer" });
      }

      // Check if product exists
      const productRes = await db.select().from(products).where(eq(products.id, productId));
      if (productRes.length === 0) {
        return res.status(404).json({ error: "Parent product not found" });
      }

      const [newVariant] = await db.insert(variants).values({
        productId,
        volume: volume.trim(),
        price: numericPrice.toString(),
        stock: numericStock,
        packaging: packaging.trim(),
        isActive: true
      }).returning();
      
      res.json({ success: true, variant: newVariant });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create variant" });
    }
  });

  app.put("/api/admin/variants/:id", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const variantId = parseInt(req.params.id);
      if (isNaN(variantId)) return res.status(400).json({ error: "Invalid variant ID" });

      const { volume, packaging, price, stock, isActive } = req.body;

      const updateData: any = {};
      if (volume !== undefined && typeof volume === 'string' && volume.trim().length > 0) {
        updateData.volume = volume.trim();
      }
      if (packaging !== undefined && typeof packaging === 'string' && packaging.trim().length > 0) {
        updateData.packaging = packaging.trim();
      }
      if (price !== undefined) {
        const numPrice = Number(price);
        if (isNaN(numPrice) || numPrice <= 0) {
          return res.status(400).json({ error: "Price must be greater than zero" });
        }
        updateData.price = numPrice.toString();
      }
      if (stock !== undefined) {
        const numStock = parseInt(stock);
        if (isNaN(numStock) || numStock < 0) {
          return res.status(400).json({ error: "Stock must be a non-negative integer" });
        }
        updateData.stock = numStock;
      }
      if (isActive !== undefined) {
        updateData.isActive = Boolean(isActive);
      }

      const [updatedVariant] = await db.update(variants)
        .set(updateData)
        .where(eq(variants.id, variantId))
        .returning();

      if (!updatedVariant) {
        return res.status(404).json({ error: "Variant not found" });
      }

      res.json({ success: true, variant: updatedVariant });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update variant" });
    }
  });

  app.post("/api/admin/variants/:id/price", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const variantId = parseInt(req.params.id);
      if (isNaN(variantId)) return res.status(400).json({ error: "Invalid variant ID" });

      const { price } = req.body;
      const numericPrice = Number(price);
      if (isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ error: "Price must be a valid number greater than zero" });
      }

      const [updatedVariant] = await db.update(variants)
        .set({ price: numericPrice.toString() })
        .where(eq(variants.id, variantId))
        .returning();

      if (!updatedVariant) {
        return res.status(404).json({ error: "Variant not found" });
      }

      res.json({ success: true, variant: updatedVariant });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update variant price" });
    }
  });

  app.post("/api/admin/variants/:id/stock", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const variantId = parseInt(req.params.id);
      if (isNaN(variantId)) return res.status(400).json({ error: "Invalid variant ID" });

      const { stock } = req.body;
      const numStock = parseInt(stock);
      if (isNaN(numStock) || numStock < 0) {
        return res.status(400).json({ error: "Stock must be a valid non-negative integer" });
      }

      const [updatedVariant] = await db.update(variants)
        .set({ stock: numStock })
        .where(eq(variants.id, variantId))
        .returning();

      if (!updatedVariant) {
        return res.status(404).json({ error: "Variant not found" });
      }

      res.json({ success: true, variant: updatedVariant });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update stock" });
    }
  });

  app.post("/api/admin/variants/:id/toggle", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const variantId = parseInt(req.params.id);
      if (isNaN(variantId)) return res.status(400).json({ error: "Invalid variant ID" });

      const variantRes = await db.select().from(variants).where(eq(variants.id, variantId));
      if (variantRes.length === 0) return res.status(404).json({ error: "Variant not found" });

      const [updated] = await db.update(variants)
        .set({ isActive: !variantRes[0].isActive })
        .where(eq(variants.id, variantId))
        .returning();

      res.json({ success: true, variant: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle variant status" });
    }
  });

  app.post("/api/admin/orders/:id/status", requireAuth, requireRole(['ADMIN', 'DELIVERER']), async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { status, delivererId, failureReason } = req.body;
      const user = await getUserByUid(req.user!.uid);
      const isAdmin = user.role === 'ADMIN';

      // Load the delivery record
      const deliveryRes = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
      let delivery = deliveryRes[0];

      // Prevent modifications to terminal states if not admin overriding
      if (delivery && ['DELIVERED', 'CANCELLED', 'FAILED'].includes(delivery.status) && !isAdmin) {
         return res.status(400).json({ error: "Cannot modify a completed, failed or cancelled delivery" });
      }

      // If updating delivererId (Admin only)
      if (delivererId !== undefined && isAdmin) {
        if (delivery && ['DELIVERED', 'CANCELLED', 'FAILED'].includes(delivery.status)) {
           return res.status(400).json({ error: "Cannot assign a completed, failed or cancelled delivery" });
        }

        if (delivererId !== null && delivererId !== "") {
          const delivererRes = await db.select().from(users).where(eq(users.id, parseInt(delivererId)));
          const deliverer = delivererRes[0];
          if (!deliverer || deliverer.role !== 'DELIVERER') {
            return res.status(400).json({ error: "Invalid deliverer assigned. Must be a valid user with DELIVERER role." });
          }
          if (!deliverer.isAvailable) {
            return res.status(400).json({ error: "Selected deliverer is currently unavailable." });
          }
        }
        
        const finalDelivererId = delivererId ? parseInt(delivererId) : null;
        
        if (!delivery) {
           const [newDel] = await db.insert(deliveries).values({
             orderId,
             delivererId: finalDelivererId,
             status: finalDelivererId ? 'ASSIGNED' : 'UNASSIGNED',
             assignedAt: finalDelivererId ? new Date() : null,
           }).returning();
           delivery = newDel;
        } else {
           // Prevent silent overwrite of another active assignment unless explicitly intended (Admin action handles this)
           const [updatedDel] = await db.update(deliveries).set({
             delivererId: finalDelivererId,
             status: finalDelivererId ? 'ASSIGNED' : 'UNASSIGNED',
             assignedAt: finalDelivererId ? new Date() : null,
             updatedAt: new Date()
           }).where(eq(deliveries.id, delivery.id)).returning();
           delivery = updatedDel;
        }
        // Sync to order for backwards compatibility 
        await db.update(orders).set({ 
          delivererId: finalDelivererId
        }).where(eq(orders.id, orderId));

        // Audit log deliverer assignment
        await orderOperationsService.recordAudit({
          orderId,
          actorId: user.id,
          actorRole: 'ADMIN',
          action: 'ASSIGNED',
          fromState: delivery.delivererId ? `Deliverer #${delivery.delivererId}` : 'Unassigned',
          toState: finalDelivererId ? `Deliverer #${finalDelivererId}` : 'Unassigned',
          reason: finalDelivererId ? `Assigned to deliverer #${finalDelivererId}` : 'Unassigned deliverer',
          metadata: { delivererId: finalDelivererId }
        });
      }

      // If updating status
      if (status && delivery) {
        // Enforce authorization for Deliverers
        if (!isAdmin && delivery.delivererId !== user.id) {
           return res.status(403).json({ error: "Not authorized to update this delivery" });
        }

        const validTransitions: Record<string, string[]> = {
          'UNASSIGNED': ['ASSIGNED', 'CANCELLED'],
          'ASSIGNED': ['ACCEPTED', 'UNASSIGNED', 'CANCELLED'],
          'ACCEPTED': ['PICKUP_READY', 'CANCELLED', 'FAILED'],
          'PICKUP_READY': ['PICKED_UP', 'CANCELLED', 'FAILED'],
          'PICKED_UP': ['OUT_FOR_DELIVERY', 'FAILED'],
          'OUT_FOR_DELIVERY': ['DELIVERED', 'FAILED'],
          'DELIVERED': [],
          'FAILED': [],
          'CANCELLED': []
        };

        const currentState = delivery.status;
        const isAllowed = isAdmin || (validTransitions[currentState] && validTransitions[currentState].includes(status));
        
        if (!isAllowed) {
           return res.status(400).json({ error: `Invalid transition from ${currentState} to ${status}` });
        }

        const deliveryUpdates: any = { status, updatedAt: new Date() };
        
        if (status === 'UNASSIGNED') {
          if (!isAdmin && !failureReason) {
            return res.status(400).json({ error: "A reason is required to decline an assignment" });
          }
          deliveryUpdates.delivererId = null;
          if (failureReason) deliveryUpdates.failureReason = failureReason;
        }

        if (status === 'ACCEPTED') {
          if (!isAdmin && !user.isAvailable) {
            return res.status(400).json({ error: "You must be available to accept new assignments" });
          }
          deliveryUpdates.acceptedAt = new Date();
        }
        if (status === 'PICKUP_READY') deliveryUpdates.pickupReadyAt = new Date();
        if (status === 'PICKED_UP') deliveryUpdates.pickedUpAt = new Date();
        if (status === 'OUT_FOR_DELIVERY') deliveryUpdates.outForDeliveryAt = new Date();
        if (status === 'DELIVERED') deliveryUpdates.deliveredAt = new Date();
        if (status === 'FAILED') {
          deliveryUpdates.failedAt = new Date();
          if (failureReason) deliveryUpdates.failureReason = failureReason;
        }
        if (status === 'CANCELLED') {
          deliveryUpdates.cancelledAt = new Date();
          if (failureReason) deliveryUpdates.failureReason = failureReason;
        }

        await db.update(deliveries).set(deliveryUpdates).where(eq(deliveries.id, delivery.id));
        
        // Sync Order Status conceptually
        const orderUpdates: any = { updatedAt: new Date() };
        if (status === 'UNASSIGNED') orderUpdates.delivererId = null;
        
        // Only sync terminal/major statuses that exist in order lifecycle
        if (['DELIVERED', 'FAILED', 'CANCELLED', 'OUT_FOR_DELIVERY', 'PICKUP_READY'].includes(status)) {
            orderUpdates.status = status;
        }

        await db.update(orders).set(orderUpdates).where(eq(orders.id, orderId));

        // Audit log delivery status transition
        await orderOperationsService.recordAudit({
          orderId,
          actorId: user.id,
          actorRole: user.role === 'ADMIN' ? 'ADMIN' : 'DELIVERER',
          action: 'DELIVERY_CHANGE',
          fromState: currentState,
          toState: status,
          reason: failureReason || null,
          metadata: { deliveryId: delivery.id, delivererId: delivery.delivererId }
        });
      } else if (status && !delivery) {
         // Fallback for orders without deliveries created yet
         await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, orderId));
         await orderOperationsService.recordAudit({
          orderId,
          actorId: user.id,
          actorRole: user.role === 'ADMIN' ? 'ADMIN' : 'DELIVERER',
          action: 'STATUS_CHANGE',
          fromState: null,
          toState: status,
          reason: failureReason || null
         });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // --- DELIVERER APIs ---
  app.get("/api/deliverer/assignments", requireAuth, requireRole(['DELIVERER']), async (req: AuthRequest, res) => {
    try {
      const user = await getUserByUid(req.user!.uid);
      
      const myDeliveries = await db.select().from(deliveries)
        .where(eq(deliveries.delivererId, user.id))
        .orderBy(desc(deliveries.createdAt));

      const orderIds = myDeliveries.map(d => d.orderId);
      
      let ordersData: any[] = [];
      let items: any[] = [];
      
      if (orderIds.length > 0) {
        // Only fetch operationally necessary info for orders
        ordersData = await db.select({
          id: orders.id,
          status: orders.status,
          totalAmount: orders.totalAmount,
          deliveryAddress: orders.deliveryAddress,
          landmark: orders.landmark,
          deliveryZone: orders.deliveryZone,
          deliveryInstructions: orders.deliveryInstructions,
          createdAt: orders.createdAt
        })
        .from(orders)
        .where(inArray(orders.id, orderIds));

        items = await db.select({
          orderId: orderItems.orderId,
          quantity: orderItems.quantity,
          variant: variants,
          product: products
        })
        .from(orderItems)
        .leftJoin(variants, eq(orderItems.variantId, variants.id))
        .leftJoin(products, eq(variants.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds));
      }

      const assignments = myDeliveries.map(delivery => {
        const relatedOrder = ordersData.find(o => o.id === delivery.orderId);
        return {
          id: relatedOrder?.id,
          deliveryAddress: relatedOrder?.deliveryAddress,
          landmark: relatedOrder?.landmark,
          deliveryZone: relatedOrder?.deliveryZone,
          deliveryInstructions: relatedOrder?.deliveryInstructions,
          status: relatedOrder?.status,
          items: items.filter(i => i.orderId === delivery.orderId),
          delivery: delivery
        };
      });

      res.json({ orders: assignments });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // --- DISPATCH & AVAILABILITY APIs ---
  app.get("/api/admin/dispatch/eligible-deliverers", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      // Find all eligible deliverers: must have DELIVERER role and be available.
      // (Future: filter by zone or assignment constraint)
      const availableDeliverers = await db.select({
        id: users.id,
        email: users.email,
        isAvailable: users.isAvailable
      }).from(users).where(and(eq(users.role, 'DELIVERER'), eq(users.isAvailable, true)));
      
      res.json({ deliverers: availableDeliverers });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch eligible deliverers" });
    }
  });

  // --- NAVIGATION BOUNDARY ---
  app.get("/api/deliveries/:id/navigate", requireAuth, requireRole(['DELIVERER', 'ADMIN']), async (req: AuthRequest, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      const deliveryRes = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
      const delivery = deliveryRes[0];
      
      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }

      const user = await getUserByUid(req.user!.uid);
      const isAdmin = user.role === 'ADMIN';

      if (!isAdmin && delivery.delivererId !== user.id) {
         return res.status(403).json({ error: "Not authorized to access navigation for this delivery" });
      }

      if (['CANCELLED', 'DELIVERED', 'FAILED'].includes(delivery.status)) {
        return res.status(400).json({ error: "Cannot navigate to a completed, failed or cancelled delivery" });
      }
      
      const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
      const order = orderRes[0];

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Construct navigation boundary payload
      // In this phase, we don't have a real maps integration, but we return structured data
      // indicating what *would* be used.
      
      let destinationStr = "";
      if (delivery.latitude && delivery.longitude) {
         destinationStr = `${delivery.latitude},${delivery.longitude}`;
      } else if (order.deliveryAddress) {
         destinationStr = encodeURIComponent(order.deliveryAddress + (order.deliveryZone ? ", " + order.deliveryZone : ""));
      }
      
      if (!destinationStr) {
         return res.status(400).json({ error: "Unable to construct navigation destination. Missing location data." });
      }
      
      // E.g., fallback to Google Maps dir url
      const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${destinationStr}`;

      res.json({ 
        success: true, 
        navigationUrl,
        provider: "UNCONFIGURED_FALLBACK",
        location: {
          address: order.deliveryAddress,
          landmark: order.landmark,
          lat: delivery.latitude,
          lng: delivery.longitude,
          source: delivery.locationSource || 'MANUAL'
        }
      });
    } catch (error) {
       console.error(error);
       res.status(500).json({ error: "Failed to construct navigation boundary" });
    }
  });

  app.post("/api/deliverer/availability", requireAuth, requireRole(['DELIVERER']), async (req: AuthRequest, res) => {
    try {
      const { isAvailable } = req.body;
      const user = await getUserByUid(req.user!.uid);
      
      await db.update(users).set({ isAvailable }).where(eq(users.id, user.id));
      
      res.json({ success: true, isAvailable });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update availability" });
    }
  });

  // --- PAYMENT ENGINE ---
  app.post("/api/payments/initiate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { orderId, provider, phoneNumber } = req.body;
      
      if (!isValidProvider(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }
      
      const user = await getUserByUid(req.user!.uid);
      
      const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
      const order = orderRes[0];
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (order.userId !== user.id) {
        return res.status(403).json({ error: "Not authorized to pay for this order" });
      }
      
      if (['SUCCESS', 'REFUNDED'].includes(order.paymentState)) {
        return res.status(400).json({ error: "Order is already paid or refunded" });
      }
      
      // Upsert a payment record (we could have multiple attempts, so insert a new one for traceability)
      const [payment] = await db.insert(payments).values({
        orderId: order.id,
        provider: provider,
        amount: order.totalAmount,
        status: 'INITIATED',
      }).returning();
      
      // Update order state to pending as we initiate
      await db.update(orders).set({ paymentState: 'PENDING', updatedAt: new Date() }).where(eq(orders.id, order.id));

      const result = await paymentService.initiate({
        orderId: order.id,
        amount: Number(order.totalAmount),
        phoneNumber: phoneNumber,
        provider: provider
      });
      
      if (!result.isConfigured) {
         // Because it's unconfigured, we shouldn't leave the order permanently PENDING if they can't pay.
         // In a real app, maybe we fail it immediately, or allow retrying with another provider.
         // Let's set it back to INITIATED so they can try again or use the dev simulation.
         await db.update(orders).set({ paymentState: 'INITIATED', updatedAt: new Date() }).where(eq(orders.id, order.id));
         await db.update(payments).set({ status: 'FAILED' }).where(eq(payments.id, payment.id));
      }
      
      res.json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Payment initiation failed" });
    }
  });

  // --- WEBHOOK / CALLBACK BOUNDARY ---
  app.post("/api/webhooks/payment/:provider", async (req, res) => {
    try {
       const { provider } = req.params;
       const { paymentService, isValidProvider, isValidPaymentTransition } = await import('./src/services/payment.ts');
       
       if (!isValidProvider(provider)) {
         return res.status(400).json({ error: "Invalid provider" });
       }

       // SECURITY BOUNDARY: Provider signature verification MUST happen here.
       // We DO NOT trust req.body.status directly from the client.
       const verification = await paymentService.verifyWebhook(provider, req.body, req.headers);
       
       if (!verification.isConfigured) {
          return res.status(501).json({ error: "Provider unconfigured. Cannot process real webhooks." });
       }
       
       if (!verification.success || !verification.orderId || !verification.status) {
          return res.status(400).json({ error: verification.error || "Invalid webhook payload or signature" });
       }
       
       const orderRes = await db.select().from(orders).where(eq(orders.id, verification.orderId));
       const order = orderRes[0];
       
       if (!order) {
         return res.status(404).json({ error: "Order not found" });
       }
       
       // Idempotency: if already in the target state, acknowledge and do nothing
       if (order.paymentState === verification.status) {
          return res.json({ received: true, note: "Already processed" });
       }
       
       // Enforce Payment State Machine
       if (!isValidPaymentTransition(order.paymentState as any, verification.status)) {
          return res.status(400).json({ error: "Invalid payment state transition" });
       }
       
       // Update the most recent pending payment attempt
       const pendingPayments = await db.select().from(payments)
         .where(and(eq(payments.orderId, order.id), eq(payments.provider, provider)))
         .orderBy(desc(payments.createdAt));
         
       if (pendingPayments.length > 0) {
          const payment = pendingPayments[0];
          await db.update(payments)
            .set({ 
              status: verification.status, 
              providerReference: verification.providerReference || payment.providerReference 
            })
            .where(eq(payments.id, payment.id));
       } else {
          // If no pending record (e.g. manual offline payment), record it
          await db.insert(payments).values({
             orderId: order.id,
             provider,
             amount: order.totalAmount,
             status: verification.status,
             providerReference: verification.providerReference
          });
       }

       // Update authoritative order state
       await db.update(orders)
         .set({ paymentState: verification.status, updatedAt: new Date() })
         .where(eq(orders.id, order.id));

       // Record payment audit log
       await orderOperationsService.recordAudit({
         orderId: order.id,
         actorId: null,
         actorRole: 'SYSTEM',
         action: 'PAYMENT_STATE_CHANGE',
         fromState: order.paymentState,
         toState: verification.status,
         reason: `Provider webhook notification: ${provider} -> ${verification.status}`,
         metadata: {
           provider,
           providerReference: verification.providerReference,
           amount: order.totalAmount
         }
       });

       // If payment is SUCCESS and order is PENDING, auto-transition order to CONFIRMED
       if (verification.status === 'SUCCESS' && order.status === 'PENDING') {
         await db.update(orders)
           .set({ status: 'CONFIRMED', updatedAt: new Date() })
           .where(eq(orders.id, order.id));

         await orderOperationsService.recordAudit({
           orderId: order.id,
           actorId: null,
           actorRole: 'SYSTEM',
           action: 'STATUS_CHANGE',
           fromState: 'PENDING',
           toState: 'CONFIRMED',
           reason: 'Auto-confirmed upon verified payment receipt',
           metadata: { trigger: 'WEBHOOK_PAYMENT_SUCCESS' }
         });
       }
         
       res.json({ received: true });
    } catch (error) {
       console.error("Webhook error:", error);
       res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // --- DEVELOPMENT ADAPTER (SIMULATION) ---
  // This explicitly replaces the old fake behavior with a dev-only tool.
  // Because the production webhook securely rejects unconfigured providers,
  // the simulator bypasses the webhook and updates the DB directly.
  app.post("/api/dev/simulate-payment", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
     if (process.env.NODE_ENV === 'production') {
       return res.status(403).json({ error: "Simulation is not available in production." });
     }
     try {
       const { orderId, provider } = req.body;
       const { isValidProvider, isValidPaymentTransition } = await import('./src/services/payment.ts');
       
       const user = await getUserByUid(req.user!.uid);
       if (!user || user.role !== 'ADMIN') {
          return res.status(403).json({ error: "Unauthorized. Only admins can simulate payments." });
       }
       
       if (!isValidProvider(provider)) {
         return res.status(400).json({ error: "Invalid provider" });
       }
       
       const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
       const order = orderRes[0];
       
       if (!order) return res.status(404).json({ error: "Order not found" });
       
       if (order.userId !== user.id) {
          return res.status(403).json({ error: "Not authorized to simulate this order" });
       }
       
       // Force SUCCESS state transition bypassing standard provider webhook
       if (!isValidPaymentTransition(order.paymentState as any, 'SUCCESS')) {
          return res.status(400).json({ error: "Invalid payment state transition" });
       }

       const pendingPayments = await db.select().from(payments)
         .where(and(eq(payments.orderId, order.id), eq(payments.provider, provider)))
         .orderBy(desc(payments.createdAt));
         
       if (pendingPayments.length > 0) {
          const payment = pendingPayments[0];
          await db.update(payments)
            .set({ 
              status: 'SUCCESS', 
              providerReference: 'DEV_SIM_' + Math.floor(Math.random() * 100000)
            })
            .where(eq(payments.id, payment.id));
       } else {
          await db.insert(payments).values({
             orderId: order.id,
             provider,
             amount: order.totalAmount,
             status: 'SUCCESS',
             providerReference: 'DEV_SIM_' + Math.floor(Math.random() * 100000)
          });
       }

       await db.update(orders)
         .set({ paymentState: 'SUCCESS', updatedAt: new Date() })
         .where(eq(orders.id, order.id));

       // Record payment audit log
       await orderOperationsService.recordAudit({
         orderId: order.id,
         actorId: user.id,
         actorRole: 'ADMIN',
         action: 'PAYMENT_STATE_CHANGE',
         fromState: order.paymentState,
         toState: 'SUCCESS',
         reason: `Development payment simulation: ${provider} -> SUCCESS`,
         metadata: {
           provider,
           simulated: true,
           amount: order.totalAmount
         }
       });

       // If order is PENDING, auto-transition to CONFIRMED
       if (order.status === 'PENDING') {
         await db.update(orders)
           .set({ status: 'CONFIRMED', updatedAt: new Date() })
           .where(eq(orders.id, order.id));

         await orderOperationsService.recordAudit({
           orderId: order.id,
           actorId: user.id,
           actorRole: 'ADMIN',
           action: 'STATUS_CHANGE',
           fromState: 'PENDING',
           toState: 'CONFIRMED',
           reason: 'Auto-confirmed via dev payment simulation',
           metadata: { trigger: 'SIMULATION_PAYMENT_SUCCESS' }
         });
       }
         
       res.json({ success: true, message: "Simulation successful" });
     } catch (e) {
       console.error("Simulation failed:", e);
       res.status(500).json({ error: "Simulation failed" });
     }
  });

  // --- PUBLIC REVIEWS API ---
  app.get("/api/products/:id/reviews", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      const productReviews = await db.select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        user: { email: users.email }
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));
      
      res.json({ reviews: productReviews });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  app.post("/api/products/:id/reviews", requireAuth, async (req: AuthRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { rating, comment } = req.body;
      const user = await getUserByUid(req.user!.uid);
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Valid rating (1-5) is required" });
      }

      await db.insert(reviews).values({
        productId,
        userId: user.id,
        rating,
        comment,
        isApproved: true, // Auto-approve for now
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  // --- Vite / Static Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
