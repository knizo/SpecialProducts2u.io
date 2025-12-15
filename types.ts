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

export type ViewState = 'home' | 'admin' | 'login';