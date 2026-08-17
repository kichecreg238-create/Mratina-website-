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
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  isApproved: boolean('is_approved').default(false).notNull(),
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

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  variants: many(variants),
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
