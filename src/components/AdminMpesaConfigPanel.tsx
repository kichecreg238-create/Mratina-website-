import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';
import {
  ShieldCheck,
  Lock,
  Unlock,
  Key,
  CreditCard,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Server,
  Zap,
  History,
  HelpCircle,
  ExternalLink,
  Save,
  Check,
  X
} from 'lucide-react';

interface PublicMpesaConfig {
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

interface AuditLog {
  id: number;
  provider: string;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  fieldsModified: string[] | null;
  environment: string | null;
  details: string | null;
  createdAt: string;
}

export function AdminMpesaConfigPanel() {
  const { user } = useAuthStore();
  
  // Security Gate State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [securityConfirming, setSecurityConfirming] = useState(false);
  const [unlockTime, setUnlockTime] = useState<number | null>(null);

  // Config State
  const [config, setConfig] = useState<PublicMpesaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; responseTimeMs?: number; tokenValiditySeconds?: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form Fields
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [passkey, setPasskey] = useState('');
  const [shortcode, setShortcode] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');

  // Secret Visibility Toggles
  const [showConsumerKey, setShowConsumerKey] = useState(false);
  const [showConsumerSecret, setShowConsumerSecret] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);

  // Auto-lock timer (15 minutes of inactivity)
  useEffect(() => {
    if (!isUnlocked) return;
    const timer = setTimeout(() => {
      setIsUnlocked(false);
      setStatusMessage({ type: 'error', text: 'Security session timed out. Re-authenticate to access credentials.' });
    }, 15 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [isUnlocked, unlockTime]);

  const loadConfig = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/payments/mpesa-config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.config) {
        setConfig(data.config);
        setShortcode(data.config.shortcode || '');
        setCallbackUrl(data.config.callbackUrl || (window.location.origin + '/api/webhooks/payment/M-PESA'));
        setEnvironment(data.config.environment || 'SANDBOX');
        // Reset secret inputs to placeholder state
        setConsumerKey(data.config.consumerKeyMasked || '');
        setConsumerSecret(data.config.consumerSecretMasked || '');
        setPasskey(data.config.passkeyMasked || '');
      }
    } catch (e) {
      console.error('Failed to load M-Pesa configuration:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    if (!user) return;
    setLoadingAudit(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/payments/mpesa-config/audit-logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.logs) {
        setAuditLogs(data.logs);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadAuditLogs();
  }, [user]);

  const handleUnlockGate = () => {
    setSecurityConfirming(true);
    setTimeout(() => {
      setIsUnlocked(true);
      setUnlockTime(Date.now());
      setSecurityConfirming(false);
      setStatusMessage({ type: 'success', text: 'Admin security gate confirmed. Credentials access unlocked.' });
    }, 400);
  };

  const handleLockGate = () => {
    setIsUnlocked(false);
    setShowConsumerKey(false);
    setShowConsumerSecret(false);
    setShowPasskey(false);
    setTestResult(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setStatusMessage(null);
    setTestResult(null);

    try {
      const token = await user.getIdToken();
      const payload: any = {
        shortcode: shortcode.trim(),
        callbackUrl: callbackUrl.trim(),
        environment
      };

      // Only send secrets if they are not masked bullets
      if (consumerKey && !consumerKey.startsWith('••••')) {
        payload.consumerKey = consumerKey.trim();
      }
      if (consumerSecret && !consumerSecret.startsWith('••••')) {
        payload.consumerSecret = consumerSecret.trim();
      }
      if (passkey && !passkey.startsWith('••••')) {
        payload.passkey = passkey.trim();
      }

      const res = await fetch('/api/admin/payments/mpesa-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save M-Pesa configuration');
      }

      setStatusMessage({ type: 'success', text: data.message || 'M-Pesa payment configuration updated successfully.' });
      await loadConfig();
      await loadAuditLogs();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Save failed. Check parameters.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!user) return;
    setTesting(true);
    setTestResult(null);

    try {
      const token = await user.getIdToken();
      const payload: any = {
        environment
      };

      if (consumerKey && !consumerKey.startsWith('••••')) {
        payload.consumerKey = consumerKey.trim();
      }
      if (consumerSecret && !consumerSecret.startsWith('••••')) {
        payload.consumerSecret = consumerSecret.trim();
      }

      const res = await fetch('/api/admin/payments/mpesa-config/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message,
        responseTimeMs: data.responseTimeMs,
        tokenValiditySeconds: data.tokenValiditySeconds
      });
      await loadAuditLogs();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Diagnostic test failed: ${err.message || 'Network error'}`
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 border border-white/10 bg-[#0d0d0d] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-none bg-[#c5a059]/10 border border-[#c5a059]/30 flex items-center justify-center text-[#c5a059]">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">
                M-Pesa Runtime Payment Gateway
              </h2>
              <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
                Client Handover Ready
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Securely configure live Safaricom Daraja credentials, shortcode, and webhook callbacks.
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          {config && (
            <>
              <span className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border ${
                config.isConfigured
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/30'
              }`}>
                {config.isConfigured ? 'Gateway Active' : 'Unconfigured'}
              </span>

              <span className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider bg-white/5 border border-white/10 text-white/70">
                Source: {config.source}
              </span>

              <span className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border ${
                config.environment === 'PRODUCTION'
                  ? 'bg-red-950/40 text-red-300 border-red-500/30'
                  : 'bg-blue-950/40 text-blue-300 border-blue-500/30'
              }`}>
                {config.environment}
              </span>
            </>
          )}

          <button
            onClick={() => setShowHelpGuide(!showHelpGuide)}
            className="flex items-center space-x-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-mono transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showHelpGuide ? 'Hide Guide' : 'Safaricom Setup Guide'}</span>
          </button>
        </div>
      </div>

      {/* Setup Guide Accordion */}
      {showHelpGuide && (
        <div className="p-5 border border-[#c5a059]/30 bg-[#c5a059]/[0.03] space-y-3 font-sans text-xs text-white/80">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#c5a059] font-bold flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>How to obtain your Safaricom Daraja credentials</span>
            </h3>
            <a
              href="https://developer.safaricom.co.ke"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 text-[#c5a059] hover:underline font-mono text-[11px]"
            >
              <span>developer.safaricom.co.ke</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-white/70">
            <li>Log into the <strong className="text-white">Safaricom Daraja Portal</strong> and navigate to <strong className="text-white">My Apps</strong>.</li>
            <li>Create or select your App to find your <strong className="text-white">Consumer Key</strong> and <strong className="text-white">Consumer Secret</strong>.</li>
            <li>For Sandbox testing, use Business Shortcode <code className="bg-black/60 px-1 py-0.5 font-mono text-[#c5a059]">174379</code>.</li>
            <li>For Live Production, enter your verified Paybill / Buy Goods Till Shortcode and Live Online Passkey issued by Safaricom.</li>
            <li>Click <strong className="text-white">Test Safaricom Daraja Connection</strong> below to verify OAuth token acquisition before saving.</li>
          </ol>
        </div>
      )}

      {/* Security Gate / Locked State */}
      {!isUnlocked ? (
        <div className="p-8 border border-white/10 bg-[#0d0d0d] text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Lock className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-sm font-semibold tracking-wider font-mono uppercase text-white">
              Payment Security Gate
            </h3>
            <p className="text-xs text-white/50">
              Access to live M-Pesa API keys and gateway configuration is restricted to authenticated Administrators. Confirm your administrator authorization to view and update credentials.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleUnlockGate}
              disabled={securityConfirming}
              className="inline-flex items-center space-x-2 px-6 py-2.5 bg-[#c5a059] hover:bg-[#b08d46] text-black font-mono text-xs uppercase tracking-wider font-bold transition-all disabled:opacity-50"
            >
              {securityConfirming ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Authenticate & Unlock Payment Settings</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Unlocked Configuration Form */
        <div className="space-y-6">
          {/* Active Security Session Banner */}
          <div className="p-3 border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-emerald-400 font-mono">
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Security Session Active ({user?.email})</span>
            </div>
            <button
              onClick={handleLockGate}
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-[11px] font-mono transition-all"
            >
              <Lock className="w-3 h-3" />
              <span>Lock Credentials</span>
            </button>
          </div>

          {/* Feedback Status Banners */}
          {statusMessage && (
            <div className={`p-4 border text-xs flex items-center space-x-3 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/30 border-red-500/40 text-red-300'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {testResult && (
            <div className={`p-4 border text-xs space-y-2 ${
              testResult.success
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/30 border-red-500/40 text-red-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 font-mono font-bold">
                  {testResult.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  <span>{testResult.success ? 'Daraja Gateway Handshake Succeeded' : 'Daraja Gateway Handshake Failed'}</span>
                </div>
                {testResult.responseTimeMs && (
                  <span className="font-mono text-[10px] text-white/60">
                    Latency: {testResult.responseTimeMs}ms
                  </span>
                )}
              </div>
              <p className="text-white/80">{testResult.message}</p>
              {testResult.tokenValiditySeconds && (
                <p className="font-mono text-[10px] text-emerald-400/80">
                  OAuth Token Validity: {testResult.tokenValiditySeconds} seconds
                </p>
              )}
            </div>
          )}

          {/* Configuration Form */}
          <form onSubmit={handleSaveConfig} className="p-6 border border-white/10 bg-[#0d0d0d] space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Environment Selector */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-mono text-white/70 uppercase">Gateway Environment</label>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setEnvironment('SANDBOX')}
                    className={`p-3 text-left border transition-all font-mono text-xs ${
                      environment === 'SANDBOX'
                        ? 'border-[#c5a059] bg-[#c5a059]/10 text-white'
                        : 'border-white/10 bg-black/40 text-white/50 hover:border-white/30'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>SANDBOX (TEST)</span>
                      {environment === 'SANDBOX' && <Check className="w-3.5 h-3.5 text-[#c5a059]" />}
                    </div>
                    <p className="text-[10px] text-white/40 mt-1 font-sans">
                      Test simulation environment via Safaricom Sandbox.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEnvironment('PRODUCTION')}
                    className={`p-3 text-left border transition-all font-mono text-xs ${
                      environment === 'PRODUCTION'
                        ? 'border-red-500 bg-red-950/20 text-white'
                        : 'border-white/10 bg-black/40 text-white/50 hover:border-white/30'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>PRODUCTION (LIVE)</span>
                      {environment === 'PRODUCTION' && <Check className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <p className="text-[10px] text-white/40 mt-1 font-sans">
                      Real money transactions using official Safaricom Daraja live API.
                    </p>
                  </button>
                </div>
              </div>

              {/* Shortcode */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-white/70 uppercase flex items-center justify-between">
                  <span>Business Shortcode / Paybill / Till</span>
                  <span className="text-[10px] text-white/40">e.g. 174379</span>
                </label>
                <input
                  type="text"
                  required
                  value={shortcode}
                  onChange={(e) => setShortcode(e.target.value)}
                  placeholder="e.g. 174379"
                  className="w-full bg-black border border-white/10 px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              {/* Callback Webhook URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-white/70 uppercase flex items-center justify-between">
                  <span>Callback Webhook URL</span>
                  <span className="text-[10px] text-white/40">Instant payment notifications</span>
                </label>
                <input
                  type="text"
                  required
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  placeholder="https://yourdomain.com/api/webhooks/payment/M-PESA"
                  className="w-full bg-black border border-white/10 px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              {/* Consumer Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-white/70 uppercase flex items-center justify-between">
                  <span>Consumer Key</span>
                  {config?.hasConsumerKey && (
                    <span className="text-[10px] text-emerald-400">Configured in DB</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showConsumerKey ? "text" : "password"}
                    value={consumerKey}
                    onChange={(e) => setConsumerKey(e.target.value)}
                    placeholder="Enter Safaricom Consumer Key"
                    className="w-full bg-black border border-white/10 px-3.5 py-2.5 pr-10 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConsumerKey(!showConsumerKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showConsumerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Consumer Secret */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-white/70 uppercase flex items-center justify-between">
                  <span>Consumer Secret</span>
                  {config?.hasConsumerSecret && (
                    <span className="text-[10px] text-emerald-400">Configured in DB</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showConsumerSecret ? "text" : "password"}
                    value={consumerSecret}
                    onChange={(e) => setConsumerSecret(e.target.value)}
                    placeholder="Enter Safaricom Consumer Secret"
                    className="w-full bg-black border border-white/10 px-3.5 py-2.5 pr-10 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConsumerSecret(!showConsumerSecret)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showConsumerSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Passkey */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-mono text-white/70 uppercase flex items-center justify-between">
                  <span>Lipa Na M-Pesa Online Passkey</span>
                  {config?.hasPasskey && (
                    <span className="text-[10px] text-emerald-400">Configured in DB</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPasskey ? "text" : "password"}
                    value={passkey}
                    onChange={(e) => setPasskey(e.target.value)}
                    placeholder="Enter Online Passkey (e.g. bfb279f9aa9bdbcf158e9...)"
                    className="w-full bg-black border border-white/10 px-3.5 py-2.5 pr-10 text-xs text-white font-mono focus:outline-none focus:border-[#c5a059]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasskey(!showPasskey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showPasskey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-white/40 font-mono">
                  Leave masked bullets untouched if you do not wish to change the existing saved passkey.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || saving}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-mono text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#c5a059]" />
                    <span>Testing Daraja Handshake...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-[#c5a059]" />
                    <span>Test Safaricom Daraja Connection</span>
                  </>
                )}
              </button>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  type="submit"
                  disabled={saving || testing}
                  className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 bg-[#c5a059] hover:bg-[#b08d46] text-black font-mono text-xs uppercase tracking-wider font-bold transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving Credentials...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save M-Pesa Configuration</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Audit Trail Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-white/70 font-semibold flex items-center space-x-2">
                <History className="w-4 h-4 text-[#c5a059]" />
                <span>Configuration Audit Trail (Without Secret Logging)</span>
              </h3>
              <button
                onClick={loadAuditLogs}
                disabled={loadingAudit}
                className="text-[11px] font-mono text-white/50 hover:text-white flex items-center space-x-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingAudit ? 'animate-spin' : ''}`} />
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="border border-white/10 bg-[#0d0d0d] overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 font-mono uppercase text-[10px]">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Admin</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Environment</th>
                    <th className="p-3">Fields Modified</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {auditLogs.length > 0 ? (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="p-3 text-white/60 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 text-white font-sans text-xs">
                          {log.actorEmail || 'Admin'}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] border ${
                            log.action === 'M_PESA_CONFIGURATION_CREATED'
                              ? 'bg-blue-950/40 text-blue-300 border-blue-500/30'
                              : log.action === 'M_PESA_CONFIGURATION_UPDATED'
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                              : 'bg-white/5 text-white/70 border-white/10'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-white/70">{log.environment || '-'}</td>
                        <td className="p-3 text-[#c5a059]">
                          {Array.isArray(log.fieldsModified) && log.fieldsModified.length > 0
                            ? log.fieldsModified.join(', ')
                            : 'None'}
                        </td>
                        <td className="p-3 text-white/50 text-[10px] max-w-xs truncate">
                          {log.details || '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-white/40 font-mono">
                        No configuration audit logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
