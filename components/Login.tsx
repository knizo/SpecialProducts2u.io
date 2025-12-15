import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { Button } from './Button';

interface LoginProps {
  onLogin: () => void;
  onCancel: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onCancel }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple hardcoded credentials for demonstration
    if (username === 'admin' && password === 'admin') {
      onLogin();
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mt-20 animate-in fade-in zoom-in duration-300">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center">
          <Lock className="w-5 h-5 mr-2 text-brand-600" />
          Admin Access
        </h2>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
            Login
          </Button>
        </div>
      </form>
    </div>
  );
};