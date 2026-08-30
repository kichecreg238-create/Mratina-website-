import { db } from '../db/index.ts';
import { notifications, notificationPreferences, users } from '../db/schema.ts';
import { eq, desc, and, count, inArray } from 'drizzle-orm';

export type NotificationType =
  | 'ORDER_STATUS'
  | 'PAYMENT_UPDATE'
  | 'DELIVERY_UPDATE'
  | 'REFUND_UPDATE'
  | 'SUPPORT_RESPONSE'
  | 'ADMIN_ALERT'
  | 'SYSTEM'
  | 'PROMOTIONAL';

export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: 'ORDER' | 'PAYMENT' | 'REFUND' | 'SUPPORT_TICKET' | 'PRODUCT' | 'SYSTEM';
  relatedEntityId?: number;
  metadata?: Record<string, any>;
  channel?: 'IN_APP' | 'EMAIL_PENDING' | 'SMS_PENDING' | 'EXTERNAL_UNAVAILABLE';
}

export class NotificationService {
  /**
   * Dispatches a notification to a specific user.
   * Checks recipient preferences and safely executes without breaking callers.
   */
  async createNotification(params: CreateNotificationParams): Promise<any> {
    try {
      const { userId, type, title, message, relatedEntityType, relatedEntityId, metadata } = params;

      // Validate user existence
      const userRes = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId));
      if (userRes.length === 0) {
        console.warn(`[NotificationService] Target user ${userId} not found, skipping notification.`);
        return null;
      }

      // Check user preferences
      const prefRes = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
      const prefs = prefRes[0];

      if (prefs) {
        if (type === 'ORDER_STATUS' && !prefs.orderUpdates) return null;
        if (type === 'DELIVERY_UPDATE' && !prefs.deliveryUpdates) return null;
        if (type === 'PAYMENT_UPDATE' && !prefs.paymentUpdates) return null;
        if (type === 'SUPPORT_RESPONSE' && !prefs.supportUpdates) return null;
        if (type === 'REFUND_UPDATE' && !prefs.refundUpdates) return null;
        if (type === 'PROMOTIONAL' && !prefs.promotionalUpdates) return null;
        if (type === 'ADMIN_ALERT' && !prefs.adminAlerts) return null;
      }

      // Check external delivery provider availability
      // External SMS/Email services are documented as pending/unconfigured in sandbox
      const isEmailConfigured = Boolean(process.env.EMAIL_API_KEY || process.env.SENDGRID_API_KEY);
      const isSmsConfigured = Boolean(process.env.SMS_API_KEY || process.env.TWILIO_AUTH_TOKEN);

      let channel = 'IN_APP';
      if (params.channel) {
        channel = params.channel;
      } else if (!isEmailConfigured && !isSmsConfigured) {
        channel = 'IN_APP';
      }

      const [notification] = await db.insert(notifications).values({
        userId,
        type,
        title: title.trim(),
        message: message.trim(),
        relatedEntityType: relatedEntityType || null,
        relatedEntityId: relatedEntityId || null,
        isRead: false,
        channel,
        metadata: metadata || null,
      }).returning();

      return notification;
    } catch (error) {
      // Safe failure mode: notification dispatch failure must never crash business transactions
      console.error('[NotificationService] Failed to create notification:', error);
      return null;
    }
  }

  /**
   * Broadcasts an administrative alert to all users with ADMIN role.
   */
  async notifyAdmins(params: Omit<CreateNotificationParams, 'userId'>): Promise<void> {
    try {
      const adminUsers = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'ADMIN'));

      for (const admin of adminUsers) {
        await this.createNotification({
          ...params,
          userId: admin.id,
        });
      }
    } catch (error) {
      console.error('[NotificationService] Failed to notify admins:', error);
    }
  }

  /**
   * Retrieves notifications strictly owned by the given user.
   */
  async getUserNotifications(
    userId: number,
    options?: {
      type?: NotificationType;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const unreadOnly = options?.unreadOnly ?? false;
    const type = options?.type;

    const conditions = [eq(notifications.userId, userId)];
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }
    if (type) {
      conditions.push(eq(notifications.type, type));
    }

    return await db.select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Retrieves administrative alerts and system broadcasts.
   */
  async getAdminNotifications(limit: number = 50) {
    return await db.select()
      .from(notifications)
      .where(inArray(notifications.type, ['ADMIN_ALERT', 'ORDER_STATUS', 'REFUND_UPDATE', 'SUPPORT_RESPONSE']))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  /**
   * Retrieves unread notifications count for a user.
   */
  async getUnreadCount(userId: number): Promise<number> {
    const res = await db.select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    return Number(res[0]?.count || 0);
  }

  /**
   * Marks a single notification as read with strict ownership check.
   */
  async markAsRead(notificationId: number, userId: number) {
    const res = await db.update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      ))
      .returning();

    if (res.length === 0) {
      throw new Error('Notification not found or unauthorized.');
    }

    return res[0];
  }

  /**
   * Marks all notifications as read for a given user.
   */
  async markAllAsRead(userId: number) {
    const res = await db.update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ))
      .returning();

    return { updatedCount: res.length };
  }

  /**
   * Gets or initializes user notification preferences.
   */
  async getUserPreferences(userId: number) {
    const existing = await db.select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    if (existing.length > 0) {
      return existing[0];
    }

    // Initialize defaults
    const [created] = await db.insert(notificationPreferences)
      .values({
        userId,
        orderUpdates: true,
        deliveryUpdates: true,
        paymentUpdates: true,
        supportUpdates: true,
        refundUpdates: true,
        adminAlerts: true,
        promotionalUpdates: false,
      })
      .returning();

    return created;
  }

  /**
   * Alias for getUserPreferences.
   */
  async getPreferences(userId: number) {
    return this.getUserPreferences(userId);
  }

  /**
   * Updates user notification preferences.
   */
  async updateUserPreferences(userId: number, updates: {
    orderUpdates?: boolean;
    deliveryUpdates?: boolean;
    paymentUpdates?: boolean;
    supportUpdates?: boolean;
    refundUpdates?: boolean;
    adminAlerts?: boolean;
    promotionalUpdates?: boolean;
    emailNotifications?: boolean;
    smsNotifications?: boolean;
    inAppNotifications?: boolean;
  }) {
    // Ensure row exists
    await this.getUserPreferences(userId);

    const [updated] = await db.update(notificationPreferences)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.userId, userId))
      .returning();

    return updated;
  }

  /**
   * Alias for updateUserPreferences.
   */
  async updatePreferences(userId: number, updates: any) {
    return this.updateUserPreferences(userId, updates);
  }
}

export const notificationService = new NotificationService();
