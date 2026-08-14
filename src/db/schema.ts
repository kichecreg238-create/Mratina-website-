import { relations } from 'drizzle-orm';
import { pgTable, serial, text, timestamp, boolean, decimal, integer, jsonb } from 'drizzle-orm/pg-core';

// Users table (Customers, Admins, Deliverers)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  role: text('role').notNull().default('CUSTOMER'), // CUSTOMER, ADMIN, DELIVERER
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

// Orders
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  delivererId: integer('deliverer_id').references(() => users.id), // Assigned deliverer
  status: text('status').notNull().default('PENDING'), // PENDING, CONFIRMED, ASSIGNED, PICKUP_READY, OUT_FOR_DELIVERY, DELIVERED, FAILED, CANCELLED
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal('delivery_fee', { precision: 10, scale: 2 }).notNull(),
  deliveryAddress: text('delivery_address').notNull(),
  deliveryZone: text('delivery_zone'), // e.g., 'Nairobi CBD', 'Westlands'
  deliveryInstructions: text('delivery_instructions'),
  paymentState: text('payment_state').notNull().default('INITIATED'), // INITIATED, PENDING, SUCCESS, FAILED, REFUNDED
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
