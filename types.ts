export interface Product {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  affiliateLink: string;
  description: string;
  category: string;
  createdAt: number;
}

export interface ProductFormData {
  title: string;
  price: string; // string for input handling
  imageUrl: string;
  affiliateLink: string;
  description: string;
  category: string;
}

export interface AdminConfig {
  username: string;
  password: string; // In a real app, this should be hashed. Storing plain for this demo.
  twoFactorSecret?: string;
  is2FAEnabled: boolean;
}

export type ViewState = 'home' | 'admin' | 'login' | 'settings';
