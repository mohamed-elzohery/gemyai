<p align="center">
  <h1 align="center">Gemy AI — Your AI Field-Service Assistant</h1>
  <p align="center">
    Real-time voice &amp; camera-powered repair guidance, built on Google Gemini
    <br />
    <strong>Gemini Live Agent Challenge</strong>
  </p>
  <p align="center">
    <a href="https://gemyai-404117367631.us-central1.run.app">Live Demo</a>
    &middot;
    <a href="#local-setup-step-by-step">Run Locally</a>
    &middot;
    <a href="#demo-video">Demo Video</a>
  </p>
</p>

---

## Table of Contents

- [What is Gemy AI?](#what-is-gemy-ai)
- [Key Features](#key-features)
- [Demo Video](#demo-video)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Third-Party Integrations](#third-party-integrations)
- [Prerequisites](#prerequisites)
- [Local Setup (Step-by-Step)](#local-setup-step-by-step)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Get a Gemini API Key](#2-get-a-gemini-api-key)
  - [3. Set Up Google OAuth Credentials](#3-set-up-google-oauth-credentials)
  - [4. Set Up Firebase](#4-set-up-firebase)
  - [5. Configure Server Environment Variables](#5-configure-server-environment-variables)
  - [6. Configure Client Environment Variables](#6-configure-client-environment-variables)
  - [7. Install Node.js Dependencies](#7-install-nodejs-dependencies)
  - [8. Install Python Dependencies](#8-install-python-dependencies)
  - [9. Start the Development Servers](#9-start-the-development-servers)
  - [10. Open the App](#10-open-the-app)
- [Alternative: Run with Docker](#alternative-run-with-docker)
- [Testing the App](#testing-the-app)
- [Project Structure](#project-structure)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What is Gemy AI?

**Gemy AI** is an AI-powered field-service assistant that helps technicians troubleshoot and repair equipment through **real-time voice and camera conversation**. Think of it as having the most experienced technician on a live call — one who can see through your camera, analyze components, search for documentation, annotate images to point out parts, and generate professional PDF service reports when the job is done.

Built for the **Gemini Live Agent Challenge**, Gemy AI showcases the full power of Google's Gemini native audio models and the Agent Development Kit (ADK) for bidirectional, multimodal, real-time AI interaction.

**Live Demo:** [https://gemyai-404117367631.us-central1.run.app](https://gemyai-404117367631.us-central1.run.app)

> **Note:** The live demo requires a Google account to sign in. Microphone and camera permissions are required for the full experience. Use **Google Chrome** for best compatibility.

---

## Key Features

- **Voice-First Conversation** — Speak naturally with Gemy using Gemini's native audio streaming. No text input required.
- **Real-Time Camera Analysis** — Point your camera at equipment and Gemy analyzes what it sees using a dedicated vision model (`gemini-3-flash-preview`).
- **Visual Grounding** — Gemy can annotate images with bounding boxes to point out specific components, connectors, or problem areas.
- **Google Search Integration** — Gemy searches the web for technical documentation, service bulletins, and troubleshooting guides specific to your equipment.
- **Guided Repair Workflow** — Step-by-step repair guidance from diagnosis through execution, with visual verification at each step.
- **PDF Report Generation** — After a repair session, Gemy generates a professional service report with images, steps taken, and recommendations.
- **Google OAuth Authentication** — Secure sign-in with Google accounts, session management via JWT cookies.
- **Responsive UI** — Works on desktop and mobile browsers with an animated 3D orb visualization that reflects conversation state.

---

## Demo Video

[![Watch the demo video](https://img.youtube.com/vi/igJmVPNCxro/maxresdefault.jpg)](https://youtu.be/igJmVPNCxro)

[▶ Watch the demo video on YouTube](https://youtu.be/igJmVPNCxro)

---

## Architecture

<p align="center">
  <img src="docs/system-design.png" alt="Gemy AI System Design" width="100%" />
</p>

The system is composed of three main layers:

- **Client (React SPA)** — Runs in the browser with a Three.js/WebGL animated orb, camera preview, chat panel, and an audio pipeline (PCM Recorder at 16kHz, PCM Player at 24kHz, Silero VAD for voice activity detection). Captures JPEG frames at ~1 fps and communicates with the backend over a single bidirectional WebSocket connection.

- **Backend (FastAPI + Google ADK on Cloud Run)** — Handles WebSocket sessions at `/ws/{userId}/{sessionId}` with three concurrent async tasks (upstream, downstream, delivery). Includes an auth layer (Google OAuth + JWT HttpOnly cookies), a Google ADK Runner with `LiveRequestQueue` for bidirectional streaming, and a 5-frame rolling buffer per session. In-memory services manage session artifacts and events. Firebase Firestore stores user profiles, and Google Secret Manager holds API keys and service account credentials.

- **Gemy — Field Service Agent** — The AI core powered by two Gemini models:
  - **Gemini 2.5 Flash** (native audio preview) — Handles real-time voice conversation and tool orchestration.
  - **Gemini 3 Flash** (preview) — Performs frame analysis, visual grounding, and structured data extraction for reports.
  
  The agent has four tools: `capture_frame` (vision analysis), `annotate_image` (visual grounding with bounding boxes via Pillow), `generate_fix_report` (PDF report generation via FPDF2), and `google_search` (web research for technical documentation). The root agent follows an Intake → Diagnose → Plan → Execute → Wrap-up workflow.

- **Google Cloud Platform** — Cloud Build + Artifact Registry deploy to Cloud Run via a multi-stage Docker build (Node 20 + Python 3.12). Secret Manager injects credentials at runtime.

<details>
<summary><strong>ASCII Diagram (Text Version)</strong></summary>

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client (React + Vite)                          │
│                                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Silero   │  │  Audio   │  │  Camera  │  │   Three.js │  │   MUI     │  │
│  │ VAD v5   │  │ Recorder │  │ 1fps     │  │   3D Orb   │  │   UI      │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────────┘  └───────────┘  │
│       │              │              │                                        │
│       ▼              ▼              ▼                                        │
│  ┌──────────────────────────────────────┐                                   │
│  │         WebSocket Connection         │                                   │
│  │   wss://host/ws/{userId}/{sessionId} │                                   │
│  └──────────────────┬───────────────────┘                                   │
└─────────────────────┼───────────────────────────────────────────────────────┘
                      │  PCM audio ↑↓ JSON events ↑↓ Binary audio
                      │
┌─────────────────────┼───────────────────────────────────────────────────────┐
│                     │          Server (FastAPI + ADK)                        │
│                     ▼                                                       │
│  ┌──────────────────────────────────────┐                                   │
│  │           WebSocket Endpoint         │                                   │
│  └──┬──────────────┬───────────────┬────┘                                   │
│     │              │               │                                        │
│     ▼              ▼               ▼                                        │
│  ┌────────┐  ┌───────────┐  ┌───────────┐                                  │
│  │Upstream│  │Downstream │  │ Delivery  │   Three concurrent async tasks    │
│  │ Task   │  │  Task     │  │  Task     │                                   │
│  └───┬────┘  └─────┬─────┘  └─────┬─────┘                                  │
│      │             │               │                                        │
│      ▼             ▼               ▼                                        │
│  ┌──────────────────────────────────────┐                                   │
│  │     LiveRequestQueue + Runner        │                                   │
│  └──────────────────┬───────────────────┘                                   │
│                     │                                                       │
│  ┌──────────────────┼───────────────────────────────────────────────┐       │
│  │                  │        Agent Tools                            │       │
│  │  ┌───────────┐ ┌┴──────────┐ ┌──────────────┐ ┌──────────────┐ │       │
│  │  │ capture   │ │ annotate  │ │   google     │ │  generate    │ │       │
│  │  │ _frame    │ │ _image    │ │   _search    │ │  _fix_report │ │       │
│  │  └───────────┘ └───────────┘ └──────────────┘ └──────────────┘ │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                     │                                                       │
│                     ▼                                                       │
│  ┌──────────────────────────────────────┐                                   │
│  │   Gemini Models (Google AI Studio)   │                                   │
│  │  • gemini-2.5-flash-native-audio     │  Main conversation (voice)        │
│  │  • gemini-3-flash-preview            │  Vision analysis & grounding      │
│  └──────────────────────────────────────┘                                   │
│                                                                             │
│  ┌────────────────────┐  ┌─────────────────┐                                │
│  │  Firebase Firestore │  │  Google OAuth   │                                │
│  │  (User storage)     │  │  (Sign-in)      │                                │
│  └────────────────────┘  └─────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

</details>

---

## Tech Stack

| Layer      | Technology                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| **Frontend** | React 19, Vite 6, TypeScript, Material UI 7, Three.js + React Three Fiber |
| **Backend**  | Python 3.12, FastAPI, Uvicorn, Google ADK                                 |
| **AI Models** | Gemini 2.5 Flash (native audio), Gemini 3 Flash Preview (vision)         |
| **Auth**     | Google OAuth 2.0, JWT (PyJWT), HttpOnly cookies                           |
| **Database** | Firebase Firestore (user profiles)                                        |
| **Voice**    | Silero VAD v5 (client-side), PCM audio worklets (16kHz record / 24kHz play) |
| **PDF**      | FPDF2 (styled service reports with images)                                |
| **Images**   | Pillow (bounding-box annotation drawing)                                  |
| **Monorepo** | pnpm workspaces, Turborepo                                               |
| **Deploy**   | Docker, Google Cloud Build, Cloud Run                                     |

---

## Third-Party Integrations

> As required by the hackathon rules, the following third-party services, SDKs, and libraries are used in this project. All are used in compliance with their respective licenses and terms of service.

| Integration | Purpose | License / Terms |
| --- | --- | --- |
| **[Google Gemini API](https://ai.google.dev/)** | Core AI models — `gemini-2.5-flash-native-audio-preview-12-2025` for real-time voice conversation, `gemini-3-flash-preview` for vision analysis, visual grounding, and report data extraction | [Google AI Terms](https://ai.google.dev/terms) |
| **[Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/)** | Agent framework — session management, `LiveRequestQueue` for bidirectional streaming, `Runner` for agent execution, `InMemorySessionService` and `InMemoryArtifactService` for state, built-in `google_search` tool | Apache 2.0 |
| **[Google OAuth 2.0](https://developers.google.com/identity)** | User authentication — Google Sign-In via `@react-oauth/google`, server-side token verification via `google-auth` | [Google API Terms](https://developers.google.com/terms) |
| **[Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) + [Firestore](https://firebase.google.com/docs/firestore)** | User data persistence — stores user profiles (google_id, email, name, picture, timestamps) in Firestore `users` collection | [Firebase Terms](https://firebase.google.com/terms) |
| **[Silero VAD v5](https://github.com/snakers4/silero-vad)** (via `@ricky0123/vad-web`) | Client-side voice activity detection — determines when the user is speaking to control audio recording and agent interruption | MIT |
| **[Three.js](https://threejs.org/) / [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)** | 3D animated orb visualization — custom WebGL shaders with Perlin noise, color states for listening/talking/idle | MIT |
| **[Material UI (MUI) v7](https://mui.com/)** | UI component library — buttons, dialogs, icons, theming | MIT |
| **[FPDF2](https://py-pdf.github.io/fpdf2/)** | PDF generation — styled service reports with headers, step badges, image captions, and watermarks | LGPL-3.0 |
| **[Pillow](https://python-pillow.org/)** | Image processing — drawing bounding-box ellipse annotations on camera frames for visual grounding | MIT-CMU |
| **[FastAPI](https://fastapi.tiangolo.com/)** | Python web framework — REST endpoints, WebSocket handling, static file serving | MIT |
| **[React Router v7](https://reactrouter.com/)** | Client-side routing — SPA navigation between home page and session page | MIT |

---

## Prerequisites

Before starting, make sure you have the following installed:

| Requirement | Version | How to install |
| --- | --- | --- |
| **Node.js** | 20 or higher | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **pnpm** | 10.6+ | Enabled via Corepack (included with Node.js): `corepack enable` |
| **Python** | 3.10 or higher | [python.org](https://www.python.org/downloads/) or `brew install python` |
| **pip** | Latest | Comes with Python. Alternatively, use [uv](https://docs.astral.sh/uv/): `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

You will also need:

- A **Google Cloud account** (free tier is sufficient) — for OAuth credentials and Firebase
- A **Gemini API key** (free) — from Google AI Studio
- **Google Chrome** browser (recommended) — for microphone/camera WebRTC support

---

## Local Setup (Step-by-Step)

Follow these steps exactly to get Gemy AI running on your local machine. Each step must be completed before moving to the next.

### 1. Clone the Repository

```bash
git clone https://github.com/AElzohworworkerAI/gemyai.git
cd gemyai
```

### 2. Get a Gemini API Key

1. Go to [Google AI Studio — API Keys](https://aistudio.google.com/apikey)
2. Click **"Create API Key"**
3. Select or create a Google Cloud project when prompted
4. Copy the generated API key — you will need it in Step 5
5. Make sure the project has the **Generative Language API** enabled (AI Studio does this automatically)

> This single API key powers the main voice agent, the camera vision analysis, the visual grounding tool, and the report generation model.

### 3. Set Up Google OAuth Credentials

Google OAuth is required for user sign-in. Create a Web Application OAuth client:

1. Go to **[Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)**
2. Select the **same project** you used for the Gemini API key
3. Click **"+ CREATE CREDENTIALS" → "OAuth client ID"**
4. If prompted, configure the **OAuth consent screen** first:
   - User Type: **External**
   - App name: `Gemy AI` (or any name)
   - User support email: your email
   - Developer contact: your email
   - Click **Save and Continue** through the remaining steps (no scopes needed)
5. Back in Credentials, click **"+ CREATE CREDENTIALS" → "OAuth client ID"**
6. Application type: **Web application**
7. Name: `Gemy AI Local`
8. Under **Authorized JavaScript origins**, add:
   ```
   http://localhost:5173
   ```
9. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:5173
   ```
10. Click **Create**
11. Copy the **Client ID** (looks like `xxxxxxxxxxxx.apps.googleusercontent.com`) — you will need it in Steps 5 and 6

### 4. Set Up Firebase

Firebase is used to store user profiles in Firestore. Set up a Firebase project:

1. Go to **[Firebase Console](https://console.firebase.google.com/)**
2. Click **"Create a project"** (or select an existing one)
   - You can link the same Google Cloud project from Step 2 — this is recommended
3. Once the project is created, go to **Build → Firestore Database** in the left sidebar
4. Click **"Create database"**
5. Choose **Start in test mode** (allows read/write for 30 days — sufficient for judging)
6. Select a Firestore location (e.g., `us-central1` or any region)
7. Click **Enable**
8. Now generate a service account key:
   - Go to **Project Settings** (gear icon) → **Service accounts** tab
   - Click **"Generate new private key"**
   - Click **"Generate key"** — a JSON file will download
9. **Move the downloaded JSON file** into the server app directory:
   ```bash
   # From the gemyai project root:
   mv ~/Downloads/<your-firebase-adminsdk-file>.json apps/server/app/
   ```
10. Note the **exact filename** of the JSON file — you will need it in Step 5

### 5. Configure Server Environment Variables

```bash
cp apps/server/app/.env.example apps/server/app/.env
```

Open `apps/server/app/.env` in your editor and fill in these values:

```env
# ── AI Platform ──────────────────────────────────────────────
GOOGLE_GENAI_USE_VERTEXAI=FALSE

# ── Gemini API Key (from Step 2) ────────────────────────────
GOOGLE_API_KEY=<paste-your-gemini-api-key-here>

# ── Google OAuth (from Step 3) ──────────────────────────────
GOOGLE_OAUTH_CLIENT_ID=<paste-your-oauth-client-id-here>

# ── JWT Secret (any random string) ──────────────────────────
JWT_SECRET=my-local-dev-jwt-secret-change-me

# ── Firebase (from Step 4) ──────────────────────────────────
FIREBASE_SERVICE_ACCOUNT_PATH=<exact-filename-of-your-firebase-json>
```

**Example with real-looking values (do NOT copy these — use your own):**

```env
GOOGLE_GENAI_USE_VERTEXAI=FALSE
GOOGLE_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_OAUTH_CLIENT_ID=123456789012-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
JWT_SECRET=super-secret-jwt-key-for-local-dev-2024
FIREBASE_SERVICE_ACCOUNT_PATH=myproject-firebase-adminsdk-abc123.json
```

### 6. Configure Client Environment Variables

Create the client `.env` file:

```bash
cat <<EOF > apps/client/.env
VITE_GOOGLE_CLIENT_ID=<paste-your-oauth-client-id-here>
EOF
```

> **Important:** The value of `VITE_GOOGLE_CLIENT_ID` must be the **same** OAuth Client ID used in Step 5's `GOOGLE_OAUTH_CLIENT_ID`.

### 7. Install Node.js Dependencies

From the project root:

```bash
corepack enable
pnpm install
```

> `corepack enable` activates the correct pnpm version (10.6.4) as declared in `package.json`. If you see a permission error, run `sudo corepack enable`.

### 8. Install Python Dependencies

```bash
cd apps/server
pip install -e .
cd ../..
```

**If you prefer using `uv` (faster):**

```bash
cd apps/server
uv sync
cd ../..
```

> This installs: `google-adk`, `fastapi`, `uvicorn`, `firebase-admin`, `PyJWT`, `Pillow`, `fpdf2`, `python-dotenv`, `google-auth`, and their transitive dependencies.

### 9. Start the Development Servers

You need **two terminal windows** running simultaneously:

**Terminal 1 — Python backend (FastAPI on port 8000):**

```bash
cd apps/server/app
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Wait until you see:

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx]
```

**Terminal 2 — Vite frontend (React on port 5173):**

```bash
cd apps/client
pnpm dev
```

Wait until you see:

```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

> **How it works:** The Vite dev server on port 5173 proxies `/api/*` and `/ws/*` requests to the FastAPI server on port 8000 (configured in `vite.config.ts`). This gives you hot-reload for both frontend and backend during development.

### 10. Open the App

1. Open **Google Chrome** and navigate to: **[http://localhost:5173](http://localhost:5173)**
2. Click **"Sign in with Google"** and sign in with your Google account
3. Click **"New Session"** to start a repair session
4. **Grant microphone and camera permissions** when the browser prompts you
5. Start talking to Gemy! Say something like *"Hi Gemy, I need help fixing my printer"*

> **Tip:** Use headphones to prevent audio feedback between the speaker and microphone.

---

## Alternative: Run with Docker

If you prefer a single-command setup (no need for two terminals):

**1. Make sure you have completed Steps 2–6** (credentials + `.env` files).

**2. Build the Docker image:**

```bash
docker build \
  --build-arg VITE_GOOGLE_CLIENT_ID=<your-oauth-client-id> \
  -t gemyai .
```

**3. Run the container:**

```bash
docker run -p 8000:8080 \
  --env-file apps/server/app/.env \
  -e PORT=8080 \
  gemyai
```

**4. Open the app:** Navigate to **[http://localhost:8000](http://localhost:8000)**

> When running via Docker, the Vite frontend is pre-built and served by FastAPI as static files. There is no hot-reload, but everything runs in a single container.

---

## Testing the App

Here is what you can test to verify the app is working correctly:

| Test | How | Expected Result |
| --- | --- | --- |
| **Sign-in** | Click "Sign in with Google" on the home page | You are authenticated and see the session start UI |
| **Voice conversation** | Start a session, say "Hi Gemy" | Gemy responds with a spoken greeting; the orb animates |
| **Camera analysis** | Enable camera, point it at something, say "What do you see?" | Gemy calls `capture_frame` and describes what it sees |
| **Visual grounding** | Say "Can you point to [something visible]?" | Gemy annotates the image with red bounding boxes |
| **Google Search** | Mention a specific equipment model and ask about common issues | Gemy searches the web and provides relevant information |
| **PDF report** | After a repair session, say "Can you generate a report?" | A PDF downloads to your device with the session summary |
| **Mobile** | Open the app on a phone (same network) via `http://<your-ip>:5173` | Responsive UI with camera/mic access |

---

## Project Structure

```
gemyai/
├── README.md                          ← You are here
├── package.json                       ← Monorepo root (pnpm + turbo scripts)
├── pnpm-workspace.yaml                ← Workspace definition
├── turbo.json                         ← Turborepo task config
├── Dockerfile                         ← Multi-stage build (Node + Python)
├── cloudbuild.yaml                    ← Google Cloud Build deployment
├── apps/
│   ├── client/                        ← React + Vite frontend
│   │   ├── package.json
│   │   ├── vite.config.ts             ← Dev proxy config (/api, /ws → :8000)
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── pcm-player-processor.js    ← Audio playback worklet
│   │   │   ├── pcm-recorder-processor.js  ← Audio recording worklet
│   │   │   ├── silero_vad_v5.onnx         ← VAD model weights
│   │   │   └── vad.worklet.bundle.min.js  ← VAD worklet bundle
│   │   └── src/
│   │       ├── App.tsx                ← Routes + OAuth provider
│   │       ├── main.tsx               ← Entry point
│   │       ├── theme.ts              ← MUI theme
│   │       ├── components/
│   │       │   ├── Orb.tsx            ← Three.js 3D orb visualization
│   │       │   ├── ChatPanel.tsx      ← Message history panel
│   │       │   ├── CameraPreview.tsx  ← Camera feed display
│   │       │   ├── SessionTopBar.tsx  ← Session header
│   │       │   ├── SessionBottomBar.tsx ← Mic/camera/end controls
│   │       │   ├── ResponsePreview.tsx  ← Transcription overlay
│   │       │   └── ...
│   │       ├── contexts/
│   │       │   └── AuthContext.tsx     ← Google OAuth state management
│   │       ├── hooks/
│   │       │   ├── useWebSocket.ts    ← WebSocket connection + message routing
│   │       │   ├── useAudioRecorder.ts ← PCM recording (16kHz)
│   │       │   ├── useAudioPlayer.ts  ← PCM playback (24kHz)
│   │       │   ├── useVAD.ts          ← Silero VAD integration
│   │       │   └── useCamera.ts       ← Camera capture (1fps JPEG)
│   │       ├── pages/
│   │       │   ├── HomePage.tsx       ← Landing + sign-in
│   │       │   └── SessionPage.tsx    ← Main session UI
│   │       └── utils/
│   │           ├── audio.ts           ← PCM conversion utilities
│   │           └── textHelpers.ts     ← Text formatting
│   └── server/                        ← FastAPI + ADK backend
│       ├── package.json               ← npm scripts (dev, start)
│       ├── pyproject.toml             ← Python dependencies
│       └── app/
│           ├── .env.example           ← Environment variable template
│           ├── main.py                ← FastAPI app, WebSocket endpoint, auth routes
│           ├── auth.py                ← Google OAuth verification, JWT helpers
│           ├── user_service.py        ← Firebase Firestore user CRUD
│           └── field_service_agent/
│               ├── __init__.py        ← Package exports
│               ├── agent.py           ← Gemy agent definition + instruction prompt
│               ├── frame_analyzer.py  ← capture_frame tool (vision analysis)
│               ├── visual_grounding.py ← annotate_image tool (bounding boxes)
│               ├── report_generator.py ← generate_fix_report tool (PDF creation)
│               ├── frame_buffer.py    ← Shared frame storage across tools
│               └── schemas.py         ← Structured output schemas for Gemini
├── assets/                            ← README images
└── scripts/                           ← GCP setup scripts
```

---

## Environment Variables Reference

### Server (`apps/server/app/.env`)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GOOGLE_GENAI_USE_VERTEXAI` | Yes | `FALSE` | Set to `FALSE` to use Gemini API directly with an API key |
| `GOOGLE_API_KEY` | Yes | — | Gemini API key from [AI Studio](https://aistudio.google.com/apikey) |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | — | Google OAuth 2.0 Client ID for sign-in verification |
| `JWT_SECRET` | Yes | `change-me-in-production` | Secret key for signing session JWT cookies |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes* | — | Path to Firebase service account JSON file (relative to `app/`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | — | Alternative: inline JSON string (used in Cloud Run with Secret Manager) |
| `DEMO_AGENT_MODEL` | No | `gemini-2.5-flash-native-audio-preview-12-2025` | Main agent model name |
| `ANALYZER_MODEL` | No | `gemini-3-flash-preview` | Model for camera frame analysis |
| `GROUNDING_MODEL` | No | `gemini-3-flash-preview` | Model for visual grounding (bounding boxes) |
| `REPORT_MODEL` | No | `gemini-3-flash-preview` | Model for report data extraction |
| `ENVIRONMENT` | No | — | Set to `production` for secure cookies (set automatically in Cloud Run) |
| `PORT` | No | `8080` | Server port (injected by Cloud Run) |

> \* Either `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT_JSON` must be set. For local development, use the path variant.

### Client (`apps/client/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Same Google OAuth Client ID as the server. Used by `@react-oauth/google` for sign-in UI. |

---

## Troubleshooting

### "OAuth not configured" error on sign-in

- Verify `GOOGLE_OAUTH_CLIENT_ID` is set in `apps/server/app/.env`
- Verify `VITE_GOOGLE_CLIENT_ID` is set in `apps/client/.env`
- Both must be the **same** Client ID
- Restart both the Vite and FastAPI servers after changing `.env` files

### CORS errors or Google Sign-In popup fails

- Ensure your OAuth Client ID has `http://localhost:5173` in **Authorized JavaScript origins**
- Ensure `http://localhost:5173` is also in **Authorized redirect URIs**
- Use `http://` (not `https://`) for local development
- Clear browser cookies and try again

### WebSocket connection fails

- Check that the FastAPI server is running on port **8000** (the Vite proxy forwards to this port)
- Look for errors in the terminal running `uvicorn`
- Check the browser console (F12) for WebSocket error messages

### Firebase / Firestore errors

- Verify the service account JSON file exists at the path specified in `FIREBASE_SERVICE_ACCOUNT_PATH`
- The path is **relative to `apps/server/app/`** — e.g., if the file is at `apps/server/app/my-firebase.json`, set `FIREBASE_SERVICE_ACCOUNT_PATH=my-firebase.json`
- Make sure Firestore database is **enabled** in the Firebase Console (Build → Firestore Database)
- Ensure the database is in **test mode** or has appropriate security rules

### Audio not working / no voice response

- Use **Google Chrome** (Firefox and Safari have limited WebRTC/AudioWorklet support)
- Grant microphone permission when prompted
- Check that no other app is using the microphone
- Use headphones to prevent audio feedback loops
- Check browser console for `AudioContext` errors — you may need to click/interact with the page first (browser autoplay policy)

### Camera not showing

- Grant camera permission when prompted
- Check that no other app (e.g., Zoom) is using the camera
- Try switching between front/rear camera using the camera-switch button

### Gemini API errors (rate limits, model not found)

- Verify your `GOOGLE_API_KEY` is valid and has the Generative Language API enabled
- The native audio model (`gemini-2.5-flash-native-audio-preview-12-2025`) requires API access — if unavailable, the server logs will show the error
- Check the Gemini API [quotas page](https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas) for rate limit issues

### Python module not found errors

- Make sure you ran `pip install -e .` from the `apps/server/` directory (not `apps/server/app/`)
- Make sure you start `uvicorn` from inside `apps/server/app/` so Python can resolve local imports (`from field_service_agent.agent import agent`)

---

## License

This project is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

---

<p align="center">
  Built with Gemini &middot; Google ADK &middot; FastAPI &middot; React
  <br />
  Made for the <strong>Gemini Live Agent Challenge</strong>
</p>