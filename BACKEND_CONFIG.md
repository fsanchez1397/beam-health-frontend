# Backend Configuration

## Switching Between Local and External Backend

To switch between the localhost backend and the external backend, edit `src/config.ts`:

```typescript
const USE_LOCAL_BACKEND = true;  // Set to true for localhost
const USE_LOCAL_BACKEND = false; // Set to false for external backend
```

### Local Backend
- URL: `http://localhost:8000`
- Use when: Running the backend locally for development

### External Backend
- URL: `https://beam-health-backend.onrender.com`
- Use when: Testing against the deployed backend

The configuration is automatically applied to all API calls throughout the application.


