import { db } from '../db/index.ts';
import { orders, orderItems, deliveries, payments, variants, users, products, orderAuditLogs } from '../db/schema.ts';
import { eq, desc, inArray, and, sql } from 'drizzle-orm';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'PICKUP_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export type PaymentState = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type DeliveryStatus = 'UNASSIGNED' | 'ASSIGNED' | 'ACCEPTED' | 'PICKUP_READY' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'PENDING': ['CONFIRMED', 'CANCELLED', 'FAILED'],
  'CONFIRMED': ['PROCESSING', 'PICKUP_READY', 'CANCELLED', 'FAILED'],
  'PROCESSING': ['PICKUP_READY', 'CANCELLED', 'FAILED'],
  'PICKUP_READY': ['OUT_FOR_DELIVERY', 'CANCELLED', 'FAILED'],
  'OUT_FOR_DELIVERY': ['DELIVERED', 'FAILED', 'CANCELLED'],
  'DELIVERED': [],
  'FAILED': ['CANCELLED'], // Can close out a failed order as cancelled
  'CANCELLED': []
};

export interface AuditParams {
  orderId: number;
  actorId?: number | null;
  actorRole: 'CUSTOMER' | 'ADMIN' | 'DELIVERER' | 'SYSTEM';
  action: 'CREATED' | 'STATUS_CHANGE' | 'PAYMENT_STATE_CHANGE' | 'DELIVERY_CHANGE' | 'EXCEPTION' | 'CANCELLED' | 'ASSIGNED';
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
}

export class OrderOperationsService {
  /**
   * Records an immutable audit log entry for an order lifecycle event.
   */
  async recordAudit(params: AuditParams, txOrDb: any = db) {
    return await txOrDb.insert(orderAuditLogs).values({
      orderId: params.orderId,
      actorId: params.actorId || null,
      actorRole: params.actorRole,
      action: params.action,
      fromState: params.fromState || null,
      toState: params.toState || null,
      reason: params.reason?.trim() || null,
      metadata: params.metadata || null,
    }).returning();
  }

  /**
   * Verifies if a requested order status transition is valid.
   */
  isValidOrderTransition(current: OrderStatus, next: OrderStatus, isAdmin: boolean = false): boolean {
    if (current === next) return true;
    if (isAdmin) {
      // Admins are permitted to correct order states, except resurrecting terminal states without explicit intent
      if (['DELIVERED', 'CANCELLED'].includes(current) && !['CANCELLED', 'FAILED'].includes(next)) {
        return false;
      }
      return true;
    }
    const allowed = VALID_ORDER_TRANSITIONS[current] || [];
    return allowed.includes(next);
  }

