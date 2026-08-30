import { db } from '../db/index.ts';
import { orders, refundRequests, refundAuditLogs, orderAuditLogs, payments, users, variants, orderItems, products } from '../db/schema.ts';
import { eq, desc, and, or, sql, inArray, ilike } from 'drizzle-orm';
import { paymentService, PaymentProvider, isValidProvider } from './payment.ts';
import { orderOperationsService } from './orderOperations.ts';
import { notificationService } from './notificationService.ts';

export type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export function isValidRefundTransition(from: RefundStatus, to: RefundStatus): boolean {
  if (from === to) return false;
  switch (from) {
    case 'REQUESTED': return ['APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(to);
    case 'PROCESSING': return ['COMPLETED', 'FAILED'].includes(to);
    case 'APPROVED': return ['PROCESSING', 'COMPLETED', 'FAILED'].includes(to);
    case 'COMPLETED': return false;
    case 'REJECTED': return false;
    case 'FAILED': return ['PROCESSING', 'COMPLETED'].includes(to);
    default: return false;
  }
}

export interface RefundEligibilityResult {
  isEligible: boolean;
  order?: any;
  existingRefund?: any;
  reason?: string;
}

export interface RefundRequestInput {
  orderId: number;
  reason: string;
  amount?: number;
}

export interface AdminRefundReviewInput {
  action: 'APPROVE' | 'REJECT';
  reason?: string;
  adminNotes?: string;
}

export class RefundService {
  /**
   * Checks if an order is eligible for a customer refund request.
   * Enforces server-side customer ownership, payment state, and idempotency (no active duplicate refund).
   */
  async checkRefundEligibility(userId: number, orderId: number): Promise<RefundEligibilityResult> {
    const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
    const order = orderRes[0];

    if (!order) {
      return { isEligible: false, reason: 'Order not found.' };
    }

    if (order.userId !== userId) {
      return { isEligible: false, reason: 'Unauthorized: You do not own this order.' };
    }

    // Check for existing refund requests on this order
    const existingRefunds = await db.select()
      .from(refundRequests)
      .where(eq(refundRequests.orderId, orderId))
      .orderBy(desc(refundRequests.createdAt));

    const activeRefund = existingRefunds.find(r => ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'].includes(r.status));
    if (activeRefund) {
      return {
        isEligible: false,
        order,
        existingRefund: activeRefund,
        reason: `A refund request is already ${activeRefund.status.toLowerCase()} for this order.`,
      };
    }

    // Payment state validation: Order must be successfully paid
    if (order.paymentState !== 'SUCCESS') {
      return {
        isEligible: false,
        order,
        reason: `Only orders with successful payment (currently ${order.paymentState}) are eligible for refunds.`,
      };
    }

    // Order status validation: Order must be delivered, cancelled, or failed
    if (!['DELIVERED', 'CANCELLED', 'FAILED'].includes(order.status)) {
      return {
        isEligible: false,
        order,
        reason: `Refunds can only be requested for delivered, cancelled, or failed orders (currently ${order.status}).`,
      };
    }

    return {
      isEligible: true,
      order,
      existingRefund: existingRefunds[0] || null,
    };
  }

  /**
   * Customer submits a refund request for an authorized order.
   */
  async requestRefund(userId: number, userEmail: string, input: RefundRequestInput) {
    const { orderId, reason, amount } = input;

    if (!reason || reason.trim().length < 5) {
      throw new Error('Please provide a detailed reason for the refund request (at least 5 characters).');
    }

    const eligibility = await this.checkRefundEligibility(userId, orderId);
    if (!eligibility.isEligible) {
      throw new Error(eligibility.reason || 'This order is not eligible for a refund request.');
    }

    const order = eligibility.order;
    
    // Authoritative amount calculation & validation
    let refundAmount = order.totalAmount;
    if (amount !== undefined && amount !== null) {
      const parsed = Number(amount);
      if (isNaN(parsed) || parsed <= 0 || parsed > Number(order.totalAmount)) {
        throw new Error(`Requested refund amount (KES ${amount}) is invalid or exceeds authoritative order total of KES ${Number(order.totalAmount).toLocaleString()}.`);
      }
      refundAmount = parsed.toFixed(2);
    }

    // Find original payment info if available
    const paymentRecords = await db.select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'SUCCESS')))
      .orderBy(desc(payments.createdAt));

    const originalPayment = paymentRecords[0] || null;

    return await db.transaction(async (tx) => {
      // Create refund request
      const [newRefund] = await tx.insert(refundRequests).values({
        orderId,
        userId,
        amount: refundAmount,
        reason: reason.trim(),
        status: 'REQUESTED',
        provider: originalPayment?.provider || 'M-PESA',
        providerReference: originalPayment?.providerReference || null,
      }).returning();

      // Create refund audit log
      await tx.insert(refundAuditLogs).values({
        refundRequestId: newRefund.id,
        orderId,
        actorId: userId,
        actorRole: 'CUSTOMER',
        action: 'REQUESTED',
        fromStatus: null,
        toStatus: 'REQUESTED',
        reason: reason.trim(),
        metadata: {
          requestedAmount: refundAmount,
          customerEmail: userEmail,
          originalPaymentId: originalPayment?.id || null,
        },
      });

      // Also record in Order audit logs for end-to-end timeline visibility
      await tx.insert(orderAuditLogs).values({
        orderId,
        actorId: userId,
        actorRole: 'CUSTOMER',
        action: 'EXCEPTION',
        fromState: order.status,
        toState: order.status,
        reason: `[REFUND_REQUESTED] Customer requested refund of KES ${refundAmount}: ${reason.trim()}`,
        metadata: {
          refundRequestId: newRefund.id,
          amount: refundAmount,
        },
      });

      // Safe notification dispatch
      Promise.resolve().then(async () => {
        try {
          await notificationService.createNotification({
            userId,
            type: 'REFUND_UPDATE',
            title: `Refund Requested for Order #${orderId}`,
            message: `Your request for a refund of KES ${Number(refundAmount).toLocaleString()} for order #${orderId} is being reviewed.`,
            relatedEntityType: 'REFUND',
            relatedEntityId: newRefund.id,
          });

          await notificationService.notifyAdmins({
            type: 'ADMIN_ALERT',
            title: `New Refund Request #${newRefund.id}`,
            message: `Customer requested refund of KES ${Number(refundAmount).toLocaleString()} on order #${orderId}. Reason: ${reason.trim()}`,
            relatedEntityType: 'REFUND',
            relatedEntityId: newRefund.id,
          });
        } catch (err) {
          console.error('[Notification] Refund request notification error:', err);
        }
      });

      return newRefund;
    });
  }

  /**
   * Retrieves all refund requests for Admin Dashboard management.
   */
  async getAdminRefunds(filters?: { status?: string; orderId?: number; search?: string }) {
    let query = db.select({
      id: refundRequests.id,
      orderId: refundRequests.orderId,
      userId: refundRequests.userId,
      amount: refundRequests.amount,
      reason: refundRequests.reason,
      status: refundRequests.status,
      provider: refundRequests.provider,
      providerReference: refundRequests.providerReference,
      rejectionReason: refundRequests.rejectionReason,
      adminNotes: refundRequests.adminNotes,
      processedBy: refundRequests.processedBy,
      processedAt: refundRequests.processedAt,
      createdAt: refundRequests.createdAt,
      updatedAt: refundRequests.updatedAt,
      customerEmail: users.email,
      orderTotalAmount: orders.totalAmount,
      orderStatus: orders.status,
      orderPaymentState: orders.paymentState,
      orderDeliveryZone: orders.deliveryZone,
      orderCreatedAt: orders.createdAt,
    })
    .from(refundRequests)
    .leftJoin(users, eq(refundRequests.userId, users.id))
    .leftJoin(orders, eq(refundRequests.orderId, orders.id))
    .orderBy(desc(refundRequests.createdAt));

    const allRefunds = await query;

    // Filter in-memory or query
    let filtered = allRefunds;
    if (filters?.status && filters.status !== 'ALL') {
      filtered = filtered.filter(r => r.status === filters.status);
    }
    if (filters?.orderId) {
      filtered = filtered.filter(r => r.orderId === filters.orderId);
    }
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase().trim();
      filtered = filtered.filter(r =>
        r.orderId.toString().includes(q) ||
        r.customerEmail?.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.providerReference?.toLowerCase().includes(q)
      );
    }

    // Calculate metrics
    const stats = {
      totalCount: allRefunds.length,
      requestedCount: allRefunds.filter(r => r.status === 'REQUESTED').length,
      approvedCount: allRefunds.filter(r => r.status === 'APPROVED' || r.status === 'COMPLETED').length,
      completedCount: allRefunds.filter(r => r.status === 'COMPLETED').length,
      rejectedCount: allRefunds.filter(r => r.status === 'REJECTED').length,
      totalRefundedAmount: allRefunds
        .filter(r => r.status === 'COMPLETED' || r.status === 'APPROVED')
        .reduce((sum, r) => sum + Number(r.amount || 0), 0),
    };

    return { refunds: filtered, stats };
  }

  /**
   * Retrieves refund requests for an authenticated customer.
   */
  async getUserRefunds(userId: number) {
    const list = await db.select({
      id: refundRequests.id,
      orderId: refundRequests.orderId,
      amount: refundRequests.amount,
      reason: refundRequests.reason,
      status: refundRequests.status,
      provider: refundRequests.provider,
      providerReference: refundRequests.providerReference,
      rejectionReason: refundRequests.rejectionReason,
      createdAt: refundRequests.createdAt,
      processedAt: refundRequests.processedAt,
      orderStatus: orders.status,
      orderTotalAmount: orders.totalAmount,
      orderPaymentState: orders.paymentState,
    })
    .from(refundRequests)
    .leftJoin(orders, eq(refundRequests.orderId, orders.id))
    .where(eq(refundRequests.userId, userId))
    .orderBy(desc(refundRequests.createdAt));

    return list;
  }

  /**
   * Retrieves full details for a single refund request, including audit trail.
   */
  async getRefundById(refundId: number, requester: { id: number; role: string }) {
    const refundRes = await db.select().from(refundRequests).where(eq(refundRequests.id, refundId));
    const refund = refundRes[0];
    if (!refund) return null;

    const isAdmin = requester.role === 'ADMIN';
    const isOwner = refund.userId === requester.id;

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized access to refund request.');
    }

    const orderRes = await db.select().from(orders).where(eq(orders.id, refund.orderId));
    const customerRes = await db.select().from(users).where(eq(users.id, refund.userId));
    
    let processor = null;
    if (refund.processedBy && isAdmin) {
      const procRes = await db.select().from(users).where(eq(users.id, refund.processedBy));
      processor = procRes[0] || null;
    }

    const auditLogs = await db.select({
      id: refundAuditLogs.id,
      actorId: refundAuditLogs.actorId,
      actorRole: refundAuditLogs.actorRole,
      action: refundAuditLogs.action,
      fromStatus: refundAuditLogs.fromStatus,
      toStatus: refundAuditLogs.toStatus,
      reason: refundAuditLogs.reason,
      metadata: refundAuditLogs.metadata,
      createdAt: refundAuditLogs.createdAt,
      actorEmail: users.email,
    })
    .from(refundAuditLogs)
    .leftJoin(users, eq(refundAuditLogs.actorId, users.id))
    .where(eq(refundAuditLogs.refundRequestId, refundId))
    .orderBy(desc(refundAuditLogs.createdAt));

    return {
      ...refund,
      order: orderRes[0] || null,
      customer: customerRes[0] ? { id: customerRes[0].id, email: customerRes[0].email } : null,
      processor: processor ? { id: processor.id, email: processor.email } : null,
      auditLogs: isAdmin ? auditLogs : auditLogs.filter(l => l.actorRole !== 'INTERNAL'),
    };
  }

  /**
   * Admin approves or rejects a refund request.
   * Integrates with payment provider adapter and updates order paymentState authoritatively.
   */
  async reviewRefund(
    refundId: number,
    adminUser: { id: number; role: string; email: string },
    input: AdminRefundReviewInput
  ) {
    const { action, reason, adminNotes } = input;

    if (adminUser.role !== 'ADMIN') {
      throw new Error('Forbidden: Only administrators can review refund requests.');
    }

    return await db.transaction(async (tx) => {
      const refundRes = await tx.select().from(refundRequests).where(eq(refundRequests.id, refundId));
      const refund = refundRes[0];
      if (!refund) {
        throw new Error('Refund request not found.');
      }

      if (refund.status !== 'REQUESTED') {
        throw new Error(`Refund #${refundId} is already in '${refund.status}' status and cannot be re-reviewed.`);
      }

      const orderRes = await tx.select().from(orders).where(eq(orders.id, refund.orderId));
      const order = orderRes[0];
      if (!order) {
        throw new Error('Linked order not found.');
      }

      // Handle Rejection
      if (action === 'REJECT') {
        if (!reason || reason.trim().length === 0) {
          throw new Error('A rejection reason is required to reject a refund request.');
        }

        const [updatedRefund] = await tx.update(refundRequests)
          .set({
            status: 'REJECTED',
            rejectionReason: reason.trim(),
            adminNotes: adminNotes?.trim() || null,
            processedBy: adminUser.id,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(refundRequests.id, refundId))
          .returning();

        // Audit log
        await tx.insert(refundAuditLogs).values({
          refundRequestId: refundId,
          orderId: order.id,
          actorId: adminUser.id,
          actorRole: 'ADMIN',
          action: 'REJECTED',
          fromStatus: 'REQUESTED',
          toStatus: 'REJECTED',
          reason: reason.trim(),
          metadata: {
            adminEmail: adminUser.email,
            adminNotes: adminNotes || null,
          },
        });

        await tx.insert(orderAuditLogs).values({
          orderId: order.id,
          actorId: adminUser.id,
          actorRole: 'ADMIN',
          action: 'EXCEPTION',
          fromState: order.status,
          toState: order.status,
          reason: `[REFUND_REJECTED] Refund request #${refundId} rejected by Admin: ${reason.trim()}`,
          metadata: { refundRequestId: refundId },
        });

        // Safe notification
        Promise.resolve().then(async () => {
          try {
            await notificationService.createNotification({
              userId: refund.userId,
              type: 'REFUND_UPDATE',
              title: `Refund Request #${refundId} Update`,
              message: `Your refund request for order #${order.id} was not approved. Reason: ${reason.trim()}`,
              relatedEntityType: 'REFUND',
              relatedEntityId: refundId,
            });
          } catch (err) {
            console.error('[Notification] Refund rejection notification error:', err);
          }
        });

        return { refund: updatedRefund, order };
      }

      // Handle Approval
      if (action === 'APPROVE') {
        // Double-refund protection: check order payment state
        if (order.paymentState === 'REFUNDED') {
          throw new Error(`Cannot approve refund: Order #${order.id} payment is already marked as REFUNDED.`);
        }

        // Double-refund protection: verify no other completed/approved/processing refund on this order
        const duplicateCheck = await tx.select()
          .from(refundRequests)
          .where(
            and(
              eq(refundRequests.orderId, order.id),
              inArray(refundRequests.status, ['APPROVED', 'COMPLETED', 'PROCESSING'])
            )
          );

        if (duplicateCheck.length > 0) {
          throw new Error(`Cannot approve refund: Order #${order.id} already has an approved/completed refund.`);
        }

        // Invoke payment provider refund adapter
        const providerName = (refund.provider || 'M-PESA') as PaymentProvider;
        const providerRef = refund.providerReference || `ORD-${order.id}-REF`;
        const refundAmountNum = Number(refund.amount);

        let providerResult;
        try {
          if (isValidProvider(providerName)) {
            providerResult = await paymentService.refund(providerName, providerRef, refundAmountNum);
          } else {
            providerResult = { success: false, isConfigured: false, error: `Invalid provider: ${providerName}` };
          }
        } catch (err: any) {
          providerResult = { success: false, isConfigured: false, error: err.message };
        }

        // Provider result handling:
        // - If provider is configured and succeeds: COMPLETED
        // - If provider is configured and fails: FAILED
        // - If provider integration is unconfigured/manual: APPROVED (authorized by admin, pending manual/gateway settlement)
        let newRefundStatus: RefundStatus = 'APPROVED';
        if (providerResult.isConfigured) {
          newRefundStatus = providerResult.success ? 'COMPLETED' : 'FAILED';
        } else {
          newRefundStatus = 'APPROVED';
        }

        if (!isValidRefundTransition(refund.status as RefundStatus, newRefundStatus)) {
          throw new Error(`Invalid refund state transition from ${refund.status} to ${newRefundStatus}.`);
        }

        const [updatedRefund] = await tx.update(refundRequests)
          .set({
            status: newRefundStatus,
            adminNotes: adminNotes?.trim() || null,
            processedBy: adminUser.id,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(refundRequests.id, refundId))
          .returning();

        // Update Order payment state to REFUNDED authoritatively when refund is approved/completed
        let updatedOrder = order;
        if (newRefundStatus === 'APPROVED' || newRefundStatus === 'COMPLETED') {
          const [resOrder] = await tx.update(orders)
            .set({
              paymentState: 'REFUNDED',
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id))
            .returning();
          updatedOrder = resOrder;
        }

        // Record refund audit log
        await tx.insert(refundAuditLogs).values({
          refundRequestId: refundId,
          orderId: order.id,
          actorId: adminUser.id,
          actorRole: 'ADMIN',
          action: 'APPROVED',
          fromStatus: 'REQUESTED',
          toStatus: newRefundStatus,
          reason: reason?.trim() || `Refund approved by Admin ${adminUser.email}`,
          metadata: {
            adminEmail: adminUser.email,
            adminNotes: adminNotes || null,
            providerResult,
            refundAmount: refund.amount,
          },
        });

        // Record Order audit log
        await tx.insert(orderAuditLogs).values({
          orderId: order.id,
          actorId: adminUser.id,
          actorRole: 'ADMIN',
          action: 'PAYMENT_STATE_CHANGE',
          fromState: order.paymentState,
          toState: 'REFUNDED',
          reason: `[REFUND_APPROVED] Refund #${refundId} (KES ${refund.amount}) approved & marked REFUNDED by Admin`,
          metadata: {
            refundRequestId: refundId,
            refundAmount: refund.amount,
            provider: providerName,
          },
        });

        // Safe notification
        Promise.resolve().then(async () => {
          try {
            await notificationService.createNotification({
              userId: refund.userId,
              type: 'REFUND_UPDATE',
              title: `Refund Approved: Order #${order.id}`,
              message: `Your refund of KES ${Number(refund.amount).toLocaleString()} for order #${order.id} has been approved. Status: ${newRefundStatus}.`,
              relatedEntityType: 'REFUND',
              relatedEntityId: refundId,
            });
          } catch (err) {
            console.error('[Notification] Refund approval notification error:', err);
          }
        });

        return { refund: updatedRefund, order: updatedOrder };
      }

      throw new Error(`Invalid review action: ${action}`);
    });
  }

  /**
   * Retrieves all refund audit logs for ledger inspection.
   */
  async getRefundAuditLogs(refundId?: number) {
    let query = db.select({
      id: refundAuditLogs.id,
      refundRequestId: refundAuditLogs.refundRequestId,
      orderId: refundAuditLogs.orderId,
      actorId: refundAuditLogs.actorId,
      actorRole: refundAuditLogs.actorRole,
      action: refundAuditLogs.action,
      fromStatus: refundAuditLogs.fromStatus,
      toStatus: refundAuditLogs.toStatus,
      reason: refundAuditLogs.reason,
      metadata: refundAuditLogs.metadata,
      createdAt: refundAuditLogs.createdAt,
      actorEmail: users.email,
    })
    .from(refundAuditLogs)
    .leftJoin(users, eq(refundAuditLogs.actorId, users.id))
    .orderBy(desc(refundAuditLogs.createdAt));

    if (refundId) {
      return await query.where(eq(refundAuditLogs.refundRequestId, refundId));
    }
    return await query;
  }
}

export const refundService = new RefundService();
