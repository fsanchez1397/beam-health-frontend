# Beam Health Frontend

A React + TypeScript + Vite application designed as an MVP for Beam Health’s physician workflow dashboard. The app integrates OpenAI’s Whisper-based speech processing to streamline clinical documentation. It can automatically transcribe conversations in real time, detect when speech stops to segment notes cleanly, identify and separate multiple speakers, and generate suggested follow-up questions for physicians based on the conversation context.
This MVP demonstrates how AI-assisted note-taking can reduce administrative burden and support physicians during patient encounters.

## Features

- Real-time appointment detection and patient information display
- Audio recording and transcription using OpenAI Whisper
- AI-powered encounter summary generation
- Editable encounter summaries with follow-up questions
- Patient email notifications
- Professional physician dashboard UI

## Prerequisites

- Node.js (v18 or higher)
- npm, yarn, or pnpm
- Backend API running (local or external)

## Local Setup

### 1. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 2. Configure Backend URL

Edit `src/config.ts` to set your backend preference:

```typescript
const USE_LOCAL_BACKEND = true;  // true for localhost, false for external
```

**Local Backend:**
- URL: `http://localhost:8000`
- Requires backend server running locally
- Use for development

**External Backend:**
- URL: `https://beam-health-backend.onrender.com`
- Use for testing against deployed backend

### 3. Start Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

The application will be available at `http://localhost:5173` (or the port shown in terminal).

## Backend Configuration

### Switching Between Backends

To switch between local and external backend, edit `src/config.ts`:

```typescript
// For local development
const USE_LOCAL_BACKEND = true;

// For external/production backend
const USE_LOCAL_BACKEND = false;
```

The configuration automatically applies to all API calls:
- Patient data fetching
- Appointment detection
- Audio transcription
- Encounter summary generation
- Email sending

### Backend Endpoints

The frontend expects the following backend endpoints:

- `GET /api/patients` - Get all patients
- `GET /api/patients/{id}` - Get patient by ID
- `GET /api/appointments/active` - Get currently active appointment
- `POST /transcribe` - Upload audio for transcription
- `POST /api/encounter-summary` - Generate encounter summary
- `POST /api/send-email` - Send email to patient

## Development

### Key Features

1. **Active Appointment Detection**
   - Automatically detects active appointments based on current time
   - Updates every 30 seconds
   - Displays patient information when appointment is active

2. **Audio Recording**
   - Records audio in WebM format
   - Automatically stops after 30 seconds of silence
   - AI greeting plays when recording starts
   - Chunks accumulated and sent when recording stops

3. **Encounter Summary**
   - AI-generated summary from transcription
   - Editable fields for all sections
   - Follow-up questions suggestions
   - Email functionality to send summary to patient

### Environment Variables

No environment variables are required for the frontend. All configuration is done in `src/config.ts`.

## Troubleshooting

### Appointments Not Showing

1. **Check Backend Configuration**
   - Verify `USE_LOCAL_BACKEND` in `src/config.ts` matches your setup
   - Ensure backend is running if using local backend

2. **Check Browser Console**
   - Look for API errors or CORS issues
   - Verify API calls are reaching the correct backend URL

3. **Verify Active Appointment**
   - Check if current time matches an appointment window
   - Appointments must be "booked" with a `patient_id` to be active

### Audio Recording Issues

1. **Microphone Permissions**
   - Grant microphone access when prompted
   - Check browser settings if permission denied

### CORS Errors

- Ensure backend CORS is configured to allow your frontend origin
- Check that backend URL in `config.ts` is correct
