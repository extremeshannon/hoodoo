# HoodooAK iOS — Mac Cursor prompt

**Use this in Cursor on your Mac** with the Hoodoo iOS SwiftUI app open.  
**Website is the source of truth.** Live site: [https://www.hoodooak.com](https://www.hoodooak.com)  
**API:** `https://www.hoodooak.com/api`  
**Web repo (read-only reference):** sibling `hoodoo/` on the VPS / clone on Mac if you have it.

This prompt tells iOS how to ship the **3D configurator**, **shop configurator**, **embroidery quote**, cart, and account — matching what the web already does.

---

## Copy-paste prompt (start here)

```
You are building the Hoodoo Alaska iOS app (SwiftUI) on this Mac.

Live website + API (source of truth): https://www.hoodooak.com
Do NOT invent product parts, colors, prices, or flows. Match the website.

Brand
- Display name: Hoodoo Alaska
- Domain: hoodooak.com
- Accent: #36B4E5
- Ink: #0a0b0d
- Surfaces: #12151a / #1c2229
- Text: #e8ecf1 / #f7f9fb
- Fonts if possible: Syne (display), DM Sans (body)
- Contact: 7362 W Parks Hwy PMB 213, Wasilla, AK 99623
- Phone: 907.202.5634
- Email: shannnon@hoodooak.com  (three n’s — use exactly this)

Golden rules
1. Web is source of truth. Before coding a screen, fetch/read the matching web page or JSON.
2. Do not change backend unless iOS cannot work without it. If you hit a gap, document it; don’t invent a parallel API.
3. Stock palettes only. No free-form color picker. Taslan/spandex/stitch/body/embroidery colors come from GET https://www.hoodooak.com/data/materials.json
4. Youth fit is “coming soon” for suits (stand-in until CLO GLB exists).
5. FastAPI errors are { "detail": "..." } (string or array). Auth is Bearer JWT. Cart on web is cookie-based (hoodoo_cart_id) — on iOS keep a local cart AND submit orders with Bearer; do not depend on browser cookies.
6. iPad is primary (configurator needs space). iPhone must still complete Pattern → Color → Sizing → Send.

Three products in the app (match the website IA)

A) 3D CONFIGURATOR  = website /suit.html
   Pattern (fit + garment) → Configurator (parts + stock colors + optional art + embroidery text) → Sizing → Download pack / Email build.

B) SHOP CONFIGURATOR  = website /configurator.html
   Categories + products from GET /api/catalog. Options, inventory, guide price, add to cart.

C) INSTANT QUOTE  = website /quote.html + /pricing.html
   Embroidery / screen / dye-sub estimator. GET /api/pricing/decoration  POST /api/quote/estimate

============================================================
A. 3D CONFIGURATOR (this is the main job)
============================================================

Reference implementation: hoodoo/js/suit-configurator.js + hoodoo/suit.html + hoodoo/js/sizing-avatar.js
Manifest: GET https://www.hoodooak.com/3d/clo/manifest.json
Materials: GET https://www.hoodooak.com/data/materials.json
GLBs: https://www.hoodooak.com/3d/clo/... (paths in manifest glb / glbByFit)

Flow (3 steps, same labels as web)
1. Pattern — pick Fit first, then garment card.
   Fits: Male, Female, Youth (Youth comingSoon=true).
   Groups:
     - hoodoo-suits: Freefly Jacket, Jumpsuit, Pants, Camera Jacket
     - apparel: Male Jersey (Blunt Collar), Hockey
     - ultimate-dog: Ultimate Paw Covers (oneFit unisex)
2. Configurator — left: part list. Center: 3D GLB. Right/bottom: stock swatches for that part’s palette.
   Tap a mesh panel to select that part (meshMap in manifest maps CLO material/mesh names → part id).
   Upload art (png/jpg/webp) per part + scale slider. Clear art.
   If product.embroideryText: show embroidery text field (max 48) when Embroidery part is selected.
   Locked palettes (body black, spandex black): show note, no other colors.
3. Sizing — 3D wireframe avatar + measurement close-up + form.
   Fields: units (Imperial lbs/in | Metric kg/cm), height, weight, chest, waist, torso, leg, inseam, arm.
   Copy for each field must match MEASURES in suit-configurator.js (do not rewrite the inseam/harness language).
   Actions: “Download print & cut files” and “Email this build”.

3D loading
- Load GLB from manifest. Female jumpsuit: try FemaleJumpSuit.glb then FamaleJumpSuit.glb (typo filename on disk).
- Recolor cloned materials per part. Do NOT share one material across parts (CLO often exports one fabric name).
- UPC (gauntlets): body+cuff forced black; trim may be missing in current GLB; embroidery is text+thread (often no mesh).
- Missing GLB: empty/awaiting state. NEVER fall back to a sample duck or random model.
- Orbit/pinch to rotate. Dark studio lighting. Hoodoo watermark OK.

Job payload (MUST match web) — POST /api/production/pack
Content-Type: application/json
Response: application/zip (print/cut pack)

{
  "jobId": "hoodoo-{productId}-{fit}-{timestamp}",
  "pattern": "{productId}-{fit}",
  "product": "jumpsuit",
  "productName": "Jumpsuit",
  "fit": "male",
  "parts": { "frontTorso": "#00aea7", "collar": "#000000" },
  "partDetails": {
    "frontTorso": { "hex": "#00aea7", "color": "#00aea7", "name": "Turquoise", "material": "taslan" },
    "embroidery": { "hex": "#FFFFFF", "color": "#FFFFFF", "name": "White", "material": "embroidery", "embroideryText": "SHANNON" }
  },
  "embroideryText": "SHANNON",
  "art": { "frontTorso": "data:image/png;base64,..." },
  "sizing": {
    "units": "Imperial (lbs/inches)",
    "fit": "male",
    "gender": "male",
    "height": "70", "weight": "180", "chest": "40", "waist": "32",
    "torso": "18", "leg": "24", "inseam": "32", "arm": "25"
  },
  "notes": "Hoodoo configurator",
  "customer": { "email": "", "name": "" }
}

Email build: mailto:shannnon@hoodooak.com with subject “Hoodoo build — {productName} {fit}” and the same fields as text (web does this if pack download isn’t wanted).

Part palettes (materials.parts + product.partPalette)
- taslan: stock chart only (Red, Charcoal, Navy, White, Royal, OD-Khaki, Crimson, Khaki, Chocolate, Silver, Raven, Canary, Blooming Pink, Tangerine, Apple Green, Cobalt, Turquoise, Purple, … as in materials.json)
- spandex: Black only
- stitch: thread colors from materials.json
- body: Black locked
- embroidery: thread colors from materials.json + text field

Typical parts
- Jacket: collar, front, back, sleeves, zipper, waistband, stitch
- Jumpsuit: collar, frontTorso, backTorso, sleeves, frontLegs, backLegs, zipper, stitch
- Pants: legs, booties, cordura, trim
- UPC: body, trim, embroidery
- Male jersey: collar, front, back, sleeves, waistband(Hem), stitch
- Hockey: collar, yoke, front, back, sleeves, sleeveStripe1/2/3, hemStripe1/2/3, stitch

============================================================
B. SHOP CONFIGURATOR
============================================================

GET /api/catalog  → categories, products, optionGroups, addons, inventory, prices.
Add to cart:
POST /api/cart/items
{ "product_slug": "upc-custom", "quantity": 1, "configuration": { "option_selections": { "fit": "unisex" }, "addon_ids": ["emb-name"] } }

Web cart cookie: hoodoo_cart_id. On iOS: persist configuration locally; when user has Bearer token, POST /api/orders.

GET /api/cart
PATCH /api/cart/items/{id}  { "quantity": n }
DELETE /api/cart/items/{id}
DELETE /api/cart

============================================================
C. EMBROIDERY / QUOTE (already live on web)
============================================================

GET /api/pricing/decoration
  → meta.qtyTiers, embroidery.perPiece (stitch band × qty), digitizingFirst 55, hat blank 14, hatHoop, individualName, garments[].blank

POST /api/quote/estimate
{
  "garment": "hat",
  "quantity": 12,
  "method": "embroidery",
  "stitches": 6000,
  "locations": 1,
  "hasDst": false,
  "textOnly": false,
  "names": 0
}
methods: embroidery | screen | dye-sub
garment ids: tee, heavy-tee, hoodie, crew, hat, jersey, gauntlet, jumpsuit

Hat in the estimate:
- Blank $14 each
- Plus hoop surcharge (qty 1 = $4, scales down)
- Plus stitch band rate
- Plus $55 digitize unless hasDst

No order minimum. Per-piece stitch price drops at 1, 6, 12, 24, 48, 72, 144.

============================================================
AUTH
============================================================

POST /api/auth/register
JSON { "email", "password" (>=8), "full_name"?, "username"? } → { "access_token", "token_type": "bearer" }

POST /api/auth/token
application/x-www-form-urlencoded  (OAuth2 password)
username={email or handle}&password={password}
→ { "access_token", "token_type": "bearer" }

GET /api/auth/me
Authorization: Bearer {token}
→ { id, email, username, full_name, role }

POST /api/auth/forgot-password  JSON { "email" }
POST /api/auth/reset-password   JSON { "token", "password" }

POST /api/orders
Authorization: Bearer
{ "lines": [ { "product_slug", "quantity", "configuration" } ], "customer_note": "" }
→ order with line snapshots

GET /api/orders
GET /api/orders/{uuid}

============================================================
iOS SCREENS TO BUILD
============================================================

Tab / root (Night Ops dark, Hoodoo logo)
1. Home — brand, services, CTA: Build a suit / Quote / Shop
2. Suits (3D configurator) — the 3-step flow
3. Shop — catalog configurator
4. Quote — live embroidery estimator
5. Cart / Account — login, orders, email estimate

Nice-to-have first ship: WKWebView of https://www.hoodooak.com/suit.html inside the Suits tab so 3D works THIS WEEK, then replace with native SceneKit/RealityKit using the same GLBs + job JSON. Native is the goal; WebView is only a temporary shell, not the product.

============================================================
DO THIS FIRST ON THE MAC
============================================================

1. Confirm Xcode + team signing. Suggested bundle id: com.hoodooak.app (or whatever is already in the project — do not change if one exists).
2. Single API client: base URL https://www.hoodooak.com  (no trailing slash). Debug override to http://127.0.0.1:8004 if they run Docker locally.
3. Fetch manifest.json + materials.json on launch; cache; respect ?v= cache busters.
4. Implement Quote screen against /api/quote/estimate (no 3D required) so something ships immediately.
5. Implement Pattern → Configurator → Sizing with GLB load + stock swatches.
6. POST /api/production/pack and share the zip (Files / Mail).
7. Match empty/error states: missing GLB, pack failed, estimate failed.

Do not:
- Invent extra garments or colors
- Price per ink-color for embroidery (thread colors are included)
- Use MalfunctionDZ / ASC Manifest APIs — this is a different product
- Point at sample 3D models
```

---

## What’s already done on the website (do not rebuild)

| Piece | URL | Notes |
|--------|-----|--------|
| Home | `/` | Brand, services, CTAs |
| 3D suits | `/suit.html` | CLO GLB configurator, 3 steps |
| Shop catalog | `/configurator.html` | Inventory + options |
| Pricing tables | `/pricing.html` | Embroidery stitch × qty |
| Instant quote | `/quote.html` | Live estimate |
| Cart / account | `/cart.html` `/login.html` `/account.html` | JWT + cookie cart |
| CLO assets | `/3d/clo/` | GLBs + `manifest.json` |
| Stock colors | `/data/materials.json` | Taslan chart |
| Admin 3D editor | `/admin/configurator` | Staff only — not in customer iOS |

---

## Suggested Mac workflow

```bash
# If the iOS repo is already on the Mac:
cd ~/projects/hoodoo-ios   # or whatever the Xcode project folder is
# Paste the prompt above into Cursor and run it.

# Web reference (optional clone):
# git clone … hoodoo
# Live API always: https://www.hoodooak.com/api/health  → {"status":"ok"}
```

After coding: iPad Simulator, walk Pattern → Jumpsuit → Male → change Front to Turquoise → Sizing → Email this build. Then Quote → Hat → qty 12 → confirm blank $14 + hoop + stitch + digitize.
