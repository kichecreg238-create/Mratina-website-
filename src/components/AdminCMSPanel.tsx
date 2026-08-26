import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  Layout,
  Image as ImageIcon,
  Sparkles,
  Sliders,
  History,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  Eye,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  X,
  Palette,
  Volume2,
  HelpCircle
} from 'lucide-react';

interface Banner {
  id: number;
  title: string;
  message: string;
  mediaUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  displayOrder: number;
  status: 'DRAFT' | 'PUBLISHED';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ContentBlock {
  id: number;
  sectionKey: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  mediaUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  displayOrder: number;
  status: 'DRAFT' | 'PUBLISHED';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CMSAuditLog {
  id: number;
  actorId: number | null;
  actorRole: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  metadata: any;
  createdAt: string;
}

const SECTION_KEY_LABELS: Record<string, { title: string; desc: string }> = {
  HERO_HEADLINE: {
    title: 'Hero Headline & Title',
    desc: 'Primary masthead copy at the top of the storefront.'
  },
  HERO_STORY: {
    title: 'Hero Heritage Quote / Story',
    desc: 'The narrative quote shown on the main featured card.'
  },
  CONCIERGE_PROMISE: {
    title: 'Concierge Delivery Promise',
    desc: 'Service guarantee card in the featured product sidebar.'
  },
  HERITAGE_NOTE: {
    title: 'Heritage & Legacy Note',
    desc: 'Historical and artisanal background in the footer.'
  },
  ABOUT_TERROIR: {
    title: 'Terroir & Botanical Craftsmanship',
    desc: 'Story of honey, muratina fruit, and botanical botanicals.'
  },
  PROMO_FEATURE: {
    title: 'Seasonal Promo & Collector Highlight',
    desc: 'Highlighted collector batch and special allocations.'
  }
};

export const AdminCMSPanel: React.FC = () => {
  const { user } = useAuthStore();
  const [subTab, setSubTab] = useState<'BLOCKS' | 'BANNERS' | 'SETTINGS' | 'AUDIT'>('BLOCKS');

  const [banners, setBanners] = useState<Banner[]>([]);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [visualSettings, setVisualSettings] = useState<Record<string, { value: string; category: string; isPublished: boolean }>>({});
  const [auditLogs, setAuditLogs] = useState<CMSAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals / Forms
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bannerForm, setBannerForm] = useState({
    title: '',
    message: '',
    mediaUrl: '',
    ctaLabel: '',
    ctaUrl: '',
    displayOrder: 0,
    status: 'DRAFT' as 'DRAFT' | 'PUBLISHED',
    isActive: true
  });

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ContentBlock | null>(null);
  const [blockForm, setBlockForm] = useState({
    sectionKey: 'HERO_HEADLINE',
    title: '',
    subtitle: '',
    body: '',
    mediaUrl: '',
    ctaLabel: '',
    ctaUrl: '',
    displayOrder: 0,
    status: 'DRAFT' as 'DRAFT' | 'PUBLISHED',
    isActive: true
  });

  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({
    site_title: 'MRATINA',
    tagline: 'Sacred Kenyan Craft & Terroir',
    hero_badge: 'Featured Release',
    accent_theme: 'gold',
    concierge_delivery_note: 'Available in Nairobi & Environs within 90 mins',
    heritage_year: 'Since 2021',
    announcement_banner_active: 'false',
    announcement_banner_text: 'Complimentary sommelier gift packaging on orders above KES 5,000',
    announcement_banner_url: '/'
  });

  const fetchCMSData = async () => {
    setLoading(true);
    try {
      const [bRes, blRes, vsRes, alRes] = await Promise.all([
        fetch('/api/admin/cms/banners'),
        fetch('/api/admin/cms/blocks'),
        fetch('/api/admin/cms/visual-settings'),
        fetch('/api/admin/cms/audit-logs')
      ]);

      if (bRes.ok) {
        const bData = await bRes.json();
        setBanners(bData.banners || []);
      }
      if (blRes.ok) {
        const blData = await blRes.json();
        setBlocks(blData.blocks || []);
      }
      if (vsRes.ok) {
        const vsData = await vsRes.json();
        const rawSettings = vsData.settings || {};
        setVisualSettings(rawSettings);
        const formObj: Record<string, string> = {};
        for (const [k, obj] of Object.entries(rawSettings)) {
          formObj[k] = (obj as any).value || '';
        }
        setSettingsForm(prev => ({ ...prev, ...formObj }));
      }
      if (alRes.ok) {
        const alData = await alRes.json();
        setAuditLogs(alData.logs || []);
      }
    } catch (err: any) {
      console.error(err);
      setMsg({ text: 'Failed to load CMS data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCMSData();
  }, []);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  // --- Banner Actions ---
  const openBannerModal = (banner?: Banner) => {
    if (banner) {
      setEditingBanner(banner);
      setBannerForm({
        title: banner.title,
        message: banner.message,
        mediaUrl: banner.mediaUrl || '',
        ctaLabel: banner.ctaLabel || '',
        ctaUrl: banner.ctaUrl || '',
        displayOrder: banner.displayOrder || 0,
        status: banner.status,
        isActive: banner.isActive
      });
    } else {
      setEditingBanner(null);
      setBannerForm({
        title: '',
        message: '',
        mediaUrl: '',
        ctaLabel: '',
        ctaUrl: '',
        displayOrder: banners.length,
        status: 'DRAFT',
        isActive: true
      });
    }
    setShowBannerModal(true);
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingBanner
        ? `/api/admin/cms/banners/${editingBanner.id}`
        : '/api/admin/cms/banners';
      const method = editingBanner ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bannerForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save banner');

      showNotification(editingBanner ? 'Banner updated successfully' : 'Banner created as draft');
      setShowBannerModal(false);
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBannerStatus = async (banner: Banner) => {
    try {
      const nextStatus = banner.status === 'PUBLISHED' ? 'unpublish' : 'publish';
      const res = await fetch(`/api/admin/cms/banners/${banner.id}/${nextStatus}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to transition banner state');

      showNotification(`Banner ${nextStatus === 'publish' ? 'published to live storefront' : 'moved to draft'}`);
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleToggleBannerActive = async (banner: Banner) => {
    try {
      const res = await fetch(`/api/admin/cms/banners/${banner.id}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle banner active state');

      showNotification(`Banner active state updated`);
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteBanner = async (id: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this banner?')) return;
    try {
      const res = await fetch(`/api/admin/cms/banners/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete banner');

      showNotification('Banner deleted');
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // --- Content Block Actions ---
  const openBlockModal = (block?: ContentBlock) => {
    if (block) {
      setEditingBlock(block);
      setBlockForm({
        sectionKey: block.sectionKey,
        title: block.title,
        subtitle: block.subtitle || '',
        body: block.body || '',
        mediaUrl: block.mediaUrl || '',
        ctaLabel: block.ctaLabel || '',
        ctaUrl: block.ctaUrl || '',
        displayOrder: block.displayOrder || 0,
        status: block.status,
        isActive: block.isActive
      });
    } else {
      setEditingBlock(null);
      setBlockForm({
        sectionKey: 'HERO_HEADLINE',
        title: '',
        subtitle: '',
        body: '',
        mediaUrl: '',
        ctaLabel: '',
        ctaUrl: '',
        displayOrder: blocks.length,
        status: 'DRAFT',
        isActive: true
      });
    }
    setShowBlockModal(true);
  };

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingBlock
        ? `/api/admin/cms/blocks/${editingBlock.id}`
        : '/api/admin/cms/blocks';
      const method = editingBlock ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blockForm)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save content block');

      showNotification(editingBlock ? 'Content block updated' : 'Content block created as draft');
      setShowBlockModal(false);
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBlockStatus = async (block: ContentBlock) => {
    try {
      const nextStatus = block.status === 'PUBLISHED' ? 'unpublish' : 'publish';
      const res = await fetch(`/api/admin/cms/blocks/${block.id}/${nextStatus}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update block publish state');

      showNotification(`Content block ${nextStatus === 'publish' ? 'published to live storefront' : 'moved to draft'}`);
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleToggleBlockActive = async (block: ContentBlock) => {
    try {
      const res = await fetch(`/api/admin/cms/blocks/${block.id}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle block active state');

      showNotification('Block active state updated');
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteBlock = async (id: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this content block?')) return;
    try {
      const res = await fetch(`/api/admin/cms/blocks/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete block');

      showNotification('Content block deleted');
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // --- Visual Settings Actions ---
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cms/visual-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsForm })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update visual settings');

      showNotification('Visual and brand settings updated & published to storefront');
      fetchCMSData();
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-[#c5a059] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {msg && (
        <div
          className={`p-4 rounded border flex items-center justify-between text-xs tracking-wider uppercase font-mono ${
            msg.type === 'success'
              ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sub navigation for CMS */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('BLOCKS')}
            className={`px-4 py-2 text-[11px] uppercase tracking-widest transition-colors flex items-center gap-2 rounded-sm ${
              subTab === 'BLOCKS'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Layout size={14} /> Page Blocks ({blocks.length})
          </button>
          <button
            onClick={() => setSubTab('BANNERS')}
            className={`px-4 py-2 text-[11px] uppercase tracking-widest transition-colors flex items-center gap-2 rounded-sm ${
              subTab === 'BANNERS'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <ImageIcon size={14} /> Banners & Promos ({banners.length})
          </button>
          <button
            onClick={() => setSubTab('SETTINGS')}
            className={`px-4 py-2 text-[11px] uppercase tracking-widest transition-colors flex items-center gap-2 rounded-sm ${
              subTab === 'SETTINGS'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Sliders size={14} /> Visual & Brand Control
          </button>
          <button
            onClick={() => setSubTab('AUDIT')}
            className={`px-4 py-2 text-[11px] uppercase tracking-widest transition-colors flex items-center gap-2 rounded-sm ${
              subTab === 'AUDIT'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <History size={14} /> CMS Audit Trail ({auditLogs.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchCMSData}
            className="p-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors rounded-sm"
            title="Refresh CMS Data"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: CONTENT BLOCKS */}
      {subTab === 'BLOCKS' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-sm">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-white font-medium">Storefront Content Sections</h3>
              <p className="text-[11px] text-white/50 mt-1">
                Customize titles, narratives, concierge notes, and terroir stories with strict schema safety.
              </p>
            </div>
            <button
              onClick={() => openBlockModal()}
              className="px-4 py-2 bg-[#c5a059] hover:bg-[#d4b271] text-black font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <Plus size={13} /> Add Content Block
            </button>
          </div>

          {blocks.length === 0 ? (
            <div className="text-center py-16 bg-white/5 border border-white/10 rounded-sm">
              <Layout className="w-12 h-12 mx-auto text-white/20 mb-3" />
              <p className="text-sm text-white/60 uppercase tracking-wider">No custom content blocks defined</p>
              <p className="text-xs text-white/40 mt-1">
                The storefront is currently rendering default built-in heritage copy seamlessly.
              </p>
              <button
                onClick={() => openBlockModal()}
                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] uppercase tracking-widest transition-colors rounded-sm inline-flex items-center gap-1"
              >
                <Plus size={12} /> Create First Custom Block
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blocks.map(block => {
                const sectionMeta = SECTION_KEY_LABELS[block.sectionKey] || {
                  title: block.sectionKey,
                  desc: 'Custom storefront section'
                };
                const isPublished = block.status === 'PUBLISHED';

                return (
                  <div
                    key={block.id}
                    className={`border rounded-sm p-5 flex flex-col justify-between transition-colors ${
                      isPublished ? 'bg-white/5 border-white/15' : 'bg-amber-950/10 border-amber-500/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <span className="text-[9px] uppercase tracking-widest text-[#c5a059] font-mono block">
                            [{block.sectionKey}]
                          </span>
                          <h4 className="text-base font-serif text-white font-medium mt-0.5">{block.title}</h4>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-full border ${
                              isPublished
                                ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            }`}
                          >
                            {block.status}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              block.isActive ? 'bg-[#00ff88]' : 'bg-white/20'
                            }`}
                            title={block.isActive ? 'Active' : 'Inactive'}
                          />
                        </div>
                      </div>

                      {block.subtitle && (
                        <p className="text-xs text-white/70 italic font-serif mb-2">{block.subtitle}</p>
                      )}

                      {block.body && (
                        <p className="text-xs text-white/50 line-clamp-3 leading-relaxed mb-3">{block.body}</p>
                      )}

                      {(block.ctaLabel || block.ctaUrl) && (
                        <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono mb-3">
                          <span className="text-[#c5a059]">CTA:</span>
                          <span>{block.ctaLabel || 'Action'}</span>
                          <span className="text-white/20">→</span>
                          <span className="truncate max-w-[150px]">{block.ctaUrl || '/'}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2 mt-2">
                      <div className="text-[10px] text-white/30 font-mono">
                        Order: {block.displayOrder} • {new Date(block.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleBlockStatus(block)}
                          className={`px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold rounded-sm border transition-colors ${
                            isPublished
                              ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                              : 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88] hover:bg-[#00ff88]/20'
                          }`}
                        >
                          {isPublished ? 'Move to Draft' : 'Publish Live'}
                        </button>
                        <button
                          onClick={() => openBlockModal(block)}
                          className="p-1.5 bg-white/5 hover:bg-white/15 text-white/80 transition-colors rounded-sm"
                          title="Edit Block"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteBlock(block.id)}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors rounded-sm"
                          title="Delete Block"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: BANNERS & PROMOTIONS */}
      {subTab === 'BANNERS' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-sm">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-white font-medium">Storefront Banners & Campaigns</h3>
              <p className="text-[11px] text-white/50 mt-1">
                Announcements, vintage releases, seasonal allocations, and cellar club invitations.
              </p>
            </div>
            <button
              onClick={() => openBannerModal()}
              className="px-4 py-2 bg-[#c5a059] hover:bg-[#d4b271] text-black font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-1.5 rounded-sm"
            >
              <Plus size={13} /> Create Banner
            </button>
          </div>

          {banners.length === 0 ? (
            <div className="text-center py-16 bg-white/5 border border-white/10 rounded-sm">
              <ImageIcon className="w-12 h-12 mx-auto text-white/20 mb-3" />
              <p className="text-sm text-white/60 uppercase tracking-wider">No banners registered</p>
              <p className="text-xs text-white/40 mt-1">
                Create promotional cards with safe links and draft-publishing controls.
              </p>
              <button
                onClick={() => openBannerModal()}
                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] uppercase tracking-widest transition-colors rounded-sm inline-flex items-center gap-1"
              >
                <Plus size={12} /> Create First Banner
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map(banner => {
                const isPublished = banner.status === 'PUBLISHED';
                return (
                  <div
                    key={banner.id}
                    className={`border rounded-sm p-5 flex flex-col justify-between transition-colors ${
                      isPublished ? 'bg-white/5 border-white/15' : 'bg-amber-950/10 border-amber-500/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className="text-base font-serif text-white font-medium">{banner.title}</h4>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-full border ${
                              isPublished
                                ? 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88]'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            }`}
                          >
                            {banner.status}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              banner.isActive ? 'bg-[#00ff88]' : 'bg-white/20'
                            }`}
                            title={banner.isActive ? 'Active' : 'Inactive'}
                          />
                        </div>
                      </div>

                      <p className="text-xs text-white/70 leading-relaxed mb-3">{banner.message}</p>

                      {(banner.ctaLabel || banner.ctaUrl) && (
                        <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono mb-2">
                          <span className="text-[#c5a059]">Button:</span>
                          <span className="text-white/80">{banner.ctaLabel || 'Action'}</span>
                          <span className="text-white/20">→</span>
                          <span className="truncate max-w-[150px]">{banner.ctaUrl || '/'}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2 mt-2">
                      <div className="text-[10px] text-white/30 font-mono">
                        Order: {banner.displayOrder} • {new Date(banner.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleBannerStatus(banner)}
                          className={`px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold rounded-sm border transition-colors ${
                            isPublished
                              ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                              : 'bg-[#00ff88]/10 border-[#00ff88]/30 text-[#00ff88] hover:bg-[#00ff88]/20'
                          }`}
                        >
                          {isPublished ? 'Move to Draft' : 'Publish Live'}
                        </button>
                        <button
                          onClick={() => openBannerModal(banner)}
                          className="p-1.5 bg-white/5 hover:bg-white/15 text-white/80 transition-colors rounded-sm"
                          title="Edit Banner"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteBanner(banner.id)}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors rounded-sm"
                          title="Delete Banner"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: VISUAL & BRAND SETTINGS */}
      {subTab === 'SETTINGS' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-white font-medium flex items-center gap-2">
                <Palette size={16} className="text-[#c5a059]" /> Brand Identity & Masthead Copy
              </h3>
              <p className="text-[11px] text-white/50 mt-1">
                Configure brand typography names, taglines, hero badges, and heritage provenance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Storefront Brand Title
                </label>
                <input
                  type="text"
                  value={settingsForm.site_title || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, site_title: e.target.value })}
                  maxLength={100}
                  className="w-full bg-[#111] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
                <span className="text-[9px] text-white/30 font-mono mt-1 block">Default: MRATINA</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Hero Section Eyebrow Badge
                </label>
                <input
                  type="text"
                  value={settingsForm.hero_badge || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, hero_badge: e.target.value })}
                  maxLength={60}
                  className="w-full bg-[#111] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
                <span className="text-[9px] text-white/30 font-mono mt-1 block">Default: FEATURED RELEASE</span>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Storefront Tagline / Philosophy
                </label>
                <input
                  type="text"
                  value={settingsForm.tagline || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                  maxLength={200}
                  className="w-full bg-[#111] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
                <span className="text-[9px] text-white/30 font-mono mt-1 block">Default: Sacred Kenyan Craft & Terroir</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Heritage Provenance Note
                </label>
                <input
                  type="text"
                  value={settingsForm.heritage_year || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, heritage_year: e.target.value })}
                  maxLength={50}
                  className="w-full bg-[#111] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
                <span className="text-[9px] text-white/30 font-mono mt-1 block">e.g. Since 2021 / Ancient Tradition</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Delivery Concierge Promise Line
                </label>
                <input
                  type="text"
                  value={settingsForm.concierge_delivery_note || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, concierge_delivery_note: e.target.value })}
                  maxLength={250}
                  className="w-full bg-[#111] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
                <span className="text-[9px] text-white/30 font-mono mt-1 block">Default: Available in Nairobi & Environs within 90 mins</span>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-white font-medium flex items-center gap-2">
                <Sparkles size={16} className="text-[#c5a059]" /> Visual Theme & Accent Palette
              </h3>
              <p className="text-[11px] text-white/50 mt-1">
                Select the luxury metallic accent aesthetic for buttons, badges, and highlights.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { id: 'gold', name: 'Imperial Gold', hex: '#c5a059', desc: 'Canonical Mratina reserve tone' },
                { id: 'amber', name: 'Harvest Amber', hex: '#d97706', desc: 'Warm honey & botanical tone' },
                { id: 'emerald', name: 'Highland Emerald', hex: '#10b981', desc: 'Kenyan Rift flora tone' },
                { id: 'crimson', name: 'Royal Crimson', hex: '#e11d48', desc: 'Vintage celebration reserve' }
              ].map(theme => (
                <div
                  key={theme.id}
                  onClick={() => setSettingsForm({ ...settingsForm, accent_theme: theme.id })}
                  className={`p-4 border rounded-sm cursor-pointer transition-all ${
                    settingsForm.accent_theme === theme.id
                      ? 'bg-white/10 border-[#c5a059] ring-1 ring-[#c5a059]'
                      : 'bg-black/40 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.hex }} />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{theme.name}</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-snug">{theme.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-white font-medium flex items-center gap-2">
                <Volume2 size={16} className="text-[#c5a059]" /> Top Announcement Banner
              </h3>
              <p className="text-[11px] text-white/50 mt-1">
                Display an eye-catching announcement bar across the top of the storefront.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="announcement_active"
                  checked={settingsForm.announcement_banner_active === 'true'}
                  onChange={e =>
                    setSettingsForm({
                      ...settingsForm,
                      announcement_banner_active: e.target.checked ? 'true' : 'false'
                    })
                  }
                  className="rounded border-white/20 text-[#c5a059] focus:ring-[#c5a059]"
                />
                <label htmlFor="announcement_active" className="text-xs text-white uppercase tracking-wider cursor-pointer">
                  Enable Top Announcement Bar
                </label>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Announcement Message
                </label>
                <input
                  type="text"
                  value={settingsForm.announcement_banner_text || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, announcement_banner_text: e.target.value })}
                  maxLength={200}
                  placeholder="e.g. Complimentary sommelier gift packaging on orders above KES 5,000"
                  className="w-full bg-[#111] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Announcement Action URL (optional)
                </label>
                <input
                  type="text"
                  value={settingsForm.announcement_banner_url || ''}
                  onChange={e => setSettingsForm({ ...settingsForm, announcement_banner_url: e.target.value })}
                  placeholder="e.g. / or /orders"
                  className="w-full bg-[#111] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 bg-[#c5a059] hover:bg-[#d4b271] text-black font-bold text-[11px] uppercase tracking-widest transition-colors rounded-sm disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Save & Publish Visual Settings
            </button>
          </div>
        </form>
      )}

      {/* SUB-TAB 4: CMS AUDIT TRAIL */}
      {subTab === 'AUDIT' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-sm">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-white font-medium">CMS Audit Ledger</h3>
              <p className="text-[11px] text-white/50 mt-1">
                Authoritative record of all visual content updates, draft transitions, and published mutations.
              </p>
            </div>
            <span className="text-[10px] font-mono text-white/40">Total Records: {auditLogs.length}</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="text-center py-16 bg-white/5 border border-white/10 rounded-sm">
              <History className="w-12 h-12 mx-auto text-white/20 mb-3" />
              <p className="text-sm text-white/60 uppercase tracking-wider">No CMS audit events recorded yet</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-sm overflow-hidden">
              <table className="w-full text-left text-xs text-white/70">
                <thead className="bg-white/5 text-[9px] uppercase tracking-widest text-white/40 border-b border-white/10 font-mono">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Admin</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors font-mono text-[11px]">
                      <td className="p-3 text-white/40 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3 font-bold text-[#c5a059]">{log.action}</td>
                      <td className="p-3 text-white/60">
                        {log.targetType} {log.targetId ? `#${log.targetId}` : ''}
                      </td>
                      <td className="p-3 text-white/80">{log.actorEmail}</td>
                      <td className="p-3 text-white/90 font-sans text-xs">{log.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD / EDIT CONTENT BLOCK */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#111] border border-white/10 max-w-xl w-full p-6 rounded-sm shadow-2xl space-y-6 my-8">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 className="text-base font-serif text-white">
                {editingBlock ? `Edit Block #${editingBlock.id}` : 'Create Content Block'}
              </h3>
              <button onClick={() => setShowBlockModal(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBlock} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Storefront Section Key
                </label>
                <select
                  value={blockForm.sectionKey}
                  onChange={e => setBlockForm({ ...blockForm, sectionKey: e.target.value })}
                  className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                >
                  {Object.entries(SECTION_KEY_LABELS).map(([k, meta]) => (
                    <option key={k} value={k}>
                      [{k}] — {meta.title}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-white/40 mt-1 font-serif italic">
                  {SECTION_KEY_LABELS[blockForm.sectionKey]?.desc}
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">Block Title *</label>
                <input
                  type="text"
                  required
                  value={blockForm.title}
                  onChange={e => setBlockForm({ ...blockForm, title: e.target.value })}
                  maxLength={150}
                  placeholder="e.g. Rare Vintage Reserve"
                  className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Subtitle / Quote Snippet (optional)
                </label>
                <input
                  type="text"
                  value={blockForm.subtitle}
                  onChange={e => setBlockForm({ ...blockForm, subtitle: e.target.value })}
                  maxLength={200}
                  placeholder="e.g. Hand-harvested forest honey aged with Muratina botanicals."
                  className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Body Narrative (optional)
                </label>
                <textarea
                  rows={4}
                  value={blockForm.body}
                  onChange={e => setBlockForm({ ...blockForm, body: e.target.value })}
                  maxLength={3000}
                  placeholder="Artisanal tasting notes, terroir details, or historical legacy context."
                  className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none font-serif leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                    CTA Button Label
                  </label>
                  <input
                    type="text"
                    value={blockForm.ctaLabel}
                    onChange={e => setBlockForm({ ...blockForm, ctaLabel: e.target.value })}
                    maxLength={50}
                    placeholder="e.g. Explore Cellar"
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                    CTA Safe URL
                  </label>
                  <input
                    type="text"
                    value={blockForm.ctaUrl}
                    onChange={e => setBlockForm({ ...blockForm, ctaUrl: e.target.value })}
                    placeholder="e.g. / or /orders"
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/10">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={blockForm.displayOrder}
                    onChange={e => setBlockForm({ ...blockForm, displayOrder: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">Status</label>
                  <select
                    value={blockForm.status}
                    onChange={e => setBlockForm({ ...blockForm, status: e.target.value as any })}
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blockForm.isActive}
                      onChange={e => setBlockForm({ ...blockForm, isActive: e.target.checked })}
                      className="rounded text-[#c5a059]"
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs uppercase tracking-wider rounded-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-[#c5a059] hover:bg-[#d4b271] text-black font-bold text-xs uppercase tracking-wider rounded-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingBlock ? 'Update Block' : 'Create Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT BANNER */}
      {showBannerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#111] border border-white/10 max-w-xl w-full p-6 rounded-sm shadow-2xl space-y-6 my-8">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 className="text-base font-serif text-white">
                {editingBanner ? `Edit Banner #${editingBanner.id}` : 'Create Banner'}
              </h3>
              <button onClick={() => setShowBannerModal(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBanner} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">Banner Title *</label>
                <input
                  type="text"
                  required
                  value={bannerForm.title}
                  onChange={e => setBannerForm({ ...bannerForm, title: e.target.value })}
                  maxLength={150}
                  placeholder="e.g. Master Distiller Limited Edition"
                  className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                  Banner Message / Copy *
                </label>
                <textarea
                  rows={3}
                  required
                  value={bannerForm.message}
                  onChange={e => setBannerForm({ ...bannerForm, message: e.target.value })}
                  maxLength={500}
                  placeholder="e.g. Aged in French oak casks for 18 months. Only 200 bottles produced."
                  className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                    Button Label (optional)
                  </label>
                  <input
                    type="text"
                    value={bannerForm.ctaLabel}
                    onChange={e => setBannerForm({ ...bannerForm, ctaLabel: e.target.value })}
                    maxLength={50}
                    placeholder="e.g. Reserve Now"
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                    Button Safe URL (optional)
                  </label>
                  <input
                    type="text"
                    value={bannerForm.ctaUrl}
                    onChange={e => setBannerForm({ ...bannerForm, ctaUrl: e.target.value })}
                    placeholder="e.g. / or /orders"
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/10">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={bannerForm.displayOrder}
                    onChange={e => setBannerForm({ ...bannerForm, displayOrder: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/60 mb-2">Status</label>
                  <select
                    value={bannerForm.status}
                    onChange={e => setBannerForm({ ...bannerForm, status: e.target.value as any })}
                    className="w-full bg-[#181818] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#c5a059] outline-none"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bannerForm.isActive}
                      onChange={e => setBannerForm({ ...bannerForm, isActive: e.target.checked })}
                      className="rounded text-[#c5a059]"
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowBannerModal(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs uppercase tracking-wider rounded-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-[#c5a059] hover:bg-[#d4b271] text-black font-bold text-xs uppercase tracking-wider rounded-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingBanner ? 'Update Banner' : 'Create Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
