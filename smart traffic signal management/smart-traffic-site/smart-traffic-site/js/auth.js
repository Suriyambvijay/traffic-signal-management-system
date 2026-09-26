// ============================================================
// AUTH HELPERS — shared across all pages
// ============================================================

function showAuthError(el, message) {
  el.textContent = message;
  el.style.display = "block";
}

function friendlyAuthError(code) {
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in instead.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ---- Sign up ----
async function signUpUser(name, email, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await cred.user.updateProfile({ displayName: name });
  await db.collection("users").doc(cred.user.uid).set({
    name: name,
    email: email,
    role: "operator",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return cred.user;
}

// ---- Log in ----
async function logInUser(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

// ---- Log out ----
async function logOutUser() {
  await auth.signOut();
  window.location.href = "login.html";
}

// ---- Route guard: call on every protected page ----
// Redirects to login.html if not authenticated.
// Calls onReady(user) once auth state is confirmed and user is signed in.
function requireAuth(onReady) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
    } else {
      onReady(user);
    }
  });
}

// ---- Redirect away from login/signup if already authenticated ----
function redirectIfAuthed(destination) {
  auth.onAuthStateChanged((user) => {
    if (user) window.location.href = destination;
  });
}
