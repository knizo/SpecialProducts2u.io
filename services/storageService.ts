import { Product, AdminConfig } from '../types';

const STORAGE_KEY = 'alifinds_products_v1';
const ADMIN_CONFIG_KEY = 'alifinds_admin_config_v1';

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

const DEFAULT_ADMIN: AdminConfig = {
  username: 'admin',
  password: 'admin',
  is2FAEnabled: false
};

export const getAdminConfig = (): AdminConfig => {
  try {
    const stored = localStorage.getItem(ADMIN_CONFIG_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_ADMIN;
  } catch (error) {
    console.error("Failed to parse admin config", error);
    return DEFAULT_ADMIN;
  }
};

export const saveAdminConfig = (config: AdminConfig): void => {
  try {
    localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("Failed to save admin config", error);
  }
};
