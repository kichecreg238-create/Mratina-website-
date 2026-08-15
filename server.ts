import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, requireRole, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser, getUserByUid } from "./src/db/users.ts";
import { getActiveProducts, createOrder } from "./src/db/commerce.ts";
import { db } from "./src/db/index.ts";
import { orders, products, variants, users, orderItems, reviews, deliveryZones } from "./src/db/schema.ts";
import { eq, desc, inArray } from "drizzle-orm";

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
      }

      const ordersWithItems = userOrders.map(order => ({
        ...order,
        items: items.filter(i => i.orderId === order.id)
      }));

      res.json({ orders: ordersWithItems });
    } catch (error: any) {
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
      }

      const ordersWithItems = allOrders.map(order => ({
        ...order,
        items: items.filter(i => i.orderId === order.id)
      }));

      res.json({ orders: ordersWithItems });
    } catch (error) {
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
      const { status, delivererId } = req.body;
      
      const updateData: any = { status, updatedAt: new Date() };
      if (delivererId !== undefined) {
        updateData.delivererId = delivererId;
      }
      
      await db.update(orders).set(updateData).where(eq(orders.id, orderId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // --- DELIVERER APIs ---
  app.get("/api/deliverer/assignments", requireAuth, requireRole(['DELIVERER']), async (req: AuthRequest, res) => {
    try {
      const user = await getUserByUid(req.user!.uid);
      const assignments = await db.select().from(orders)
        .where(eq(orders.delivererId, user.id))
        .orderBy(desc(orders.createdAt));

      const orderIds = assignments.map(o => o.id);
      let items: any[] = [];
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
      }

      const ordersWithItems = assignments.map(order => ({
        ...order,
        items: items.filter(i => i.orderId === order.id)
      }));

      res.json({ orders: ordersWithItems });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // --- PAYMENT WEBHOOK (Simulation) ---
  app.post("/api/webhooks/payment", async (req, res) => {
    try {
      // In production, verify provider signature (M-Pesa/Airtel) here.
      const { orderId, provider, providerReference, status } = req.body;
      
      // Update order payment state securely on the server
      await db.update(orders)
        .set({ paymentState: status, updatedAt: new Date() })
        .where(eq(orders.id, orderId));
        
      res.json({ received: true });
    } catch (error) {
      res.status(500).json({ error: "Webhook processing failed" });
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
