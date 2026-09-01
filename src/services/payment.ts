// Payment domain abstractions

export type PaymentState = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type PaymentProvider = 'M-PESA' | 'AIRTEL_MONEY';

export const VALID_PROVIDERS: PaymentProvider[] = ['M-PESA', 'AIRTEL_MONEY'];

export function isValidProvider(provider: string): provider is PaymentProvider {
  return VALID_PROVIDERS.includes(provider as PaymentProvider);
}

export function isValidPaymentTransition(from: PaymentState, to: PaymentState): boolean {
  if (from === to) return false;
  switch (from) {
    case 'INITIATED': return ['PENDING', 'FAILED', 'CANCELLED'].includes(to);
    case 'PENDING': return ['SUCCESS', 'FAILED', 'CANCELLED'].includes(to);
    case 'SUCCESS': return ['REFUNDED'].includes(to);
    case 'FAILED': return false;
    case 'CANCELLED': return false;
    case 'REFUNDED': return false;
    default: return false;
  }
}

export interface PaymentInitiationRequest {
  orderId: number;
  amount: number;
  phoneNumber: string;
  provider: PaymentProvider;
}

export interface PaymentInitiationResult {
  success: boolean;
  providerReference?: string;
  isConfigured: boolean;
  error?: string;
}

export interface PaymentVerificationResult {
  status: PaymentState;
  providerReference?: string;
  error?: string;
}

export interface PaymentWebhookVerificationResult {
  success: boolean;
  isConfigured: boolean;
  orderId?: number;
  status?: PaymentState;
  providerReference?: string;
  error?: string;
}

export interface PaymentRefundResult {
  success: boolean;
  isConfigured: boolean;
  error?: string;
}

export interface PaymentProviderAdapter {
  initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult>;
  verify(providerReference: string): Promise<PaymentVerificationResult>;
  verifyWebhook(payload: any, headers: any): Promise<PaymentWebhookVerificationResult>;
  refund(providerReference: string, amount: number): Promise<PaymentRefundResult>;
}

import { paymentConfigService } from './paymentConfigService.ts';

// Concrete Adapters (Authoritative & Runtime-Configured)

