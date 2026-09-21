# Site guide (portable chat)

A drop-in assistant that answers from a **site knowledge JSON** file. Copy these three pieces onto Hoodoo, MalfunctionDZ, or any other FastAPI + static site:

| Piece | Role |
| --- | --- |
| `js/site-guide.js` | Floating chat widget (shadow DOM, no CSS collisions) |
| `backend/app/site_guide.py` | `/api/guide/config` + `/api/guide/chat` |
| `data/site-guide.json` | Pages, facts, contact, tone — **this is the only file that should change per site** |

`knowledge.example.json` in this folder is a blank template.

## Hoodoo

Already wired. Public pages load `/js/site-guide.js`. Knowledge lives at `data/site-guide.json`.

The guide works **without an LLM** (keyword retrieval over that JSON). To get fuller phrasing, set an OpenAI-compatible key:

```
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Any Chat Completions-compatible host works (`OPENAI_BASE_URL` can point at OpenRouter, Azure, a local proxy, etc.).

## Port to MalfunctionDZ (or another site)

1. Copy `js/site-guide.js` and `site_guide.py` into that app.
2. Copy `knowledge.example.json` → `data/site-guide.json` and fill in:
   - `site`, `assistant`, `contact`, `theme.accent`
   - `pages` (id, title, path, audience, summary, keywords)
   - `facts` (what to say, with `links: [{ "id": "page-id" }]`)
   - `rules` (what the model must not invent)
   - `synonyms` (optional query expansions)
3. Include the router:

```python
from app.site_guide import router as site_guide_router
app.include_router(site_guide_router, prefix="/api")
```

4. Add settings (names match Hoodoo’s `app/config.py`):

```python
openai_api_key: str | None = None
openai_base_url: str = "https://api.openai.com/v1"
openai_model: str = "gpt-4o-mini"
site_guide_knowledge_path: str = "data/site-guide.json"
site_guide_enabled: bool = True
site_guide_rate_per_minute: int = 20
```

5. On every page:

```html
<script src="/js/site-guide.js"></script>
```

If the API is not same-origin:

```html
<script>
  window.SITE_GUIDE = { prefix: "https://example.com/api/guide" };
</script>
<script src="/js/site-guide.js"></script>
```

6. Optional staff awareness: if the host exposes `get_current_user_optional` (Hoodoo) or a Bearer token via `window.SITE_GUIDE.getToken`, the guide can show `audience: "staff"` pages. Public visitors only get `audience: "public"` facts and links.

## Audience

- `public` — everyone
- `customer` — signed-in users
- `staff` — staff/admin only (do not send public visitors to those URLs)

## Editing answers

Change `data/site-guide.json` and save. The API reloads it from disk on the next request (mtime cache), no rebuild.
