import { db } from '../db/index.ts';
import { supportTickets, supportMessages, supportAuditLogs, users, orders } from '../db/schema.ts';
import { eq, desc, and, or, sql, inArray } from 'drizzle-orm';

export type SupportCategory = 'ORDER_ISSUE' | 'DELIVERY_STATUS' | 'QUALITY_ISSUE' | 'PAYMENT_ISSUE' | 'ACCOUNT_INQUIRY' | 'OTHER';
export type SupportStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SupportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface CreateTicketInput {
  orderId?: number | null;
  category: SupportCategory;
  subject: string;
  message: string;
  priority?: SupportPriority;
}

export class SupportService {
  /**
   * Customer creates an authorized support request.
   * If an orderId is provided, ownership is verified server-side.
   */
  async createTicket(userId: number, userEmail: string, input: CreateTicketInput) {
    const { orderId, category, subject, message, priority = 'MEDIUM' } = input;

    if (!subject || subject.trim().length < 3) {
      throw new Error('Subject is required (at least 3 characters).');
    }
    if (!message || message.trim().length < 5) {
      throw new Error('Message details are required (at least 5 characters).');
    }

    let linkedOrderId: number | null = null;
    if (orderId) {
      const orderRes = await db.select().from(orders).where(eq(orders.id, orderId));
      const order = orderRes[0];
      if (!order) {
        throw new Error(`Referenced order #${orderId} was not found.`);
      }
      if (order.userId !== userId) {
        throw new Error(`Unauthorized: You do not have permission to reference order #${orderId}.`);
      }
      linkedOrderId = order.id;
    }

    // Generate unique human-readable ticket number (e.g. TICK-102948)
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const ticketNumber = `TICK-${randomSuffix}`;

    return await db.transaction(async (tx) => {
      // 1. Create ticket
      const [newTicket] = await tx.insert(supportTickets).values({
        ticketNumber,
        userId,
        orderId: linkedOrderId,
        category: category || 'ORDER_ISSUE',
        subject: subject.trim(),
        status: 'OPEN',
        priority: priority || 'MEDIUM',
        internalNotes: null,
      }).returning();

      // 2. Insert initial opening message from customer
      const [initialMessage] = await tx.insert(supportMessages).values({
        ticketId: newTicket.id,
        senderId: userId,
        senderRole: 'CUSTOMER',
        message: message.trim(),
        isInternalNote: false,
      }).returning();

      // 3. Record audit log
      await tx.insert(supportAuditLogs).values({
        ticketId: newTicket.id,
        actorId: userId,
        actorRole: 'CUSTOMER',
        action: 'CREATED',
        fromStatus: null,
        toStatus: 'OPEN',
        details: `Ticket created by ${userEmail}. Category: ${category}`,
        metadata: {
          category,
          priority,
          orderId: linkedOrderId,
        },
      });

      return { ticket: newTicket, message: initialMessage };
    });
  }

