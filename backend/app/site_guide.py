"""Portable site-guide chat.

Drop this module into another FastAPI app, point ``SITE_GUIDE_KNOWLEDGE_PATH``
at that site's JSON, include ``router`` under ``/api``, and add ``js/site-guide.js``.

Works without an LLM (keyword retrieval). If ``OPENAI_API_KEY`` is set, answers
are written with an OpenAI-compatible Chat Completions API.
"""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import get_settings

logger = logging.getLogger(__name__)

try:
    from app.deps import get_current_user_optional as _get_user
except ImportError:  # pragma: no cover - other hosts stub this
    def _get_user() -> Any:  # type: ignore[misc]
        return None

router = APIRouter(prefix="/guide", tags=["site-guide"])

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOP = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "of",
    "for",
    "in",
    "on",
    "at",
    "is",
    "are",
    "do",
    "you",
    "your",
    "we",
    "i",
    "me",
    "my",
    "can",
    "please",
    "help",
    "with",
    "this",
    "that",
    "it",
}
_GREET = {"hi", "hello", "hey", "yo", "howdy", "sup"}

_knowledge_cache: tuple[float, Path, dict[str, Any]] | None = None
_rate: dict[str, list[float]] = {}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=800)
    page: str | None = Field(default=None, max_length=200)
    messages: list[ChatMessage] = Field(default_factory=list, max_length=12)


class LinkOut(BaseModel):
    label: str
    href: str


class ChatOut(BaseModel):
    reply: str
    links: list[LinkOut] = Field(default_factory=list)
    source: str = "retrieval"


def _repo_root() -> Path:
    settings = get_settings()
    if settings.repo_root:
        return Path(settings.repo_root).resolve()
    return Path(__file__).resolve().parent.parent.parent


def knowledge_path() -> Path:
    settings = get_settings()
    path = Path(settings.site_guide_knowledge_path)
    if not path.is_absolute():
        path = _repo_root() / path
    return path


def load_knowledge() -> dict[str, Any]:
    global _knowledge_cache
    path = knowledge_path()
    try:
        mtime = path.stat().st_mtime
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Site guide knowledge is missing") from exc
    if _knowledge_cache and _knowledge_cache[0] == mtime and _knowledge_cache[1] == path:
        return _knowledge_cache[2]
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise HTTPException(status_code=503, detail="Site guide knowledge is invalid")
    _knowledge_cache = (mtime, path, data)
    return data


def _tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOP and len(t) > 1}


def _expand(tokens: set[str], knowledge: dict[str, Any]) -> set[str]:
    extra: set[str] = set()
    synonyms = knowledge.get("synonyms") or {}
    if not isinstance(synonyms, dict):
        return tokens
    blob = " ".join(tokens)
    for canon, alts in synonyms.items():
        canon_tokens = set(_TOKEN_RE.findall(str(canon))) | {str(canon).lower()}
        matched = bool(tokens & (canon_tokens - _STOP))
        matched_bits = set(canon_tokens)
        if isinstance(alts, list):
            for alt in alts:
                alt_tokens = set(_TOKEN_RE.findall(str(alt))) - _STOP
                alt_l = str(alt).lower()
                hit = bool(alt_tokens and alt_tokens <= tokens)
                if not hit and " " in alt_l and alt_l in blob:
                    hit = True
                    alt_tokens = set(_TOKEN_RE.findall(alt_l)) - _STOP
                if hit:
                    matched = True
                    matched_bits |= alt_tokens
        if matched:
            extra |= matched_bits
    return tokens | extra


def _allowed(audience: str, item_audience: str | None) -> bool:
    need = (item_audience or "public").lower()
    if need == "public":
        return True
    if need == "customer":
        return audience in ("customer", "staff")
    if need == "staff":
        return audience == "staff"
    return True


def _pages(knowledge: dict[str, Any]) -> list[dict[str, Any]]:
    pages = knowledge.get("pages") or []
    return [p for p in pages if isinstance(p, dict) and p.get("id")]


def _facts(knowledge: dict[str, Any]) -> list[dict[str, Any]]:
    facts = knowledge.get("facts") or []
    return [f for f in facts if isinstance(f, dict) and f.get("id")]


