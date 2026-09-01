import React, { useState } from 'react';
import { useCartStore } from '../store/useCartStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { X, Minus, Plus, ShoppingBag, MapPin, CreditCard, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

type CheckoutStep = 'CART' | 'DELIVERY' | 'PAYMENT';

export const CartSidebar = () => {
  const { items, isOpen, toggleCart, updateQuantity, removeItem } = useCartStore();
  const { user, signIn } = useAuthStore();
  const [step, setStep] = useState<CheckoutStep>('CART');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  
  // Delivery Zones & Serviceability State
  const [availableZones, setAvailableZones] = useState<any[]>([]);
  const [fetchingZones, setFetchingZones] = useState(true);

  // Form State
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');
  const [phone, setPhone] = useState('');
  const [zoneId, setZoneId] = useState<string>('');
  
  const [authoritativeDeliveryFee, setAuthoritativeDeliveryFee] = useState<number>(0);

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const finalTotal = total + authoritativeDeliveryFee;

  // Fetch Delivery Zones
  React.useEffect(() => {
    if (isOpen) {
      setFetchingZones(true);
      fetch('/api/delivery-zones')
        .then(res => res.json())
        .then(data => {
          if (data.zones && data.zones.length > 0) {
            setAvailableZones(data.zones);
            setZoneId(data.zones[0].id.toString());
            setAuthoritativeDeliveryFee(Number(data.zones[0].fee));
          }
          setFetchingZones(false);
        })
        .catch(err => {
          console.error(err);
          setFetchingZones(false);
        });
    }
  }, [isOpen]);

  // Update fee when zone changes
  React.useEffect(() => {
    const selectedZone = availableZones.find(z => z.id.toString() === zoneId);
    if (selectedZone) {
      setAuthoritativeDeliveryFee(Number(selectedZone.fee));
    }
  }, [zoneId, availableZones]);

  // Reset step when closed
  React.useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('CART');
        setCheckoutError(null);
      }, 300);
    }
  }, [isOpen]);

  const handleNextStep = async () => {
    setCheckoutError(null);
    if (!user) {
      await signIn();
      return;
    }
    if (step === 'CART') setStep('DELIVERY');
    else if (step === 'DELIVERY') {
      if (!address.trim()) {
        setCheckoutError('Please provide a delivery address.');
        return;
      }
      if (!zoneId) {
        setCheckoutError('Please select a delivery zone.');
        return;
      }
      
      // Authoritative Serviceability Validation
      setCheckingOut(true);
      try {
        const res = await fetch('/api/serviceability/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoneId })
        });
        const data = await res.json();
        
        if (!res.ok || !data.isServiceable) {
          setCheckoutError('This zone is outside our current service area.');
          setCheckingOut(false);
          return;
        }
        if (!data.isAcceptingOrders) {
          setCheckoutError('This zone is currently at delivery capacity. Please try again later.');
          setCheckingOut(false);
          return;
        }
        
        // Update authoritative fee just to be sure
        setAuthoritativeDeliveryFee(Number(data.fee));
        setStep('PAYMENT');
      } catch (err) {
        setCheckoutError('Failed to verify serviceability. Please check your connection.');
      } finally {
        setCheckingOut(false);
      }
    }
  };

  const handleCheckout = async () => {
    setCheckoutError(null);
    if (!phone.trim()) {
      setCheckoutError('Please provide a phone number for M-Pesa.');
      return;
    }
    
    setCheckingOut(true);
    try {
      const token = await user!.getIdToken();
      
      // 1. Create the order
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: items.map(i => ({ variantId: i.variantId, quantity: i.quantity, expectedPrice: i.price })),
          deliveryAddress: address,
          landmark,
          deliveryZoneId: zoneId,
          deliveryInstructions: instructions
        })
      });
      
      const data = await res.json();
      if (!data.success) {
        setCheckoutError(data.error || 'Failed to create order. Please check your cart.');
        setStep('CART'); // Send them back to cart to see what they might need to change
        setCheckingOut(false);
        return;
      }

            const orderId = data.order.id;

      // 2. Initiate Payment through the Payment Engine
      const payRes = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId,
          provider: 'M-PESA',
          phoneNumber: phone
        })
      });
      
      const payData = await payRes.json();
      
      if (!payData.isConfigured) {
        // Provider is not configured.
        setCheckoutError('Payment provider is not currently configured.');
        setCheckingOut(false);
        return;
      } else if (!payData.success) {
        setCheckoutError(payData.error || 'Payment initiation failed.');
        setCheckingOut(false);
        return;
      } else {
        alert(`Order #${orderId} created! Please check your phone for the payment prompt.`);
      }

      useCartStore.getState().clearCart();
      toggleCart();
    } catch (e) {
      setCheckoutError('A network error occurred. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={toggleCart}
        />
      )}
      
      {/* Sidebar */}
      <div className={clsx(
        "fixed top-0 right-0 h-full w-full md:w-[450px] bg-[#0a0a0a] border-l border-white/5 z-50 transform transition-transform duration-300 flex flex-col shadow-2xl",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#0a0a0a]">
          {step !== 'CART' ? (
            <button 
              onClick={() => setStep(step === 'PAYMENT' ? 'DELIVERY' : 'CART')} 
              className="text-white/60 hover:text-white flex items-center gap-2 text-xs uppercase tracking-widest transition-colors py-1"
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <h2 className="text-sm tracking-[0.25em] font-serif uppercase text-[#c5a059] flex items-center gap-2">
              <ShoppingBag size={16} /> Your Reserve
            </h2>
          )}
          
          {/* Progress Indicator */}
          <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-white/40">
            <span className={clsx("px-1.5 py-0.5 rounded-xs transition-colors", step === 'CART' ? "text-[#c5a059] font-bold bg-[#c5a059]/10" : "text-white/30")}>1. Cart</span>
            <span>›</span>
            <span className={clsx("px-1.5 py-0.5 rounded-xs transition-colors", step === 'DELIVERY' ? "text-[#c5a059] font-bold bg-[#c5a059]/10" : "text-white/30")}>2. Delivery</span>
            <span>›</span>
            <span className={clsx("px-1.5 py-0.5 rounded-xs transition-colors", step === 'PAYMENT' ? "text-[#c5a059] font-bold bg-[#c5a059]/10" : "text-white/30")}>3. Pay</span>
          </div>

          <button 
            onClick={toggleCart} 
            className="text-white/50 hover:text-white transition-colors p-1 rounded-sm hover:bg-white/5"
            aria-label="Close cart"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {step === 'CART' && (
            items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-16 h-16 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/20 flex items-center justify-center mb-4">
                  <ShoppingBag size={28} className="text-[#c5a059]" />
                </div>
                <h3 className="text-base font-serif text-white mb-2">Your Reserve is Empty</h3>
                <p className="text-xs text-white/50 max-w-xs mb-6 font-serif">Explore our handcrafted Kakamega reserve vintages and botanical elixirs.</p>
                <button
                  onClick={toggleCart}
                  className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[#c5a059] hover:text-white text-xs uppercase tracking-widest font-mono transition-colors"
                >
                  Explore Collection
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.variantId} className="flex gap-4 border-b border-white/5 pb-5 group">
                    <div className="w-16 h-20 bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                      <span className="text-[8px] tracking-[0.25em] text-[#c5a059] -rotate-90 font-mono font-bold">MRATINA</span>
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-serif text-white group-hover:text-[#c5a059] transition-colors">{item.name}</h3>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono mt-0.5">{item.volume}</p>
                      </div>
                      <div className="flex justify-between items-end mt-3">
                        <div className="flex items-center gap-3 border border-white/10 bg-white/[0.02] px-2.5 py-1">
                          <button 
                            onClick={() => item.quantity > 1 ? updateQuantity(item.variantId, item.quantity - 1) : removeItem(item.variantId)} 
                            className="text-white/40 hover:text-white transition-colors p-1"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-xs font-mono font-bold text-white min-w-4 text-center">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.variantId, item.quantity + 1)} 
                            className="text-white/40 hover:text-white transition-colors p-1"
                            aria-label="Increase quantity"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-mono font-medium text-[#c5a059]">KES {(item.price * item.quantity).toLocaleString()}</span>
                          {item.quantity > 1 && (
                            <span className="block text-[9px] text-white/30 font-mono">KES {item.price.toLocaleString()} each</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {step === 'DELIVERY' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                <div className="w-9 h-9 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/30 flex items-center justify-center">
                  <MapPin size={16} className="text-[#c5a059]" />
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-[#c5a059] font-bold">Delivery Details</h3>
                  <p className="text-[10px] text-white/50 font-serif">Kakamega Town & Serviceable Zones</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2 font-mono">Delivery Zone *</label>
                {fetchingZones ? (
                  <div className="w-full bg-[#111] border border-white/10 text-white/50 p-3.5 text-xs flex items-center justify-center font-mono">
                    <span className="w-3.5 h-3.5 border-t border-[#c5a059] rounded-full animate-spin mr-2"></span> Loading active zones...
                  </div>
                ) : availableZones.length === 0 ? (
                  <div className="w-full bg-red-950/30 border border-red-500/40 text-red-300 p-3 text-[11px] font-mono leading-relaxed">
                    No active delivery zones available right now.
                  </div>
                ) : (
                  <select 
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059] transition-colors cursor-pointer"
                  >
                    <option value="" disabled>Select your delivery zone...</option>
                    {availableZones.map(z => (
                      <option key={z.id} value={z.id}>
                        {z.name} — KES {Number(z.fee).toLocaleString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2 font-mono">Delivery Address / Building *</label>
                <input 
                  type="text" 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Mega Mall Building, 2nd Floor, Suite 14"
                  className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059] transition-colors placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2 font-mono">Nearby Landmark (Optional)</label>
                <input 
                  type="text" 
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Next to Kakamega Primary / Near Total Energies"
                  className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059] transition-colors placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/60 mb-2 font-mono">Courier Instructions (Optional)</label>
                <textarea 
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Please ring doorbell or call upon arrival at gate"
                  className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059] transition-colors h-20 resize-none placeholder:text-white/20"
                />
              </div>
              
              <div className="p-4 bg-white/[0.02] border border-[#c5a059]/20 flex items-start gap-3">
                 <MapPin size={16} className="text-[#c5a059] shrink-0 mt-0.5" />
                 <div>
                   <span className="block text-xs font-serif text-white mb-0.5">Concierge Cellar Dispatch</span>
                   <span className="block text-[10px] text-white/50 leading-relaxed font-sans">
                     Delivery fee is <strong className="text-white font-mono">KES {authoritativeDeliveryFee.toLocaleString()}</strong>. Our courier coordinates dispatch directly with your contact.
                   </span>
                 </div>
              </div>
            </div>
          )}

          {step === 'PAYMENT' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                <div className="w-9 h-9 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/30 flex items-center justify-center">
                  <CreditCard size={16} className="text-[#c5a059]" />
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-[#c5a059] font-bold">Payment Method</h3>
                  <p className="text-[10px] text-white/50 font-serif">M-Pesa Express & Mobile Money</p>
                </div>
              </div>

              <div className="p-6 border border-[#c5a059]/30 bg-gradient-to-br from-[#1c160c] via-[#120f08] to-[#0a0a0a] relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <CreditCard size={96} />
                </div>
                
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h4 className="text-sm font-serif text-white font-medium">M-Pesa STK Push</h4>
                  <span className="text-[9px] font-mono text-[#00ff88] bg-[#00ff88]/10 border border-[#00ff88]/20 px-2 py-0.5 uppercase tracking-wider">
                    Instant
                  </span>
                </div>

                <label className="block text-[10px] uppercase tracking-widest text-[#c5a059]/90 mb-2 relative z-10 font-mono">
                  Safaricom M-Pesa Phone Number *
                </label>
                <div className="flex relative z-10 shadow-inner">
                  <span className="bg-[#111] border border-white/15 border-r-0 text-white/60 px-3.5 text-xs font-mono flex items-center select-none">
                    +254
                  </span>
                  <input 
                    type="tel" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="712 345 678"
                    maxLength={10}
                    className="flex-1 bg-[#111] border border-white/15 text-white p-3 text-sm font-mono focus:outline-none focus:border-[#c5a059] transition-colors"
                  />
                </div>
                
                <p className="text-[11px] text-white/50 mt-3 relative z-10 leading-relaxed font-serif">
                  You will receive a secure PIN prompt on your phone to complete <strong className="text-white font-mono">KES {finalTotal.toLocaleString()}</strong>.
                </p>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 text-[11px] text-white/40 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span className="text-white">KES {total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery to {availableZones.find(z => z.id.toString() === zoneId)?.name || 'Selected Zone'}</span>
                  <span className="text-white">KES {authoritativeDeliveryFee.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 bg-[#111] border-t border-white/5 shrink-0">
            {step === 'CART' && (
              <>
                <div className="flex justify-between mb-4">
                  <span className="text-xs text-white/50 uppercase tracking-widest">Subtotal</span>
                  <span className="text-sm text-white">KES {total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between mb-6">
                  <span className="text-xs text-white/50 uppercase tracking-widest">Concierge Delivery</span>
                  <span className="text-sm text-[#c5a059]">KES {authoritativeDeliveryFee.toLocaleString()}</span>
                </div>
              </>
            )}
            
            {step === 'PAYMENT' && (
              <div className="flex justify-between mb-6 pt-2">
                <span className="text-xs text-white/80 uppercase tracking-widest font-bold">Total to Pay</span>
                <span className="text-lg text-[#c5a059] font-serif">KES {finalTotal.toLocaleString()}</span>
              </div>
            )}

            {checkoutError && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-500/30 text-red-200 text-[10px] uppercase tracking-wider leading-relaxed">
                {checkoutError}
              </div>
            )}

            <button 
              onClick={step === 'PAYMENT' ? handleCheckout : handleNextStep}
              disabled={checkingOut}
              className="w-full py-4 bg-[#c5a059] hover:bg-[#d4b271] text-[#050505] text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex justify-center items-center gap-2"
            >
              {checkingOut ? 'Processing...' : 
                (step === 'CART' ? (user ? 'Proceed to Delivery' : 'Sign In to Checkout') : 
                (step === 'DELIVERY' ? 'Proceed to Payment' : `Pay KES ${finalTotal.toLocaleString()}`))}
            </button>
            
          </div>
        )}
      </div>
    </>
  );
};
