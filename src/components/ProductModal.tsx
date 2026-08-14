import React, { useState, useEffect } from 'react';
import { X, Star, ShoppingBag } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useCartStore } from '../store/useCartStore.ts';

export const ProductModal = ({ product, onClose }: { product: any, onClose: () => void }) => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  
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
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchReviews();
  }, [product.id]);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rating, comment })
      });
      setComment('');
      setRating(5);
      fetchReviews();
    } catch (error) {
      alert("Failed to submit review");
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
          <div className="flex justify-between items-start mb-8">
            <h2 className="text-2xl font-serif text-white tracking-widest">{product.name}</h2>
            <button onClick={onClose} className="md:hidden text-white/50 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
          
          <div className="h-64 bg-[#111] border border-white/5 flex items-center justify-center mb-8">
            <div className="w-24 h-48 bg-gradient-to-b from-[#222] to-[#111] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] border border-white/5 flex items-center justify-center">
              <span className="text-[8px] tracking-widest text-[#c5a059] -rotate-90 block">MRATINA</span>
            </div>
          </div>

          <p className="text-sm text-white/60 leading-relaxed font-serif italic mb-8">
            "{product.description}"
          </p>

          <div className="space-y-4 mb-8">
            <h3 className="text-[10px] uppercase tracking-widest text-white/40">Select Variant</h3>
            <div className="flex flex-col gap-3">
              {product.variants?.map((variant: any) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant)}
                  className={`flex justify-between items-center p-4 border transition-colors ${
                    selectedVariant?.id === variant.id 
                      ? 'border-[#c5a059] bg-[#c5a059]/5' 
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="text-left">
                    <span className="block text-sm text-white mb-1">{variant.volume}</span>
                    <span className="block text-[10px] text-white/50 uppercase tracking-widest">{variant.packaging}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm text-[#c5a059]">KES {Number(variant.price).toLocaleString()}</span>
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

        {/* Right: Reviews */}
        <div className="w-full md:w-1/2 flex flex-col h-full bg-[#050505]">
          <div className="hidden md:flex justify-end p-6 pb-0">
            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>

          <div className="p-6 md:p-10 space-y-8 flex-1 overflow-y-auto">
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-[#c5a059] mb-4">Customer Reviews</h3>
              {loading ? (
                <div className="text-white/40 text-sm">Loading reviews...</div>
              ) : reviews.length === 0 ? (
                <div className="text-white/40 text-sm italic">No reviews yet. Be the first to review.</div>
              ) : (
                <div className="space-y-4">
                  {reviews.map(r => (
                    <div key={r.id} className="bg-white/5 p-4 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/80">{r.user?.displayName || 'Anonymous'}</span>
                        <div className="flex text-[#c5a059]">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={12} fill={i < r.rating ? "currentColor" : "none"} className={i < r.rating ? "text-[#c5a059]" : "text-white/20"} />
                          ))}
                        </div>
                      </div>
                      {r.comment && <p className="text-sm text-white/60">{r.comment}</p>}
                      <div className="mt-2 text-[9px] text-white/30 uppercase tracking-widest">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {user ? (
              <form onSubmit={submitReview} className="border-t border-white/5 pt-8">
                <h3 className="text-[10px] uppercase tracking-widest text-white/70 mb-4">Write a Review</h3>
                <div className="mb-4">
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-2">Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRating(num)}
                        className="text-[#c5a059] focus:outline-none"
                      >
                        <Star size={20} fill={num <= rating ? "currentColor" : "none"} className={num <= rating ? "text-[#c5a059]" : "text-white/20"} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-2">Comment</label>
                  <textarea
                    className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059] min-h-[100px]"
                    placeholder="Share your experience..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-[#c5a059] text-black uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-[#d4b271] transition-colors"
                >
                  Submit Review
                </button>
              </form>
            ) : (
              <div className="border-t border-white/5 pt-8 text-center">
                <p className="text-[10px] uppercase tracking-widest text-white/50">Please sign in to leave a review</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
