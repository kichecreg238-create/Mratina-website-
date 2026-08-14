import React, { useEffect, useState } from 'react';
import { useCartStore } from '../store/useCartStore.ts';
import { ProductModal } from '../components/ProductModal.tsx';

export const Home = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const addItem = useCartStore(state => state.addItem);

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then(data => {
        if (data.products) setProducts(data.products);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-t-2 border-[#c5a059] rounded-full animate-spin"></div>
      </div>
    );
  }

  // Use the first product as featured, rest as collection
  const featured = products[0];
  const featuredVariant = featured?.variants?.[0];

  return (
    <main className="flex-1 flex flex-col p-6 md:p-12 md:pt-24 relative overflow-y-auto min-h-0 h-full">
      {featured && featuredVariant && (
        <>
          <header className="flex flex-col md:flex-row md:justify-between md:items-start mb-8 md:mb-12 gap-6 pt-12 md:pt-0">
            <div>
              <h2 className="text-xs uppercase tracking-[0.4em] text-[#c5a059] mb-4">Featured Release</h2>
              <h3 
                className="text-4xl md:text-6xl font-serif font-light text-white leading-tight cursor-pointer hover:text-[#c5a059] transition-colors"
                onClick={() => setSelectedProduct(featured)}
              >
                {featured.name.split(' ').slice(0,2).join(' ')}<br />
                {featured.name.split(' ').slice(2).join(' ')}
              </h3>
            </div>
            <div className="flex flex-col md:items-end md:text-right">
              <span className="text-sm text-white/40 mb-2">{featuredVariant.packaging}</span>
              <span className="text-2xl text-white font-light">KES {Number(featuredVariant.price).toLocaleString()}</span>
            </div>
          </header>

          <section className="flex flex-col lg:flex-row gap-8 lg:gap-12 flex-shrink-0 min-h-0">
            <div className="flex-1 relative group rounded-sm overflow-hidden min-h-[400px] lg:min-h-0 cursor-pointer" onClick={() => setSelectedProduct(featured)}>
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent z-10"></div>
              <div className="w-full h-full bg-[#111] border border-white/10 flex items-center justify-center p-12 overflow-hidden relative">
                <div className="w-40 h-72 md:w-48 md:h-80 bg-gradient-to-b from-[#222] to-[#111] shadow-[0_35px_60px_-15px_rgba(197,160,89,0.15)] relative border border-white/5 flex items-center justify-center">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-40 md:w-32 md:h-48 border border-[#c5a059]/20"></div>
                  <div className="p-4 text-center z-10">
                    <span className="text-[8px] tracking-[0.5em] text-[#c5a059] uppercase block mb-2">{featured.category}</span>
                    <span className="text-lg md:text-xl font-serif text-white block tracking-widest text-center px-2">MRATINA</span>
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8 z-20 max-w-sm pr-6" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm text-white/60 leading-relaxed italic font-serif">
                  '{featured.description}'
                </p>
                <button 
                  onClick={() => setSelectedProduct(featured)}
                  className="mt-6 px-6 py-3 md:px-8 md:py-3 bg-[#c5a059] hover:bg-[#d4b271] transition-colors text-[#050505] text-[10px] font-bold uppercase tracking-[0.2em] cursor-pointer"
                >
                  Select Variant
                </button>
              </div>
            </div>

            <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 pb-8 lg:pb-0">
              <div className="p-6 bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setSelectedProduct(featured)}>
                <h4 className="text-[10px] uppercase tracking-widest text-white/40 mb-4">Product Details & Reviews</h4>
                <ul className="space-y-4 pointer-events-none">
                  <li className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-[11px] text-white/50 uppercase tracking-wider">Volume</span>
                    <span className="text-[11px] text-white">{featuredVariant.volume}</span>
                  </li>
                  <li className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-[11px] text-white/50 uppercase tracking-wider">ABV</span>
                    <span className="text-[11px] text-white">{featured.abv}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-[11px] text-white/50 uppercase tracking-wider">Terroir</span>
                    <span className="text-[11px] text-white">{featured.origin}</span>
                  </li>
                </ul>
              </div>
              
              <div className="p-6 bg-[#c5a059]/5 border border-[#c5a059]/20 flex-1 flex flex-col justify-center text-center min-h-[160px]">
                <span className="text-[9px] uppercase tracking-widest text-[#c5a059] mb-2">Delivery Service</span>
                <p className="text-lg font-serif text-white">Concierge Delivery</p>
                <p className="text-[11px] text-white/40 mt-2">Available in Nairobi & Environs within 90 mins</p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* The Collection */}
      {products.length > 1 && (
        <section className="mt-16 md:mt-24 mb-12">
          <h2 className="text-xs uppercase tracking-[0.4em] text-[#c5a059] mb-8 border-b border-white/5 pb-4">The Collection</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.slice(1).map(p => {
              const variant = p.variants?.[0];
              if (!variant) return null;
              return (
                <div key={p.id} className="group border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-6 flex flex-col cursor-pointer" onClick={() => setSelectedProduct(p)}>
                  <div className="h-48 flex items-center justify-center mb-6 pointer-events-none">
                    <div className="w-16 h-32 bg-[#222] border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center">
                       <span className="text-[6px] tracking-widest text-[#c5a059] -rotate-90 block">MRATINA</span>
                    </div>
                  </div>
                  <h3 className="text-xl font-serif text-white mb-2 group-hover:text-[#c5a059] transition-colors">{p.name}</h3>
                  <p className="text-[11px] text-white/50 uppercase tracking-wider mb-6 flex-1 pointer-events-none">{variant.volume} • {p.abv}</p>
                  <div className="flex justify-between items-center border-t border-white/5 pt-4">
                    <span className="text-sm text-[#c5a059]">KES {Number(variant.price).toLocaleString()}</span>
                    <button 
                      className="text-[9px] uppercase tracking-[0.2em] text-white/70 hover:text-white transition-colors"
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="mt-12 md:mt-24 flex flex-col md:flex-row justify-between md:items-end gap-6 shrink-0 pb-8 md:pb-0">
        <div className="flex gap-8">
          <div className="text-left">
            <span className="block text-[9px] text-white/30 uppercase tracking-widest mb-1">Heritage</span>
            <span className="text-xs text-white/70">Since 2021</span>
          </div>
          <div className="text-left">
            <span className="block text-[9px] text-white/30 uppercase tracking-widest mb-1">Status</span>
            <span className="text-xs text-[#00ff88] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-[#00ff88] rounded-full animate-pulse"></span> 
              Operational
            </span>
          </div>
        </div>
        <div className="text-[10px] text-white/20 uppercase tracking-[0.3em]">
          Mratina Reserve &copy; 2024
        </div>
      </footer>
      
      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </main>
  );
};
