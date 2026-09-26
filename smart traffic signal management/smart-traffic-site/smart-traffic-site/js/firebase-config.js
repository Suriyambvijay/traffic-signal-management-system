// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
// 1. Go to https://console.firebase.google.com
// 2. Create a project (or use an existing one)
// 3. Project settings > General > "Your apps" > Web app (</>) > register
// 4. Copy the config object Firebase gives you and paste the values below
// 5. Enable Authentication > Sign-in method > Email/Password
// 6. Enable Firestore Database (start in test mode, then lock down rules)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDpJXW86kyNe5AX7hrCHoFrcBaJOzerVRI",
  authDomain: "traffic-control-d5d7e.firebaseapp.com",
  projectId: "traffic-control-d5d7e",
  storageBucket: "traffic-control-d5d7e.firebasestorage.app",
  messagingSenderId: "306631137906",
  appId: "1:306631137906:web:3a3e23a72673eee1e3c0eb",
  measurementId: "G-5VEST5Q336"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Suggested Firestore security rules (paste into Firestore > Rules):
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /users/{userId} {
//       allow read, write: if request.auth != null && request.auth.uid == userId;
//     }
//     match /users/{userId}/detections/{docId} {
//       allow read, write: if request.auth != null && request.auth.uid == userId;
//     }
//     match /users/{userId}/events/{docId} {
//       allow read, write: if request.auth != null && request.auth.uid == userId;
//     }
//     match /users/{userId}/traffic/{docId} {
//       allow read, write: if request.auth != null && request.auth.uid == userId;
//     }
//   }
// }
