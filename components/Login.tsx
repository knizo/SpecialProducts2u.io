import React, { useState } from 'react';
import { Lock, AlertCircle, ArrowRight, KeyRound } from 'lucide-react';
import { Button } from './Button';
import { verifyCredentials, is2FAEnabled, verifyTOTP } from '../services/authService';

interface LoginProps {
  onLogin: () => void;
  onCancel: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onCancel }) => {
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');

  const handleCredentialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCredentials(username, password)) {
      if (is2FAEnabled()) {
        setStep('2fa');
        setError('');
      } else {
        onLogin();
      }
    } else {
      setError('Invalid username or password');
    }
  };

  const handle2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyTOTP(totpCode)) {
      onLogin();
    } else {
      setError('Invalid authentication code');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mt-20 animate-in fade-in zoom-in duration-300">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center">
          <Lock className="w-5 h-5 mr-2 text-brand-600" />
          {step === 'credentials' ? 'Admin Access' : 'Security Check'}
        </h2>
      </div>
      
      {step === 'credentials' ? (
        <form onSubmit={handleCredentialSubmit} className="p-6 space-y-6">
          {error && (
              <div className="flex items-center p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                  <AlertCircle size={16} className="mr-2 shrink-0" />
                  {error}
              </div>
          )}
          
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
              type="text"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
              placeholder="Enter username"
              />
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
              placeholder="Enter password"
              />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Return Home
            </Button>
            <Button type="submit">
              Login <ArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handle2FASubmit} className="p-6 space-y-6">
           <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-50 text-brand-600 mb-3">
                <KeyRound size={24} />
              </div>
              <p className="text-gray-600 text-sm">
                Enter the 6-digit code from your authenticator app.
              </p>
           </div>

           {error && (
              <div className="flex items-center p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                  <AlertCircle size={16} className="mr-2 shrink-0" />
                  {error}
              </div>
          )}

           <div>
              <input
              type="text"
              autoFocus
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-center text-2xl tracking-[0.5em] font-mono"
              placeholder="000000"
              />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button 
              type="button" 
              onClick={() => { setStep('credentials'); setError(''); }}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Back to Login
            </button>
            <Button type="submit">
              Verify
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
