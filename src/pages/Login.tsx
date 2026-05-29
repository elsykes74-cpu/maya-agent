import { useState } from 'react';
import { PhoneCall, Bot, Shield, Zap } from 'lucide-react';

function getKimiOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set('client_id', appID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'profile');
  url.searchParams.set('state', state);
  return url.toString();
}

export default function Login() {
  const [loading, setLoading] = useState<'kimi' | 'google' | null>(null);

  const handleKimiLogin = () => {
    setLoading('kimi');
    window.location.href = getKimiOAuthUrl();
  };

  const handleGoogleLogin = async () => {
    setLoading('google');
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="app-shell bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#007AFF] to-[#5856D6] flex items-center justify-center shadow-xl mb-6">
          <Bot size={48} className="text-white" />
        </div>

        <h1 className="text-[32px] font-bold text-[#1C1C1E] text-center tracking-tight">
          AI Calling Agent
        </h1>
        <p className="text-[17px] text-[#8E8E93] text-center mt-2 leading-relaxed">
          Never miss a motivated seller lead. Your AI agent calls 24/7.
        </p>

        <div className="flex flex-wrap justify-center gap-2 mt-6">
          <FeaturePill icon={<PhoneCall size={14} />} label="24/7 Calling" />
          <FeaturePill icon={<Zap size={14} />} label="Instant Response" />
          <FeaturePill icon={<Shield size={14} />} label="TCPA Compliant" />
        </div>
      </div>

      <div className="px-6 pb-12 space-y-3">
        <button
          onClick={handleKimiLogin}
          disabled={loading !== null}
          className="w-full ios-btn bg-[#007AFF] text-white text-[18px] py-4 disabled:opacity-50 shadow-lg"
        >
          {loading === 'kimi' ? 'Signing in...' : 'Sign in with Kimi'}
        </button>

        <button
          onClick={handleGoogleLogin}
          disabled={loading !== null}
          className="w-full ios-btn bg-white border border-[#E5E5EA] text-[#1C1C1E] text-[18px] py-4 disabled:opacity-50 shadow-sm"
        >
          {loading === 'google' ? (
            'Signing in...'
          ) : (
            <span className="flex items-center justify-center gap-2">
              <GoogleG /> Sign in with Google
            </span>
          )}
        </button>

        <p className="text-center text-[13px] text-[#C6C6C8] pt-2">
          By signing in, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}

function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F2F2F7] rounded-full">
      <span className="text-[#007AFF]">{icon}</span>
      <span className="text-[13px] font-medium text-[#1C1C1E]">{label}</span>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
