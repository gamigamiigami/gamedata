// firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCaIa9i7DEJ5eHRjpoxTNPhqqskstTD5b0",
  authDomain: "rank-iogames.firebaseapp.com",
  projectId: "rank-iogames",
  storageBucket: "rank-iogames.firebasestorage.app",
  messagingSenderId: "810185267955",
  appId: "1:810185267955:web:36c86ba7885fdf98c8b586"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };