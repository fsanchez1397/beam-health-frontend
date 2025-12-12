// API Configuration

const USE_LOCAL_BACKEND = false; // Set to false to use external Render backend

const LOCAL_BACKEND_URL = 'http://localhost:8000';
const EXTERNAL_BACKEND_URL = 'https://beam-health-backend.onrender.com';

export const API_BASE_URL = USE_LOCAL_BACKEND ? LOCAL_BACKEND_URL : EXTERNAL_BACKEND_URL;
export const API_BASE = `${API_BASE_URL}/api`;

