import { db } from '../db/index.ts';
import { paymentConfigurations, paymentConfigAuditLogs, users } from '../db/schema.ts';
import { eq, desc } from 'drizzle-orm';

export interface PublicMpesaConfig {
  isConfigured: boolean;
  source: 'DATABASE' | 'ENVIRONMENT' | 'NOT_CONFIGURED';
  environment: 'SANDBOX' | 'PRODUCTION';
  shortcode: string;
  callbackUrl: string;
  consumerKeyMasked: string | null;
  consumerSecretMasked: string | null;
  passkeyMasked: string | null;
  hasConsumerKey: boolean;
  hasConsumerSecret: boolean;
  hasPasskey: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

export interface AuthoritativeMpesaSecrets {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  callbackUrl: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  isConfigured: boolean;
  source: 'DATABASE' | 'ENVIRONMENT' | 'NOT_CONFIGURED';
}

export interface SaveMpesaConfigInput {
  consumerKey?: string;
  consumerSecret?: string;
  passkey?: string;
  shortcode?: string;
  callbackUrl?: string;
  environment?: 'SANDBOX' | 'PRODUCTION';
  actorId: number;
  actorRole: string;
}

export class PaymentConfigService {
  private initialized = false;

  private maskSecret(val: string | null | undefined, isKey = false): string | null {
    if (!val || typeof val !== 'string' || val.trim() === '') return null;
    const clean = val.trim();
    if (isKey) {
      if (clean.length <= 4) return '••••••••';
      const lastChars = clean.slice(-4);
      return `••••••••••••${lastChars}`;
    }
    // High-security secrets (consumerSecret, passkey) NEVER expose trailing characters
    return '••••••••••••••••';
  }