  /**
   * Restores variant inventory for an order (e.g. upon cancellation).
   */
  async restoreStockForOrder(orderId: number, tx: any) {
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      const variantRes = await tx.select().from(variants).where(eq(variants.id, item.variantId));
      if (variantRes.length > 0) {
        const variant = variantRes[0];
        await tx.update(variants)
          .set({ stock: variant.stock + item.quantity })
          .where(eq(variants.id, variant.id));
      }
    }
  }

  /**
   * Transitions an order's status with state machine checks, inventory handling, and audit logging.
   */
  async transitionOrderStatus(params: {
    orderId: number;
    newStatus: OrderStatus;
    actor: { id: number; role: string; email: string };
    reason?: string;
    metadata?: Record<string, any>;
  }) {
    const { orderId, newStatus, actor, reason, metadata } = params;

    return await db.transaction(async (tx) => {
      const orderRes = await tx.select().from(orders).where(eq(orders.id, orderId));
      const order = orderRes[0];
      if (!order) {
        throw new Error(`Order #${orderId} not found`);
      }

      const currentStatus = order.status as OrderStatus;
      const isAdmin = actor.role === 'ADMIN';

      if (['FAILED', 'CANCELLED'].includes(newStatus) && !reason) {
        throw new Error(`A reason is required when transitioning order #${orderId} to ${newStatus}`);
      }

      if (!this.isValidOrderTransition(currentStatus, newStatus, isAdmin)) {
        throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus} for order #${orderId}`);
      }

      // If cancelling an order that was not already cancelled or delivered, restore inventory stock
      if (newStatus === 'CANCELLED' && currentStatus !== 'CANCELLED' && currentStatus !== 'DELIVERED') {
        await this.restoreStockForOrder(orderId, tx);
      }

      // Update order status
      const [updatedOrder] = await tx.update(orders)
        .set({
          status: newStatus,
          updatedAt: new Date()
        })
        .where(eq(orders.id, orderId))
        .returning();

      // If terminal status (CANCELLED / FAILED), sync delivery record status if active
      if (['CANCELLED', 'FAILED'].includes(newStatus)) {
        const delRes = await tx.select().from(deliveries).where(eq(deliveries.orderId, orderId));
        if (delRes.length > 0 && !['DELIVERED', 'CANCELLED', 'FAILED'].includes(delRes[0].status)) {
          await tx.update(deliveries)
            .set({
              status: newStatus,
              failureReason: reason || 'Order cancelled by management',
              cancelledAt: newStatus === 'CANCELLED' ? new Date() : undefined,
              failedAt: newStatus === 'FAILED' ? new Date() : undefined,
              updatedAt: new Date()
            })
            .where(eq(deliveries.id, delRes[0].id));
        }
      }

      // Record audit log
      await this.recordAudit({
        orderId,
        actorId: actor.id,
        actorRole: (actor.role as any) || 'ADMIN',
        action: newStatus === 'CANCELLED' ? 'CANCELLED' : 'STATUS_CHANGE',
        fromState: currentStatus,
        toState: newStatus,
        reason: reason || null,
        metadata: metadata || null,
      }, tx);

      return updatedOrder;
    });
  }

  /**
   * Customer-initiated cancellation with strict validation rules.
   */
  async cancelOrderByCustomer(params: {
    orderId: number;
    userId: number;
    reason: string;
  }) {
    const { orderId, userId, reason } = params;

    if (!reason || reason.trim().length === 0) {
      throw new Error("A cancellation reason is required.");
    }

    return await db.transaction(async (tx) => {
      const orderRes = await tx.select().from(orders).where(eq(orders.id, orderId));
      const order = orderRes[0];

      if (!order) {
        throw new Error("Order not found.");
      }

      if (order.userId !== userId) {
        throw new Error("Unauthorized to cancel this order.");
      }

      // Customer can only cancel if order is in PENDING or CONFIRMED state and not dispatched
      if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
        throw new Error(`Order cannot be cancelled in its current status (${order.status}). Please contact support.`);
      }

      // Check delivery status
      const delRes = await tx.select().from(deliveries).where(eq(deliveries.orderId, orderId));
      if (delRes.length > 0 && ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(delRes[0].status)) {
        throw new Error("Order is already in transit or delivered and cannot be cancelled.");
      }

      // Restore stock
      await this.restoreStockForOrder(orderId, tx);

      // Update order
      const [updatedOrder] = await tx.update(orders)
        .set({
          status: 'CANCELLED',
          updatedAt: new Date()
        })
        .where(eq(orders.id, orderId))
        .returning();

      // Update delivery
      if (delRes.length > 0) {
        await tx.update(deliveries)
          .set({
            status: 'CANCELLED',
            failureReason: `Customer cancelled: ${reason.trim()}`,
            cancelledAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(deliveries.id, delRes[0].id));
      }

      // Record audit log
      await this.recordAudit({
        orderId,
        actorId: userId,
        actorRole: 'CUSTOMER',
        action: 'CANCELLED',
        fromState: order.status,
        toState: 'CANCELLED',
        reason: reason.trim(),
        metadata: { initiatedBy: 'CUSTOMER' }
      }, tx);

      return updatedOrder;
    });
  }

  /**
   * Records an operational exception / incident for an order.
   */
  async recordOrderException(params: {
    orderId: number;
    actor: { id: number; role: string; email: string };
    exceptionType: string;
    details: string;
    actionTaken?: string;
  }) {
    const { orderId, actor, exceptionType, details, actionTaken } = params;

    if (!details || details.trim().length === 0) {
      throw new Error("Exception details are required.");
    }

    return await db.transaction(async (tx) => {
      const orderRes = await tx.select().from(orders).where(eq(orders.id, orderId));
      const order = orderRes[0];
      if (!order) throw new Error("Order not found");

      const [audit] = await this.recordAudit({
        orderId,
        actorId: actor.id,
        actorRole: (actor.role as any) || 'ADMIN',
        action: 'EXCEPTION',
        fromState: order.status,
        toState: order.status,
        reason: `[${exceptionType}] ${details.trim()}`,
        metadata: {
          exceptionType,
          details: details.trim(),
          actionTaken: actionTaken?.trim() || null
        }
      }, tx);

      return audit;
    });
  }

  /**
   * Fetches full order operational details (with security check).
   */
  async getOrderById(orderId: number, requester: { id: number; role: string }) {
    const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
    const order = orderRes[0];
    if (!order) return null;

    const isAdmin = requester.role === 'ADMIN';
    const isDeliverer = requester.role === 'DELIVERER';
    const isOwner = order.userId === requester.id;

    if (!isAdmin && !isOwner && !isDeliverer) {
      throw new Error("Unauthorized access to order");
    }

    // Fetch items
    const items = await db.select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      priceAtPurchase: orderItems.priceAtPurchase,
      variant: variants,
      product: products
    })
    .from(orderItems)
    .leftJoin(variants, eq(orderItems.variantId, variants.id))
    .leftJoin(products, eq(variants.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

    // Fetch delivery
    const deliveryRes = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
    const delivery = deliveryRes[0] || null;

    // Fetch deliverer user info if admin or deliverer
    let delivererUser = null;
    if (delivery && delivery.delivererId && (isAdmin || isDeliverer)) {
      const delivererRes = await db.select({
        id: users.id,
        email: users.email,
        isAvailable: users.isAvailable
      }).from(users).where(eq(users.id, delivery.delivererId));
      delivererUser = delivererRes[0] || null;
    }

    // Fetch customer details if admin
    let customerUser = null;
    if (isAdmin) {
      const userRes = await db.select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt
      }).from(users).where(eq(users.id, order.userId));
      customerUser = userRes[0] || null;
    }

    // Fetch payment attempts
    let paymentRecords: any[] = [];
    if (isAdmin || isOwner) {
      paymentRecords = await db.select().from(payments)
        .where(eq(payments.orderId, orderId))
        .orderBy(desc(payments.createdAt));
    }

    // Fetch audit logs
    let auditLogs: any[] = [];
    if (isAdmin) {
      auditLogs = await db.select({
        id: orderAuditLogs.id,
        actorId: orderAuditLogs.actorId,
        actorRole: orderAuditLogs.actorRole,
        action: orderAuditLogs.action,
        fromState: orderAuditLogs.fromState,
        toState: orderAuditLogs.toState,
        reason: orderAuditLogs.reason,
        metadata: orderAuditLogs.metadata,
        createdAt: orderAuditLogs.createdAt,
        actorEmail: users.email
      })
      .from(orderAuditLogs)
      .leftJoin(users, eq(orderAuditLogs.actorId, users.id))
      .where(eq(orderAuditLogs.orderId, orderId))
      .orderBy(desc(orderAuditLogs.createdAt));
    } else if (isOwner) {
      // Return filtered timeline for customer (non-internal)
      const logs = await db.select().from(orderAuditLogs)
        .where(eq(orderAuditLogs.orderId, orderId))
        .orderBy(desc(orderAuditLogs.createdAt));
      auditLogs = logs.map(l => ({
        action: l.action,
        fromState: l.fromState,
        toState: l.toState,
        createdAt: l.createdAt,
        reason: ['CANCELLED', 'EXCEPTION'].includes(l.action) ? l.reason : undefined
      }));
    }

    return {
      ...order,
      items,
      delivery,
      deliverer: delivererUser,
      customer: customerUser,
      payments: paymentRecords,
      auditLogs
    };
  }
}

export const orderOperationsService = new OrderOperationsService();