export class MpesaAdapter implements PaymentProviderAdapter {
  private formatPhoneNumber(phone: string): string {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '254' + clean.slice(1);
    } else if (clean.startsWith('+254')) {
      clean = clean.slice(1);
    } else if (!clean.startsWith('254') && (clean.startsWith('7') || clean.startsWith('1'))) {
      clean = '254' + clean;
    }
    return clean;
  }

  private getTimestamp(): string {
    const date = new Date();
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
  }

  private async getAccessToken(consumerKey: string, consumerSecret: string, environment: 'SANDBOX' | 'PRODUCTION'): Promise<string | null> {
    const authUrl = environment === 'PRODUCTION'
      ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
      : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

    const basicAuth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const response = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) return null;
    const data: any = await response.json();
    return data.access_token || null;
  }

  async initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    const secrets = await paymentConfigService.getAuthoritativeMpesaSecrets();

    if (!secrets.isConfigured || !secrets.consumerKey || !secrets.consumerSecret || !secrets.shortcode) {
      return {
        success: false,
        isConfigured: false,
        error: "M-Pesa payment gateway is unconfigured. Please configure M-Pesa credentials in the Admin Portal."
      };
    }

    const formattedPhone = this.formatPhoneNumber(request.phoneNumber);
    if (formattedPhone.length !== 12 || !formattedPhone.startsWith('254')) {
      return {
        success: false,
        isConfigured: true,
        error: "Invalid phone number format. Please provide a valid Kenyan mobile number (e.g. 0712345678 or 254712345678)."
      };
    }

    try {
      const accessToken = await this.getAccessToken(secrets.consumerKey, secrets.consumerSecret, secrets.environment);
      if (!accessToken) {
        return {
          success: false,
          isConfigured: true,
          error: "Failed to authenticate with Safaricom Daraja gateway. Check Consumer Key and Consumer Secret in Admin Portal."
        };
      }

      const timestamp = this.getTimestamp();
      const passkey = secrets.passkey || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'; // Fallback to standard Daraja sandbox passkey if empty
      const password = Buffer.from(`${secrets.shortcode}${passkey}${timestamp}`).toString('base64');

      const stkUrl = secrets.environment === 'PRODUCTION'
        ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
        : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

      const callbackUrl = secrets.callbackUrl || (process.env.APP_URL ? `${process.env.APP_URL}/api/webhooks/payment/M-PESA` : 'https://example.com/api/webhooks/payment/M-PESA');

      const payload = {
        BusinessShortCode: secrets.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.max(1, Math.round(request.amount)),
        PartyA: formattedPhone,
        PartyB: secrets.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: `MRATINA-${request.orderId}`,
        TransactionDesc: `Mratina Cellar Order #${request.orderId}`
      };

      const stkRes = await fetch(stkUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const stkData: any = await stkRes.json().catch(() => ({}));

      if (stkRes.ok && (stkData.ResponseCode === '0' || stkData.ResponseCode === 0)) {
        return {
          success: true,
          isConfigured: true,
          providerReference: stkData.CheckoutRequestID || stkData.MerchantRequestID || `MPESA-${request.orderId}-${Date.now()}`
        };
      } else {
        const errorMsg = stkData.errorMessage || stkData.CustomerMessage || stkData.ResponseDescription || "Daraja STK push dispatch rejected";
        return {
          success: false,
          isConfigured: true,
          error: `M-Pesa STK Push error: ${errorMsg}`
        };
      }
    } catch (err: any) {
      console.error('[M-Pesa] STK push execution error:', err);
      return {
        success: false,
        isConfigured: true,
        error: `M-Pesa dispatch error: ${err.message || 'Network failure connecting to gateway'}`
      };
    }
  }

  async verify(providerReference: string): Promise<PaymentVerificationResult> {
    const secrets = await paymentConfigService.getAuthoritativeMpesaSecrets();
    if (!secrets.isConfigured) {
      return {
        status: 'PENDING',
        error: "M-Pesa verification unconfigured."
      };
    }

    return {
      status: 'PENDING',
      providerReference
    };
  }
  
  async verifyWebhook(payload: any, headers: any): Promise<PaymentWebhookVerificationResult> {
    const secrets = await paymentConfigService.getAuthoritativeMpesaSecrets();
    if (!secrets.isConfigured) {
      return {
        success: false,
        isConfigured: false,
        error: "M-Pesa is not configured."
      };
    }

    try {
      // Safaricom Daraja STK Callback Parser
      const stkCallback = payload?.Body?.stkCallback;
      if (!stkCallback) {
        return {
          success: false,
          isConfigured: true,
          error: "Invalid Daraja callback structure."
        };
      }

      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;

      let receiptNumber: string | undefined = undefined;
      let amount: number | undefined = undefined;

      const items = stkCallback.CallbackMetadata?.Item;
      if (Array.isArray(items)) {
        for (const it of items) {
          if (it.Name === 'MpesaReceiptNumber') receiptNumber = String(it.Value);
          if (it.Name === 'Amount') amount = Number(it.Value);
        }
      }

      const isSuccess = Number(resultCode) === 0;
      const paymentState: PaymentState = isSuccess ? 'SUCCESS' : 'FAILED';

      return {
        success: true,
        isConfigured: true,
        status: paymentState,
        providerReference: receiptNumber || checkoutRequestId,
        error: isSuccess ? undefined : resultDesc
      };
    } catch (err: any) {
      return {
        success: false,
        isConfigured: true,
        error: `Webhook parsing error: ${err.message}`
      };
    }
  }

  async refund(providerReference: string, amount: number): Promise<PaymentRefundResult> {
    return {
      success: false,
      isConfigured: false,
      error: "Automated M-Pesa refund API requires B2C credentials. Handled via admin manual disbursement."
    };
  }
}

export class AirtelMoneyAdapter implements PaymentProviderAdapter {
  async initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    return {
      success: false,
      isConfigured: false,
      error: "Airtel Money integration is currently unconfigured."
    };
  }

  async verify(providerReference: string): Promise<PaymentVerificationResult> {
    return {
      status: 'PENDING',
      error: "Airtel Money verification is currently unconfigured."
    };
  }
  
  async verifyWebhook(payload: any, headers: any): Promise<PaymentWebhookVerificationResult> {
    return {
      success: false,
      isConfigured: false,
      error: "Airtel Money webhook verification is currently unconfigured."
    };
  }

  async refund(providerReference: string, amount: number): Promise<PaymentRefundResult> {
    return {
      success: false,
      isConfigured: false,
      error: "Airtel Money refund is currently unconfigured."
    };
  }
}

// PaymentService Orchestrator

export class PaymentService {
  private adapters: Record<PaymentProvider, PaymentProviderAdapter>;

  constructor() {
    this.adapters = {
      'M-PESA': new MpesaAdapter(),
      'AIRTEL_MONEY': new AirtelMoneyAdapter()
    };
  }

  private getAdapter(provider: PaymentProvider): PaymentProviderAdapter {
    if (!isValidProvider(provider)) throw new Error(`Provider ${provider} is not supported.`);
    return this.adapters[provider];
  }

  async initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    return this.getAdapter(request.provider).initiate(request);
  }

  async verify(provider: PaymentProvider, providerReference: string): Promise<PaymentVerificationResult> {
    return this.getAdapter(provider).verify(providerReference);
  }
  
  async verifyWebhook(provider: PaymentProvider, payload: any, headers: any): Promise<PaymentWebhookVerificationResult> {
    return this.getAdapter(provider).verifyWebhook(payload, headers);
  }

  async refund(provider: PaymentProvider, providerReference: string, amount: number): Promise<PaymentRefundResult> {
    return this.getAdapter(provider).refund(providerReference, amount);
  }
}

export const paymentService = new PaymentService();