  public async ensureTablesExist() {
    if (this.initialized) return;
    try {
      // Automatic safety table creation
      await db.execute(`
        CREATE TABLE IF NOT EXISTS payment_configurations (
          id SERIAL PRIMARY KEY,
          provider TEXT NOT NULL UNIQUE,
          consumer_key TEXT,
          consumer_secret TEXT,
          passkey TEXT,
          shortcode TEXT,
          callback_url TEXT,
          environment TEXT NOT NULL DEFAULT 'SANDBOX',
          is_active BOOLEAN NOT NULL DEFAULT true,
          updated_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS payment_config_audit_logs (
          id SERIAL PRIMARY KEY,
          provider TEXT NOT NULL,
          actor_id INTEGER REFERENCES users(id),
          actor_role TEXT NOT NULL DEFAULT 'ADMIN',
          action TEXT NOT NULL,
          fields_modified JSONB,
          environment TEXT,
          details TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      this.initialized = true;
    } catch (err) {
      console.warn('[PaymentConfig] Note on table ensure:', err);
    }
  }

  /**
   * Safe public representation for Admin UI - NEVER contains raw secrets.
   */
  async getPublicMpesaConfig(): Promise<PublicMpesaConfig> {
    await this.ensureTablesExist();

    try {
      const records = await db.select().from(paymentConfigurations).where(eq(paymentConfigurations.provider, 'M-PESA'));
      const dbConfig = records[0];

      if (dbConfig && dbConfig.isActive) {
        let updaterEmail: string | null = null;
        if (dbConfig.updatedBy) {
          const userRes = await db.select({ email: users.email }).from(users).where(eq(users.id, dbConfig.updatedBy));
          if (userRes[0]) updaterEmail = userRes[0].email;
        }

        const hasKey = Boolean(dbConfig.consumerKey && dbConfig.consumerKey.trim());
        const hasSecret = Boolean(dbConfig.consumerSecret && dbConfig.consumerSecret.trim());
        const hasPass = Boolean(dbConfig.passkey && dbConfig.passkey.trim());
        const hasShortcode = Boolean(dbConfig.shortcode && dbConfig.shortcode.trim());

        return {
          isConfigured: hasKey && hasSecret && hasShortcode,
          source: 'DATABASE',
          environment: (dbConfig.environment as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
          shortcode: dbConfig.shortcode || '',
          callbackUrl: dbConfig.callbackUrl || (process.env.APP_URL ? `${process.env.APP_URL}/api/webhooks/payment/M-PESA` : '/api/webhooks/payment/M-PESA'),
          consumerKeyMasked: this.maskSecret(dbConfig.consumerKey, true),
          consumerSecretMasked: this.maskSecret(dbConfig.consumerSecret, false),
          passkeyMasked: this.maskSecret(dbConfig.passkey, false),
          hasConsumerKey: hasKey,
          hasConsumerSecret: hasSecret,
          hasPasskey: hasPass,
          updatedAt: dbConfig.updatedAt ? dbConfig.updatedAt.toISOString() : null,
          updatedByEmail: updaterEmail
        };
      }
    } catch (e) {
      console.warn('[PaymentConfig] Could not read database config, falling back to ENV:', e);
    }

    // Fallback to environment variables
    const envKey = process.env.MPESA_CONSUMER_KEY;
    const envSecret = process.env.MPESA_CONSUMER_SECRET;
    const envPass = process.env.MPESA_PASSKEY;
    const envShortcode = process.env.MPESA_SHORTCODE;
    const envCallback = process.env.MPESA_CALLBACK_URL || (process.env.APP_URL ? `${process.env.APP_URL}/api/webhooks/payment/M-PESA` : '/api/webhooks/payment/M-PESA');

    const hasKey = Boolean(envKey && envKey.trim());
    const hasSecret = Boolean(envSecret && envSecret.trim());
    const hasShort = Boolean(envShortcode && envShortcode.trim());

    const isEnvConfigured = hasKey && hasSecret && hasShort;

    return {
      isConfigured: isEnvConfigured,
      source: isEnvConfigured ? 'ENVIRONMENT' : 'NOT_CONFIGURED',
      environment: 'SANDBOX',
      shortcode: envShortcode || '',
      callbackUrl: envCallback,
      consumerKeyMasked: this.maskSecret(envKey, true),
      consumerSecretMasked: this.maskSecret(envSecret, false),
      passkeyMasked: this.maskSecret(envPass, false),
      hasConsumerKey: hasKey,
      hasConsumerSecret: hasSecret,
      hasPasskey: Boolean(envPass && envPass.trim()),
      updatedAt: null,
      updatedByEmail: isEnvConfigured ? 'System (Environment Bootstrap)' : null
    };
  }

  /**
   * Internal Authoritative Method - Used ONLY by server-side MpesaAdapter during payment processing.
   * Priority: Database Runtime Config > Environment Variables.
   */
  async getAuthoritativeMpesaSecrets(): Promise<AuthoritativeMpesaSecrets> {
    await this.ensureTablesExist();

    try {
      const records = await db.select().from(paymentConfigurations).where(eq(paymentConfigurations.provider, 'M-PESA'));
      const dbConfig = records[0];

      if (dbConfig && dbConfig.isActive) {
        const cKey = (dbConfig.consumerKey || '').trim();
        const cSec = (dbConfig.consumerSecret || '').trim();
        const pass = (dbConfig.passkey || '').trim();
        const short = (dbConfig.shortcode || '').trim();
        const callback = (dbConfig.callbackUrl || '').trim() || (process.env.APP_URL ? `${process.env.APP_URL}/api/webhooks/payment/M-PESA` : '');

        if (cKey && cSec) {
          return {
            consumerKey: cKey,
            consumerSecret: cSec,
            passkey: pass,
            shortcode: short,
            callbackUrl: callback,
            environment: (dbConfig.environment as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
            isConfigured: Boolean(cKey && cSec && short),
            source: 'DATABASE'
          };
        }
      }
    } catch (e) {
      console.warn('[PaymentConfig] DB lookup error in getAuthoritativeSecrets:', e);
    }

    // Fallback to process.env
    const envKey = (process.env.MPESA_CONSUMER_KEY || '').trim();
    const envSecret = (process.env.MPESA_CONSUMER_SECRET || '').trim();
    const envPass = (process.env.MPESA_PASSKEY || '').trim();
    const envShort = (process.env.MPESA_SHORTCODE || '').trim();
    const envCallback = (process.env.MPESA_CALLBACK_URL || '').trim() || (process.env.APP_URL ? `${process.env.APP_URL}/api/webhooks/payment/M-PESA` : '');

    return {
      consumerKey: envKey,
      consumerSecret: envSecret,
      passkey: envPass,
      shortcode: envShort,
      callbackUrl: envCallback,
      environment: 'SANDBOX',
      isConfigured: Boolean(envKey && envSecret && envShort),
      source: (envKey && envSecret) ? 'ENVIRONMENT' : 'NOT_CONFIGURED'
    };
  }

  /**
   * Save or Update M-Pesa Configuration from Admin Portal
   */
  async saveMpesaConfig(input: SaveMpesaConfigInput) {
    await this.ensureTablesExist();

    const existingList = await db.select().from(paymentConfigurations).where(eq(paymentConfigurations.provider, 'M-PESA'));
    const existing = existingList[0];

    const fieldsModified: string[] = [];

    // Helper to determine whether a secret is updated or preserved
    const resolveSecret = (incoming: string | undefined, currentStored: string | null | undefined, fieldName: string): string | null => {
      if (incoming === undefined || incoming === null) {
        return currentStored || null;
      }
      const trimmed = incoming.trim();
      // If client sent empty string, bullet characters (masked text), or asterisk placeholders, retain current stored
      if (trimmed === '' || trimmed.includes('•') || trimmed.startsWith('***') || trimmed.startsWith('••••')) {
        return currentStored || null;
      }
      fieldsModified.push(fieldName);
      return trimmed;
    };

    const finalConsumerKey = resolveSecret(input.consumerKey, existing?.consumerKey, 'consumerKey');
    const finalConsumerSecret = resolveSecret(input.consumerSecret, existing?.consumerSecret, 'consumerSecret');
    const finalPasskey = resolveSecret(input.passkey, existing?.passkey, 'passkey');

    let finalShortcode = existing?.shortcode || null;
    if (input.shortcode !== undefined && input.shortcode !== null) {
      const cleanShort = input.shortcode.trim();
      if (cleanShort !== '' && cleanShort !== (existing?.shortcode || '')) {
        finalShortcode = cleanShort;
        fieldsModified.push('shortcode');
      }
    }

    let finalCallbackUrl = existing?.callbackUrl || null;
    if (input.callbackUrl !== undefined && input.callbackUrl !== null) {
      const cleanUrl = input.callbackUrl.trim();
      if (cleanUrl !== '' && cleanUrl !== (existing?.callbackUrl || '')) {
        finalCallbackUrl = cleanUrl;
        fieldsModified.push('callbackUrl');
      }
    }

    let finalEnvironment = existing?.environment || 'SANDBOX';
    if (input.environment && input.environment !== existing?.environment) {
      finalEnvironment = input.environment;
      fieldsModified.push('environment');
    }

    const action = existing ? 'M_PESA_CONFIGURATION_UPDATED' : 'M_PESA_CONFIGURATION_CREATED';

    if (existing) {
      await db.update(paymentConfigurations)
        .set({
          consumerKey: finalConsumerKey,
          consumerSecret: finalConsumerSecret,
          passkey: finalPasskey,
          shortcode: finalShortcode,
          callbackUrl: finalCallbackUrl,
          environment: finalEnvironment,
          updatedBy: input.actorId,
          updatedAt: new Date(),
          isActive: true
        })
        .where(eq(paymentConfigurations.id, existing.id));
    } else {
      await db.insert(paymentConfigurations).values({
        provider: 'M-PESA',
        consumerKey: finalConsumerKey,
        consumerSecret: finalConsumerSecret,
        passkey: finalPasskey,
        shortcode: finalShortcode,
        callbackUrl: finalCallbackUrl,
        environment: finalEnvironment,
        updatedBy: input.actorId,
        isActive: true
      });
    }

    // Record Immutable Audit Log (WITHOUT RAW SECRETS)
    await db.insert(paymentConfigAuditLogs).values({
      provider: 'M-PESA',
      actorId: input.actorId,
      actorRole: input.actorRole || 'ADMIN',
      action: action,
      fieldsModified: fieldsModified,
      environment: finalEnvironment,
      details: `M-Pesa payment configuration updated by Admin #${input.actorId}. Fields modified: [${fieldsModified.join(', ')}]`
    });

    return {
      success: true,
      action,
      fieldsModified,
      message: existing ? 'M-Pesa configuration updated successfully.' : 'M-Pesa configuration saved successfully.'
    };
  }