def _item_text(item: dict[str, Any]) -> str:
    bits = [
        str(item.get("title") or ""),
        str(item.get("summary") or ""),
        str(item.get("body") or ""),
        str(item.get("path") or ""),
        " ".join(str(k) for k in (item.get("keywords") or [])),
    ]
    return " ".join(bits)


def score_item(query: str, query_tokens: set[str], item: dict[str, Any]) -> float:
    hay = _tokens(_item_text(item))
    if not hay:
        return 0.0
    overlap = query_tokens & hay
    if not overlap:
        return 0.0
    score = float(len(overlap))
    title_tokens = _tokens(str(item.get("title") or ""))
    score += 1.5 * len(query_tokens & title_tokens)
    qlow = query.lower()
    for raw in item.get("keywords") or []:
        phrase = str(raw).lower()
        if " " in phrase and phrase in qlow:
            score += 2.0
        kt = set(_TOKEN_RE.findall(phrase)) - _STOP
        if kt and kt <= query_tokens:
            score += 1.25
    score += 0.15 * len(overlap) / max(len(hay), 1)
    return score


def retrieve(knowledge: dict[str, Any], query: str, audience: str, limit: int = 5) -> list[dict[str, Any]]:
    q = _expand(_tokens(query), knowledge)
    if not q:
        return []
    ranked: list[tuple[float, dict[str, Any]]] = []
    for item in (*_facts(knowledge), *_pages(knowledge)):
        if not _allowed(audience, item.get("audience")):
            continue
        s = score_item(query, q, item)
        if s > 0:
            ranked.append((s, item))
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    if not ranked:
        return []
    top = ranked[0][0]
    cutoff = max(1.6, top * 0.55)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for score, item in ranked:
        if score < cutoff:
            continue
        iid = str(item["id"])
        if iid in seen:
            continue
        seen.add(iid)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def _page_by_id(knowledge: dict[str, Any], page_id: str) -> dict[str, Any] | None:
    for page in _pages(knowledge):
        if page.get("id") == page_id:
            return page
    return None


def _contact_links(knowledge: dict[str, Any]) -> list[dict[str, str]]:
    contact = knowledge.get("contact") or {}
    links: list[dict[str, str]] = []
    email = contact.get("email")
    phone = contact.get("phone")
    phone_href = contact.get("phoneHref") or (f"tel:{phone}" if phone else None)
    if email:
        links.append({"label": email, "href": f"mailto:{email}"})
    if phone and phone_href:
        links.append({"label": phone, "href": str(phone_href)})
    page = _page_by_id(knowledge, "contact") or _page_by_id(knowledge, "home")
    if page and page.get("path"):
        links.append({"label": page.get("title") or "Contact", "href": str(page["path"])})
    return links


def resolve_links(
    knowledge: dict[str, Any],
    items: list[dict[str, Any]],
    link_ids: list[str] | None,
    audience: str,
) -> list[dict[str, str]]:
    wanted: list[str] = []
    for iid in link_ids or []:
        if iid and iid not in wanted:
            wanted.append(iid)
    for item in items:
        for ref in item.get("links") or []:
            if isinstance(ref, dict):
                rid = str(ref.get("id") or "")
                if rid and rid not in wanted:
                    wanted.append(rid)
            elif isinstance(ref, str) and ref not in wanted:
                wanted.append(ref)
        if item.get("path") and str(item.get("id")) not in wanted:
            wanted.append(str(item["id"]))
        for anchor in item.get("anchors") or []:
            if isinstance(anchor, dict) and anchor.get("href"):
                wanted.append(f"anchor:{anchor.get('label')}|{anchor.get('href')}")

    links: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(label: str, href: str) -> None:
        if not href or href in seen:
            return
        seen.add(href)
        links.append({"label": label, "href": href})

    for token in wanted:
        if token.startswith("anchor:"):
            rest = token[7:]
            if "|" not in rest:
                continue
            label, href = rest.split("|", 1)
            if audience != "staff" and not _public_href(knowledge, href):
                continue
            add(label, href)
            continue
        page = _page_by_id(knowledge, token)
        if not page:
            continue
        href = str(page.get("path") or "")
        if not href:
            continue
        if not _allowed(audience, page.get("audience")):
            continue
        if audience != "staff" and page.get("audience") == "staff":
            continue
        add(str(page.get("title") or href), href)
    return links[:8]


