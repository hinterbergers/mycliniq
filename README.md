## Environment Variables

This app is configured via environment variables (do **not** commit secrets).

Required:
- `DATABASE_URL` – Postgres connection string (e.g. Neon)  
- `SESSION_SECRET` – long random string used to sign sessions
- `PORT` – server port (default: `3000`)

Optional:
- `OPENAI_API_KEY` – enables OpenAI features (if not set, OpenAI-related features should be disabled/hidden)

## Nginx proxy
- Ensure the Nginx server block that proxy_pass-es to Node uses `client_max_body_size` large enough for training uploads; e.g. `client_max_body_size 20m;`. Without increasing it, PowerPoint/PDF uploads hit `413 Request Entity Too Large` before Express can process them.

### Example (.env)
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
SESSION_SECRET=replace_with_a_long_random_string
OPENAI_API_KEY=optional
