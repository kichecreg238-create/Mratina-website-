// Payment domain abstractions

export type PaymentState = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type PaymentProvider = 'M-PESA' | 'AIRTEL_MONEY';

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

export interface PaymentRefundResult {
  success: boolean;
  isConfigured: boolean;
  error?: string;
}

export interface PaymentProviderAdapter {
  initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult>;
  verify(providerReference: string): Promise<PaymentVerificationResult>;
  refund(providerReference: string, amount: number): Promise<PaymentRefundResult>;
}

// Concrete Adapters (Unconfigured for now, but respecting the boundary)

export class MpesaAdapter implements PaymentProviderAdapter {
  async initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    // We would use M-Pesa Daraja API STK Push here.
    return {
      success: false,
      isConfigured: false,
      error: "M-Pesa integration is currently unconfigured."
    };
  }

  async verify(providerReference: string): Promise<PaymentVerificationResult> {
    return {
      status: 'PENDING',
      error: "M-Pesa verification is currently unconfigured."
    };
  }

  async refund(providerReference: string, amount: number): Promise<PaymentRefundResult> {
    return {
      success: false,
      isConfigured: false,
      error: "M-Pesa refund is currently unconfigured."
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
    const adapter = this.adapters[provider];
    if (!adapter) throw new Error(`Provider ${provider} is not supported.`);
    return adapter;
  }

  async initiate(request: PaymentInitiationRequest): Promise<PaymentInitiationResult> {
    return this.getAdapter(request.provider).initiate(request);
  }

  async verify(provider: PaymentProvider, providerReference: string): Promise<PaymentVerificationResult> {
    return this.getAdapter(provider).verify(providerReference);
  }

  async refund(provider: PaymentProvider, providerReference: string, amount: number): Promise<PaymentRefundResult> {
    return this.getAdapter(provider).refund(providerReference, amount);
  }
}

export const paymentService = new PaymentService();
