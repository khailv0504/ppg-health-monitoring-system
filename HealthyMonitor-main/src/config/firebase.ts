import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyD8WJ87ObKrBBq24nNOqgBvQ1XttvXY61E",
  authDomain: "max30102-bccad.firebaseapp.com",
  databaseURL: "https://max30102-bccad-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "max30102-bccad",
  storageBucket: "max30102-bccad.firebasestorage.app",
  messagingSenderId: "749391671319",
  appId: "1:749391671319:web:d698d4fb7026bb4f152c52"
};

export const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);