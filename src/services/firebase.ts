import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTHDOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECTID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGEBUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGINGSENDERID as string,
  appId: import.meta.env.VITE_FIREBASE_APPID as string,
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const auth = getAuth(app);
export const storage = getStorage(app);