  /**
   * Record security gate unlock by authenticated admin
   */
  async recordGateUnlock(actorId: number, actorRole: string) {
    await this.ensureTablesExist();
    try {
      await db.insert(paymentConfigAuditLogs).values({
        provider: 'M-PESA',
        actorId,
        actorRole: actorRole || 'ADMIN',
        action: 'M_PESA_GATE_UNLOCKED',
        fieldsModified: [],
        details: `Admin #${actorId} authenticated and unlocked M-Pesa runtime payment credentials panel.`
      });
    } catch (e) {
      console.warn('[PaymentConfig] Could not record gate unlock log:', e);
    }
  }

  /**
   * Diagnostic Test for Safaricom Daraja Authentication
   */
  async testMpesaConnectivity(actorId: number, actorRole: string, overrideParams?: { consumerKey?: string; consumerSecret?: string; environment?: 'SANDBOX' | 'PRODUCTION' }) {
    await this.ensureTablesExist();

    const authSecrets = await this.getAuthoritativeMpesaSecrets();

    const isMaskedOrEmpty = (v: string | undefined | null) => !v || v.trim() === '' || v.includes('•') || v.startsWith('***');

    const consumerKey = (overrideParams?.consumerKey && !isMaskedOrEmpty(overrideParams.consumerKey))
      ? overrideParams.consumerKey.trim()
      : authSecrets.consumerKey;

    const consumerSecret = (overrideParams?.consumerSecret && !isMaskedOrEmpty(overrideParams.consumerSecret))
      ? overrideParams.consumerSecret.trim()
      : authSecrets.consumerSecret;

    const environment = overrideParams?.environment || authSecrets.environment || 'SANDBOX';

    if (!consumerKey || !consumerSecret) {
      return {
        success: false,
        message: 'Cannot test connection: Consumer Key and Consumer Secret are required.',
        details: 'Missing credentials.'
      };
    }

    const authUrl = environment === 'PRODUCTION'
      ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
      : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

    try {
      const basicAuth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
      const startTime = Date.now();

      const response = await fetch(authUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Accept': 'application/json'
        }
      });

