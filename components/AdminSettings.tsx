import React, { useState, useEffect } from 'react';
import { Settings, Shield, User, Key, CheckCircle, XCircle, QrCode } from 'lucide-react';
import { Button } from './Button';
import { getAdminConfig } from '../services/storageService';
import { 
  generateTOTPSecret, 
  getTOTPUri, 
  generateQRCode, 
  verifyTOTP, 
  updateAdminCredentials 
} from '../services/authService';

interface AdminSettingsProps {
  onCancel: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onCancel }) => {
  const [config, setConfig] = useState(getAdminConfig());
  const [activeTab, setActiveTab] = useState<'general' | 'security'>('general');
  
  // Credentials State
  const [newUsername, setNewUsername] = useState(config.username);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credentialMessage, setCredentialMessage] = useState({ type: '', text: '' });

  // 2FA State
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [tempSecret, setTempSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [securityMessage, setSecurityMessage] = useState({ type: '', text: '' });

  const handleUpdateCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      setCredentialMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    const updates: any = { username: newUsername };
    if (newPassword) updates.password = newPassword;

    updateAdminCredentials(updates);
    setConfig(getAdminConfig()); // Refresh
    setCredentialMessage({ type: 'success', text: 'Credentials updated successfully' });
    setNewPassword('');
    setConfirmPassword('');
  };

  const start2FASetup = async () => {
    const secret = generateTOTPSecret();
    setTempSecret(secret);
    const uri = getTOTPUri(secret, config.username);
    const qr = await generateQRCode(uri);
    setQrCodeUrl(qr);
    setIsSetupMode(true);
    setSecurityMessage({ type: '', text: '' });
  };

  const verifyAndEnable2FA = () => {
    if (verifyTOTP(verifyCode, tempSecret)) {
      updateAdminCredentials({ 
        is2FAEnabled: true, 
        twoFactorSecret: tempSecret 
      });
      setConfig(getAdminConfig());
      setIsSetupMode(false);
      setSecurityMessage({ type: 'success', text: 'Two-Factor Authentication Enabled!' });
    } else {
      setSecurityMessage({ type: 'error', text: 'Invalid code. Please try again.' });
    }
  };

  const disable2FA = () => {
    if (confirm('Are you sure you want to disable 2FA? This will make your account less secure.')) {
      updateAdminCredentials({ is2FAEnabled: false, twoFactorSecret: undefined });
      setConfig(getAdminConfig());
      setSecurityMessage({ type: 'success', text: '2FA Disabled.' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center">
          <Settings className="w-5 h-5 mr-2 text-brand-600" />
          Admin Settings
        </h2>
        <Button variant="ghost" onClick={onCancel} className="text-sm">
          Close
        </Button>
      </div>

      <div className="flex flex-col md:flex-row min-h-[500px]">
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-gray-50/50 border-r border-gray-100 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'general' 
                ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-100' 
                : 'text-gray-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            <User size={18} className="mr-3" />
            Credentials
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'security' 
                ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-100' 
                : 'text-gray-600 hover:bg-white hover:shadow-sm'
            }`}
          >
            <Shield size={18} className="mr-3" />
            Security (2FA)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-8">
          {activeTab === 'general' && (
            <div className="max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-6">Update Credentials</h3>
              
              {credentialMessage.text && (
                <div className={`mb-6 p-4 rounded-lg flex items-start ${credentialMessage.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                  {credentialMessage.type === 'error' ? <XCircle className="w-5 h-5 mr-2 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 shrink-0" />}
                  {credentialMessage.text}
                </div>
              )}

              <form onSubmit={handleUpdateCredentials} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div className="pt-4">
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="max-w-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-6">Two-Factor Authentication</h3>

              {securityMessage.text && (
                <div className={`mb-6 p-4 rounded-lg flex items-start ${securityMessage.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                  {securityMessage.type === 'error' ? <XCircle className="w-5 h-5 mr-2 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 shrink-0" />}
                  {securityMessage.text}
                </div>
              )}

              {!isSetupMode ? (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className={`p-2 rounded-lg mr-4 ${config.is2FAEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Key size={24} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">Authenticator App</h4>
                        <p className="text-sm text-gray-500">
                          {config.is2FAEnabled ? 'Protected by 2FA' : 'Not configured'}
                        </p>
                      </div>
                    </div>
                    {config.is2FAEnabled ? (
                      <Button variant="danger" onClick={disable2FA}>Disable</Button>
                    ) : (
                      <Button onClick={start2FASetup}>Setup</Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    Use an authenticator app like Google Authenticator or Authy to generate one-time codes for secure login.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                      <QrCode className="w-4 h-4 mr-2" />
                      Scan QR Code
                    </h4>
                    <p className="text-sm text-blue-800 mb-4">
                      Open your authenticator app and scan the image below.
                    </p>
                    <div className="flex justify-center bg-white p-4 rounded-lg border border-blue-100 w-fit mx-auto">
                      {qrCodeUrl && <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />}
                    </div>
                    <div className="mt-4 text-center">
                      <p className="text-xs text-blue-600 uppercase font-semibold tracking-wider">Manual Entry Code</p>
                      <code className="bg-white px-2 py-1 rounded border border-blue-200 text-sm">{tempSecret}</code>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Verify Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none tracking-widest font-mono text-center text-lg"
                        autoFocus
                      />
                      <Button onClick={verifyAndEnable2FA} disabled={verifyCode.length !== 6}>
                        Activate
                      </Button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <button 
                      onClick={() => setIsSetupMode(false)}
                      className="text-sm text-gray-500 hover:text-gray-900 underline"
                    >
                      Cancel Setup
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
