import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Configuration from environment variables
// In Vercel, set these variables starting with VITE_
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if config is actually present
const isConfigured = config.apiKey && config.projectId;

if (!isConfigured) {
  console.warn("Firebase is not configured. Falling back to LocalStorage. Data will NOT be shared between users. Please set VITE_FIREBASE_API_KEY and related env vars.");
}

const app = isConfigured ? initializeApp(config) : null;
export const db = app ? getFirestore(app) : null;
export const isDbConnected = !!db;