      const responseTime = Date.now() - startTime;
      const data: any = await response.json().catch(() => ({}));

      if (response.ok && data.access_token) {
        // Record test audit log (NEVER store access_token in logs)
        await db.insert(paymentConfigAuditLogs).values({
          provider: 'M-PESA',
          actorId,
          actorRole,
          action: 'M_PESA_CONFIGURATION_TESTED',
          fieldsModified: [],
          environment,
          details: `Daraja OAuth test connection SUCCESSFUL (${responseTime}ms). Environment: ${environment}. Token validity: ${data.expires_in || 3599}s.`
        });

        return {
          success: true,
          message: `Connection successful. Successfully authenticated with Safaricom Daraja (${environment}).`,
          environment,
          responseTimeMs: responseTime,
          tokenValiditySeconds: data.expires_in || 3599
        };
      } else {
        const errorDetail = data.errorMessage || data.error_description || data.error || `HTTP Status ${response.status}`;
        
        await db.insert(paymentConfigAuditLogs).values({
          provider: 'M-PESA',
          actorId,
          actorRole,
          action: 'M_PESA_CONFIGURATION_TESTED',
          fieldsModified: [],
          environment,
          details: `Daraja OAuth test connection FAILED. Environment: ${environment}. Reason: ${errorDetail}`
        });

        return {
          success: false,
          message: `Daraja authentication failed: ${errorDetail}`,
          environment,
          status: response.status
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Network failure connecting to Safaricom Daraja endpoint: ${err.message || 'Unknown network error'}`,
        environment
      };
    }
  }

  /**
   * Retrieve audit logs for M-Pesa configuration changes
   */
  async getAuditLogs(limit = 20) {
    await this.ensureTablesExist();

    try {
      const logs = await db.select({
        id: paymentConfigAuditLogs.id,
        provider: paymentConfigAuditLogs.provider,
        actorId: paymentConfigAuditLogs.actorId,
        actorRole: paymentConfigAuditLogs.actorRole,
        action: paymentConfigAuditLogs.action,
        fieldsModified: paymentConfigAuditLogs.fieldsModified,
        environment: paymentConfigAuditLogs.environment,
        details: paymentConfigAuditLogs.details,
        createdAt: paymentConfigAuditLogs.createdAt,
        actorEmail: users.email
      })
      .from(paymentConfigAuditLogs)
      .leftJoin(users, eq(paymentConfigAuditLogs.actorId, users.id))
      .orderBy(desc(paymentConfigAuditLogs.createdAt))
      .limit(limit);

      return logs;
    } catch (e) {
      console.warn('[PaymentConfig] Audit log fetch error:', e);
      return [];
    }
  }
}

export const paymentConfigService = new PaymentConfigService();
