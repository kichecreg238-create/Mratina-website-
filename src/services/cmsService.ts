import { db } from '../db/index.ts';
import { cmsBanners, cmsContentBlocks, cmsVisualSettings, cmsAuditLogs, users } from '../db/schema.ts';
import { eq, desc, and, asc } from 'drizzle-orm';

export interface CMSAuditParams {
  actorId?: number | null;
  actorRole?: 'ADMIN' | 'SYSTEM';
  action: string;
  targetType: 'BANNER' | 'CONTENT_BLOCK' | 'VISUAL_SETTINGS';
  targetId?: string | null;
  details?: string | null;
  metadata?: Record<string, any> | null;
}

export const ALLOWED_SECTION_KEYS = [
  'HERO_HEADLINE',
  'HERO_STORY',
  'CONCIERGE_PROMISE',
  'HERITAGE_NOTE',
  'ABOUT_TERROIR',
  'PROMO_FEATURE'
] as const;

export type SectionKey = typeof ALLOWED_SECTION_KEYS[number];

export const ALLOWED_THEMES = ['gold', 'amber', 'emerald', 'crimson'] as const;
export type AccentTheme = typeof ALLOWED_THEMES[number];

export const ALLOWED_SETTING_KEYS = [
  'site_title',
  'tagline',
  'hero_badge',
  'accent_theme',
  'concierge_delivery_note',
  'heritage_year',
  'announcement_banner_active',
  'announcement_banner_text',
  'announcement_banner_url'
] as const;

export type SettingKey = typeof ALLOWED_SETTING_KEYS[number];

export const DEFAULT_VISUAL_SETTINGS: Record<SettingKey, { value: string; category: string }> = {
  site_title: { value: 'MRATINA', category: 'BRAND' },
  tagline: { value: 'Sacred Kenyan Craft & Terroir', category: 'BRAND' },
  hero_badge: { value: 'Featured Release', category: 'BRAND' },
  accent_theme: { value: 'gold', category: 'THEME' },
  concierge_delivery_note: { value: 'Available in Nairobi & Environs within 90 mins', category: 'DELIVERY_PROMO' },
  heritage_year: { value: 'Since 2021', category: 'BRAND' },
  announcement_banner_active: { value: 'false', category: 'ANNOUNCEMENT' },
  announcement_banner_text: { value: 'Complimentary sommelier gift packaging on orders above KES 5,000', category: 'ANNOUNCEMENT' },
  announcement_banner_url: { value: '/', category: 'ANNOUNCEMENT' }
};

/**
 * Validates and sanitizes a URL to ensure it cannot execute arbitrary code or scripts.
 */
export function sanitizeSafeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Disallow javascript:, data:, vbscript:, etc.
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.includes('<script') ||
    lower.includes('onload=') ||
    lower.includes('onerror=')
  ) {
    throw new Error('Unsafe URL scheme or script detected.');
  }

  // Must be a relative path or http/https URL
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }

  throw new Error('Invalid URL format. Must start with "/", "#", "https://" or "http://".');
}

/**
 * Strips dangerous HTML / script tags from text fields.
 */
export function sanitizeText(text: string | null | undefined, maxLength: number = 2000): string {
  if (!text) return '';
  const trimmed = text.trim();
  // Strip out any HTML tags to ensure pure structured text
  const clean = trimmed.replace(/<[^>]*>?/gm, '');
  return clean.slice(0, maxLength);
}

export class CMSService {
  /**
   * Logs an immutable CMS audit entry.
   */
  async recordAudit(params: CMSAuditParams) {
    try {
      await db.insert(cmsAuditLogs).values({
        actorId: params.actorId || null,
        actorRole: params.actorRole || 'ADMIN',
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId || null,
        details: params.details?.trim() || null,
        metadata: params.metadata || null
      });
    } catch (err) {
      console.error('Failed to record CMS audit log:', err);
    }
  }

  // ==========================================
  // STOREFRONT (PUBLIC) PUBLISHED CONTENT
  // ==========================================

