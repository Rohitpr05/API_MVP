# RapidAPI Quick Reference

## 30-Second Setup

```bash
npm install
cp .env.example .env
# Edit .env: Add RAPIDAPI_PROXY_SECRET and OPENROUTER_API_KEY
npm run dev
```

---

## Testing (Copy-Paste)

### Health Check
```bash
curl http://localhost:3000/health
```

### Extract (Valid)
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}'
```

### Extract (Missing Secret - Should Fail)
```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}'
```

### Extract (Wrong Secret - Should Fail)
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: wrong" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}'
```

---

## Files Changed Summary

### Removed
- Auth routes, controllers, services
- JWT plugin
- Password hashing
- User database models

### Added
- `src/middleware/rapidapi.js` - Secret validation
- Swagger documentation

### Modified
- `src/app.js` - JWT → Swagger
- `src/config/env.js` - JWT_SECRET → RAPIDAPI_PROXY_SECRET
- `src/controllers/extraction.controller.js` - Remove user tracking
- `src/services/extraction.service.js` - Remove database logging
- `src/routes/extraction.routes.js` - JWT auth → RapidAPI middleware
- `package.json` - Remove JWT/Prisma, add Swagger
- `.env.example` - RapidAPI config

---

## Environment Variables

```env
# REQUIRED
RAPIDAPI_PROXY_SECRET=your-secret
OPENROUTER_API_KEY=sk-...

# Optional but recommended
NODE_ENV=production
PORT=3000
EXTRACTION_TIMEOUT=30000
EXTRACTION_MODEL=deepseek/deepseek-chat
```

---

## Deploy to Railway

1. Push code to GitHub
2. Go to https://railway.app
3. Click "New Project" → "Deploy from GitHub"
4. Select your repo
5. Add environment variables in dashboard
6. Deploy!

URL: `https://<project-name>.up.railway.app/extract`

---

## Deploy to Render

1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repo
4. Add environment variables
5. Deploy!

URL: `https://<service-name>.onrender.com/extract`

---

## RapidAPI Integration

1. Create account: https://rapidapi.io
2. Create new API
3. Add your deployed endpoint URL
4. Upload OpenAPI spec (or use auto-detection)
5. Configure pricing
6. Submit for review

Your Swagger docs are at: `/docs`
OpenAPI spec: Generated automatically by Fastify Swagger

---

## Status Codes

- **200** - Success
- **400** - Invalid URL or schema
- **403** - Invalid/missing RAPIDAPI_PROXY_SECRET
- **422** - Extraction failed
- **500** - Server error

---

## Common Issues

| Issue | Fix |
|-------|-----|
| "Secret not found" | Add RAPIDAPI_PROXY_SECRET to .env |
| "Browser not found" | Run `npm install playwright --force` |
| "Timeout" | Increase EXTRACTION_TIMEOUT |
| "API error" | Check OPENROUTER_API_KEY is valid |

---

## Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

---

## Full Docs

- **Deployment:** See `RAPIDAPI_DEPLOYMENT.md`
- **Testing:** See `RAPIDAPI_TESTING.md`
- **Summary:** See `RAPIDAPI_REFACTORING_SUMMARY.md`
- **Swagger:** Visit `http://localhost:3000/docs`

---

## What Was Changed (High-level)

✅ **Removed:** JWT auth, user management, database dependency
✅ **Added:** RapidAPI middleware, Swagger docs
✅ **Kept:** Extraction pipeline, browser automation, LLM integration
✅ **Result:** Stateless, marketplace-ready, deployable anywhere

---

## Next Steps

1. ✅ Test locally: `npm run dev`
2. ✅ Deploy to Railway/Render
3. ✅ Generate secure RAPIDAPI_PROXY_SECRET
4. ✅ Submit to RapidAPI marketplace
5. ✅ Configure pricing
6. ✅ Launch!

---

**Status: 🟢 Ready for RapidAPI Marketplace**
