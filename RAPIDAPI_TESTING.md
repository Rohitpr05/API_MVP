# RapidAPI Testing Guide

## Setup for Testing

### Prerequisites
- Node.js 18+
- OpenRouter API key (free from https://openrouter.ai)
- Local terminal with curl

### Installation
```bash
cd /home/rdev/dev/API_PROJECT/API_CODE
npm install
cp .env.example .env
```

### Edit .env
```bash
nano .env
```

Set these values:
```env
NODE_ENV=development
PORT=3000
HOST=localhost
LOG_LEVEL=info
RAPIDAPI_PROXY_SECRET=test-secret-dev
OPENROUTER_API_KEY=sk-...  # Your OpenRouter key
EXTRACTION_TIMEOUT=30000
EXTRACTION_MAX_CONTENT=8000
EXTRACTION_MODEL=deepseek/deepseek-chat
```

### Start Server
```bash
npm run dev
```

You should see:
```
Server running at http://0.0.0.0:3000
Swagger docs at http://0.0.0.0:3000/docs
```

---

## Test Cases

### Test 1: Health Check (No Auth Required)
```bash
curl -X GET http://localhost:3000/health \
  -H "Content-Type: application/json"
```

**Expected:** 200 OK with `"status": "healthy"`

**What it tests:** Basic server connectivity

---

### Test 2: Swagger Documentation
```bash
curl http://localhost:3000/docs
```

**Expected:** HTML page with interactive API documentation

**What it tests:** OpenAPI/Swagger integration

---

### Test 3: Root Endpoint
```bash
curl http://localhost:3000/
```

**Expected:** JSON showing API info and endpoints

**What it tests:** Application metadata

---

### Test 4: Extraction - Valid Request with Correct Secret
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://en.wikipedia.org/wiki/Python_(programming_language)",
    "schema": {
      "title": "string",
      "year": "number"
    }
  }' | jq '.'
```

**Expected:** 200 OK with extracted data like:
```json
{
  "success": true,
  "data": {
    "extractionId": "ext_...",
    "success": true,
    "data": {
      "title": "Python (programming language)",
      "year": 1991
    },
    "source": {...},
    "usage": {...}
  },
  "message": "Extraction successful"
}
```

**What it tests:**
- RapidAPI secret validation ✓
- Playwright page fetch ✓
- Content extraction ✓
- OpenRouter LLM call ✓
- JSON parsing ✓
- Response formatting ✓

---

### Test 5: Extraction - Missing RapidAPI Secret (403)
```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "schema": {"title": "string"}
  }' | jq '.'
```

**Expected:** 403 Forbidden
```json
{
  "success": false,
  "message": "Unauthorized: Missing x-rapidapi-proxy-secret header",
  "code": "INVALID_API_KEY"
}
```

**What it tests:** RapidAPI secret validation (missing)

---

### Test 6: Extraction - Invalid RapidAPI Secret (403)
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: wrong-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "schema": {"title": "string"}
  }' | jq '.'
```

**Expected:** 403 Forbidden
```json
{
  "success": false,
  "message": "Unauthorized: Invalid proxy secret",
  "code": "INVALID_API_KEY"
}
```

**What it tests:** RapidAPI secret validation (invalid)

---

### Test 7: Extraction - Invalid URL (400)
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "not-a-valid-url",
    "schema": {"title": "string"}
  }' | jq '.'
```

**Expected:** 400 Bad Request
```json
{
  "success": false,
  "message": "Invalid URL: ...",
  "code": "BAD_REQUEST"
}
```

**What it tests:** URL validation

---

### Test 8: Extraction - Invalid Schema (400)
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }' | jq '.'
```

**Expected:** 400 Bad Request with validation error

**What it tests:** Request schema validation (Zod)

---

### Test 9: Multiple Extractions (Concurrency)
```bash
# Run 3 concurrent extractions
for i in {1..3}; do
  curl -X POST http://localhost:3000/extract \
    -H "x-rapidapi-proxy-secret: test-secret-dev" \
    -H "Content-Type: application/json" \
    -d '{
      "url": "https://en.wikipedia.org/wiki/Node.js",
      "schema": {"title": "string", "language": "string"}
    }' > response_$i.json &
done
wait

# Check all succeeded
jq '.success' response_*.json
```

**Expected:** All three requests return 200 with `"success": true`

**What it tests:**
- Parallel request handling
- No race conditions
- Browser resource cleanup

---

### Test 10: Complex Schema Extraction
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.wikipedia.org",
    "schema": {
      "main_heading": "string",
      "featured_article_title": "string",
      "did_you_know_count": "number",
      "is_wikipedia": "boolean"
    }
  }' | jq '.data.data'