  /**
   * Returns published and active storefront content (banners, content blocks, visual settings).
   * Falls back gracefully to structured defaults if database has no published entries.
   */
  async getPublishedStorefrontContent() {
    // 1. Fetch published banners
    const publishedBanners = await db.select().from(cmsBanners)
      .where(and(eq(cmsBanners.status, 'PUBLISHED'), eq(cmsBanners.isActive, true)))
      .orderBy(asc(cmsBanners.displayOrder), desc(cmsBanners.updatedAt));

    // 2. Fetch published content blocks
    const publishedBlocks = await db.select().from(cmsContentBlocks)
      .where(and(eq(cmsContentBlocks.status, 'PUBLISHED'), eq(cmsContentBlocks.isActive, true)))
      .orderBy(asc(cmsContentBlocks.displayOrder), desc(cmsContentBlocks.updatedAt));

    // 3. Fetch published visual settings
    const settingsRows = await db.select().from(cmsVisualSettings)
      .where(eq(cmsVisualSettings.isPublished, true));

    const visualSettings: Record<string, string> = {};
    // Populate defaults first
    for (const key of ALLOWED_SETTING_KEYS) {
      visualSettings[key] = DEFAULT_VISUAL_SETTINGS[key].value;
    }
    // Overlay database settings
    for (const row of settingsRows) {
      if (ALLOWED_SETTING_KEYS.includes(row.key as SettingKey)) {
        visualSettings[row.key] = row.value;
      }
    }

    // Group blocks by sectionKey
    const blocksBySection: Record<string, any[]> = {};
    for (const block of publishedBlocks) {
      if (!blocksBySection[block.sectionKey]) {
        blocksBySection[block.sectionKey] = [];
      }
      blocksBySection[block.sectionKey].push(block);
    }

    return {
      banners: publishedBanners,
      blocks: publishedBlocks,
      blocksBySection,
      visualSettings
    };
  }

  // ==========================================
  // ADMIN BANNERS
  // ==========================================

  async getAllBanners() {
    return await db.select().from(cmsBanners).orderBy(asc(cmsBanners.displayOrder), desc(cmsBanners.createdAt));
  }

