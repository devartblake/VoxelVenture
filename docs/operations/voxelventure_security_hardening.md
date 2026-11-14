# Security Hardening & Safeguard Guide: VoxelVenture (`voxelventure.app`)

**Target:** [VoxelVenture](https://voxelventure.app/)  
**Assessment Scope:** Passive public inspection of the interactive 3D commercial city, economic counters (`Your Gold`, `City Market Cap`, `Occupied Plots`), wardrobe/avatar controls, movement/emotes, and `List your business free` directory flow. Private APIs, WebSockets, HTTP response headers, and source code were not directly probed.

---

## 1. Threat Model Summary (Red vs. Blue Team)

| Attack Surface | Red Team Vector (What Can Break) | Blue Team Control (How to Fix) | Priority |
| :--- | :--- | :--- | :--- |
| **Virtual Economy & Plots** | Race conditions to double-spend Gold or claim multiple plots; parameter tampering on balances/prices | Atomic DB transactions (`SELECT ... FOR UPDATE`), idempotency keys, server-authoritative balances | Critical |
| **Business Listings (UGC)** | Stored XSS in business names/descriptions; `javascript:` or phishing redirects in storefront URLs | Server-side sanitization + output encoding, strict `https://` URL allowlist, `CSP` without `unsafe-inline` scripts | Critical |
| **3D Assets & WebGL** | Malformed/oversized `.glb`/texture uploads causing client GPU crashes; served-file XSS if hosted on main origin | Server-side magic-byte/polycount/size validation, isolated cookieless CDN/bucket with `nosniff` | High |
| **Real-Time Movement / Emotes** | WebSocket/API flooding (`WASD`, click-to-walk, emotes) to degrade server or other clients | Per-socket token-bucket rate limiting, payload schema validation, max-message-size caps | High |
| **Edge, Headers & CORS** | Permissive `Access-Control-Allow-Origin: *` leaking tokens; clickjacking via `<iframe>` | Strict CORS origin allowlist, `HttpOnly` cookies, `frame-ancestors 'none'`, Three.js-tuned `CSP` | High |

---

## 2. Edge, CORS & Three.js Content-Security-Policy

Serve security headers as HTTP response headers at your edge proxy or backend server (never solely in `<meta>` tags, which ignore `frame-ancestors` and reporting directives).

### Recommended Headers

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy:
  default-src 'none';
  script-src 'self' 'wasm-unsafe-eval';
  script-src-attr 'none';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://assets.voxelventure.app;
  font-src 'self';
  connect-src 'self' blob: https://api.voxelventure.app wss://api.voxelventure.app https://assets.voxelventure.app;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
  report-to csp-endpoint;
```

### Why Three.js & Custom Shaders Need These Directives

1. **`'wasm-unsafe-eval'` instead of `'unsafe-eval'`:** Custom GLSL shaders compile on the GPU via WebGL and need no eval permission. However, Three.js decoders for compressed geometry/textures (Draco, Meshopt, KTX2/Basis Universal) use WebAssembly; `'wasm-unsafe-eval'` enables `WebAssembly.compile()` and `instantiate()` while blocking JavaScript `eval()` and `new Function()` ([GitHub MCP Ext-Apps #605](https://github.com/modelcontextprotocol/ext-apps/issues/605)).
2. **`blob:` in `worker-src`, `img-src`, and `connect-src`:** `GLTFLoader` and `KTX2Loader` create `blob:` URLs for embedded textures and off-thread decoding workers ([Three.js Forum](https://discourse.threejs.org/t/how-to-set-content-security-policy-for-usegltfs/51398), [TomTom 3D Landmarks Docs](https://docs.tomtom.com/maps-sdk-js/guides/plugins/landmarks-3d-landmarks)). Keeping `blob:` out of `script-src` prevents arbitrary script execution while keeping 3D loading functional.
3. **CORS & Session Tokens:** Lock `Access-Control-Allow-Origin` strictly to `https://voxelventure.app` (never `*` on authenticated routes) and set `Access-Control-Allow-Credentials: true` only when using `HttpOnly; Secure; SameSite=Lax` session cookies instead of `localStorage` JWTs.

---

## 3. Virtual Economy & Plot Claim Integrity

[VoxelVenture](https://voxelventure.app/) tracks live economic state (`Your Gold`, `City Market Cap`, `Occupied Plots 401 / 855`).

### Safeguard Procedures

1. **Prevent Race Conditions (Double-Spend & Multi-Plot Claims):**
   * Wrap every Gold deduction and plot-claim mutation in a single atomic database transaction using row-level locking (`SELECT ... FOR UPDATE`) or an atomic conditional update (`UPDATE plots SET owner_id = $1 WHERE id = $2 AND owner_id IS NULL`).
   * Require a client-generated `Idempotency-Key` header on purchase/claim endpoints so retried requests cannot execute twice.
2. **Enforce Server-Side Authority:**
   * Reject negative, zero, or non-integer amounts in any Gold/transfer/bid schema.
   * Never trust client-supplied prices, plot availability flags, or `City Market Cap` totals; compute all balances and aggregate market stats on the server from committed ledger rows.
3. **Authorization (Anti-IDOR):**
   * Verify `plot.owner_id === session.userId` before allowing edits to storefront metadata, wardrobe items, or plot transfers.

---

## 4. Business Directory (UGC) & Stored XSS Prevention

The `List your business free` workflow accepts user-controlled text, links, and storefront branding that render for all city visitors.

### Safeguard Procedures

1. **Strict Text Sanitization & Encoding:**
   * Strip HTML tags from business names, taglines, and descriptions on ingest, and render them using safe text bindings (`textContent` / framework auto-escaping) rather than `innerHTML` or `dangerouslySetInnerHTML`.
2. **URL & Protocol Allowlisting:**
   * Validate all submitted website/storefront URLs with a strict URL parser: allow **only** `https:` (or `http:` if required), and explicitly reject `javascript:`, `data:`, and `vbscript:` schemes.
   * Render external links with `target="_blank" rel="noopener noreferrer nofollow"`.
3. **Abuse & Spam Throttling:**
   * Require authenticated accounts and bot-challenge verification (e.g., Turnstile) before creating a free business listing, and cap active free listings per account/IP.

---

## 5. 3D Asset & Real-Time Multiplayer Hardening

1. **Isolate Uploaded 3D Assets & Textures:**
   * Validate uploaded `.glb`/`.gltf` models and textures server-side: check magic bytes, enforce strict file-size caps, and reject external URI references inside `.gltf` JSON manifests that point to arbitrary third-party hosts.
   * Serve all user-uploaded assets from a separate, cookieless domain/bucket (e.g., `https://assets.voxelventure.app`) with `X-Content-Type-Options: nosniff` so an uploaded SVG or HTML file can never execute in the `voxelventure.app` origin.
2. **Rate-Limit Real-Time Movement & Emotes:**
   * Apply per-connection token-bucket rate limits on WebSocket/API updates for `WASD`/click-to-walk coordinates and `1 2 3` emotes (e.g., max 20–30 position updates/sec, 2 emotes/sec).
   * Validate coordinate bounds on the server so clients cannot teleport into restricted zones or broadcast `NaN`/`Infinity` values that crash other players' Three.js render loops.

---

## 6. Safe Rollout & Verification Checklist

1. **Deploy CSP in Report-Only Mode:** Start with `Content-Security-Policy-Report-Only` and a `report-to` endpoint while testing `GLTFLoader`, `KTX2Loader`, wardrobe switches, and business-listing modals.
2. **Verify Headers & Asset Bucket Isolation via CLI:**
   ```bash
   curl -I https://voxelventure.app
   curl -I https://assets.voxelventure.app/sample-asset.glb
   ```
   Confirm `X-Content-Type-Options: nosniff` and `frame-ancestors 'none'` on the app origin, and verify that the asset host sets no session cookies.
3. **Run Concurrency Tests on Plot Claims:** Fire 10–20 simultaneous `POST` requests against a staging environment for the same unowned plot and verify that exactly **one** succeeds (`200`/`201`) and the rest fail cleanly (`409 Conflict`) without negative Gold balances.
4. **Enforce CSP:** Switch from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` once zero legitimate `securitypolicyviolation` events occur in testing.
