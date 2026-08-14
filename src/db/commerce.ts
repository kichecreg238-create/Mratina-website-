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

export async function createOrder(userId: number, items: { variantId: number; quantity: number }[], deliveryAddress: string, deliveryZone: string, deliveryFee: number, deliveryInstructions?: string) {
  return await db.transaction(async (tx) => {
    let totalAmount = 0;
    const itemsToInsert = [];
    
    for (const item of items) {
      const variantRes = await tx.select().from(variants).where(eq(variants.id, item.variantId));
      const variant = variantRes[0];
      
      if (!variant) throw new Error(`Variant ${item.variantId} not found`);
      if (variant.stock < item.quantity) throw new Error(`Insufficient stock for variant ${item.variantId}`);
      
      const priceAtPurchase = Number(variant.price);
      totalAmount += priceAtPurchase * item.quantity;
      
      itemsToInsert.push({
        variantId: variant.id,
        quantity: item.quantity,
        priceAtPurchase: priceAtPurchase.toString(), // Store as string for precise decimal
      });
      
      // Decrement stock
      await tx.update(variants)
        .set({ stock: variant.stock - item.quantity })
        .where(eq(variants.id, variant.id));
    }
    
    // Create order
    const orderRes = await tx.insert(orders).values({
      userId,
      status: 'PENDING',
      totalAmount: totalAmount.toString(), // Base total
      deliveryFee: deliveryFee.toString(),
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
