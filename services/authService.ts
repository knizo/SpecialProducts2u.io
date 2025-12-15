import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { getAdminConfig, saveAdminConfig } from './storageService';
import { AdminConfig } from '../types';

export const verifyCredentials = (username: string, password: string): boolean => {
  const config = getAdminConfig();
  return config.username === username && config.password === password;
};

export const is2FAEnabled = (): boolean => {
  const config = getAdminConfig();
  return config.is2FAEnabled;
};

export const generateTOTPSecret = () => {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
};

export const getTOTPUri = (secret: string, username: string) => {
  const totp = new OTPAuth.TOTP({
    issuer: 'Special-Products',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
};

export const generateQRCode = async (uri: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(uri);
  } catch (err) {
    console.error(err);
    return '';
  }
};

export const verifyTOTP = (token: string, secret?: string): boolean => {
  const config = getAdminConfig();
  // Use provided secret (for setup) or stored secret (for login)
  const secretToUse = secret || config.twoFactorSecret;
  
  if (!secretToUse) return false;

  const totp = new OTPAuth.TOTP({
    issuer: 'Special-Products',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretToUse),
  });

  // validate returns null if invalid, or the delta (integer) if valid
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};

export const updateAdminCredentials = (newConfig: Partial<AdminConfig>) => {
  const current = getAdminConfig();
  saveAdminConfig({ ...current, ...newConfig });
};
