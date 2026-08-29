import React, { useEffect, useState } from 'react';
import { useCartStore } from '../store/useCartStore.ts';
import { ProductModal } from '../components/ProductModal.tsx';
import { Sparkles, ArrowRight, ShieldCheck, Clock, ExternalLink } from 'lucide-react';

interface CMSContentState {
  banners: Array<{
    id: number;
    title: string;
    message: string;
    mediaUrl: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    displayOrder: number;
  }>;
  contentBlocks: Record<string, {
    id: number;
    title: string;
    subtitle: string | null;
    body: string | null;
    mediaUrl: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
  }>;
  visualSettings: Record<string, string>;
}

export const Home = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [cmsContent, setCmsContent] = useState<CMSContentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const addItem = useCartStore(state => state.addItem);

  useEffect(() => {
    Promise.all([
      fetch('/api/products').then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/cms/content').then(r => r.json()).catch(() => null)
    ])
      .then(([prodData, cmsData]) => {
        if (prodData.products) setProducts(prodData.products);
        if (cmsData) setCmsContent(cmsData);
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

  const settings = cmsContent?.visualSettings || {};
  const blocks = cmsContent?.contentBlocks || {};
  const banners = cmsContent?.banners || [];

  const heroHeadlineBlock = blocks.HERO_HEADLINE;
  const heroStoryBlock = blocks.HERO_STORY;
  const conciergeBlock = blocks.CONCIERGE_PROMISE;
  const heritageBlock = blocks.HERITAGE_NOTE;
  const terroirBlock = blocks.ABOUT_TERROIR;
  const promoBlock = blocks.PROMO_FEATURE;

  const heroBadge = settings.hero_badge || 'Featured Release';
  const conciergeDeliveryNote = conciergeBlock?.body || settings.concierge_delivery_note || 'Serving Kakamega town and nearby serviceable areas.';
  const heritageYear = heritageBlock?.title || settings.heritage_year || 'Since 2021';

  return (
    <main className="flex-1 flex flex-col p-6 md:p-12 md:pt-20 relative overflow-y-auto min-h-0 h-full scroll-smooth">
      {/* Top Announcement Bar from CMS */}
      {settings.announcement_banner_active === 'true' && settings.announcement_banner_text && (
        <div className="mb-6 -mx-6 md:-mx-12 -mt-6 md:-mt-20 bg-gradient-to-r from-[#1a150b] via-[#2c2010] to-[#1a150b] border-b border-[#c5a059]/30 px-4 py-2.5 text-center text-xs tracking-wider uppercase flex items-center justify-center gap-2 text-[#c5a059]">
          <Sparkles size={13} className="shrink-0" />
          <span>{settings.announcement_banner_text}</span>
          {settings.announcement_banner_url && (
            <a
              href={settings.announcement_banner_url}
              className="ml-2 underline text-white hover:text-[#d4b271] font-mono text-[10px]"
            >
              Learn More →
            </a>
          )}
        </div>
      )}

      {/* Published Campaigns & Banners */}
      {banners.length > 0 && (
        <div className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map(banner => (
            <div
              key={banner.id}
              className="p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border border-[#c5a059]/30 rounded-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <span className="text-[9px] uppercase tracking-widest text-[#c5a059] font-mono block mb-1">
                  Exclusive Allocation
                </span>
                <h4 className="text-base font-serif text-white font-medium">{banner.title}</h4>
                <p className="text-xs text-white/70 leading-relaxed mt-2">{banner.message}</p>
              </div>
              {banner.ctaLabel && (
                <div className="mt-4 pt-3 border-t border-white/5">
                  <a
                    href={banner.ctaUrl || '/'}
                    className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#c5a059] hover:text-white transition-colors font-bold"
                  >
                    <span>{banner.ctaLabel}</span>
                    <ArrowRight size={12} />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Featured Release Hero Section */}
      {featured && featuredVariant && (
        <>
          <header className="flex flex-col md:flex-row md:justify-between md:items-start mb-8 md:mb-12 gap-6 pt-6 md:pt-0">
            <div>
              <h2 className="text-xs uppercase tracking-[0.4em] text-[#c5a059] mb-4">
                {heroHeadlineBlock?.subtitle || heroBadge}
              </h2>
              <h3 
                className="text-4xl md:text-6xl font-serif font-light text-white leading-tight cursor-pointer hover:text-[#c5a059] transition-colors"
                onClick={() => setSelectedProduct(featured)}
              >
                {heroHeadlineBlock?.title ? (
                  heroHeadlineBlock.title
                ) : (
                  <>
                    {featured.name.split(' ').slice(0, 2).join(' ')}<br />
                    {featured.name.split(' ').slice(2).join(' ')}
                  </>
                )}
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
                  '{heroStoryBlock?.body || featured.description}'
                </p>
                <button 
                  onClick={() => setSelectedProduct(featured)}
                  className="mt-6 px-6 py-3 md:px-8 md:py-3 bg-[#c5a059] hover:bg-[#d4b271] transition-colors text-[#050505] text-[10px] font-bold uppercase tracking-[0.2em] cursor-pointer"
                >
                  {heroStoryBlock?.ctaLabel || 'Select Variant'}
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
                <span className="text-[9px] uppercase tracking-widest text-[#c5a059] mb-2">
                  {conciergeBlock?.subtitle || 'Delivery Service'}
                </span>
                <p className="text-lg font-serif text-white">
                  {conciergeBlock?.title || 'Concierge Delivery'}
                </p>
                <p className="text-[11px] text-white/40 mt-2">
                  {conciergeDeliveryNote}
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Published Terroir & Craft Section from CMS */}
      {terroirBlock && (
        <section className="mt-16 bg-white/[0.02] border border-white/10 p-8 md:p-12 rounded-sm">
          <div className="max-w-3xl">
            <span className="text-[9px] uppercase tracking-[0.3em] text-[#c5a059] block mb-2">
              {terroirBlock.subtitle || 'Terroir & Botanical Craft'}
            </span>
            <h3 className="text-2xl md:text-3xl font-serif text-white font-light mb-4">
              {terroirBlock.title}
            </h3>
            <p className="text-sm text-white/60 leading-relaxed font-serif">
              {terroirBlock.body}
            </p>
            {terroirBlock.ctaLabel && (
              <a
                href={terroirBlock.ctaUrl || '/'}
                className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#c5a059] hover:underline"
              >
                <span>{terroirBlock.ctaLabel}</span>
                <ArrowRight size={13} />
              </a>
            )}
          </div>
        </section>
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

      {/* Seasonal Promo & Collector Allocation Feature from CMS */}
      {promoBlock && (
        <section className="mb-12 p-8 bg-gradient-to-r from-[#16120c] to-[#0a0a0a] border border-[#c5a059]/25 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-[9px] uppercase tracking-[0.3em] text-[#c5a059] font-mono">
              {promoBlock.subtitle || 'Special Collector Allocation'}
            </span>
            <h3 className="text-xl md:text-2xl font-serif text-white mt-1">
              {promoBlock.title}
            </h3>
            {promoBlock.body && (
              <p className="text-xs text-white/60 mt-2 max-w-xl font-serif">
                {promoBlock.body}
              </p>
            )}
          </div>
          {promoBlock.ctaLabel && (
            <a
              href={promoBlock.ctaUrl || '/'}
              className="px-6 py-3 bg-[#c5a059] hover:bg-[#d4b271] text-black text-xs uppercase font-bold tracking-widest whitespace-nowrap transition-colors"
            >
              {promoBlock.ctaLabel}
            </a>
          )}
        </section>
      )}

      <footer className="mt-12 md:mt-24 flex flex-col md:flex-row justify-between md:items-end gap-6 shrink-0 pb-8 md:pb-0">
        <div className="flex gap-8">
          <div className="text-left">
            <span className="block text-[9px] text-white/30 uppercase tracking-widest mb-1">
              {heritageBlock?.subtitle || 'Heritage'}
            </span>
            <span className="text-xs text-white/70">
              {heritageYear}
            </span>
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
          {settings.site_title || 'Mratina Reserve'} &copy; {new Date().getFullYear()}
        </div>
      </footer>
      
      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </main>
  );
};
