/*!
 * Portable site-guide chat widget.
 * Drop this script on any page. Optional: window.SITE_GUIDE = { prefix: "/api/guide" }
 * Branding comes from GET {prefix}/config and CSS variables (--brand, --ink, --paper, …).
 */
(function (global) {
  if (global.__SITE_GUIDE_LOADED) return;
  global.__SITE_GUIDE_LOADED = true;

  var cfg = global.SITE_GUIDE || {};
  var prefix = (cfg.prefix || "/api/guide").replace(/\/$/, "");
  var history = [];
  var open = false;
  var busy = false;
  var shadow;
  var els = {};

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function authHeader() {
    var token =
      (global.HoodooApi && global.HoodooApi.getToken && global.HoodooApi.getToken()) ||
      (cfg.getToken && cfg.getToken()) ||
      "";
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function theme() {
    var accent = (cfg.theme && cfg.theme.accent) || cssVar("--brand", "#36b4e5");
    return {
      accent: accent,
      ink: cssVar("--ink", "#0a0b0d"),
      inkSoft: cssVar("--ink-soft", "#12151a"),
      slate: cssVar("--slate", "#1c2229"),
      paper: cssVar("--paper", "#e8ecf1"),
      muted: cssVar("--muted", "#8b95a5"),
      display: cssVar("--font-display", "Syne, system-ui, sans-serif"),
      body: cssVar("--font-body", "DM Sans, system-ui, sans-serif"),
    };
  }

  function styles(t) {
    return (
      ":host{all:initial;position:fixed;inset:0;z-index:360;pointer-events:none;font-family:" +
      t.body +
      ";}" +
      "*{box-sizing:border-box}" +
      "button,input,textarea{font:inherit}" +
      ".wrap{position:absolute;right:1.1rem;bottom:1.1rem;display:flex;flex-direction:column;align-items:flex-end;gap:0.7rem;pointer-events:none}" +
      ".launcher,.panel{pointer-events:auto}" +
      ".launcher{display:flex;align-items:center;gap:0.55rem;padding:0.7rem 0.95rem 0.7rem 0.75rem;border:0;border-radius:999px;cursor:pointer;color:" +
      t.ink +
      ";background:" +
      t.accent +
      ";box-shadow:0 10px 28px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.08);transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}" +
      ".launcher:hover,.launcher:focus-visible{transform:translateY(-1px);outline:none;box-shadow:0 14px 32px rgba(0,0,0,.4),0 0 0 2px " +
      t.accent +
      "}" +
      ".launcher svg{width:1.35rem;height:1.35rem;flex:0 0 auto}" +
      ".launcher-label{font-weight:700;font-size:.9rem;letter-spacing:.01em}" +
      ".panel{width:min(24.5rem,calc(100vw - 1.5rem));height:min(36rem,calc(100vh - 6.5rem));display:flex;flex-direction:column;overflow:hidden;border-radius:18px;background:linear-gradient(180deg," +
      t.inkSoft +
      " 0%," +
      t.ink +
      " 100%);color:" +
      t.paper +
      ";border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 60px rgba(0,0,0,.5)}" +
      ".panel[hidden]{display:none !important}" +
      ".head{display:flex;align-items:center;gap:.7rem;padding:.85rem .9rem .8rem;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}" +
      ".mark{width:2rem;height:2rem;border-radius:10px;display:grid;place-items:center;background:" +
      t.accent +
      ";color:" +
      t.ink +
      ";flex:0 0 auto}" +
      ".mark svg{width:1.1rem;height:1.1rem}" +
      ".head-copy{flex:1;min-width:0}" +
      ".head-title{margin:0;font-family:" +
      t.display +
      ";font-size:1rem;font-weight:800;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".head-sub{margin:.1rem 0 0;color:" +
      t.muted +
      ";font-size:.75rem}" +
      ".icon-btn{width:2rem;height:2rem;border:0;border-radius:8px;background:transparent;color:" +
      t.paper +
      ";cursor:pointer}" +
      ".icon-btn:hover,.icon-btn:focus-visible{background:rgba(255,255,255,.08);outline:none}" +
      ".log{flex:1;overflow:auto;padding:.9rem;display:flex;flex-direction:column;gap:.7rem;scrollbar-width:thin}" +
      ".bubble{max-width:92%;padding:.7rem .8rem;border-radius:14px;font-size:.9rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}" +
      ".bubble a{color:" +
      t.accent +
      ";text-decoration:underline}" +
      ".from-bot{align-self:flex-start;background:" +
      t.slate +
      ";border:1px solid rgba(255,255,255,.06)}" +
      ".from-user{align-self:flex-end;background:" +
      t.accent +
      ";color:" +
      t.ink +
      ";font-weight:550}" +
      ".links{display:flex;flex-wrap:wrap;gap:.4rem;margin:.55rem 0 0}" +
      ".chip{display:inline-flex;align-items:center;padding:.32rem .7rem;border-radius:999px;text-decoration:none;font-size:.78rem;font-weight:700;color:" +
      t.accent +
      ";background:transparent;border:1px solid " +
      t.accent +
      "}" +
      ".chip:hover{filter:brightness(1.08)}" +
      ".suggest{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.15rem}" +
      ".suggest button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:" +
      t.paper +
      ";border-radius:999px;padding:.35rem .65rem;cursor:pointer;font-size:.75rem}" +
      ".suggest button:hover,.suggest button:focus-visible{border-color:" +
      t.accent +
      ";outline:none}" +
      ".composer{display:flex;gap:.45rem;padding:.7rem;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.2)}" +
      ".composer input{flex:1;min-width:0;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:" +
      t.inkSoft +
      ";color:" +
      t.paper +
      ";padding:.65rem .75rem}" +
      ".composer input:focus{outline:2px solid " +
      t.accent +
      ";outline-offset:0}" +
      ".send{border:0;border-radius:12px;background:" +
      t.accent +
      ";color:" +
      t.ink +
      ";font-weight:700;padding:.65rem .85rem;cursor:pointer}" +
      ".send:disabled{opacity:.55;cursor:wait}" +
      ".status{color:" +
      t.muted +
      ";font-size:.78rem}" +
      ".pulse{position:absolute;inset:-3px;border-radius:inherit;border:2px solid " +
      t.accent +
      ";opacity:.55;animation:sgpulse 2.4s ease-out infinite;pointer-events:none}" +
      "@keyframes sgpulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.18);opacity:0}}" +
      "@media (max-width:560px){.wrap{right:.7rem;bottom:.7rem}.panel{width:calc(100vw - 1.4rem);height:min(78vh,36rem)}.launcher-label{display:none}.launcher{padding:.85rem}}"
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatText(s) {
    var html = escapeHtml(s);
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(
      /\b(https?:\/\/[^\s<]+)/g,
      '<a href="$1" rel="noopener noreferrer">$1</a>'
    );
    html = html.replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      function (m) {
        return '<a href="mailto:' + m + '">' + m + "</a>";
      }
    );
    html = html.replace(/\b(\d{3}[.\-\s]\d{3}[.\-\s]\d{4})\b/g, function (m) {
      var digits = m.replace(/\D/g, "");
      return '<a href="tel:+1' + digits + '">' + m + "</a>";
    });
    return html;
  }

  function iconChat() {
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H12l-4.2 3.2A.8.8 0 0 1 6.5 18.6V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  function mount(meta) {
    var t = theme();
    if (meta.theme && meta.theme.accent) t.accent = meta.theme.accent;
    var host = document.createElement("div");
    host.id = "site-guide-host";
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" +
      styles(t) +
      "</style>" +
      '<div class="wrap">' +
      '  <div class="panel" hidden role="dialog" aria-labelledby="sg-title" aria-modal="false">' +
      '    <div class="head">' +
      '      <div class="mark">' +
      iconChat() +
      "</div>" +
      '      <div class="head-copy">' +
      '        <p class="head-title" id="sg-title"></p>' +
      '        <p class="head-sub"></p>' +
      "      </div>" +
      '      <button type="button" class="icon-btn" data-close aria-label="Close chat">✕</button>' +
      "    </div>" +
      '    <div class="log" role="log" aria-live="polite"></div>' +
      '    <form class="composer">' +
      '      <input type="text" maxlength="800" autocomplete="off" />' +
      '      <button type="submit" class="send">Send</button>' +
      "    </form>" +
      "  </div>" +
      '  <button type="button" class="launcher" aria-expanded="false">' +
      '    <span class="pulse" aria-hidden="true"></span>' +
      iconChat() +
      '    <span class="launcher-label"></span>' +
      "  </button>" +
      "</div>";

    els.panel = shadow.querySelector(".panel");
    els.log = shadow.querySelector(".log");
    els.form = shadow.querySelector("form");
    els.input = shadow.querySelector("input");
    els.send = shadow.querySelector(".send");
    els.launcher = shadow.querySelector(".launcher");
    els.close = shadow.querySelector("[data-close]");
    els.title = shadow.querySelector(".head-title");
    els.sub = shadow.querySelector(".head-sub");
    els.pulse = shadow.querySelector(".pulse");
    els.label = shadow.querySelector(".launcher-label");

    els.title.textContent = meta.name || "Site guide";
    els.sub.textContent = meta.siteName || "";
    els.label.textContent = meta.launcherLabel || "Ask";
    els.input.placeholder = meta.placeholder || "Ask a question…";
    els.launcher.setAttribute("aria-label", meta.launcherLabel || "Open site guide");

    addBot(meta.welcome || "How can I help?", [], meta.suggestions || []);

    els.launcher.addEventListener("click", toggle);
    els.close.addEventListener("click", function () {
      setOpen(false);
    });
    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      send(els.input.value);
    });
    shadow.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  }

  function setOpen(next) {
    open = next;
    els.panel.hidden = !open;
    els.launcher.setAttribute("aria-expanded", open ? "true" : "false");
    if (els.pulse) els.pulse.hidden = true;
    if (open) {
      els.input.focus();
      els.log.scrollTop = els.log.scrollHeight;
    } else {
      els.launcher.focus();
    }
  }

  function go(href) {
    try {
      var url = new URL(href, location.href);
      if (url.origin === location.origin) {
        var next = url.pathname + url.search + url.hash;
        if (url.hash && url.pathname === location.pathname) {
          location.hash = url.hash;
          var id = url.hash.replace(/^#/, "");
          var el = id ? document.getElementById(id) : null;
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        location.assign(next);
        return;
      }
    } catch (err) {}
    location.assign(href);
  }

  function toggle() {
    setOpen(!open);
  }

  function addUser(text) {
    var div = document.createElement("div");
    div.className = "bubble from-user";
    div.textContent = text;
    els.log.appendChild(div);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function addBot(text, links, suggestions) {
    var wrap = document.createElement("div");
    wrap.className = "bubble from-bot";
    wrap.innerHTML = formatText(text);
    if (links && links.length) {
      var row = document.createElement("div");
      row.className = "links";
      links.forEach(function (link) {
        if (!link || !link.href) return;
        var a = document.createElement("a");
        a.className = "chip";
        a.href = link.href;
        a.textContent = link.label || link.href;
        a.addEventListener("click", function (e) {
          var href = a.getAttribute("href") || "";
          if (!href || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return;
          if (href.charAt(0) === "/" || href.charAt(0) === "#") {
            e.preventDefault();
            go(href);
          }
        });
        row.appendChild(a);
      });
      wrap.appendChild(row);
    }
    if (suggestions && suggestions.length) {
      var sug = document.createElement("div");
      sug.className = "suggest";
      suggestions.forEach(function (q) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = q;
        b.addEventListener("click", function () {
          send(q);
        });
        sug.appendChild(b);
      });
      wrap.appendChild(sug);
    }
    els.log.appendChild(wrap);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function addStatus(text) {
    var p = document.createElement("p");
    p.className = "status";
    p.textContent = text;
    els.log.appendChild(p);
    return p;
  }

  function send(raw) {
    var text = String(raw || "").trim();
    if (!text || busy) return;
    if (!open) setOpen(true);
    els.input.value = "";
    addUser(text);
    history.push({ role: "user", content: text });
    if (history.length > 12) history = history.slice(-12);
    busy = true;
    els.send.disabled = true;
    var pending = addStatus("Looking that up…");
    var headers = Object.assign({ "Content-Type": "application/json" }, authHeader());
    fetch(prefix + "/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: headers,
      body: JSON.stringify({
        message: text,
        page: location.pathname + location.hash,
        messages: history.slice(0, -1),
      }),
    })
      .then(function (r) {
        return r.text().then(function (body) {
          var data = null;
          try {
            data = body ? JSON.parse(body) : null;
          } catch (e) {
            data = null;
          }
          if (!r.ok) {
            var err = (data && (data.detail || data.error)) || r.statusText || "Request failed";
            throw new Error(typeof err === "string" ? err : "Request failed");
          }
          return data;
        });
      })
      .then(function (data) {
        pending.remove();
        var reply = (data && data.reply) || "I could not find that.";
        var links = (data && data.links) || [];
        addBot(reply, links);
        history.push({ role: "assistant", content: reply });
      })
      .catch(function (err) {
        pending.remove();
        addBot(err.message || "Something went wrong. Try again, or contact the shop.");
      })
      .finally(function () {
        busy = false;
        els.send.disabled = false;
        els.input.focus();
      });
  }

  function boot() {
    fetch(prefix + "/config", { credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (meta) {
        if (!meta || meta.enabled === false) return;
        mount(meta);
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : this);