  /**
   * Retrieves all tickets created by the authenticated customer.
   */
  async getUserTickets(userId: number) {
    const list = await db.select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      orderId: supportTickets.orderId,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      resolvedAt: supportTickets.resolvedAt,
      orderStatus: orders.status,
      orderTotalAmount: orders.totalAmount,
    })
    .from(supportTickets)
    .leftJoin(orders, eq(supportTickets.orderId, orders.id))
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.updatedAt));

    return list;
  }

  /**
   * Retrieves all support tickets for Admin Dashboard management.
   */
  async getAdminTickets(filters?: { status?: string; category?: string; priority?: string; search?: string }) {
    let query = db.select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      userId: supportTickets.userId,
      orderId: supportTickets.orderId,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      assignedTo: supportTickets.assignedTo,
      internalNotes: supportTickets.internalNotes,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      resolvedAt: supportTickets.resolvedAt,
      customerEmail: users.email,
      orderTotalAmount: orders.totalAmount,
      orderStatus: orders.status,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .leftJoin(orders, eq(supportTickets.orderId, orders.id))
    .orderBy(desc(supportTickets.updatedAt));

    const allTickets = await query;

    let filtered = allTickets;
    if (filters?.status && filters.status !== 'ALL') {
      filtered = filtered.filter(t => t.status === filters.status);
    }
    if (filters?.category && filters.category !== 'ALL') {
      filtered = filtered.filter(t => t.category === filters.category);
    }
    if (filters?.priority && filters.priority !== 'ALL') {
      filtered = filtered.filter(t => t.priority === filters.priority);
    }
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase().trim();
      filtered = filtered.filter(t =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.customerEmail?.toLowerCase().includes(q) ||
        (t.orderId && t.orderId.toString().includes(q))
      );
    }

    const stats = {
      totalCount: allTickets.length,
      openCount: allTickets.filter(t => t.status === 'OPEN').length,
      inProgressCount: allTickets.filter(t => t.status === 'IN_PROGRESS').length,
      resolvedCount: allTickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
      urgentCount: allTickets.filter(t => t.priority === 'URGENT' && t.status !== 'CLOSED').length,
    };

    return { tickets: filtered, stats };
  }

  /**
   * Fetches ticket conversation thread and details.
   * STRICT SECURITY: Customers NEVER receive internal notes or private staff data.
   */
  async getTicketDetails(ticketId: number, requester: { id: number; role: string }) {
    const ticketRes = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    const ticket = ticketRes[0];
    if (!ticket) return null;

    const isAdmin = requester.role === 'ADMIN';
    const isOwner = ticket.userId === requester.id;

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized access to support ticket.');
    }

    // Customer info
    const customerRes = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, ticket.userId));
    const customer = customerRes[0] || null;

    // Staff Assignee info
    let assignee = null;
    if (ticket.assignedTo) {
      const assignRes = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, ticket.assignedTo));
      assignee = assignRes[0] || null;
    }

    // Order info if linked
    let order = null;
    if (ticket.orderId) {
      const orderRes = await db.select().from(orders).where(eq(orders.id, ticket.orderId));
      order = orderRes[0] || null;
    }

    // Messages
    const rawMessages = await db.select({
      id: supportMessages.id,
      ticketId: supportMessages.ticketId,
      senderId: supportMessages.senderId,
      senderRole: supportMessages.senderRole,
      message: supportMessages.message,
      isInternalNote: supportMessages.isInternalNote,
      createdAt: supportMessages.createdAt,
      senderEmail: users.email,
    })
    .from(supportMessages)
    .leftJoin(users, eq(supportMessages.senderId, users.id))
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(supportMessages.createdAt);

    // Filter out internal notes for customers
    const messages = isAdmin ? rawMessages : rawMessages.filter(m => !m.isInternalNote);

    // Audit logs for Admin
    let auditLogs: any[] = [];
    if (isAdmin) {
      auditLogs = await db.select({
        id: supportAuditLogs.id,
        ticketId: supportAuditLogs.ticketId,
        actorId: supportAuditLogs.actorId,
        actorRole: supportAuditLogs.actorRole,
        action: supportAuditLogs.action,
        fromStatus: supportAuditLogs.fromStatus,
        toStatus: supportAuditLogs.toStatus,
        details: supportAuditLogs.details,
        createdAt: supportAuditLogs.createdAt,
        actorEmail: users.email,
      })
      .from(supportAuditLogs)
      .leftJoin(users, eq(supportAuditLogs.actorId, users.id))
      .where(eq(supportAuditLogs.ticketId, ticketId))
      .orderBy(desc(supportAuditLogs.createdAt));
    }

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      userId: ticket.userId,
      orderId: ticket.orderId,
      category: ticket.category,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo,
      internalNotes: isAdmin ? ticket.internalNotes : undefined, // Strip internal notes for customers
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      resolvedAt: ticket.resolvedAt,
      customer,
      assignee,
      order,
      messages,
      auditLogs,
    };
  }

  /**
   * Adds a message / response to a ticket thread.
   */
  async addMessage(
    ticketId: number,
    sender: { id: number; role: string; email: string },
    messageText: string,
    isInternalNote: boolean = false
  ) {
    if (!messageText || messageText.trim().length === 0) {
      throw new Error('Message cannot be empty.');
    }

    const ticketRes = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    const ticket = ticketRes[0];
    if (!ticket) {
      throw new Error('Ticket not found.');
    }

    const isAdmin = sender.role === 'ADMIN';
    const isOwner = ticket.userId === sender.id;

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized: You cannot post to this ticket.');
    }

    // Customers can NEVER post internal notes
    const effectiveInternalNote = isAdmin ? Boolean(isInternalNote) : false;

    return await db.transaction(async (tx) => {
      const [newMsg] = await tx.insert(supportMessages).values({
        ticketId,
        senderId: sender.id,
        senderRole: sender.role,
        message: messageText.trim(),
        isInternalNote: effectiveInternalNote,
      }).returning();

      // If customer replies to a resolved ticket, optionally transition back to IN_PROGRESS
      let newStatus = ticket.status;
      if (!isAdmin && ticket.status === 'RESOLVED') {
        newStatus = 'IN_PROGRESS';
      }

      await tx.update(supportTickets)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));

      // Record audit log
      await tx.insert(supportAuditLogs).values({
        ticketId,
        actorId: sender.id,
        actorRole: sender.role,
        action: effectiveInternalNote ? 'NOTE_ADDED' : 'REPLIED',
        fromStatus: ticket.status,
        toStatus: newStatus,
        details: effectiveInternalNote
          ? `Internal staff note added by ${sender.email}`
          : `Reply sent by ${sender.email}`,
      });

      return newMsg;
    });
  }

  /**
   * Admin updates ticket lifecycle status (OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED).
   */
  async updateTicketStatus(
    ticketId: number,
    actor: { id: number; role: string; email: string },
    newStatus: SupportStatus,
    reasonOrNotes?: string
  ) {
    if (actor.role !== 'ADMIN') {
      throw new Error('Forbidden: Only administrators can update ticket status.');
    }

    const validStatuses: SupportStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    return await db.transaction(async (tx) => {
      const ticketRes = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
      const ticket = ticketRes[0];
      if (!ticket) throw new Error('Ticket not found.');

      const [updatedTicket] = await tx.update(supportTickets)
        .set({
          status: newStatus,
          resolvedAt: newStatus === 'RESOLVED' || newStatus === 'CLOSED' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId))
        .returning();

      await tx.insert(supportAuditLogs).values({
        ticketId,
        actorId: actor.id,
        actorRole: 'ADMIN',
        action: newStatus === 'RESOLVED' ? 'RESOLVED' : newStatus === 'CLOSED' ? 'CLOSED' : 'STATUS_CHANGE',
        fromStatus: ticket.status,
        toStatus: newStatus,
        details: reasonOrNotes || `Ticket status changed from ${ticket.status} to ${newStatus} by ${actor.email}`,
      });

      return updatedTicket;
    });
  }

  /**
   * Admin assigns staff member to a ticket.
   */
  async assignTicket(
    ticketId: number,
    actor: { id: number; role: string; email: string },
    assignedToUserId: number | null
  ) {
    if (actor.role !== 'ADMIN') {
      throw new Error('Forbidden: Only administrators can assign tickets.');
    }

    return await db.transaction(async (tx) => {
      let assigneeEmail = 'Unassigned';
      if (assignedToUserId) {
        const staffRes = await tx.select().from(users).where(eq(users.id, assignedToUserId));
        if (staffRes.length === 0) {
          throw new Error('Assigned staff user not found.');
        }
        assigneeEmail = staffRes[0].email;
      }

      const [updatedTicket] = await tx.update(supportTickets)
        .set({
          assignedTo: assignedToUserId,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId))
        .returning();

      await tx.insert(supportAuditLogs).values({
        ticketId,
        actorId: actor.id,
        actorRole: 'ADMIN',
        action: 'ASSIGNED',
        details: `Assigned to ${assigneeEmail} by ${actor.email}`,
        metadata: { assignedToUserId },
      });

      return updatedTicket;
    });
  }

  /**
   * Admin updates private internal notes on a ticket.
   */
  async updateInternalNotes(
    ticketId: number,
    actor: { id: number; role: string; email: string },
    internalNotes: string
  ) {
    if (actor.role !== 'ADMIN') {
      throw new Error('Forbidden: Only administrators can modify internal notes.');
    }

    const [updatedTicket] = await db.update(supportTickets)
      .set({
        internalNotes: internalNotes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticketId))
      .returning();

    await db.insert(supportAuditLogs).values({
      ticketId,
      actorId: actor.id,
      actorRole: 'ADMIN',
      action: 'NOTE_ADDED',
      details: `Internal notes updated by ${actor.email}`,
    });

    return updatedTicket;
  }
}

export const supportService = new SupportService();
