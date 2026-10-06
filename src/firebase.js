// Firebase ne sert qu'à l'authentification Google ; les données passent par l'API (Neon).
import { initializeApp } from '@firebase/app';
import { connectAuthEmulator, getAuth } from '@firebase/auth';

// Accès variable par variable : `import.meta.env` entier embarquerait dans le bundle
// toutes les variables VITE_* (dont VITE_VERCEL_* : commit, auteur…).
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!config.apiKey || !config.projectId) {
  throw new Error('Config Firebase manquante : copier .env.example vers .env et la renseigner.');
}

export const app = initializeApp(config);
export const auth = getAuth(app);

if (import.meta.env.VITE_USE_AUTH_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
