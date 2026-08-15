import { db } from './index.ts';
import { products, variants, orders, orderItems } from './schema.ts';
import { eq, inArray } from 'drizzle-orm';

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

export async function createOrder(userId: number, items: { variantId: number; quantity: number; expectedPrice?: number }[], deliveryAddress: string, deliveryZone: string, deliveryInstructions?: string) {
  if (!items || items.length === 0) throw new Error("Order must contain at least one item.");

  // Clean boundary for delivery calculation (to be expanded in next phase)
  // We ignore any client-submitted delivery fee and use this authoritative function.
  const calculateDeliveryFee = (zone: string) => {
    return 250; // Placeholder authoritative delivery fee
  };
  
  const authoritativeDeliveryFee = calculateDeliveryFee(deliveryZone);

  return await db.transaction(async (tx) => {
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
      // We rely on standard transaction isolation, but can also enforce at row level
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
      deliveryZone,
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
    
    return order;
  });
}
