import React, { useState } from 'react';
import { ExternalLink, Sparkles, Send, ShieldCheck, Lock } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  isMiniApp: boolean;
  initialError?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, isMiniApp, initialError }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(initialError || null);

  React.useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const handleOidcRedirect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/oidc/login');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to get Telegram login URL');
      }
    } catch (err: any) {
      setError(err.message || 'Telegram OIDC connection error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 text-slate-100 selection:bg-blue-500 selection:text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        {/* App Logo */}
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
            <Send className="w-8 h-8 text-white transform -rotate-12 translate-x-0.5" />
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Telegram Media Manager</h1>
          <p className="text-sm text-slate-400 mt-2">
            Cloud media storage powered by Telegram infrastructure
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-xs sm:text-sm">
            {error}
          </div>
        )}

        {isMiniApp ? (
          <div className="space-y-4 text-center">
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/50 text-blue-200 text-sm">
              <Sparkles className="w-5 h-5 mx-auto mb-2 text-blue-400 animate-pulse" />
              Verifying Telegram WebApp authentication signature...
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Official Telegram OIDC Button */}
            <button
              onClick={handleOidcRedirect}
              disabled={loading}
              className="w-full py-3.5 px-5 rounded-xl bg-[#2481cc] hover:bg-[#1f72b5] text-white font-medium flex items-center justify-center gap-3 shadow-md shadow-blue-900/30 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-60"
            >
              <Send className="w-5 h-5" />
              <span>Log in with Telegram</span>
              <ExternalLink className="w-4 h-4 opacity-60 ml-auto" />
            </button>

            <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>OAuth 2.0 / OpenID Connect with PKCE (S256)</span>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800/70 text-center text-xs text-slate-500">
          <p>Access requires Telegram account approval by system administrators.</p>
        </div>
      </div>
    </div>
  );
};