def _public_href(knowledge: dict[str, Any], href: str) -> bool:
    for page in _pages(knowledge):
        path = str(page.get("path") or "")
        if path and (href == path or href.startswith(path + "#") or path.startswith(href)):
            return _allowed("public", page.get("audience"))
    return href.startswith("/#") or href in ("/", "/login", "/forgot-password", "/reset-password")


def contact_fallback(knowledge: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    contact = knowledge.get("contact") or {}
    name = (knowledge.get("site") or {}).get("name") or "the shop"
    email = contact.get("email") or "the shop email"
    phone = contact.get("phone") or "the shop phone"
    reply = (
        f"I don't have that on the {name} site yet. "
        f"Email {email} or call {phone} and they'll help you spec the job."
    )
    return reply, _contact_links(knowledge)


def fallback_reply(
    knowledge: dict[str, Any],
    query: str,
    hits: list[dict[str, Any]],
    audience: str,
) -> tuple[str, list[dict[str, str]]]:
    qtok = _tokens(query)
    if qtok <= _GREET or not qtok:
        welcome = (knowledge.get("assistant") or {}).get("welcome") or "How can I help you find something?"
        return welcome, resolve_links(knowledge, [], ["home", "contact", "services"], audience)

    if not hits:
        return contact_fallback(knowledge)

    bodies = [h for h in hits if str(h.get("body") or "").strip()]
    chosen = bodies[:2] or hits[:2]
    parts: list[str] = []
    for item in chosen:
        body = str(item.get("body") or item.get("summary") or "").strip()
        if body and body not in parts:
            parts.append(body)
    if not parts:
        return contact_fallback(knowledge)

    links = resolve_links(knowledge, chosen, None, audience)
    if not links:
        links = _contact_links(knowledge)
    return "\n\n".join(parts), links


def _llm_enabled() -> bool:
    settings = get_settings()
    return bool(settings.openai_api_key)


def _knowledge_context(knowledge: dict[str, Any], hits: list[dict[str, Any]], audience: str) -> str:
    blocks: list[str] = []
    site = knowledge.get("site") or {}
    contact = knowledge.get("contact") or {}
    blocks.append(f"Site: {site.get('name')} — {site.get('tagline')}")
    if contact:
        blocks.append(
            "Contact: "
            + ", ".join(
                str(v)
                for v in (contact.get("email"), contact.get("phone"), contact.get("mail"))
                if v
            )
        )
    rules = knowledge.get("rules") or []
    if rules:
        blocks.append("Rules:\n- " + "\n- ".join(str(r) for r in rules))
    for item in hits:
        kind = "page" if item.get("path") else "fact"
        aud = item.get("audience") or "public"
        body = item.get("body") or item.get("summary") or ""
        path = f" path={item.get('path')}" if item.get("path") else ""
        blocks.append(f"[{kind} id={item.get('id')} audience={aud}{path}] {item.get('title')}: {body}")
    visible_pages = [
        p for p in _pages(knowledge) if _allowed(audience, p.get("audience"))
    ]
    catalog = ", ".join(
        f"{p.get('id')} ({p.get('title')} -> {p.get('path')})"
        for p in visible_pages
        if audience == "staff" or p.get("audience") != "staff"
    )
    if catalog:
        blocks.append("Linkable pages: " + catalog)
    return "\n\n".join(blocks)


def _parse_llm_json(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    if isinstance(data, dict) and isinstance(data.get("reply"), str):
        return data
    return None


def llm_reply(
    knowledge: dict[str, Any],
    query: str,
    history: list[ChatMessage],
    hits: list[dict[str, Any]],
    audience: str,
    page: str | None,
) -> dict[str, Any] | None:
    settings = get_settings()
    key = settings.openai_api_key
    if not key:
        return None
    assistant = knowledge.get("assistant") or {}
    name = assistant.get("name") or "site guide"
    site_name = (knowledge.get("site") or {}).get("name") or "this site"
    system = (
        f"You are {name}, a navigation assistant for {site_name}. "
        "Answer only from the knowledge block. Be brief (2–5 sentences). "
        "Return JSON only: {\"reply\": string, \"link_ids\": [string]}. "
        "link_ids must be ids from the provided pages/facts. "
        f"Visitor audience: {audience}. Current page: {page or '/'}."
    )
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system + "\n\n" + _knowledge_context(knowledge, hits, audience)},
    ]
    for msg in history[-8:]:
        messages.append({"role": msg.role, "content": msg.content[:800]})
    messages.append({"role": "user", "content": query})
    payload = {
        "model": settings.openai_model,
        "temperature": 0.2,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }
    url = settings.openai_base_url.rstrip("/") + "/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")[:400]
        logger.warning("site-guide LLM HTTP %s: %s", exc.code, err)
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("site-guide LLM failed: %s", exc)
        return None
    try:
        raw = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    return _parse_llm_json(raw if isinstance(raw, str) else "")


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


