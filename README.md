# 🏨 Hostella (StayNexa)

> **Next-Generation Multi-Tenant Hostel & Co-Living Property Management Ecosystem**  
> *Seamlessly connecting Property Managers, Residents, Technicians, and Platform Executives.*

---

## 📌 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [User Roles & Portals](#-user-roles--portals)
- [Technology Stack](#-technology-stack)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#1-backend-setup)
  - [Mobile App Setup](#2-mobile-app-setup-ios--android)
  - [Web Frontend Setup](#3-web-frontend-setup)
- [Push Notification Architecture](#-push-notification-architecture)
- [Deployment](#-deployment)
- [License](#-license)

---

## 🌟 Overview

**Hostella** is an enterprise-ready, cross-platform property management system designed specifically for hostels, student residences, paying guest (PG) accommodations, and co-living facilities.

The system replaces manual spreadsheets, WhatsApp payment screenshots, and paper logbooks with an automated, synchronized digital hub:

- **Mobile App (iOS & Android)**: Built with React Native & Expo SDK 57, featuring native biometrics (Face ID / Fingerprint), an introductory startup video, offline-first sync, and high-priority background push notifications.
- **Backend API**: A Node.js & Express RESTful service powered by Google Firebase Cloud Firestore, Firebase Auth, Firebase Storage, and FCM v1 HTTP API.
- **Web Frontend**: A React + Vite responsive administrative dashboard for desktop management.

---

## 🏗️ System Architecture

```mermaid
graph TD
    subgraph Clients ["Client Layer"]
        A["Mobile App (iOS / Android)<br/>React Native • Expo SDK 57"]
        B["Web Admin Portal<br/>React 19 • Vite • Tailwind"]
    end

    subgraph BackendLayer ["Backend API Layer (Node.js / Express)"]
        C["Express 5 REST API Router"]
        D["Auth & Role Guard Middleware"]
        E["Expo & Native FCM Push Service"]
        F["System Telemetry & Audit Service"]
    end

    subgraph FirebaseLayer ["Cloud Infrastructure (Google Firebase)"]
        G[("Cloud Firestore<br/>NoSQL Database")]
        H["Firebase Authentication<br/>Google OAuth & Passwords"]
        I["Firebase Cloud Storage<br/>Payment Proofs & Receipts"]
        J["Firebase Cloud Messaging (FCM)<br/>High-Priority Native Push"]
    end

    A -->|REST API + JWT| C
    B -->|REST API + JWT| C
    C --> D
    D --> G
    D --> H
    E --> J
    J -->|Push Banners| A
    C --> I
    C --> F
```

---

## ✨ Key Features

### 🔔 1. Dual-Layer Push Notification Engine
- **Background / Terminated State**: Uses Google Firebase Cloud Messaging (FCM v1) with high-priority Android channels (`default`, `hostella`), custom vibration patterns, and system tray delivery even when the app is completely killed or the phone is locked.
- **Foreground In-App Sync**: Periodic 20-second active sync that polls new unread notifications and fires native OS alerts.
- **Auto-Pruning Dead Tokens**: Automatically identifies stale tokens (`NotRegistered`, `SenderId mismatch`) and purges them from Firestore to ensure clean message queues.
- **One-Tap Diagnostics**: Includes a delayed push test feature in the app settings allowing users to trigger a 5-second delayed notification, lock their screen, and verify background receipt.

### 🎬 2. Cinematic Startup Video Intro
- Full-screen startup video intro powered by `expo-video` (`videoprojects.mp4`).
- **Parallel Preloading**: As the video plays on startup, the application authenticates, warms up API caches, and queries push tokens in the background—ensuring instantaneous access the moment the video fades out.
- Includes smooth 350ms fade transitions, skip controls, and safety timeouts.

### 🔐 3. Native Biometric Security
- Hardware-backed biometric authentication (Apple Face ID, Touch ID, Android Biometrics).
- Secure encrypted session caching using `@react-native-async-storage/async-storage`.

### 💳 4. Digital Fee Collection & Payment Proofs
- Automated monthly recurring fee generation per bed or room.
- Residents upload payment screenshots with client-side image compression.
- Administrators review zoomable payment proofs, approve or reject transactions with one click, and issue auto-generated digital receipts.

### 🛠️ 5. Maintenance Ticket Management
- Residents log repair tickets with photos, descriptions, and urgency levels (`LOW`, `MEDIUM`, `HIGH`, `URGENT`).
- Property managers assign tasks to registered repair technicians and track real-time resolution states.

### 📶 6. Offline-First Resilience
- Network status detection via NetInfo with offline mutation queuing.
- Changes made while offline automatically flush to the server upon reconnection.

---

## 👥 User Roles & Portals

| Role | Access Level | Primary Capabilities |
| :--- | :--- | :--- |
| **Super Admin** | Platform-Wide | • Executive KPIs & Count-up Metrics<br/>• Provision & Delete Administrators<br/>• Assign/Unassign Hostels to Staff<br/>• One-Click Admin Password Reset & Generator<br/>• Emergency Platform Lockdown (HTTP 503)<br/>• Real-time Exception Logs & Telemetry<br/>• Cache Flush Utilities |
| **Hostel Admin** | Branch Property | • Hostel, Room, and Bed Inventory<br/>• Resident Onboarding & Profiles<br/>• Fee Generation & Overdue Reminders<br/>• Payment Proof Verification<br/>• Maintenance Person Allocation<br/>• Hostel-wide Emergency Broadcast Notices |
| **Resident (Renter)** | Personal Portal | • Room & Bed Details<br/>• Pending & Paid Dues Breakdown<br/>• Direct Payment Proof Upload<br/>• Repair Request Submission & Tracking<br/>• Broadcast Notices Feed |
| **Repair Person** | Field Operations | • Assigned Maintenance Tickets<br/>• Priority Indicators<br/>• Status Update Tracking |

---

## 💻 Technology Stack

### Mobile Application (`/mobile`)
- **Framework**: React Native 0.86, React 19, Expo SDK 57
- **Video & Media**: `expo-video`, `expo-image-manipulator`, `expo-image-picker`
- **Security & Hardware**: `expo-local-authentication` (Biometrics), `expo-haptics`, `expo-clipboard`
- **Notifications**: `expo-notifications`, `expo-task-manager`
- **Design System**: Apple iOS Human Interface Guidelines (Cupertino), Dark/Light harmonious tokens, custom SVGs, smooth layout transitions

### Backend API (`/backend`)
- **Runtime**: Node.js (>= 22) + TypeScript
- **Framework**: Express.js v5
- **Database & Cloud**: Google Cloud Firestore, Firebase Admin SDK v13
- **Push Delivery**: Native FCM v1 Admin Messaging + Expo Server SDK
- **Security**: JWT dual-token (Access + Refresh), Helmet, Zod validation schemas, CORS

### Web Dashboard (`/frontend`)
- **Framework**: React 19 + Vite
- **Icons & Styling**: Lucide React, Tailwind CSS, Framer Motion
- **Data Visualizations**: Recharts

---

## 📁 Repository Structure

```text
Hostella/
├── backend/                        # Node.js & Express REST API
│   ├── src/
│   │   ├── config/                 # Firebase Admin & Environment configs
│   │   ├── middleware/             # Auth, Maintenance, Error, Hostel-Access guards
│   │   ├── modules/
│   │   │   ├── auth/               # Super admin, staff provisioning, password reset
│   │   │   ├── hostels/            # Property CRUD & manager assignments
│   │   │   ├── rooms/              # Room inventory, floor & bed slots
│   │   │   ├── renters/            # Resident profiling & check-in/out
│   │   │   ├── fees/               # Recurring billing & fee reminders
│   │   │   ├── payments/           # Payment proof verification & audit
│   │   │   ├── repairs/            # Incident ticketing & maintenance persons
│   │   │   └── notifications/      # Push token registration, test triggers, broadcasts
│   │   ├── services/               # Native FCM V1 push & telemetry monitoring
│   │   └── utils/                  # Audit loggers & mailers
│   └── package.json
│
├── mobile/                         # React Native / Expo Mobile App
│   ├── assets/                     # Logos, icons, and videoprojects.mp4
│   ├── src/
│   │   ├── components/             # Reusable UI, IntroVideoScreen, Brand assets
│   │   ├── contexts/               # Theme (Dark/Light) & Toast contexts
│   │   ├── hooks/                  # Custom hooks (Auth, Biometrics, Push, Data sync)
│   │   ├── screens/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── DashboardScreen.tsx
│   │   │   ├── SuperAdminScreen.tsx # 4-tab executive console
│   │   │   ├── RenterPortalScreen.tsx
│   │   │   ├── RoomsScreen.tsx
│   │   │   ├── RentersScreen.tsx
│   │   │   ├── PaymentsScreen.tsx
│   │   │   ├── RepairsScreen.tsx
│   │   │   └── MoreScreen.tsx
│   │   ├── services/               # API client, offline queue, background tasks
│   │   └── types/                  # TypeScript data interfaces
│   ├── app.json                    # Expo configuration & plugins
│   └── package.json
│
├── frontend/                       # React + Vite Web Management Portal
│   ├── src/
│   ├── index.html
│   └── package.json
│
├── render.yaml                     # Render.com cloud deployment specification
└── README.md                       # Master Documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v22.x` or higher
- **npm**: `v10.x` or higher
- **Firebase Account**: A Firebase project with Firestore, Authentication, and Storage enabled.
- **Expo CLI / EAS CLI**: For mobile development (`npm install -g eas-cli`)

---

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create an environment file `.env` in `backend/`:
   ```env
   NODE_ENV=development
   PORT=3000
   CORS_ORIGIN=http://localhost:5173

   # Firebase Service Account Credentials
   FIREBASE_PROJECT_ID=your-firebase-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_STORAGE_BUCKET=your-project.appspot.com

   # Bootstrap Super Admin Email
   BOOTSTRAP_ADMIN_EMAIL=admin@example.com
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. *(Optional)* Bootstrap the initial Super Admin:
   ```bash
   npm run bootstrap:admin
   ```

---

### 2. Mobile App Setup (iOS & Android)

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   npm install
   ```

2. Place your `google-services.json` (for Android) and `GoogleService-Info.plist` (for iOS) in `mobile/`.

3. Ensure the intro video asset is located at `mobile/assets/videoprojects.mp4`.

4. Start the Expo development server:
   ```bash
   npx expo start --clear
   ```

5. **Build Standalone Android APK**:
   ```bash
   npm run build:apk
   ```

---

### 3. Web Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

---

## 📡 Push Notification Architecture

```text
[ Trigger: Admin sends Broadcast / Fee Reminder ]
                    │
                    ▼
       [ Backend: expo-push.service.ts ]
                    │
                    ├─► Checks Firestore 'pushTokens' for recipient userIds
                    │
                    ├─► If Token is ExponentPushToken[...] ──► Expo Push Relay API
                    │
                    └─► If Token is Native FCM Token ────────► Firebase Admin Messaging
                                                                     │
                                                                     ▼
                                                      [ Google Play Services ]
                                                                     │
                                                                     ▼
                                               [ Android Status Bar & Lock Screen ]
                                                (Works even when app is terminated)
```

---

## ☁️ Deployment

- **Backend API**: Automated deployments configured via [`render.yaml`](./render.yaml) on [Render](https://render.com). Connected to the `main` branch of `https://github.com/abhibannan/Hostella.git`.
- **Web App**: Built with Vite and deployable to GitHub Pages, Vercel, or Netlify.
- **Mobile Builds**: Managed through EAS Build with the `preview` profile generating standalone release APKs.

---

## 📄 License

This project is licensed under the MIT License — see the [`LICENSE`](./LICENSE) file for details.