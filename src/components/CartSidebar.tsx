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
  
  // Form State
  const [address, setAddress] = useState('');
  const [instructions, setInstructions] = useState('');
  const [phone, setPhone] = useState('');
  const [zone, setZone] = useState('Nairobi CBD');

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const deliveryZones: Record<string, number> = {
    'Nairobi CBD': 300,
    'Westlands / Parklands': 500,
    'Kilimani / Kileleshwa': 600,
    'Karen / Langata': 1000,
    'Kiambu / Thika Road': 1200
  };
  
  const deliveryFee = deliveryZones[zone] || 500;
  const finalTotal = total + deliveryFee;

  // Reset step when closed
  React.useEffect(() => {
    if (!isOpen) {
      setTimeout(() => setStep('CART'), 300);
    }
  }, [isOpen]);

  const handleNextStep = async () => {
    if (!user) {
      await signIn();
      return;
    }
    if (step === 'CART') setStep('DELIVERY');
    else if (step === 'DELIVERY') {
      if (!address.trim()) {
        alert('Please provide a delivery address.');
        return;
      }
      setStep('PAYMENT');
    }
  };

  const handleCheckout = async () => {
    if (!phone.trim()) {
      alert('Please provide a phone number for M-Pesa.');
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
          items: items.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
          deliveryAddress: address,
          deliveryZone: zone,
          deliveryFee,
          deliveryInstructions: instructions
        })
      });
      
      const data = await res.json();
      if (!data.success) {
        alert('Checkout failed: ' + data.error);
        setCheckingOut(false);
        return;
      }

      const orderId = data.order.id;

      // 2. Simulate M-Pesa Push Webhook (In production, this is triggered externally)
      // We will wait 2 seconds, then hit our own webhook to simulate the payment arriving
      setTimeout(async () => {
        try {
          await fetch('/api/webhooks/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              provider: 'MPESA',
              providerReference: 'RKT87X' + Math.floor(Math.random() * 1000),
              status: 'SUCCESS'
            })
          });
        } catch (e) {
          console.error('Simulated webhook failed', e);
        }
      }, 2000);

      alert(`Order #${orderId} created successfully! M-Pesa prompt sent to ${phone}.`);
      useCartStore.getState().clearCart();
      toggleCart();
    } catch (e) {
      alert('Checkout error.');
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
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0a0a0a]">
          {step !== 'CART' ? (
            <button onClick={() => setStep(step === 'PAYMENT' ? 'DELIVERY' : 'CART')} className="text-white/50 hover:text-white flex items-center gap-2 text-xs uppercase tracking-widest">
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <h2 className="text-sm tracking-[0.2em] font-serif uppercase text-[#c5a059] flex items-center gap-2">
              <ShoppingBag size={16} /> Your Reserve
            </h2>
          )}
          <button onClick={toggleCart} className="text-white/50 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {step === 'CART' && (
            items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                <ShoppingBag size={48} className="mb-4 text-[#c5a059]" />
                <p className="text-sm font-serif">Your reserve is empty</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.variantId} className="flex gap-4 border-b border-white/5 pb-6">
                  <div className="w-16 h-20 bg-[#111] border border-white/5 flex items-center justify-center shrink-0">
                    <span className="text-[8px] tracking-widest text-[#c5a059] -rotate-90">MRATINA</span>
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-serif">{item.name}</h3>
                      <p className="text-[10px] text-white/50 uppercase tracking-wider">{item.volume}</p>
                    </div>
                    <div className="flex justify-between items-end mt-4">
                      <div className="flex items-center gap-3 border border-white/10 px-2 py-1">
                        <button onClick={() => item.quantity > 1 ? updateQuantity(item.variantId, item.quantity - 1) : removeItem(item.variantId)} className="text-white/50 hover:text-white"><Minus size={12} /></button>
                        <span className="text-xs">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.variantId, item.quantity + 1)} className="text-white/50 hover:text-white"><Plus size={12} /></button>
                      </div>
                      <span className="text-sm text-[#c5a059]">KES {(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {step === 'DELIVERY' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 rounded-full bg-[#c5a059]/10 flex items-center justify-center">
                  <MapPin size={16} className="text-[#c5a059]" />
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-[#c5a059]">Delivery Details</h3>
                  <p className="text-[10px] text-white/50 uppercase tracking-widest">Where should we deliver?</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-2">Delivery Zone *</label>
                <select 
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059]"
                >
                  {Object.keys(deliveryZones).map(z => (
                    <option key={z} value={z}>{z} - KES {deliveryZones[z]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-2">Location / Landmark *</label>
                <input 
                  type="text" 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 5th Floor, Kibo Tower"
                  className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-2">Special Instructions</label>
                <textarea 
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Leave at reception"
                  className="w-full bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059] h-24 resize-none"
                />
              </div>
              
              <div className="p-4 bg-white/5 border border-white/10 flex items-start gap-3">
                 <MapPin size={16} className="text-[#c5a059] shrink-0 mt-0.5" />
                 <div>
                   <span className="block text-xs text-white mb-1">{zone} Delivery</span>
                   <span className="block text-[10px] text-white/50 leading-relaxed">Delivery fee is KES {deliveryFee}. Our concierge will contact you upon arrival.</span>
                 </div>
              </div>
            </div>
          )}

          {step === 'PAYMENT' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 rounded-full bg-[#c5a059]/10 flex items-center justify-center">
                  <CreditCard size={16} className="text-[#c5a059]" />
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-[#c5a059]">Payment Method</h3>
                  <p className="text-[10px] text-white/50 uppercase tracking-widest">Mobile Money</p>
                </div>
              </div>

              <div className="p-6 border border-[#c5a059]/30 bg-[#c5a059]/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <CreditCard size={64} />
                </div>
                <h4 className="text-sm font-serif mb-4 relative z-10">M-Pesa Express</h4>
                <label className="block text-[10px] uppercase tracking-widest text-[#c5a059]/80 mb-2 relative z-10">Phone Number *</label>
                <div className="flex relative z-10">
                  <span className="bg-[#111] border border-white/10 border-r-0 text-white/50 p-3 text-sm flex items-center">+254</span>
                  <input 
                    type="tel" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="712 345 678"
                    className="flex-1 bg-[#111] border border-white/10 text-white p-3 text-sm focus:outline-none focus:border-[#c5a059]"
                  />
                </div>
                <p className="text-[10px] text-white/40 mt-3 relative z-10">You will receive an STK prompt on your phone to complete the payment securely.</p>
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
                  <span className="text-sm text-[#c5a059]">KES {deliveryFee.toLocaleString()}</span>
                </div>
              </>
            )}
            
            {step === 'PAYMENT' && (
              <div className="flex justify-between mb-6 pt-2">
                <span className="text-xs text-white/80 uppercase tracking-widest font-bold">Total to Pay</span>
                <span className="text-lg text-[#c5a059] font-serif">KES {finalTotal.toLocaleString()}</span>
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
