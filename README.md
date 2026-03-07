## Environment Variables

This app is configured via environment variables (do **not** commit secrets).

Required:
- `DATABASE_URL` – Postgres connection string (e.g. Neon)  
- `SESSION_SECRET` – long random string used to sign sessions
- `PORT` – server port (default: `3000`)

Optional:
- `OPENAI_API_KEY` – enables OpenAI features (if not set, OpenAI-related features should be disabled/hidden)
- `VITE_API_BASE_URL` – optional absolute backend URL for native builds (example: `https://app.example.com`)

## Nginx proxy
- Ensure the Nginx server block that proxy_pass-es to Node uses `client_max_body_size` large enough for training uploads; e.g. `client_max_body_size 20m;`. Without increasing it, PowerPoint/PDF uploads hit `413 Request Entity Too Large` before Express can process them.

### Example (.env)
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
SESSION_SECRET=replace_with_a_long_random_string
OPENAI_API_KEY=optional
VITE_API_BASE_URL=https://app.example.com
```

## iOS (Capacitor) quickstart

1. Install/update dependencies:
   - `npm install`
2. Create iOS project once:
   - `npm run mobile:add:ios`
3. Sync current web build into iOS:
   - `npm run mobile:sync:ios`
4. Open in Xcode:
   - `npm run mobile:open:ios`

Notes:
- Capacitor uses `dist/public` as web assets (`capacitor.config.ts`).
- Set `VITE_API_BASE_URL` before `mobile:sync:ios` so the iOS app calls your deployed backend.
- Auth token storage uses secure native storage on iOS when the secure storage plugin is available, with automatic fallback.
- Widget snapshot contract (step 3): dashboard writes `mycliniq_widget_today_v1` in local storage and optionally forwards the same payload to `MycliniqWidgetBridge.setTodaySnapshot` or `webkit.messageHandlers.mycliniqWidget`.
- Step 4 WidgetKit templates and setup live in:
  - `ios/WIDGETKIT_SETUP.md`
  - `ios/widget-template/MycliniqWidgetBridge.swift`
  - `ios/widget-template/MycliniqTodayWidget.swift`
