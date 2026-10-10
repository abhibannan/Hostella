# Deploying HostelDesk Backend Online (Render / Railway)

This guide walks you through deploying your HostelDesk backend so your mobile application can access it from anywhere over the internet.

---

## Option 1: Deploy to Render (Recommended - Free Tier)

### Step 1: Push your project to GitHub
If you haven't already initialized git:
```bash
git add .
git commit -m "Configure online deployment and mobile modularity"
git push origin main
```

### Step 2: Create a Web Service on Render
1. Log in to [render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your repository.
4. Set the following settings:
   - **Name:** `hosteldesk-backend`
   - **Root Directory:** `backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### Step 3: Add Environment Variables in Render Dashboard
Go to the **Environment** tab in your service and add the following keys from your local `backend/.env`:

| Key | Value / Source |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `CORS_ORIGIN` | `*` |
| `FIREBASE_PROJECT_ID` | Your Firebase Project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account client email |
| `FIREBASE_PRIVATE_KEY` | Entire private key starting with `-----BEGIN PRIVATE KEY-----` |
| `BOOTSTRAP_ADMIN_EMAIL` | Your admin email |
| `FIREBASE_STORAGE_BUCKET` | *(Optional)* Your storage bucket |

### Step 4: Click Deploy
Once the build completes, Render will provide you with a public URL:
`https://hosteldesk-api-xxxx.onrender.com`

---

## Option 2: Deploy to Railway (Alternative Free/Trial)
1. Go to [railway.app](https://railway.app) and click **New Project** -> **Deploy from GitHub repo**.
2. Set Root Directory to `/backend`.
3. Add the environment variables listed above.
4. Generate a public domain under **Settings** -> **Networking** -> **Generate Domain**.

---

## Connect Mobile App to the Online Backend

Once your backend is live:

1. Open [`mobile/src/services/api.ts`](file:///c:/Users/abhil/Downloads/HostelDesk-backend-modified%20-%20Copy%20%282%29/mobile/src/services/api.ts).
2. Update `API_URL` to point to your new cloud URL:
   ```typescript
   export const API_URL = "https://hosteldesk-api-xxxx.onrender.com/api/v1";
   ```
3. Test by opening the mobile app and signing in!
