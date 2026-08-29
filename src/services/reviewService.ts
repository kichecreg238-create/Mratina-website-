import { db } from '../db/index.ts';
import { reviews, reviewAuditLogs, orders, orderItems, variants, products, users } from '../db/schema.ts';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

export interface SubmitReviewInput {
  productId: number;
  rating: number;
  comment?: string;
  reviewerName?: string;
  orderId?: number;
}

export interface ReviewEligibilityResult {
  isEligible: boolean;
  qualifyingOrderId: number | null;
  hasExistingReview: boolean;
  existingReview?: {
    id: number;
    rating: number;
    comment: string | null;
    reviewerName: string | null;
    status: string;
    createdAt: Date | null;
  } | null;
  reason?: string;
}

/**
 * Sanitizes plain text input by stripping all HTML tags and control characters.
 */
function sanitizePlainText(input: string | null | undefined, maxLength: number = 1000): string | null {
  if (!input) return null;
  const stripped = input
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip control chars
    .trim();
  if (stripped.length === 0) return null;
  return stripped.slice(0, maxLength);
}

/**
 * Derives a safe customer display name (e.g., 'Alexander K.' or 'Verified Connoisseur') without exposing email.
 */
function deriveSafeDisplayName(customName: string | null | undefined, userEmail: string | null | undefined): string {
  const sanitized = sanitizePlainText(customName, 60);
  if (sanitized) return sanitized;
  
  if (userEmail && userEmail.includes('@')) {
    const [namePart] = userEmail.split('@');
    const cleanName = namePart.replace(/[^a-zA-Z0-9]/g, ' ').trim();
    if (cleanName.length > 0) {
      const words = cleanName.split(/\s+/);
      if (words.length === 1) {
        return words[0].charAt(0).toUpperCase() + words[0].slice(1);
      }
      return words[0].charAt(0).toUpperCase() + words[0].slice(1) + ' ' + words[words.length - 1].charAt(0).toUpperCase() + '.';
    }
  }
  return 'Verified Connoisseur';
}

