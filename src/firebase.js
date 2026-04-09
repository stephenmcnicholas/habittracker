import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCm20xcM89i6kGpqIKGn2nllgwUbmKqGmw",
  authDomain: "habittracker-a2060.firebaseapp.com",
  projectId: "habittracker-a2060",
  storageBucket: "habittracker-a2060.firebasestorage.app",
  messagingSenderId: "69908278913",
  appId: "1:69908278913:web:9ebdff9cd4e3eac780e780",
  measurementId: "G-Y09PWQ67FC"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
