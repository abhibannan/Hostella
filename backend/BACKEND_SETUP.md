# HostelDesk Firebase-only Backend

## Stack

- Node.js + Express + TypeScript
- Firebase Authentication
- Cloud Firestore
- Firebase Storage (Admin SDK configured)
- Firebase Cloud Messaging can be added without another database
- Zod validation

PostgreSQL and Prisma are no longer used.

## Environment

The existing `.env` file is intentionally preserved. It must contain:

- `CORS_ORIGIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `BOOTSTRAP_ADMIN_EMAIL`

`DATABASE_URL` may remain in the existing `.env`; it is ignored by the Firebase-only backend.

Optional:
`FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app`

Do not commit `.env` or Firebase service-account JSON files.

## Firebase Console

In the Firebase project:

1. Authentication -> Email/Password must be enabled.
2. Firestore Database -> Create database.
3. Storage -> Get started if photos/documents are needed.
4. Keep the service-account private key only in `.env`.

## Install and run

```powershell
npm install
npm run build
npm run dev
```

Health:
`GET /api/v1/health`

Authentication:
`POST /api/v1/auth/bootstrap`
`GET /api/v1/auth/me`

Business data is stored in these Firestore collections:

`users`, `hostels`, `hostelAdmins`, `hostelAdminHistory`, `rooms`, `renters`, `fees`, `payments`, `repairs`, `notifications`, `auditLogs`.

Money values are stored as integer `amountPaise` fields to avoid floating-point currency errors.