```

**Expected:** All schema fields populated with correct types

**What it tests:**
- Complex schema handling
- Type coercion
- Multiple field extraction

---

### Test 11: Timeout Handling
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://httpbin.org/delay/60",
    "schema": {"title": "string"},
    "options": {"timeout": 5000}
  }' | jq '.message'
```

**Expected:** 400 Bad Request with timeout message

**What it tests:** Custom timeout option

---

### Test 12: Custom Model Selection
```bash
curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "schema": {"title": "string", "founded_year": "number"},
    "options": {"model": "qwen/qwen-14b-chat"}
  }' | jq '.data.usage.model'
```

**Expected:** `"qwen/qwen-14b-chat"`

**What it tests:** Custom model parameter

---

## Batch Test Script

Save as `test-all.sh`:
```bash
#!/bin/bash

echo "🧪 Running RapidAPI Marketplace Tests..."
SECRET="test-secret-dev"
BASE_URL="http://localhost:3000"

# Test 1: Health
echo "✓ Test 1: Health Check"
curl -s $BASE_URL/health | jq '.success' | grep -q "true" && echo "  PASS" || echo "  FAIL"

# Test 2: Valid extraction
echo "✓ Test 2: Valid Extraction"
curl -s -X POST $BASE_URL/extract \
  -H "x-rapidapi-proxy-secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}' | \
  jq '.success' | grep -q "true" && echo "  PASS" || echo "  FAIL"

# Test 3: Missing secret (403)
echo "✓ Test 3: Missing Secret (403)"
curl -s -X POST $BASE_URL/extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}' | \
  jq '.message' | grep -q "Missing" && echo "  PASS" || echo "  FAIL"

# Test 4: Invalid secret (403)
echo "✓ Test 4: Invalid Secret (403)"
curl -s -X POST $BASE_URL/extract \
  -H "x-rapidapi-proxy-secret: wrong" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}' | \
  jq '.code' | grep -q "INVALID" && echo "  PASS" || echo "  FAIL"

# Test 5: Invalid URL (400)
echo "✓ Test 5: Invalid URL (400)"
curl -s -X POST $BASE_URL/extract \
  -H "x-rapidapi-proxy-secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"not-url","schema":{"title":"string"}}' | \
  jq '.message' | grep -q "Invalid" && echo "  PASS" || echo "  FAIL"

echo ""
echo "✅ All tests completed!"
```

Run:
```bash
chmod +x test-all.sh
./test-all.sh
```

---

## Performance Testing

### Measure Response Time
```bash
time curl -X POST http://localhost:3000/extract \
  -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","schema":{"title":"string"}}' \
  > /dev/null 2>&1
```

**Expected:** 5-15 seconds (depends on website)

---

### Load Testing (using Apache Bench)
```bash
# 10 requests, 5 concurrent
ab -n 10 -c 5 -H "x-rapidapi-proxy-secret: test-secret-dev" \
  -p request.json \
  -T "application/json" \
  http://localhost:3000/extract
```

Where `request.json`:
```json
{
  "url": "https://example.com",
  "schema": {"title": "string"}
}
```

---

## Debug Logging

Enable verbose logging:
```bash
LOG_LEVEL=debug npm run dev
```

This shows:
- HTTP request details
- RapidAPI secret validation
- Playwright browser commands
- OpenRouter API calls
- Response parsing

---

## Error Scenarios to Test

| Scenario | Expected Code | Expected Message |
|----------|---------------|------------------|
| Missing secret | 403 | Missing x-rapidapi-proxy-secret |
| Wrong secret | 403 | Invalid proxy secret |
| Invalid URL | 400 | Invalid URL |
| Missing schema | 400 | Validation failed |
| Timeout site | 400 | Page load timeout |
| Bad JSON response | 422 | Extraction failed |
| Server error | 500 | Internal server error |

---

## Check Server Logs

```bash
# See real-time logs
npm run dev

# From another terminal, make requests
curl http://localhost:3000/health
```

You should see structured logs in the terminal running `npm run dev`.

---

## Verify RapidAPI Integration Ready

Checklist:
- ✅ Server starts without errors
- ✅ `/health` endpoint returns 200
- ✅ `/extract` requires `x-rapidapi-proxy-secret` header
- ✅ Invalid/missing secret returns 403
- ✅ Valid extraction returns real data
- ✅ Swagger docs at `/docs`
- ✅ Error codes are correct (400, 403, 422, 500)
- ✅ Response format matches spec
- ✅ Concurrent requests work
- ✅ Logs are structured (Pino)

---

## Ready for RapidAPI Marketplace!

Once all tests pass:
1. Deploy to Railway or Render
2. Test production endpoints
3. Generate `RAPIDAPI_PROXY_SECRET` (strong random string)
4. Submit to RapidAPI for review
5. Configure pricing
6. Launch on marketplace

---

**Test Status:** 🟢 Ready for Production

**Created:** May 12, 2026
