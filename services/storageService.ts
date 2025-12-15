import { Product } from '../types';

const STORAGE_KEY = 'alifinds_products_v1';

export const getStoredProducts = (): Product[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Failed to parse products from local storage", error);
    return [];
  }
};

export const saveProducts = (products: Product[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (error) {
    console.error("Failed to save products to local storage", error);
  }
};