def _rate_ok(ip: str) -> bool:
    settings = get_settings()
    now = time.time()
    window = 60.0
    bucket = [t for t in _rate.get(ip, []) if now - t < window]
    if len(bucket) >= settings.site_guide_rate_per_minute:
        _rate[ip] = bucket
        return False
    bucket.append(now)
    _rate[ip] = bucket
    return True


def _audience(request: Request, user: Any) -> str:
    if user is not None:
        role = getattr(user, "role", None)
        if role in ("staff", "admin"):
            return "staff"
        if role:
            return "customer"
    session = request.scope.get("session") or {}
    if session.get("role") in ("staff", "admin"):
        return "staff"
    return "public"


def public_config(knowledge: dict[str, Any]) -> dict[str, Any]:
    assistant = knowledge.get("assistant") or {}
    site = knowledge.get("site") or {}
    theme = knowledge.get("theme") or {}
    return {
        "enabled": True,
        "siteName": site.get("shortName") or site.get("name") or "Guide",
        "name": assistant.get("name") or "Site guide",
        "launcherLabel": assistant.get("launcherLabel") or "Ask",
        "welcome": assistant.get("welcome") or "How can I help you find something?",
        "placeholder": assistant.get("placeholder") or "Ask a question…",
        "suggestions": assistant.get("suggestions") or [],
        "theme": {"accent": theme.get("accent") or ""},
        "llm": _llm_enabled(),
    }


@router.get("/config")
def guide_config():
    settings = get_settings()
    if not settings.site_guide_enabled:
        return {"enabled": False}
    return public_config(load_knowledge())


@router.post("/chat", response_model=ChatOut)
def guide_chat(
    body: ChatIn,
    request: Request,
    user: Annotated[Any, Depends(_get_user)],
):
    settings = get_settings()
    if not settings.site_guide_enabled:
        raise HTTPException(status_code=404, detail="Site guide is disabled")
    if not _rate_ok(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many questions — try again in a minute.")
    knowledge = load_knowledge()
    audience = _audience(request, user)
    query = body.message.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Message is empty")

    hits = retrieve(knowledge, query, audience)
    # Public retrieval hides staff items; still pull public facts that mention those tools.
    if not hits:
        hits = retrieve(knowledge, query, "public")

    source = "retrieval"
    reply: str | None = None
    link_ids: list[str] | None = None
    if _llm_enabled():
        llm = llm_reply(knowledge, query, body.messages, hits, audience, body.page)
        if llm:
            reply = str(llm.get("reply") or "").strip()
            raw_ids = llm.get("link_ids") or []
            if isinstance(raw_ids, list):
                link_ids = [str(x) for x in raw_ids if x]
            source = "llm"

    if not reply:
        reply, links = fallback_reply(knowledge, query, hits, audience)
        return ChatOut(reply=reply, links=[LinkOut(**lnk) for lnk in links], source=source)

    links = resolve_links(knowledge, hits, link_ids, audience)
    if not links:
        links = _contact_links(knowledge)
    return ChatOut(reply=reply, links=[LinkOut(**lnk) for lnk in links], source=source)
