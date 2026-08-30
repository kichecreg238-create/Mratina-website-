import { db } from './index.ts';
import { products, variants, orders, orderItems, deliveryZones, deliveries, orderAuditLogs } from './schema.ts';
import { eq, inArray } from 'drizzle-orm';
import { notificationService } from '../services/notificationService.ts';

export async function getActiveProducts() {
  const allProducts = await db.select().from(products).where(eq(products.isActive, true));
  const productIds = allProducts.map(p => p.id);
  
  if (productIds.length === 0) return [];
  
  const allVariants = await db.select().from(variants)
    .where(inArray(variants.productId, productIds));
    
  return allProducts.map(p => ({
    ...p,
    variants: allVariants.filter(v => v.productId === p.id && v.isActive)
  }));
}

export async function createOrder(userId: number, items: { variantId: number; quantity: number; expectedPrice?: number }[], deliveryAddress: string, deliveryZoneId: number, deliveryInstructions?: string, landmark?: string) {
  if (!items || items.length === 0) throw new Error("Order must contain at least one item.");

  return await db.transaction(async (tx) => {
    // 1. Authoritative Serviceability Check
    const zoneRes = await tx.select().from(deliveryZones).where(eq(deliveryZones.id, deliveryZoneId));
    const zone = zoneRes[0];
    
    if (!zone) {
      throw new Error("Invalid delivery zone selected.");
    }
    if (!zone.isActive) {
      throw new Error(`Delivery zone '${zone.name}' is not currently active or serviceable.`);
    }
    if (!zone.isAcceptingOrders) {
      throw new Error(`Delivery zone '${zone.name}' is currently at capacity and not accepting orders.`);
    }

    const authoritativeDeliveryFee = Number(zone.fee);

    let subtotal = 0;
    const itemsToInsert = [];
    
    // Lock rows or at least check sequentially
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error(`Invalid quantity ${item.quantity} for variant ${item.variantId}`);
      }

      const variantRes = await tx.select().from(variants).where(eq(variants.id, item.variantId));
      const variant = variantRes[0];
      
      if (!variant) throw new Error(`Variant ${item.variantId} not found`);
      if (!variant.isActive) throw new Error(`Variant ${item.variantId} is not active`);
      if (variant.stock < item.quantity) throw new Error(`Insufficient stock for variant ${item.variantId}. Available: ${variant.stock}`);
      
      const productRes = await tx.select().from(products).where(eq(products.id, variant.productId));
      const product = productRes[0];
      if (!product) throw new Error(`Parent product for variant ${item.variantId} not found`);
      if (!product.isActive) throw new Error(`Product ${product.name} is no longer active`);

      const priceAtPurchase = Number(variant.price);
      
      if (item.expectedPrice !== undefined && priceAtPurchase !== item.expectedPrice) {
        throw new Error(`Price changed for variant ${item.variantId}. Expected ${item.expectedPrice}, but current price is ${priceAtPurchase}. Please refresh your cart.`);
      }

      subtotal += priceAtPurchase * item.quantity;
      
      itemsToInsert.push({
        variantId: variant.id,
        quantity: item.quantity,
        priceAtPurchase: priceAtPurchase.toString(), // Store as string for precise decimal
      });
      
      // Decrement stock (atomic check via where clause)
      await tx.update(variants)
        .set({ stock: variant.stock - item.quantity })
        .where(eq(variants.id, variant.id));
    }
    
    const grandTotal = subtotal + authoritativeDeliveryFee;

    // Create order
    const orderRes = await tx.insert(orders).values({
      userId,
      status: 'PENDING',
      totalAmount: grandTotal.toString(), // Base total
      deliveryFee: authoritativeDeliveryFee.toString(),
      deliveryAddress,
      landmark,
      deliveryZone: zone.name, // Store the name for history so it doesn't change if zone is renamed
      deliveryInstructions,
      paymentState: 'INITIATED',
    }).returning();
    
    const order = orderRes[0];
    
    // Create order items
    for (const item of itemsToInsert) {
      await tx.insert(orderItems).values({
        orderId: order.id,
        ...item
      });
    }

    // Initialize delivery record
    await tx.insert(deliveries).values({
      orderId: order.id,
      status: 'UNASSIGNED',
    });

    // Record initial audit event
    await tx.insert(orderAuditLogs).values({
      orderId: order.id,
      actorId: userId,
      actorRole: 'CUSTOMER',
      action: 'CREATED',
      fromState: null,
      toState: 'PENDING',
      reason: 'Order placed by customer',
      metadata: {
        totalAmount: grandTotal,
        deliveryFee: authoritativeDeliveryFee,
        deliveryZone: zone.name,
        itemCount: items.length
      }
    });
    
    // Safely emit notifications (asynchronous non-blocking)
    Promise.resolve().then(async () => {
      try {
        await notificationService.createNotification({
          userId,
          type: 'ORDER_STATUS',
          title: `Order #${order.id} Placed`,
          message: `Your order for KES ${Number(grandTotal).toLocaleString()} has been placed and is awaiting confirmation.`,
          relatedEntityType: 'ORDER',
          relatedEntityId: order.id,
        });

        await notificationService.notifyAdmins({
          type: 'ADMIN_ALERT',
          title: `New Order #${order.id}`,
          message: `New order #${order.id} received in zone ${zone.name} for KES ${Number(grandTotal).toLocaleString()}.`,
          relatedEntityType: 'ORDER',
          relatedEntityId: order.id,
        });
      } catch (err) {
        console.error('[Notification] Order placement notification error:', err);
      }
    });

    return order;
  });
}
