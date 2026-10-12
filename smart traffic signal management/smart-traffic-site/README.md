# Smart Traffic Signal Management

Node.js and Express application with a static browser frontend and a small JSON API.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Use `npm start` for a standard production-style run. The API health endpoint is `http://localhost:3000/api/health`.

## Structure

- `frontend/public/` contains the HTML pages, CSS, and browser JavaScript.
- `backend/` contains the Express application and API routes.
- `server/` contains the Node.js process entry point.
- `firebase.json` and `firestore.rules` configure Firebase hosting and Firestore.