export class ReviewService {
  /**
   * Checks if an authenticated customer is eligible to review a given product.
   * Eligibility requires at least one completed/delivered order containing the product.
   */
  async checkEligibility(userId: number, productId: number): Promise<ReviewEligibilityResult> {
    if (!userId || !productId) {
      return { isEligible: false, qualifyingOrderId: null, hasExistingReview: false, reason: 'Invalid user or product' };
    }

    // 1. Verify product exists
    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
    if (!product) {
      return { isEligible: false, qualifyingOrderId: null, hasExistingReview: false, reason: 'Product does not exist' };
    }

    // 2. Query delivered orders for this user that contain a variant of this product
    const qualifyingOrders = await db
      .select({
        orderId: orders.id,
        orderStatus: orders.status,
        deliveredAt: orders.updatedAt,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(variants, eq(orderItems.variantId, variants.id))
      .where(
        and(
          eq(orders.userId, userId),
          eq(variants.productId, productId),
          eq(orders.status, 'DELIVERED')
        )
      )
      .orderBy(desc(orders.id));

    const isEligible = qualifyingOrders.length > 0;
    const qualifyingOrderId = qualifyingOrders[0]?.orderId || null;

    // 3. Check for existing review by this user on this product
    const [existing] = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
      .orderBy(desc(reviews.id));

    return {
      isEligible,
      qualifyingOrderId,
      hasExistingReview: !!existing,
      existingReview: existing
        ? {
            id: existing.id,
            rating: existing.rating,
            comment: existing.comment,
            reviewerName: existing.reviewerName,
            status: existing.status,
            createdAt: existing.createdAt,
          }
        : null,
      reason: isEligible ? undefined : 'Only customers with a delivered purchase of this reserve may submit a review.',
    };
  }

  /**
   * Submits or updates a customer review for a verified delivered purchase.
   * Always places submission into PENDING status for admin moderation.
   */
  async submitReview(
    userId: number,
    userEmail: string,
    input: SubmitReviewInput
  ) {
    const { productId, rating, comment, reviewerName, orderId } = input;

    // 1. Validate rating (must be an integer 1 to 5)
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Rating must be an integer between 1 and 5 stars.');
    }

    // 2. Validate & sanitize text content
    const sanitizedComment = sanitizePlainText(comment, 1000);
    const safeDisplayName = deriveSafeDisplayName(reviewerName, userEmail);

    // 3. Authoritative eligibility check
    const eligibility = await this.checkEligibility(userId, productId);
    if (!eligibility.isEligible) {
      throw new Error('Review eligibility requirement not met: You must have a delivered purchase of this product.');
    }

    const authoritativeOrderId = orderId && orderId === eligibility.qualifyingOrderId
      ? orderId
      : eligibility.qualifyingOrderId;

    // 4. Duplicate control: Check if user already submitted a review for this product
    const [existingReview] = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)));

    if (existingReview) {
      // Update existing review and reset to PENDING for moderation re-verification
      const [updatedReview] = await db
        .update(reviews)
        .set({
          orderId: authoritativeOrderId,
          rating,
          comment: sanitizedComment,
          reviewerName: safeDisplayName,
          status: 'PENDING',
          isApproved: false,
          rejectionReason: null,
          moderatedBy: null,
          moderatedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, existingReview.id))
        .returning();

      // Record audit log
      await db.insert(reviewAuditLogs).values({
        reviewId: updatedReview.id,
        actorId: userId,
        actorRole: 'CUSTOMER',
        action: 'UPDATED',
        fromStatus: existingReview.status,
        toStatus: 'PENDING',
        reason: 'Customer updated existing review',
        metadata: {
          productId,
          orderId: authoritativeOrderId,
          rating,
          hasComment: !!sanitizedComment,
        },
      });

      return {
        review: updatedReview,
        isUpdate: true,
        message: 'Your review has been updated and submitted for verification.',
      };
    } else {
      // Create new review in PENDING state
      const [newReview] = await db
        .insert(reviews)
        .values({
          userId,
          productId,
          orderId: authoritativeOrderId,
          rating,
          comment: sanitizedComment,
          reviewerName: safeDisplayName,
          status: 'PENDING',
          isApproved: false,
        })
        .returning();

      // Record audit log
      await db.insert(reviewAuditLogs).values({
        reviewId: newReview.id,
        actorId: userId,
        actorRole: 'CUSTOMER',
        action: 'SUBMITTED',
        fromStatus: null,
        toStatus: 'PENDING',
        reason: 'Customer submitted new review for verified purchase',
        metadata: {
          productId,
          orderId: authoritativeOrderId,
          rating,
          hasComment: !!sanitizedComment,
        },
      });

      return {
        review: newReview,
        isUpdate: false,
        message: 'Thank you for your review. It has been submitted for moderation.',
      };
    }
  }

  /**
   * Retrieves public approved reviews and authoritative aggregate statistics for a product.
   */
  async getPublicProductReviews(productId: number) {
    if (!productId || isNaN(productId)) {
      return {
        reviews: [],
        stats: {
          reviewCount: 0,
          averageRating: 0,
          distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
      };
    }

    // Only fetch APPROVED reviews
    const approvedReviews = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        reviewerName: reviews.reviewerName,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.productId, productId),
          eq(reviews.status, 'APPROVED')
        )
      )
      .orderBy(desc(reviews.createdAt));

    // Authoritative statistical calculation
    const reviewCount = approvedReviews.length;
    const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalScore = 0;

    for (const rev of approvedReviews) {
      totalScore += rev.rating;
      if (distribution[rev.rating] !== undefined) {
        distribution[rev.rating]++;
      }
    }

    const averageRating = reviewCount > 0
      ? Math.round((totalScore / reviewCount) * 10) / 10
      : 0;

    const formattedReviews = approvedReviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      reviewerName: r.reviewerName || 'Verified Connoisseur',
      createdAt: r.createdAt,
      isVerifiedPurchase: true,
    }));

    return {
      reviews: formattedReviews,
      stats: {
        reviewCount,
        averageRating,
        distribution,
      },
    };
  }

  /**
   * Retrieves all reviews for admin moderation with filters and customer/product metadata.
   */
  async getAdminReviews(filters?: {
    status?: string;
    productId?: number;
    search?: string;
  }) {
    let query = db
      .select({
        id: reviews.id,
        userId: reviews.userId,
        productId: reviews.productId,
        orderId: reviews.orderId,
        rating: reviews.rating,
        comment: reviews.comment,
        reviewerName: reviews.reviewerName,
        status: reviews.status,
        isApproved: reviews.isApproved,
        rejectionReason: reviews.rejectionReason,
        moderatedBy: reviews.moderatedBy,
        moderatedAt: reviews.moderatedAt,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        productName: products.name,
        userEmail: users.email,
      })
      .from(reviews)
      .leftJoin(products, eq(reviews.productId, products.id))
      .leftJoin(users, eq(reviews.userId, users.id))
      .orderBy(desc(reviews.createdAt));

    const allRecords = await query;

    let filtered = allRecords;

    if (filters?.status && filters.status !== 'ALL') {
      filtered = filtered.filter((r) => r.status === filters.status);
    }

    if (filters?.productId) {
      filtered = filtered.filter((r) => r.productId === filters.productId);
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.productName && r.productName.toLowerCase().includes(q)) ||
          (r.reviewerName && r.reviewerName.toLowerCase().includes(q)) ||
          (r.userEmail && r.userEmail.toLowerCase().includes(q)) ||
          (r.comment && r.comment.toLowerCase().includes(q)) ||
          (r.id && r.id.toString().includes(q))
      );
    }

    // Compute summary metrics for moderation dashboard
    const totalCount = allRecords.length;
    const pendingCount = allRecords.filter((r) => r.status === 'PENDING').length;
    const approvedCount = allRecords.filter((r) => r.status === 'APPROVED').length;
    const rejectedCount = allRecords.filter((r) => r.status === 'REJECTED').length;

    const approvedTotalRating = allRecords
      .filter((r) => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.rating, 0);

    const overallAverageRating = approvedCount > 0
      ? Math.round((approvedTotalRating / approvedCount) * 10) / 10
      : 0;

    return {
      reviews: filtered,
      metrics: {
        totalCount,
        pendingCount,
        approvedCount,
        rejectedCount,
        overallAverageRating,
      },
    };
  }

  /**
   * Moderates a review (APPROVE, REJECT, or HIDE) with server-side audit logging.
   */
  async moderateReview(
    reviewId: number,
    actor: { id: number; email: string; role: string },
    action: 'APPROVE' | 'REJECT' | 'HIDE',
    reason?: string
  ) {
    if (!['APPROVE', 'REJECT', 'HIDE'].includes(action)) {
      throw new Error(`Invalid moderation action: ${action}`);
    }

    const [existing] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
    if (!existing) {
      throw new Error(`Review #${reviewId} not found`);
    }

    let newStatus: 'APPROVED' | 'REJECTED' | 'PENDING' = 'APPROVED';
    let isApproved = false;
    let rejectionReason: string | null = null;

    if (action === 'APPROVE') {
      newStatus = 'APPROVED';
      isApproved = true;
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      isApproved = false;
      rejectionReason = sanitizePlainText(reason, 300) || 'Rejected by moderator';
    } else if (action === 'HIDE') {
      newStatus = 'REJECTED';
      isApproved = false;
      rejectionReason = sanitizePlainText(reason, 300) || 'Hidden by administrator';
    }

    const [updated] = await db
      .update(reviews)
      .set({
        status: newStatus,
        isApproved,
        rejectionReason,
        moderatedBy: actor.id,
        moderatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, reviewId))
      .returning();

    // Record immutable audit log
    await db.insert(reviewAuditLogs).values({
      reviewId,
      actorId: actor.id,
      actorRole: 'ADMIN',
      action: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      fromStatus: existing.status,
      toStatus: newStatus,
      reason: rejectionReason || `Review ${action.toLowerCase()}d by admin`,
      metadata: {
        moderatedByEmail: actor.email,
        previousStatus: existing.status,
        newStatus,
        action,
      },
    });

    return updated;
  }

  /**
   * Deletes a review administratively and logs audit record.
   */
  async deleteReview(
    reviewId: number,
    actor: { id: number; email: string; role: string },
    reason?: string
  ) {
    const [existing] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
    if (!existing) {
      throw new Error(`Review #${reviewId} not found`);
    }

    // Record audit log before cascade delete
    await db.insert(reviewAuditLogs).values({
      reviewId,
      actorId: actor.id,
      actorRole: 'ADMIN',
      action: 'DELETED',
      fromStatus: existing.status,
      toStatus: null,
      reason: sanitizePlainText(reason, 300) || 'Review deleted by administrator',
      metadata: {
        moderatedByEmail: actor.email,
        deletedReviewDetails: {
          productId: existing.productId,
          userId: existing.userId,
          rating: existing.rating,
        },
      },
    });

    await db.delete(reviews).where(eq(reviews.id, reviewId));

    return { success: true, deletedId: reviewId };
  }

  /**
   * Retrieves review audit logs for admin ledger inspection.
   */
  async getReviewAuditLogs(reviewId?: number, limit: number = 50) {
    let query = db
      .select({
        id: reviewAuditLogs.id,
        reviewId: reviewAuditLogs.reviewId,
        actorId: reviewAuditLogs.actorId,
        actorRole: reviewAuditLogs.actorRole,
        action: reviewAuditLogs.action,
        fromStatus: reviewAuditLogs.fromStatus,
        toStatus: reviewAuditLogs.toStatus,
        reason: reviewAuditLogs.reason,
        metadata: reviewAuditLogs.metadata,
        createdAt: reviewAuditLogs.createdAt,
        actorEmail: users.email,
      })
      .from(reviewAuditLogs)
      .leftJoin(users, eq(reviewAuditLogs.actorId, users.id))
      .orderBy(desc(reviewAuditLogs.createdAt))
      .limit(limit);

    if (reviewId) {
      return await query.where(eq(reviewAuditLogs.reviewId, reviewId));
    }
    return await query;
  }
}

export const reviewService = new ReviewService();
