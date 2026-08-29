import React, { useState, useEffect } from 'react';
import { X, Star, ShoppingBag, ShieldCheck, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useCartStore } from '../store/useCartStore.ts';

interface ReviewStats {
  reviewCount: number;
  averageRating: number;
  distribution: Record<number, number>;
}

export const ProductModal = ({ product, onClose }: { product: any, onClose: () => void }) => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState<ReviewStats>({
    reviewCount: 0,
    averageRating: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  });
  const [loading, setLoading] = useState(true);

  // Review Form & Eligibility States
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [existingReview, setExistingReview] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const { user } = useAuthStore();
  const addItem = useCartStore(state => state.addItem);
  const toggleCart = useCartStore(state => state.toggleCart);

  // Variant selection
  const [selectedVariant, setSelectedVariant] = useState<any>(product.variants?.[0] || null);

  const fetchReviews = () => {
    fetch(`/api/products/${product.id}/reviews`)
      .then(res => res.json())
      .then(data => {
        if (data.reviews) setReviews(data.reviews);
        if (data.stats) setStats(data.stats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const checkEligibility = async () => {
    if (!user) {
      setIsEligible(null);
      setExistingReview(null);
      return;
    }
    setEligibilityLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/products/${product.id}/reviews/eligibility`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setIsEligible(Boolean(data.isEligible));
      if (data.existingReview) {
        setExistingReview(data.existingReview);
        setRating(data.existingReview.rating || 5);
        setComment(data.existingReview.comment || '');
        if (data.existingReview.reviewerName) {
          setReviewerName(data.existingReview.reviewerName);
        }
      } else {
        setExistingReview(null);
      }
    } catch (e) {
      console.error("Eligibility check failed:", e);
      setIsEligible(false);
    } finally {
      setEligibilityLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [product.id]);

  useEffect(() => {
    if (user) {
      checkEligibility();
    } else {
      setIsEligible(null);
      setExistingReview(null);
    }
  }, [user, product.id]);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isEligible) return;

    if (!rating || rating < 1 || rating > 5) {
      setSubmitError('Please select a valid rating between 1 and 5 stars.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccessMsg(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          reviewerName: reviewerName.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit review');
      }

      setSubmitSuccessMsg(data.message || 'Thank you. Your review has been submitted for verification.');
      await checkEligibility();
      fetchReviews();
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    addItem({
      variantId: selectedVariant.id,
      productId: product.id,
      name: product.name,
      volume: selectedVariant.volume,
      price: Number(selectedVariant.price),
      quantity: 1
    });
    onClose();
    toggleCart();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0a0a0a] border border-white/10 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col md:flex-row">
        
        {/* Left: Product Details */}
        <div className="w-full md:w-1/2 p-6 md:p-10 border-b md:border-b-0 md:border-r border-white/5 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-serif text-white tracking-widest">{product.name}</h2>
              {/* Aggregate rating badge */}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex text-[#c5a059]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={13}
                      fill={i < Math.round(stats.averageRating) ? "currentColor" : "none"}
                      className={i < Math.round(stats.averageRating) ? "text-[#c5a059]" : "text-white/20"}
                    />
                  ))}
                </div>
                <span className="text-xs font-mono font-bold text-white">
                  {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : 'No ratings'}
                </span>
                <span className="text-[10px] font-mono text-white/40">
                  ({stats.reviewCount} {stats.reviewCount === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            </div>
            <button onClick={onClose} className="md:hidden text-white/50 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
          
          <div className="h-56 bg-[#111] border border-white/5 flex items-center justify-center mb-6">
            <div className="w-20 h-40 bg-gradient-to-b from-[#222] to-[#111] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] border border-white/5 flex items-center justify-center">
              <span className="text-[8px] tracking-widest text-[#c5a059] -rotate-90 block">MRATINA</span>
            </div>
          </div>

          <p className="text-sm text-white/60 leading-relaxed font-serif italic mb-6">
            "{product.description}"
          </p>

          <div className="space-y-3 mb-6">
            <h3 className="text-[10px] uppercase tracking-widest text-white/40">Select Variant</h3>
            <div className="flex flex-col gap-2.5">
              {product.variants?.map((variant: any) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant)}
                  className={`flex justify-between items-center p-3.5 border transition-colors ${
                    selectedVariant?.id === variant.id 
                      ? 'border-[#c5a059] bg-[#c5a059]/5' 
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="text-left">
                    <span className="block text-sm text-white mb-0.5">{variant.volume}</span>
                    <span className="block text-[10px] text-white/50 uppercase tracking-widest">{variant.packaging}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm text-[#c5a059] font-mono">KES {Number(variant.price).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={!selectedVariant || selectedVariant.stock <= 0}
            className="w-full py-4 bg-[#c5a059] text-black uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-[#d4b271] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-auto"
          >
            <ShoppingBag size={14} />
            {selectedVariant?.stock > 0 ? 'Add to Reserve' : 'Out of Stock'}
          </button>
        </div>

        {/* Right: Reviews & Moderation-Guarded Submission */}
        <div className="w-full md:w-1/2 flex flex-col h-full bg-[#050505]">
          <div className="hidden md:flex justify-end p-6 pb-0">
            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="p-6 md:p-10 space-y-8 flex-1 overflow-y-auto">
            {/* Reviews Header & Scorecard */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] uppercase tracking-widest text-[#c5a059]">Verified Customer Reviews</h3>
                {stats.reviewCount > 0 && (
                  <span className="text-[10px] font-mono text-white/40">
                    {stats.reviewCount} {stats.reviewCount === 1 ? 'Rating' : 'Ratings'}
                  </span>
                )}
              </div>

              {/* Authoritative Score summary bar */}
              {stats.reviewCount > 0 && (
                <div className="p-4 bg-white/[0.02] border border-white/5 mb-6">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-3xl font-serif font-bold text-white">{stats.averageRating.toFixed(1)}</span>
                    <div className="flex text-[#c5a059]">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={14} fill={i < Math.round(stats.averageRating) ? "currentColor" : "none"} className={i < Math.round(stats.averageRating) ? "text-[#c5a059]" : "text-white/20"} />
                      ))}
                    </div>
                    <span className="text-xs text-white/40 font-mono">out of 5 stars</span>
                  </div>

                  {/* Distribution bars */}
                  <div className="space-y-1 mt-3">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const count = stats.distribution[stars] || 0;
                      const percentage = stats.reviewCount > 0 ? (count / stats.reviewCount) * 100 : 0;
                      return (
                        <div key={stars} className="flex items-center text-[10px] text-white/40 gap-2">
                          <span className="w-10 font-mono">{stars} stars</span>
                          <div className="flex-1 h-1.5 bg-white/5 rounded-none overflow-hidden">
                            <div className="h-full bg-[#c5a059]/70" style={{ width: `${percentage}%` }} />
                          </div>
                          <span className="w-6 text-right font-mono text-white/30">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reviews List */}
              {loading ? (
                <div className="text-white/40 text-xs py-4 font-mono">Loading verified reviews...</div>
              ) : reviews.length === 0 ? (
                <div className="text-white/40 text-xs italic py-4">No published reviews yet. Be the first verified customer to review.</div>
              ) : (
                <div className="space-y-3">
                  {reviews.map(r => (
                    <div key={r.id} className="bg-white/[0.02] p-4 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-serif text-white/90">{r.reviewerName || 'Verified Connoisseur'}</span>
                          {r.isVerifiedPurchase && (
                            <span className="flex items-center gap-1 text-[9px] font-mono text-[#00ff88]/80 bg-[#00ff88]/10 px-1.5 py-0.2 border border-[#00ff88]/20">
                              <ShieldCheck size={10} />
                              Verified Order
                            </span>
                          )}
                        </div>
                        <div className="flex text-[#c5a059]">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={11} fill={i < r.rating ? "currentColor" : "none"} className={i < r.rating ? "text-[#c5a059]" : "text-white/20"} />
                          ))}
                        </div>
                      </div>
                      {r.comment && <p className="text-xs text-white/70 leading-relaxed">{r.comment}</p>}
                      <div className="mt-2 text-[9px] text-white/30 font-mono uppercase tracking-widest">
                        {new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submission Section */}
            <div className="border-t border-white/5 pt-6">
              {user ? (
                eligibilityLoading ? (
                  <div className="text-white/40 text-xs font-mono py-2">Checking purchase verification...</div>
                ) : isEligible ? (
                  <form onSubmit={submitReview} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] uppercase tracking-widest text-white/70">
                        {existingReview ? 'Update Your Review' : 'Write a Verified Review'}
                      </h3>
                      {existingReview && (
                        <span
                          className={`text-[9px] font-mono uppercase px-2 py-0.5 border ${
                            existingReview.status === 'APPROVED'
                              ? 'text-[#00ff88] bg-[#00ff88]/10 border-[#00ff88]/20'
                              : existingReview.status === 'REJECTED'
                              ? 'text-red-400 bg-red-500/10 border-red-500/20'
                              : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          }`}
                        >
                          Status: {existingReview.status === 'APPROVED' ? 'Published' : existingReview.status}
                        </span>
                      )}
                    </div>

                    {submitSuccessMsg && (
                      <div className="p-3 bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] text-xs flex items-center gap-2">
                        <CheckCircle2 size={14} className="shrink-0" />
                        <span>{submitSuccessMsg}</span>
                      </div>
                    )}

                    {submitError && (
                      <div className="p-3 bg-red-950/30 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    {/* Star Rating Control */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Rating (Required)</label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map(num => {
                          const active = (hoverRating !== null ? hoverRating >= num : rating >= num);
                          return (
                            <button
                              key={num}
                              type="button"
                              onMouseEnter={() => setHoverRating(num)}
                              onMouseLeave={() => setHoverRating(null)}
                              onClick={() => setRating(num)}
                              className="text-[#c5a059] p-1 focus:outline-none hover:scale-110 transition-transform"
                              aria-label={`Rate ${num} stars`}
                            >
                              <Star
                                size={22}
                                fill={active ? "currentColor" : "none"}
                                className={active ? "text-[#c5a059]" : "text-white/20"}
                              />
                            </button>
                          );
                        })}
                        <span className="text-xs font-mono text-[#c5a059] ml-2">
                          {rating} / 5 Stars
                        </span>
                      </div>
                    </div>

                    {/* Optional Display Name */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
                        Display Name (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        placeholder="e.g. Alex K. (defaults to Verified Connoisseur)"
                        value={reviewerName}
                        onChange={(e) => setReviewerName(e.target.value)}
                        className="w-full bg-[#111] border border-white/10 text-white px-3 py-2 text-xs focus:outline-none focus:border-[#c5a059]"
                      />
                    </div>

                    {/* Comment */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
                        Review Notes (Optional, max 1000 characters)
                      </label>
                      <textarea
                        maxLength={1000}
                        className="w-full bg-[#111] border border-white/10 text-white p-3 text-xs focus:outline-none focus:border-[#c5a059] min-h-[90px]"
                        placeholder="Share your experience with this product..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 bg-[#c5a059] text-black uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-[#d4b271] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submitting ? 'Submitting...' : existingReview ? 'Update Review' : 'Submit Review'}
                    </button>
                    <p className="text-[9px] font-mono text-white/30 text-center">
                      All customer reviews undergo moderation verification prior to public storefront display.
                    </p>
                  </form>
                ) : (
                  <div className="bg-white/[0.02] border border-white/5 p-4 text-center">
                    <ShieldCheck size={20} className="text-white/30 mx-auto mb-2" />
                    <p className="text-xs text-white/80 font-serif mb-1">Purchase Verification Required</p>
                    <p className="text-[10px] text-white/40 leading-relaxed font-mono">
                      To ensure authentic reviews, only customers with a delivered purchase of this product can submit a review.
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-white/[0.02] border border-white/5 p-4 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Customer Reviews</p>
                  <p className="text-xs text-white/40 font-mono">
                    Please sign in with your account to leave a verified review.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
