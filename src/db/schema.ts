import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, boolean, decimal, integer, jsonb } from 'drizzle-orm/pg-core';

// Users table (Customers, Admins, Deliverers)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  role: text('role').notNull().default('CUSTOMER'), // CUSTOMER, ADMIN, DELIVERER
  isAvailable: boolean('is_available').default(false).notNull(), // DELIVERER availability
  createdAt: timestamp('created_at').defaultNow(),
});

// Products
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  abv: text('abv'),
  origin: text('origin'),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Product Variants (Volumes, Packaging, Pricing)
export const variants = pgTable('variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id),
  volume: text('volume').notNull(), // e.g., '750ml'
  packaging: text('packaging').notNull(), // e.g., 'Standard Glass', 'Gift Box'
  price: decimal('price', { precision: 10, scale: 2 }).notNull(), // Stored as exact decimal
  stock: integer('stock').notNull().default(0),
  isActive: boolean('is_active').default(true).notNull(),
});

// Delivery Zones
export const deliveryZones = pgTable('delivery_zones', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  fee: decimal('fee', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isAcceptingOrders: boolean('is_accepting_orders').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Orders
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  // Deprecating delivererId directly on order in favor of deliveries table, but keeping it for backward compatibility during transition
  delivererId: integer('deliverer_id').references(() => users.id), 
  status: text('status').notNull().default('PENDING'), // PENDING, CONFIRMED, ASSIGNED, PICKUP_READY, OUT_FOR_DELIVERY, DELIVERED, FAILED, CANCELLED
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).notNull(),
  deliveryAddress: text('delivery_address').notNull(),
  landmark: text('landmark'),
  deliveryZone: text('delivery_zone'), // We'll store the name to preserve history, or foreign key. String is fine for historical immutability.
  deliveryInstructions: text('delivery_instructions'),
  paymentState: text('payment_state').notNull().default('INITIATED'), // INITIATED, PENDING, SUCCESS, FAILED, REFUNDED
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Deliveries
export const deliveries = pgTable('deliveries', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  delivererId: integer('deliverer_id').references(() => users.id),
  status: text('status').notNull().default('UNASSIGNED'), // UNASSIGNED, ASSIGNED, ACCEPTED, PICKUP_READY, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED, FAILED, CANCELLED
  assignedAt: timestamp('assigned_at'),
  acceptedAt: timestamp('accepted_at'),
  pickupReadyAt: timestamp('pickup_ready_at'),
  pickedUpAt: timestamp('picked_up_at'),
  outForDeliveryAt: timestamp('out_for_delivery_at'),
  deliveredAt: timestamp('delivered_at'),
  failedAt: timestamp('failed_at'),
  cancelledAt: timestamp('cancelled_at'),
  failureReason: text('failure_reason'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  locationSource: text('location_source'), // MANUAL, GPS, MAP_PIN
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Payments
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  provider: text('provider').notNull(), // 'M-PESA', 'AIRTEL_MONEY'
  providerReference: text('provider_reference'), // Transaction ID
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING, SUCCESS, FAILED
  createdAt: timestamp('created_at').defaultNow(),
});

// Reviews
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  productId: integer('product_id').notNull().references(() => products.id),
  orderId: integer('order_id').references(() => orders.id),
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  reviewerName: text('reviewer_name'),
  status: text('status').notNull().default('PENDING'), // PENDING, APPROVED, REJECTED
  isApproved: boolean('is_approved').default(false).notNull(),
  rejectionReason: text('rejection_reason'),
  moderatedBy: integer('moderated_by').references(() => users.id),
  moderatedAt: timestamp('moderated_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Review Audit Logs (Auditability for review submissions & moderation actions)
export const reviewAuditLogs = pgTable('review_audit_logs', {
  id: serial('id').primaryKey(),
  reviewId: integer('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  actorId: integer('actor_id').references(() => users.id),
  actorRole: text('actor_role').notNull().default('ADMIN'), // 'CUSTOMER', 'ADMIN', 'SYSTEM'
  action: text('action').notNull(), // 'SUBMITTED', 'UPDATED', 'APPROVED', 'REJECTED', 'DELETED'
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Order Items
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  variantId: integer('variant_id').notNull().references(() => variants.id),
  quantity: integer('quantity').notNull(),
  priceAtPurchase: decimal('price_at_purchase', { precision: 10, scale: 2 }).notNull(),
});

// CMS Banners (Promotions, Announcements)
export const cmsBanners = pgTable('cms_banners', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  mediaUrl: text('media_url'),
  ctaLabel: text('cta_label'),
  ctaUrl: text('cta_url'),
  displayOrder: integer('display_order').default(0).notNull(),
  status: text('status').notNull().default('DRAFT'), // DRAFT, PUBLISHED
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// CMS Content Blocks (Predefined storefront sections)
export const cmsContentBlocks = pgTable('cms_content_blocks', {
  id: serial('id').primaryKey(),
  sectionKey: text('section_key').notNull(), // 'HERO_HEADLINE', 'HERO_STORY', 'CONCIERGE_PROMISE', 'HERITAGE_NOTE', 'PROMO_FEATURE'
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  body: text('body'),
  mediaUrl: text('media_url'),
  ctaLabel: text('cta_label'),
  ctaUrl: text('cta_url'),
  displayOrder: integer('display_order').default(0).notNull(),
  status: text('status').notNull().default('DRAFT'), // DRAFT, PUBLISHED
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// CMS Visual & Brand Settings (Safe typed configuration values)
export const cmsVisualSettings = pgTable('cms_visual_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(), // 'store_tagline', 'concierge_delivery_note', 'heritage_year', 'accent_theme', 'announcement_text', 'announcement_active'
  value: text('value').notNull(),
  category: text('category').notNull().default('GENERAL'), // 'BRAND', 'THEME', 'DELIVERY_PROMO', 'ANNOUNCEMENT'
  isPublished: boolean('is_published').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// CMS Audit Logs (Auditability for all CMS & visual changes)
export const cmsAuditLogs = pgTable('cms_audit_logs', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id').references(() => users.id),
  actorRole: text('actor_role').notNull().default('ADMIN'),
  action: text('action').notNull(), // 'CREATE_BANNER', 'UPDATE_BANNER', 'PUBLISH_BANNER', 'DELETE_BANNER', 'CREATE_BLOCK', 'UPDATE_BLOCK', 'PUBLISH_BLOCK', 'DELETE_BLOCK', 'UPDATE_VISUAL_SETTINGS'
  targetType: text('target_type').notNull(), // 'BANNER', 'CONTENT_BLOCK', 'VISUAL_SETTINGS'
  targetId: text('target_id'),
  details: text('details'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Order Audit Logs / Events
export const orderAuditLogs = pgTable('order_audit_logs', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  actorId: integer('actor_id').references(() => users.id),
  actorRole: text('actor_role').notNull().default('SYSTEM'), // 'CUSTOMER', 'ADMIN', 'DELIVERER', 'SYSTEM'
  action: text('action').notNull(), // 'CREATED', 'STATUS_CHANGE', 'PAYMENT_STATE_CHANGE', 'DELIVERY_CHANGE', 'EXCEPTION', 'CANCELLED'
  fromState: text('from_state'),
  toState: text('to_state'),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Refund Requests (Module 19 - Customer refund requests and Admin lifecycle management)
export const refundRequests = pgTable('refund_requests', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  userId: integer('user_id').notNull().references(() => users.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('REQUESTED'), // 'REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED'
  provider: text('provider'), // 'M-PESA', 'AIRTEL_MONEY'
  providerReference: text('provider_reference'),
  rejectionReason: text('rejection_reason'),
  adminNotes: text('admin_notes'),
  processedBy: integer('processed_by').references(() => users.id),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Refund Audit Logs (Lifecycle traceability and provider results)
export const refundAuditLogs = pgTable('refund_audit_logs', {
  id: serial('id').primaryKey(),
  refundRequestId: integer('refund_request_id').notNull().references(() => refundRequests.id, { onDelete: 'cascade' }),
  orderId: integer('order_id').notNull().references(() => orders.id),
  actorId: integer('actor_id').references(() => users.id),
  actorRole: text('actor_role').notNull().default('SYSTEM'), // 'CUSTOMER', 'ADMIN', 'SYSTEM'
  action: text('action').notNull(), // 'REQUESTED', 'APPROVED', 'REJECTED', 'PROVIDER_INITIATED', 'COMPLETED', 'FAILED'
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Support Tickets (Module 19 - Order-linked & General Support Management)
export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  ticketNumber: text('ticket_number').notNull().unique(), // e.g. "TICK-1001"
  userId: integer('user_id').notNull().references(() => users.id),
  orderId: integer('order_id').references(() => orders.id),
  category: text('category').notNull().default('ORDER_ISSUE'), // 'ORDER_ISSUE', 'DELIVERY_STATUS', 'QUALITY_ISSUE', 'PAYMENT_ISSUE', 'ACCOUNT_INQUIRY', 'OTHER'
  subject: text('subject').notNull(),
  status: text('status').notNull().default('OPEN'), // 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
  priority: text('priority').notNull().default('MEDIUM'), // 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
  assignedTo: integer('assigned_to').references(() => users.id),
  internalNotes: text('internal_notes'), // Staff/Admin only
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});

// Support Messages / Thread (Two-way communication with internal notes support)
export const supportMessages = pgTable('support_messages', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  senderId: integer('sender_id').notNull().references(() => users.id),
  senderRole: text('sender_role').notNull(), // 'CUSTOMER', 'ADMIN', 'DELIVERER'
  message: text('message').notNull(),
  isInternalNote: boolean('is_internal_note').default(false).notNull(), // When true, completely hidden from customer
  createdAt: timestamp('created_at').defaultNow(),
});

// Support Audit Logs (Traceability of ticket lifecycle events)
export const supportAuditLogs = pgTable('support_audit_logs', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  actorId: integer('actor_id').references(() => users.id),
  actorRole: text('actor_role').notNull().default('SYSTEM'), // 'CUSTOMER', 'ADMIN', 'SYSTEM'
  action: text('action').notNull(), // 'CREATED', 'ASSIGNED', 'STATUS_CHANGE', 'REPLIED', 'NOTE_ADDED', 'RESOLVED', 'CLOSED'
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  details: text('details'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  variants: many(variants),
  reviews: many(reviews),
}));

export const variantsRelations = relations(variants, ({ one }) => ({
  product: one(products, {
    fields: [variants.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
  delivery: one(deliveries, {
    fields: [orders.id],
    references: [deliveries.orderId]
  }),
  auditLogs: many(orderAuditLogs),
  refundRequests: many(refundRequests),
  supportTickets: many(supportTickets),
}));

export const refundRequestsRelations = relations(refundRequests, ({ one, many }) => ({
  order: one(orders, {
    fields: [refundRequests.orderId],
    references: [orders.id],
  }),
  user: one(users, {
    fields: [refundRequests.userId],
    references: [users.id],
  }),
  processor: one(users, {
    fields: [refundRequests.processedBy],
    references: [users.id],
  }),
  auditLogs: many(refundAuditLogs),
}));

export const refundAuditLogsRelations = relations(refundAuditLogs, ({ one }) => ({
  refundRequest: one(refundRequests, {
    fields: [refundAuditLogs.refundRequestId],
    references: [refundRequests.id],
  }),
  order: one(orders, {
    fields: [refundAuditLogs.orderId],
    references: [orders.id],
  }),
  actor: one(users, {
    fields: [refundAuditLogs.actorId],
    references: [users.id],
  }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(users, {
    fields: [supportTickets.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [supportTickets.orderId],
    references: [orders.id],
  }),
  assignee: one(users, {
    fields: [supportTickets.assignedTo],
    references: [users.id],
  }),
  messages: many(supportMessages),
  auditLogs: many(supportAuditLogs),
}));

export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [supportMessages.ticketId],
    references: [supportTickets.id],
  }),
  sender: one(users, {
    fields: [supportMessages.senderId],
    references: [users.id],
  }),
}));

export const supportAuditLogsRelations = relations(supportAuditLogs, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [supportAuditLogs.ticketId],
    references: [supportTickets.id],
  }),
  actor: one(users, {
    fields: [supportAuditLogs.actorId],
    references: [users.id],
  }),
}));

export const orderAuditLogsRelations = relations(orderAuditLogs, ({ one }) => ({
  order: one(orders, {
    fields: [orderAuditLogs.orderId],
    references: [orders.id],
  }),
  actor: one(users, {
    fields: [orderAuditLogs.actorId],
    references: [users.id],
  }),
}));

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  order: one(orders, {
    fields: [deliveries.orderId],
    references: [orders.id],
  }),
  deliverer: one(users, {
    fields: [deliveries.delivererId],
    references: [users.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  variant: one(variants, {
    fields: [orderItems.variantId],
    references: [variants.id],
  }),
}));

// Notifications (Module 20 - User & Operational Notifications)
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'ORDER_STATUS', 'PAYMENT_UPDATE', 'DELIVERY_UPDATE', 'REFUND_UPDATE', 'SUPPORT_RESPONSE', 'ADMIN_ALERT', 'SYSTEM'
  title: text('title').notNull(),
  message: text('message').notNull(),
  relatedEntityType: text('related_entity_type'), // 'ORDER', 'PAYMENT', 'REFUND', 'SUPPORT_TICKET', 'PRODUCT', 'SYSTEM'
  relatedEntityId: integer('related_entity_id'),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at'),
  channel: text('channel').default('IN_APP').notNull(), // 'IN_APP', 'EMAIL_PENDING', 'SMS_PENDING', 'EXTERNAL_UNAVAILABLE'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Notification Preferences (Module 20 - User preferences)
export const notificationPreferences = pgTable('notification_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  orderUpdates: boolean('order_updates').default(true).notNull(),
  deliveryUpdates: boolean('delivery_updates').default(true).notNull(),
  paymentUpdates: boolean('payment_updates').default(true).notNull(),
  supportUpdates: boolean('support_updates').default(true).notNull(),
  refundUpdates: boolean('refund_updates').default(true).notNull(),
  adminAlerts: boolean('admin_alerts').default(true).notNull(),
  promotionalUpdates: boolean('promotional_updates').default(false).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));