  async createBanner(data: {
    title: string;
    message: string;
    mediaUrl?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    displayOrder?: number;
    status?: 'DRAFT' | 'PUBLISHED';
    isActive?: boolean;
  }, actorId: number) {
    const title = sanitizeText(data.title, 150);
    const message = sanitizeText(data.message, 500);
    if (!title || !message) {
      throw new Error('Banner title and message are required.');
    }

    const ctaUrl = data.ctaUrl ? sanitizeSafeUrl(data.ctaUrl) : null;
    const mediaUrl = data.mediaUrl ? sanitizeSafeUrl(data.mediaUrl) : null;
    const ctaLabel = data.ctaLabel ? sanitizeText(data.ctaLabel, 50) : null;
    const displayOrder = typeof data.displayOrder === 'number' ? data.displayOrder : 0;
    const status = data.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    const isActive = data.isActive !== undefined ? Boolean(data.isActive) : true;

    const [newBanner] = await db.insert(cmsBanners).values({
      title,
      message,
      mediaUrl,
      ctaLabel,
      ctaUrl,
      displayOrder,
      status,
      isActive
    }).returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'CREATE_BANNER',
      targetType: 'BANNER',
      targetId: newBanner.id.toString(),
      details: `Created banner "${newBanner.title}" [${newBanner.status}]`,
      metadata: { bannerId: newBanner.id, status: newBanner.status }
    });

    return newBanner;
  }

  async updateBanner(id: number, data: {
    title?: string;
    message?: string;
    mediaUrl?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    displayOrder?: number;
    status?: 'DRAFT' | 'PUBLISHED';
    isActive?: boolean;
  }, actorId: number) {
    const bannerRes = await db.select().from(cmsBanners).where(eq(cmsBanners.id, id));
    if (bannerRes.length === 0) throw new Error('Banner not found.');

    const updateFields: any = { updatedAt: new Date() };

    if (data.title !== undefined) updateFields.title = sanitizeText(data.title, 150);
    if (data.message !== undefined) updateFields.message = sanitizeText(data.message, 500);
    if (data.mediaUrl !== undefined) updateFields.mediaUrl = data.mediaUrl ? sanitizeSafeUrl(data.mediaUrl) : null;
    if (data.ctaLabel !== undefined) updateFields.ctaLabel = data.ctaLabel ? sanitizeText(data.ctaLabel, 50) : null;
    if (data.ctaUrl !== undefined) updateFields.ctaUrl = data.ctaUrl ? sanitizeSafeUrl(data.ctaUrl) : null;
    if (data.displayOrder !== undefined) updateFields.displayOrder = Number(data.displayOrder) || 0;
    if (data.status !== undefined) {
      if (!['DRAFT', 'PUBLISHED'].includes(data.status)) throw new Error('Invalid status.');
      updateFields.status = data.status;
    }
    if (data.isActive !== undefined) updateFields.isActive = Boolean(data.isActive);

    const [updated] = await db.update(cmsBanners).set(updateFields).where(eq(cmsBanners.id, id)).returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'UPDATE_BANNER',
      targetType: 'BANNER',
      targetId: id.toString(),
      details: `Updated banner #${id} (${updated.title})`,
      metadata: { fieldsUpdated: Object.keys(data) }
    });

    return updated;
  }

  async setBannerPublishStatus(id: number, status: 'DRAFT' | 'PUBLISHED', actorId: number) {
    const bannerRes = await db.select().from(cmsBanners).where(eq(cmsBanners.id, id));
    if (bannerRes.length === 0) throw new Error('Banner not found.');

    const [updated] = await db.update(cmsBanners)
      .set({ status, updatedAt: new Date() })
      .where(eq(cmsBanners.id, id))
      .returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: status === 'PUBLISHED' ? 'PUBLISH_BANNER' : 'UNPUBLISH_BANNER',
      targetType: 'BANNER',
      targetId: id.toString(),
      details: `${status === 'PUBLISHED' ? 'Published' : 'Unpublished'} banner #${id} (${updated.title})`,
      metadata: { previousStatus: bannerRes[0].status, newStatus: status }
    });

    return updated;
  }

  async toggleBannerActive(id: number, actorId: number) {
    const bannerRes = await db.select().from(cmsBanners).where(eq(cmsBanners.id, id));
    if (bannerRes.length === 0) throw new Error('Banner not found.');

    const newActive = !bannerRes[0].isActive;
    const [updated] = await db.update(cmsBanners)
      .set({ isActive: newActive, updatedAt: new Date() })
      .where(eq(cmsBanners.id, id))
      .returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: newActive ? 'ACTIVATE_BANNER' : 'DEACTIVATE_BANNER',
      targetType: 'BANNER',
      targetId: id.toString(),
      details: `Set banner #${id} active state to ${newActive}`,
      metadata: { isActive: newActive }
    });

    return updated;
  }

  async deleteBanner(id: number, actorId: number) {
    const bannerRes = await db.select().from(cmsBanners).where(eq(cmsBanners.id, id));
    if (bannerRes.length === 0) throw new Error('Banner not found.');

    await db.delete(cmsBanners).where(eq(cmsBanners.id, id));

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'DELETE_BANNER',
      targetType: 'BANNER',
      targetId: id.toString(),
      details: `Deleted banner #${id} (${bannerRes[0].title})`,
      metadata: { deletedBanner: bannerRes[0] }
    });

    return { success: true };
  }

  // ==========================================
  // ADMIN CONTENT BLOCKS
  // ==========================================

  async getAllContentBlocks() {
    return await db.select().from(cmsContentBlocks).orderBy(asc(cmsContentBlocks.sectionKey), asc(cmsContentBlocks.displayOrder));
  }

  async createContentBlock(data: {
    sectionKey: string;
    title: string;
    subtitle?: string | null;
    body?: string | null;
    mediaUrl?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    displayOrder?: number;
    status?: 'DRAFT' | 'PUBLISHED';
    isActive?: boolean;
  }, actorId: number) {
    if (!ALLOWED_SECTION_KEYS.includes(data.sectionKey as SectionKey)) {
      throw new Error(`Invalid sectionKey. Allowed: ${ALLOWED_SECTION_KEYS.join(', ')}`);
    }

    const title = sanitizeText(data.title, 150);
    if (!title) throw new Error('Block title is required.');

    const subtitle = data.subtitle ? sanitizeText(data.subtitle, 200) : null;
    const body = data.body ? sanitizeText(data.body, 3000) : null;
    const ctaUrl = data.ctaUrl ? sanitizeSafeUrl(data.ctaUrl) : null;
    const mediaUrl = data.mediaUrl ? sanitizeSafeUrl(data.mediaUrl) : null;
    const ctaLabel = data.ctaLabel ? sanitizeText(data.ctaLabel, 50) : null;
    const displayOrder = typeof data.displayOrder === 'number' ? data.displayOrder : 0;
    const status = data.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    const isActive = data.isActive !== undefined ? Boolean(data.isActive) : true;

    const [newBlock] = await db.insert(cmsContentBlocks).values({
      sectionKey: data.sectionKey,
      title,
      subtitle,
      body,
      mediaUrl,
      ctaLabel,
      ctaUrl,
      displayOrder,
      status,
      isActive
    }).returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'CREATE_BLOCK',
      targetType: 'CONTENT_BLOCK',
      targetId: newBlock.id.toString(),
      details: `Created content block [${newBlock.sectionKey}] "${newBlock.title}"`,
      metadata: { blockId: newBlock.id, sectionKey: newBlock.sectionKey, status: newBlock.status }
    });

    return newBlock;
  }

  async updateContentBlock(id: number, data: {
    sectionKey?: string;
    title?: string;
    subtitle?: string | null;
    body?: string | null;
    mediaUrl?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    displayOrder?: number;
    status?: 'DRAFT' | 'PUBLISHED';
    isActive?: boolean;
  }, actorId: number) {
    const blockRes = await db.select().from(cmsContentBlocks).where(eq(cmsContentBlocks.id, id));
    if (blockRes.length === 0) throw new Error('Content block not found.');

    const updateFields: any = { updatedAt: new Date() };

    if (data.sectionKey !== undefined) {
      if (!ALLOWED_SECTION_KEYS.includes(data.sectionKey as SectionKey)) {
        throw new Error(`Invalid sectionKey. Allowed: ${ALLOWED_SECTION_KEYS.join(', ')}`);
      }
      updateFields.sectionKey = data.sectionKey;
    }
    if (data.title !== undefined) updateFields.title = sanitizeText(data.title, 150);
    if (data.subtitle !== undefined) updateFields.subtitle = data.subtitle ? sanitizeText(data.subtitle, 200) : null;
    if (data.body !== undefined) updateFields.body = data.body ? sanitizeText(data.body, 3000) : null;
    if (data.mediaUrl !== undefined) updateFields.mediaUrl = data.mediaUrl ? sanitizeSafeUrl(data.mediaUrl) : null;
    if (data.ctaLabel !== undefined) updateFields.ctaLabel = data.ctaLabel ? sanitizeText(data.ctaLabel, 50) : null;
    if (data.ctaUrl !== undefined) updateFields.ctaUrl = data.ctaUrl ? sanitizeSafeUrl(data.ctaUrl) : null;
    if (data.displayOrder !== undefined) updateFields.displayOrder = Number(data.displayOrder) || 0;
    if (data.status !== undefined) {
      if (!['DRAFT', 'PUBLISHED'].includes(data.status)) throw new Error('Invalid status.');
      updateFields.status = data.status;
    }
    if (data.isActive !== undefined) updateFields.isActive = Boolean(data.isActive);

    const [updated] = await db.update(cmsContentBlocks).set(updateFields).where(eq(cmsContentBlocks.id, id)).returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'UPDATE_BLOCK',
      targetType: 'CONTENT_BLOCK',
      targetId: id.toString(),
      details: `Updated content block #${id} (${updated.title}) in [${updated.sectionKey}]`,
      metadata: { fieldsUpdated: Object.keys(data) }
    });

    return updated;
  }

  async setBlockPublishStatus(id: number, status: 'DRAFT' | 'PUBLISHED', actorId: number) {
    const blockRes = await db.select().from(cmsContentBlocks).where(eq(cmsContentBlocks.id, id));
    if (blockRes.length === 0) throw new Error('Content block not found.');

    const [updated] = await db.update(cmsContentBlocks)
      .set({ status, updatedAt: new Date() })
      .where(eq(cmsContentBlocks.id, id))
      .returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: status === 'PUBLISHED' ? 'PUBLISH_BLOCK' : 'UNPUBLISH_BLOCK',
      targetType: 'CONTENT_BLOCK',
      targetId: id.toString(),
      details: `${status === 'PUBLISHED' ? 'Published' : 'Unpublished'} block #${id} (${updated.title})`,
      metadata: { previousStatus: blockRes[0].status, newStatus: status }
    });

    return updated;
  }

  async toggleBlockActive(id: number, actorId: number) {
    const blockRes = await db.select().from(cmsContentBlocks).where(eq(cmsContentBlocks.id, id));
    if (blockRes.length === 0) throw new Error('Content block not found.');

    const newActive = !blockRes[0].isActive;
    const [updated] = await db.update(cmsContentBlocks)
      .set({ isActive: newActive, updatedAt: new Date() })
      .where(eq(cmsContentBlocks.id, id))
      .returning();

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: newActive ? 'ACTIVATE_BLOCK' : 'DEACTIVATE_BLOCK',
      targetType: 'CONTENT_BLOCK',
      targetId: id.toString(),
      details: `Set block #${id} active state to ${newActive}`,
      metadata: { isActive: newActive }
    });

    return updated;
  }

  async deleteBlock(id: number, actorId: number) {
    const blockRes = await db.select().from(cmsContentBlocks).where(eq(cmsContentBlocks.id, id));
    if (blockRes.length === 0) throw new Error('Content block not found.');

    await db.delete(cmsContentBlocks).where(eq(cmsContentBlocks.id, id));

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'DELETE_BLOCK',
      targetType: 'CONTENT_BLOCK',
      targetId: id.toString(),
      details: `Deleted content block #${id} (${blockRes[0].title})`,
      metadata: { deletedBlock: blockRes[0] }
    });

    return { success: true };
  }

  // ==========================================
  // ADMIN VISUAL SETTINGS
  // ==========================================

  async getAllVisualSettings() {
    const rows = await db.select().from(cmsVisualSettings);
    const settingsMap: Record<string, { value: string; category: string; isPublished: boolean }> = {};

    // Defaults
    for (const key of ALLOWED_SETTING_KEYS) {
      settingsMap[key] = {
        value: DEFAULT_VISUAL_SETTINGS[key].value,
        category: DEFAULT_VISUAL_SETTINGS[key].category,
        isPublished: true
      };
    }

    for (const row of rows) {
      if (ALLOWED_SETTING_KEYS.includes(row.key as SettingKey)) {
        settingsMap[row.key] = {
          value: row.value,
          category: row.category,
          isPublished: row.isPublished
        };
      }
    }

    return settingsMap;
  }

  async updateVisualSettings(settings: Record<string, string>, actorId: number) {
    const updatedKeys: string[] = [];

    for (const [key, rawVal] of Object.entries(settings)) {
      if (!ALLOWED_SETTING_KEYS.includes(key as SettingKey)) continue;

      let val = rawVal;
      if (key === 'accent_theme') {
        if (!ALLOWED_THEMES.includes(rawVal as AccentTheme)) {
          throw new Error(`Invalid accent theme. Allowed: ${ALLOWED_THEMES.join(', ')}`);
        }
      } else if (key === 'announcement_banner_url') {
        val = sanitizeSafeUrl(rawVal) || '/';
      } else if (key === 'announcement_banner_active') {
        val = rawVal === 'true' ? 'true' : 'false';
      } else {
        val = sanitizeText(rawVal, 300);
      }

      const category = DEFAULT_VISUAL_SETTINGS[key as SettingKey]?.category || 'GENERAL';

      // Upsert into cmsVisualSettings
      const existing = await db.select().from(cmsVisualSettings).where(eq(cmsVisualSettings.key, key));
      if (existing.length > 0) {
        await db.update(cmsVisualSettings)
          .set({ value: val, category, updatedAt: new Date() })
          .where(eq(cmsVisualSettings.key, key));
      } else {
        await db.insert(cmsVisualSettings).values({
          key,
          value: val,
          category,
          isPublished: true
        });
      }
      updatedKeys.push(key);
    }

    await this.recordAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'UPDATE_VISUAL_SETTINGS',
      targetType: 'VISUAL_SETTINGS',
      targetId: 'GLOBAL',
      details: `Updated visual settings keys: [${updatedKeys.join(', ')}]`,
      metadata: { updatedKeys }
    });

    return await this.getAllVisualSettings();
  }

  // ==========================================
  // CMS AUDIT LOGS
  // ==========================================

  async getCMSAuditLogs(limit: number = 100) {
    const logs = await db.select({
      log: cmsAuditLogs,
      actorEmail: users.email
    })
    .from(cmsAuditLogs)
    .leftJoin(users, eq(cmsAuditLogs.actorId, users.id))
    .orderBy(desc(cmsAuditLogs.createdAt))
    .limit(limit);

    return logs.map(l => ({
      ...l.log,
      actorEmail: l.actorEmail || 'System/Admin'
    }));
  }
}

export const cmsService = new CMSService();
