# Secure Banking Starter

This is a fresh starter scaffold created from the service names and infrastructure implied by your `.env`.
It is NOT your original missing application code.

## Run

1. Copy `.env.example` to `.env`
2. Replace every `change_me` value with a local secret.
3. Start Docker Desktop.
4. From the project root:
   - `npm install`
   - `docker compose up -d`
   - `npm run dev:backend`
5. Open a second terminal:
   - `npm run dev:frontend`
6. Open the Vite URL shown in the terminal.

Backend health endpoints:
- Auth: http://localhost:4001/health
- Account: http://localhost:4002/health
- Transaction: http://localhost:4003/health
- Payment: http://localhost:4004/health
- Audit: http://localhost:4005/health
- Notification: http://localhost:4006/health
- Dead Letter: http://localhost:4007/health
