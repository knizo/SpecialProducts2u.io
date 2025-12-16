import { Product, AdminConfig } from '../types';
import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  QuerySnapshot,
  DocumentData
} from 'firebase/firestore';

const STORAGE_KEY = 'alifinds_products_v1';
const ADMIN_CONFIG_KEY = 'alifinds_admin_config_v1';

// --- SHARED DATA (Products) ---

/**
 * Subscribes to product updates. 
 * If DB is connected, it listens to Firestore real-time updates.
 * If not, it falls back to local storage once.
 */
export const subscribeToProducts = (
  onUpdate: (products: Product[]) => void, 
  onError?: (error: string) => void
) => {
  if (db) {
    // Real-time listener from Firestore
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const products = snapshot.docs.map(doc => doc.data() as Product);
      onUpdate(products);
    }, (error) => {
      console.error("Firestore subscription error:", error);
      
      // Notify UI about the specific error
      if (error.code === 'permission-denied') {
        onError?.('permission-denied');
      } else {
        onError?.(error.message);
      }

      // Fallback to local so the app doesn't look empty, 
      // but the user should know the DB connection failed.
      onUpdate(getStoredProductsLocal());
    });

    return unsubscribe;
  } else {
    // Fallback: Load from local storage immediately
    onUpdate(getStoredProductsLocal());
    // Return empty unsubscribe function
    return () => {}; 
  }
};

export const addProduct = async (product: Product): Promise<void> => {
  if (db) {
    try {
      await setDoc(doc(db, "products", product.id), product);
    } catch (e) {
      console.error("Error adding document: ", e);
      // Fallback
      saveProductLocal(product);
      throw e; // Re-throw so UI knows it failed remotely
    }
  } else {
    saveProductLocal(product);
  }
};

export const removeProduct = async (id: string): Promise<void> => {
  if (db) {
    try {
      await deleteDoc(doc(db, "products", id));
    } catch (e) {
      console.error("Error deleting document: ", e);
      removeProductLocal(id);
      throw e;
    }
  } else {
    removeProductLocal(id);
  }
};

// --- LOCAL FALLBACKS ---

const getStoredProductsLocal = (): Product[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Failed to parse products from local storage", error);
    return [];
  }
};

const saveProductLocal = (product: Product) => {
  const current = getStoredProductsLocal();
  const updated = [product, ...current];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

const removeProductLocal = (id: string) => {
  const current = getStoredProductsLocal();
  const updated = current.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const getStoredProducts = getStoredProductsLocal; // Keep for compatibility if needed, but prefer subscription

// --- ADMIN CONFIG (Local Only) ---
// Admin config stays local because it contains the 'login state' for this specific browser/device
// We don't want to share the "I am logged in" state across all users globally.

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