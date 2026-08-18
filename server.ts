import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, requireRole, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser, getUserByUid } from "./src/db/users.ts";
import { getActiveProducts, createOrder } from "./src/db/commerce.ts";
import { db } from "./src/db/index.ts";
import { orders, products, variants, users, orderItems, reviews, deliveryZones, deliveries, payments } from "./src/db/schema.ts";
import { eq, desc, inArray, and } from "drizzle-orm";
import { paymentService, isValidProvider } from "./src/services/payment.ts";

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
      }

      const ordersWithItems = userOrders.map(order => ({
        ...order,
        items: items.filter(i => i.orderId === order.id),
        delivery: deliveryRecords.find(d => d.orderId === order.id) || null
      }));

      res.json({ orders: ordersWithItems });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch order history" });
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
      const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));
      
      const orderIds = allOrders.map(o => o.id);
      let items: any[] = [];
      let deliveryRecords: any[] = [];
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
      }

      const ordersWithItems = allOrders.map(order => ({
        ...order,
        items: items.filter(i => i.orderId === order.id),
        delivery: deliveryRecords.find(d => d.orderId === order.id) || null
      }));

      res.json({ orders: ordersWithItems });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch orders" });
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
      const { role } = req.body;
      await db.update(users).set({ role }).where(eq(users.id, userId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update role" });
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
      const { name, category, brand, origin, abv, description, imageBase64, isCustomisable } = req.body;
      
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

  app.post("/api/admin/variants/:id/stock", requireAuth, requireRole(['ADMIN']), async (req: AuthRequest, res) => {
    try {
      const variantId = parseInt(req.params.id);
      const { stock } = req.body;
      await db.update(variants).set({ stock: parseInt(stock) }).where(eq(variants.id, variantId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update stock" });
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
        if (['DELIVERED', 'FAILED', 'CANCELLED'].includes(status)) {
            orderUpdates.status = status;
        }

        await db.update(orders).set(orderUpdates).where(eq(orders.id, orderId));
      } else if (status && !delivery) {
         // Fallback for orders without deliveries created yet
         await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, orderId));
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
