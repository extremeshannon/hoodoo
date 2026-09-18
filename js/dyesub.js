(function () {
  var MM = 25.4;
  var HANDLE = 9;
  var state = {
    garment: null,
    jobId: null,
    name: "Untitled print",
    pieceId: null,
    arts: [],
    placements: [],
    baseColor: "#36B4E5",
    baseColors: {},
    zipColor: "#9fa4a5",
    threadColor: "#36B4E5",
    opposingThread: false,
    selectedId: null,
    notes: "",
    role: "",
  };
  var palettes = { taslan: [], pantone: [] };
  var paletteTarget = null;
  var images = {};
  var canvas;
  var ctx;
  var statusEl;

  function qs(id) {
    return document.getElementById(id);
  }

  function sameId(a, b) {
    return String(a || "") === String(b || "");
  }

  function isAdmin() {
    return state.role === "admin";
  }

  function syncRoleUi() {
    var packBtn = qs("btn-pack");
    if (packBtn) packBtn.hidden = !isAdmin();
  }

  function apiError(r, text) {
    var parsed = window.HoodooApi.parseResponse(r, text || "");
    return parsed.error || "Request failed";
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function authHeaders() {
    var h = {};
    var tok = window.HoodooApi && window.HoodooApi.getToken();
    if (tok) h.Authorization = "Bearer " + tok;
    return h;
  }

  function api(path, opts) {
    return window.HoodooApi.fetchJson(path, opts);
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function currentPiece() {
    if (!state.garment) return null;
    var pieces = state.garment.pieces || [];
    return pieces.find(function (p) { return p.id === state.pieceId; }) || pieces[0] || null;
  }

  function defaultColorFor(p) {
    var role = String((p && (p.role || p.id)) || "").toLowerCase();
    if (role.indexOf("collar") !== -1 || role.indexOf("waist") !== -1) return "#000000";
    return "#36B4E5";
  }

  function pieceColor(pid) {
    if (state.baseColors[pid]) return state.baseColors[pid];
    var piece = (state.garment && state.garment.pieces || []).find(function (p) {
      return p.id === pid;
    });
    return defaultColorFor(piece) || state.baseColor || "#36B4E5";
  }

  function ensurePieceColors() {
    if (!state.garment) return;
    (state.garment.pieces || []).forEach(function (p) {
      if (!state.baseColors[p.id]) state.baseColors[p.id] = defaultColorFor(p);
    });
  }

  var previewTimer = 0;

  function refresh3d(immediate) {
    var preview = window.HoodooDyeSub3D;
    if (!preview || !preview.refresh) return;
    function send() {
      previewTimer = 0;
      preview.refresh({
        garment: state.garment,
        baseColor: state.baseColor,
        baseColors: state.baseColors,
        placements: state.placements,
        images: images,
        pieceId: state.pieceId,
        zipColor: state.zipColor,
        threadColor: effectiveThreadColor(),
        opposingThread: state.opposingThread,
      });
    }
    if (previewTimer) window.clearTimeout(previewTimer);
    if (immediate) send();
    else previewTimer = window.setTimeout(send, 70);
  }

  function selectPiece(pid, opts) {
    if (!state.garment || !pid) return;
    var pieces = state.garment.pieces || [];
    if (!pieces.some(function (p) { return p.id === pid; })) return;
    state.pieceId = pid;
    if (!opts || !opts.keepArt) state.selectedId = null;
    renderPieces();
    syncProps();
    draw();
  }

  function placementsOnPiece(pid) {
    return state.placements.filter(function (p) { return p.pieceId === pid; });
  }

  function yDown(pts, heightMm) {
    return (pts || []).map(function (pt) {
      return [pt[0], heightMm - pt[1]];
    });
  }

  function viewTransform(piece, cssW, cssH) {
    var bleed = Number(state.garment.bleedIn || 0.25);
    var win = Number(piece.cutWin) + bleed * 2;
    var hin = Number(piece.cutHin) + bleed * 2;
    var pad = 16;
    var scale = Math.min((cssW - pad * 2) / win, (cssH - pad * 2) / hin);
    var ox = (cssW - win * scale) / 2;
    var oy = (cssH - hin * scale) / 2;
    return { scale: scale, ox: ox, oy: oy, bleed: bleed, win: win, hin: hin };
  }

  function pieceToCanvas(vt, xIn, yIn) {
    return [vt.ox + (vt.bleed + xIn) * vt.scale, vt.oy + (vt.bleed + yIn) * vt.scale];
  }

  function canvasToPiece(vt, x, y) {
    return [(x - vt.ox) / vt.scale - vt.bleed, (y - vt.oy) / vt.scale - vt.bleed];
  }

  function hexRgb(hex) {
    var h = String(hex || "#36B4E5").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16) || 54, parseInt(h.slice(2, 4), 16) || 180, parseInt(h.slice(4, 6), 16) || 229];
  }

  function contrastInk(hex) {
    var rgb = hexRgb(hex);
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return lum > 0.52 ? "#101215" : "#f4f7fb";
  }

  function sewInk(hex) {
    var rgb = hexRgb(hex);
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return lum > 0.52 ? "#e11d8f" : "#ffe14a";
  }

  function fabricThreadColor() {
    return pieceColor("front-pair-a") || pieceColor(state.pieceId) || "#36B4E5";
  }

  function effectiveThreadColor() {
    if (state.opposingThread) return state.threadColor || contrastInk(fabricThreadColor());
    return fabricThreadColor();
  }

  function paintSwatch(btn, hex) {
    if (!btn) return;
    btn.style.background = hex || "#36B4E5";
    btn.dataset.hex = hex || "#36B4E5";
  }

  function syncThreadUi() {
    var row = qs("thread-color-row");
    var box = qs("thread-opposing");
    if (box) box.checked = !!state.opposingThread;
    if (row) row.hidden = !state.opposingThread;
    if (!state.opposingThread) state.threadColor = fabricThreadColor();
    paintSwatch(qs("thread-swatch"), effectiveThreadColor());
    paintSwatch(qs("zip-swatch"), state.zipColor || "#9fa4a5");
  }

  function renderPalette(currentHex) {
    var body = qs("dyesub-palette-body");
    if (!body) return;
    body.innerHTML = "";
    function group(title, colors) {
      if (!colors || !colors.length) return;
      var wrap = document.createElement("div");
      wrap.className = "dyesub-palette-group";
      var h = document.createElement("h4");
      h.textContent = title;
      var grid = document.createElement("div");
      grid.className = "dyesub-swatch-grid";
      colors.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.style.background = c.hex;
        b.title = c.name + (c.id && String(c.id).indexOf("-c") !== -1 ? "" : "") + " " + c.hex;
        b.setAttribute("aria-label", c.name);
        var rgb = hexRgb(c.hex);
        var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
        if (lum > 0.82) b.classList.add("is-light");
        if (String(c.hex).toLowerCase() === String(currentHex || "").toLowerCase()) b.classList.add("is-on");
        b.addEventListener("click", function () {
          applyPaletteHex(c.hex);
        });
        grid.appendChild(b);
      });
      wrap.appendChild(h);
      wrap.appendChild(grid);
      body.appendChild(wrap);
    }
    var hoodoo = [{ id: "hoodoo-cyan", name: "Hoodoo Cyan", hex: "#36B4E5" }].concat(palettes.taslan || []);
    group("Hoodoo Taslan", hoodoo);
    group("Pantone", palettes.pantone || []);
  }

  function openPalette(target, title, currentHex) {
    paletteTarget = target;
    var t = qs("dyesub-palette-title");
    if (t) t.textContent = title || "Color";
    renderPalette(currentHex);
    var pal = qs("dyesub-palette");
    if (pal) pal.hidden = false;
  }

  function closePalette() {
    var pal = qs("dyesub-palette");
    if (pal) pal.hidden = true;
    paletteTarget = null;
  }

  function applyPaletteHex(hex) {
    if (!paletteTarget) return;
    if (paletteTarget.type === "piece") {
      state.baseColors[paletteTarget.id] = hex;
      if (state.pieceId !== paletteTarget.id) {
        state.pieceId = paletteTarget.id;
        state.selectedId = null;
      }
      if (!state.opposingThread) state.threadColor = fabricThreadColor();
      renderPieces();
      syncThreadUi();
      draw();
    } else if (paletteTarget.type === "zip") {
      state.zipColor = hex;
      paintSwatch(qs("zip-swatch"), hex);
      refresh3d(true);
    } else if (paletteTarget.type === "thread") {
      state.threadColor = hex;
      paintSwatch(qs("thread-swatch"), hex);
      refresh3d(true);
    }
    closePalette();
  }

  function loadPalettes() {
    return Promise.all([
      fetch("/data/materials.json", { credentials: "same-origin" }).then(function (r) {
        return r.ok ? r.json() : {};
      }).catch(function () { return {}; }),
      fetch("/data/dyesub/pantone.json", { credentials: "same-origin" }).then(function (r) {
        return r.ok ? r.json() : { colors: [] };
      }).catch(function () { return { colors: [] }; }),
    ]).then(function (pair) {
      palettes.taslan = ((pair[0].taslan && pair[0].taslan.colors) || []).map(function (c) {
        return { id: c.id, name: c.name, hex: c.hex };
      });
      palettes.pantone = (pair[1].colors || []).map(function (c) {
        return { id: c.id, name: "Pantone " + c.name, hex: c.hex };
      });
    });
  }

  function drawPoly(ptsMm, piece, vt, fill, stroke, dash, lineWidth) {
    var hMm = Number(piece.cutHin) * MM;
    var pts = yDown(ptsMm, hMm);
    if (pts.length < 2) return;
    ctx.beginPath();
    pts.forEach(function (pt, i) {
      var xin = pt[0] / MM;
      var yin = pt[1] / MM;
      var c = pieceToCanvas(vt, xin, yin);
      if (i === 0) ctx.moveTo(c[0], c[1]);
      else ctx.lineTo(c[0], c[1]);
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1.5;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.restore();
    }
  }

  function placementCenter(pl) {
    return { x: pl.xIn + pl.wIn / 2, y: pl.yIn + pl.hIn / 2 };
  }

  function drawPlacement(pl, vt, selected) {
    var img = images[pl.artId];
    var c = placementCenter(pl);
    var tl = pieceToCanvas(vt, pl.xIn, pl.yIn);
    var br = pieceToCanvas(vt, pl.xIn + pl.wIn, pl.yIn + pl.hIn);
    var w = br[0] - tl[0];
    var h = br[1] - tl[1];
    var cx = (tl[0] + br[0]) / 2;
    var cy = (tl[1] + br[1]) / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((pl.rotationDeg || 0) * Math.PI) / 180);
    if (pl.flipX) ctx.scale(-1, 1);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = "rgba(54,180,229,0.35)";
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    if (selected) {
      ctx.strokeStyle = "#36B4E5";
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      var hs = HANDLE;
      var corners = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      ctx.fillStyle = "#36B4E5";
      corners.forEach(function (p) {
        ctx.fillRect(p[0] - hs / 2, p[1] - hs / 2, hs, hs);
      });
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(0, -h / 2 - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -h / 2 - 22, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return { cx: cx, cy: cy, w: w, h: h };
  }

  function draw() {
    if (!canvas || !ctx) return;
    var piece = currentPiece();
    var dpr = window.devicePixelRatio || 1;
    var cssW = Math.min(canvas.clientWidth || 800, window.innerWidth || 800);
    var cssH = Math.min(canvas.clientHeight || 480, window.innerHeight || 480);
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#0a0b0d";
    ctx.fillRect(0, 0, cssW, cssH);
    if (!piece) return;
    var vt = viewTransform(piece, cssW, cssH);
    canvas._vt = vt;
    var fabric = pieceColor(piece.id);
    var rgb = hexRgb(fabric);
    var cutInk = contrastInk(fabric);
    var stitchInk = sewInk(fabric);
    drawPoly(piece.cutMm, piece, vt, "rgba(" + rgb.join(",") + ",0.95)", cutInk, null, 2);
    ctx.save();
    ctx.strokeStyle = cutInk;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(vt.ox, vt.oy, vt.win * vt.scale, vt.hin * vt.scale);
    ctx.restore();
    if (piece.sewMm) drawPoly(piece.sewMm, piece, vt, null, stitchInk, [7, 4], 2.25);
    placementsOnPiece(piece.id).forEach(function (pl) {
      drawPlacement(pl, vt, pl.id === state.selectedId);
    });
    var meta = qs("stage-meta");
    if (meta) {
      meta.textContent =
        (piece.label || piece.id) +
        " · CLO " +
        (piece.dxf || "") +
        " · cut " +
        Number(piece.cutWin).toFixed(2) +
        " × " +
        Number(piece.cutHin).toFixed(2) +
        " in · 300 DPI print";
    }
    refresh3d();
  }

  function inverseRotate(x, y, cx, cy, deg) {
    var r = (-(deg || 0) * Math.PI) / 180;
    var dx = x - cx;
    var dy = y - cy;
    return {
      x: cx + dx * Math.cos(r) - dy * Math.sin(r),
      y: cy + dx * Math.sin(r) + dy * Math.cos(r),
    };
  }

  function hitTest(cssX, cssY) {
    var piece = currentPiece();
    if (!piece || !canvas._vt) return null;
    var vt = canvas._vt;
    var list = placementsOnPiece(piece.id).slice().reverse();
    for (var i = 0; i < list.length; i++) {
      var pl = list[i];
      var tl = pieceToCanvas(vt, pl.xIn, pl.yIn);
      var br = pieceToCanvas(vt, pl.xIn + pl.wIn, pl.yIn + pl.hIn);
      var w = br[0] - tl[0];
      var h = br[1] - tl[1];
      var cx = (tl[0] + br[0]) / 2;
      var cy = (tl[1] + br[1]) / 2;
      var local = inverseRotate(cssX, cssY, cx, cy, pl.rotationDeg || 0);
      var lx = local.x - cx;
      var ly = local.y - cy;
      var hs = HANDLE + 4;
      var corners = [
        { name: "nw", x: -w / 2, y: -h / 2 },
        { name: "ne", x: w / 2, y: -h / 2 },
        { name: "se", x: w / 2, y: h / 2 },
        { name: "sw", x: -w / 2, y: h / 2 },
      ];
      for (var c = 0; c < corners.length; c++) {
        if (Math.abs(lx - corners[c].x) <= hs && Math.abs(ly - corners[c].y) <= hs) {
          return { type: "resize", handle: corners[c].name, pl: pl };
        }
      }
      if (Math.abs(lx) <= hs && Math.abs(ly - (-h / 2 - 22)) <= hs + 2) {
        return { type: "rotate", pl: pl };
      }
      if (lx >= -w / 2 && lx <= w / 2 && ly >= -h / 2 && ly <= h / 2) {
        return { type: "move", pl: pl };
      }
    }
    return null;
  }

  function selected() {
    return state.placements.find(function (p) { return p.id === state.selectedId; }) || null;
  }

  function syncProps() {
    var box = qs("sel-props");
    var pl = selected();
    if (!box) return;
    if (!pl) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    qs("prop-w").value = pl.wIn.toFixed(2);
    qs("prop-h").value = pl.hIn.toFixed(2);
    qs("prop-x").value = pl.xIn.toFixed(2);
    qs("prop-y").value = pl.yIn.toFixed(2);
    qs("prop-rot").value = Number(pl.rotationDeg || 0).toFixed(0);
  }

  function renderPieces() {
    var ul = qs("piece-list");
    if (!ul || !state.garment) return;
    ul.innerHTML = "";
    (state.garment.pieces || []).forEach(function (p) {
      var li = document.createElement("li");
      li.className = "dyesub-piece-row";
      var b = document.createElement("button");
      b.type = "button";
      b.className = p.id === state.pieceId ? "is-on" : "";
      b.innerHTML =
        (p.label || p.id) +
        '<span class="dyesub-piece-size">' +
        Number(p.cutWin).toFixed(2) +
        " × " +
        Number(p.cutHin).toFixed(2) +
        " in</span>";
      b.addEventListener("click", function () {
        selectPiece(p.id);
      });
      var tint = document.createElement("button");
      tint.type = "button";
      tint.className = "dyesub-swatch-btn";
      tint.style.background = pieceColor(p.id);
      tint.title = "Fabric color for " + (p.label || p.id);
      tint.setAttribute("aria-label", "Fabric color for " + (p.label || p.id));
      tint.addEventListener("click", function (e) {
        e.stopPropagation();
        openPalette({ type: "piece", id: p.id }, (p.label || p.id) + " fabric", pieceColor(p.id));
      });
      li.appendChild(b);
      li.appendChild(tint);
      ul.appendChild(li);
    });
  }

  function renderArts() {
    var ul = qs("art-list");
    if (!ul) return;
    ul.innerHTML = "";
    state.arts.forEach(function (a) {
      var li = document.createElement("li");
      var img = document.createElement("img");
      img.className = "dyesub-art-thumb";
      img.alt = a.filename;
      img.src = a.url;
      var pick = document.createElement("button");
      pick.type = "button";
      pick.className = "dyesub-art-pick";
      pick.textContent = a.filename;
      pick.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        placeArt(a.id);
      });
      var row = document.createElement("div");
      row.className = "dyesub-art-row";
      var placeBtn = document.createElement("button");
      placeBtn.type = "button";
      placeBtn.className = "btn btn-ghost";
      placeBtn.textContent = "Place";
      placeBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        placeArt(a.id);
      });
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-ghost";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        deleteArt(a.id);
      });
      row.appendChild(placeBtn);
      row.appendChild(delBtn);
      li.appendChild(img);
      li.appendChild(pick);
      li.appendChild(row);
      ul.appendChild(li);
    });
  }

  function ensureImage(artId, url) {
    var id = String(artId || "");
    if (!id || images[id]) return;
    var img = new Image();
    img.onload = function () {
      draw();
    };
    img.src = url;
    images[id] = img;
  }

  function placeArt(artId) {
    var piece = currentPiece();
    var art = state.arts.find(function (a) { return sameId(a.id, artId); });
    if (!piece || !art) return;
    var img = images[String(artId)] || images[artId];
    var aspect = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : 1;
    var w = Math.min(piece.cutWin * 0.6, 6);
    var h = w / aspect;
    if (h > piece.cutHin * 0.6) {
      h = piece.cutHin * 0.6;
      w = h * aspect;
    }
    var pl = {
      id: uuid(),
      artId: artId,
      pieceId: piece.id,
      xIn: (piece.cutWin - w) / 2,
      yIn: (piece.cutHin - h) / 2,
      wIn: w,
      hIn: h,
      rotationDeg: 0,
    };
    state.placements.push(pl);
    state.selectedId = pl.id;
    syncProps();
    draw();
    setStatus("Placed “" + art.filename + "” on " + (piece.label || piece.id) + ". Drag to position, then save.");
  }

  function layoutPayload() {
    return {
      baseColor: state.baseColor,
      baseColors: state.baseColors,
      zipColor: state.zipColor,
      threadColor: effectiveThreadColor(),
      opposingThread: !!state.opposingThread,
      placements: state.placements.map(function (p) {
        return {
          id: p.id,
          artId: p.artId,
          pieceId: p.pieceId,
          xIn: p.xIn,
          yIn: p.yIn,
          wIn: p.wIn,
          hIn: p.hIn,
          rotationDeg: p.rotationDeg || 0,
          flipX: !!p.flipX,
        };
      }),
      notes: state.notes,
    };
  }

  function applyJob(job) {
    state.jobId = job.id;
    state.name = job.name || state.name;
    state.notes = job.notes || "";
    var layout = job.layout || {};
    state.baseColor = layout.baseColor || state.baseColor;
    state.baseColors = layout.baseColors || {};
    state.zipColor = layout.zipColor || state.zipColor || "#9fa4a5";
    state.opposingThread = !!layout.opposingThread;
    state.threadColor = layout.threadColor || state.threadColor;
    ensurePieceColors();
    if (!state.opposingThread) state.threadColor = fabricThreadColor();
    state.placements = layout.placements || [];
    qs("job-name").value = state.name;
    syncThreadUi();
    var q = params();
    var next = q.get("job") || state.jobId;
    if (next && window.history && history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set("job", state.jobId);
      if (state.garment) url.searchParams.set("garment", state.garment.id);
      history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
    }
  }

  function loadArtMeta(job) {
    var arts = job.artworks || [];
    return Promise.all(
      arts.map(function (a) {
        return fetch("/api/dyesub/jobs/" + job.id + "/art/" + a.id, { headers: authHeaders(), credentials: "same-origin" })
          .then(function (r) {
            if (!r.ok) throw new Error("art");
            return r.blob();
          })
          .then(function (blob) {
            var url = URL.createObjectURL(blob);
            state.arts.push({ id: String(a.id), filename: a.filename, url: url });
            ensureImage(a.id, url);
          });
      })
    );
  }

  function saveJob() {
    if (!state.garment) return Promise.reject(new Error("No garment"));
    state.name = qs("job-name").value.trim() || "Untitled print";
    var body = {
      name: state.name,
      layout: layoutPayload(),
      notes: state.notes,
    };
    setStatus("Saving…");
    var req;
    if (state.jobId) {
      req = api("/dyesub/jobs/" + state.jobId, { method: "PUT", body: JSON.stringify(body) });
    } else {
      req = api("/dyesub/jobs", {
        method: "POST",
        body: JSON.stringify({
          garment_id: state.garment.id,
          name: state.name,
          layout: body.layout,
          notes: state.notes,
        }),
      });
    }
    return req
      .then(function (job) {
        applyJob(job);
        setStatus("Saved to your account.");
        return job;
      })
      .catch(function (e) {
        setStatus(e.message || "Could not save.");
        throw e;
      });
  }

  function isArtFile(file) {
    var n = String((file && file.name) || "").toLowerCase();
    var t = String((file && file.type) || "").toLowerCase();
    if (t.indexOf("png") !== -1 || t.indexOf("jpeg") !== -1 || t.indexOf("jpg") !== -1 || t.indexOf("webp") !== -1) {
      return true;
    }
    return /\.(png|jpe?g|webp)$/.test(n);
  }

  function removeArtLocal(artId) {
    var id = String(artId || "");
    state.arts = state.arts.filter(function (a) { return !sameId(a.id, id); });
    state.placements = state.placements.filter(function (p) { return !sameId(p.artId, id); });
    if (selected() && sameId(selected().artId, id)) state.selectedId = null;
    Object.keys(images).forEach(function (k) {
      if (sameId(k, id)) delete images[k];
    });
    renderArts();
    syncProps();
    draw();
    refresh3d(true);
  }

  function uploadFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f && f.size;
    });
    if (!files.length) return;
    var skipped = files.filter(function (f) { return !isArtFile(f); });
    files = files.filter(isArtFile);
    if (!files.length) {
      setStatus("Use PNG, JPEG, or WebP artwork.");
      return;
    }
    setStatus(skipped.length ? "Uploading artwork (skipped non-image files)…" : "Uploading artwork…");
    var start = state.jobId ? Promise.resolve() : saveJob();
    start
      .then(function () {
        if (!state.jobId) throw new Error("Save the job before adding artwork.");
        var chain = Promise.resolve();
        files.forEach(function (file) {
          chain = chain.then(function () {
            var fd = new FormData();
            fd.append("file", file, file.name);
            return fetch("/api/dyesub/jobs/" + state.jobId + "/art", {
              method: "POST",
              headers: authHeaders(),
              credentials: "same-origin",
              body: fd,
            }).then(function (r) {
              return r.text().then(function (text) {
                var parsed = window.HoodooApi.parseResponse(r, text);
                if (!parsed.ok) throw new Error(parsed.error || "Upload failed");
                return parsed.data;
              });
            });
          }).then(function (meta) {
            if (!meta || !meta.id) throw new Error("Upload did not return artwork.");
            var url = URL.createObjectURL(file);
            state.arts.push({ id: String(meta.id), filename: meta.filename || file.name, url: url });
            ensureImage(meta.id, url);
            try {
              placeArt(String(meta.id));
            } catch (err) {
              setStatus((err && err.message) || "Uploaded, but could not place on the piece.");
            }
          });
        });
        return chain;
      })
      .then(function () {
        renderArts();
        refresh3d(true);
        return saveJob();
      })
      .then(function () {
        setStatus("Artwork added. Place it on each piece you need, then save.");
      })
      .catch(function (e) {
        renderArts();
        setStatus(e.message || "Upload failed.");
      });
  }

  function deleteArt(artId) {
    var id = String(artId || "");
    if (!id) return;
    setStatus("Removing artwork…");
    var go = state.jobId
      ? api("/dyesub/jobs/" + state.jobId + "/art/" + encodeURIComponent(id), { method: "DELETE" })
      : Promise.resolve();
    go.then(function () {
        removeArtLocal(id);
        setStatus("Artwork removed.");
        if (state.jobId) return saveJob();
      })
      .catch(function (e) {
        setStatus(e.message || "Could not delete art.");
      });
  }

  function packSteps() {
    var names = ((state.garment && state.garment.pieces) || []).map(function (p) {
      return "Rendering " + (p.label || p.id) + "…";
    });
    return ["Saving job…"].concat(names).concat(["Nesting on 44 in roll…", "Zipping PRINT, CLO, and CUT files…"]);
  }

  function downloadPack() {
    if (!isAdmin()) {
      setStatus("Print packs are admin-only. Save the job, then send it in for a quote.");
      return;
    }
    if (window.HoodooPackBusy) window.HoodooPackBusy.start({ steps: packSteps() });
    else setStatus("Building print pack… this can take a minute.");
    saveJob()
      .then(function () {
        return fetch("/api/dyesub/jobs/" + state.jobId + "/pack", {
          headers: authHeaders(),
          credentials: "same-origin",
        });
      })
      .then(function (r) {
        return r.arrayBuffer().then(function (buf) {
          if (!r.ok) {
            var text = "";
            try {
              text = new TextDecoder().decode(buf);
            } catch (e) {
              text = "";
            }
            throw new Error(apiError(r, text));
          }
          var disp = r.headers.get("Content-Disposition") || "";
          var m = /filename="([^"]+)"/.exec(disp);
          return { blob: new Blob([buf], { type: "application/zip" }), name: (m && m[1]) || "hoodoo-dyesub.zip" };
        });
      })
      .then(function (file) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(file.blob);
        a.download = file.name;
        a.click();
        setStatus("Print pack complete.");
        if (window.HoodooPackBusy) window.HoodooPackBusy.complete("Downloaded. PRINT PNGs are 300 DPI for the F6200.");
      })
      .catch(function (e) {
        var msg = e.message || "Could not build pack.";
        setStatus(msg);
        if (window.HoodooPackBusy) window.HoodooPackBusy.fail(msg);
      });
  }

  function sendQuote() {
    saveJob()
      .then(function () {
        setStatus("Sending to Hoodoo for a quote…");
        return api("/dyesub/jobs/" + state.jobId + "/quote", { method: "POST" });
      })
      .then(function (job) {
        applyJob(job);
        setStatus("Sent for quote. Hoodoo will review this print from the admin shop and follow up.");
      })
      .catch(function (e) {
        setStatus(e.message || "Could not send quote.");
      });
  }

  function pairPieceId(pid) {
    var pairs = (state.garment && state.garment.pairs) || {};
    if (pairs[pid]) return pairs[pid];
    var fallback = {
      "front-pair-a": "front-pair-b",
      "front-pair-b": "front-pair-a",
      "back-pair-a": "back-pair-b",
      "back-pair-b": "back-pair-a",
      "sleeve-left": "sleeve-right",
      "sleeve-right": "sleeve-left",
      "collar-left": "collar-right",
      "collar-right": "collar-left",
      "waist-left": "waist-right",
      "waist-right": "waist-left",
    };
    if (fallback[pid]) return fallback[pid];
    var pieces = (state.garment && state.garment.pieces) || [];
    var me = pieces.find(function (p) { return p.id === pid; });
    if (!me) return null;
    var mates = pieces.filter(function (p) {
      return p.id !== pid && p.role && me.role && p.role === me.role;
    });
    if (mates.length === 1) return mates[0].id;
    var side = String(me.side || me.id || me.label || "").toLowerCase();
    var hit = mates.find(function (p) {
      var s = String(p.side || p.id || p.label || "").toLowerCase();
      if (/left/.test(side) && /right/.test(s)) return true;
      if (/right/.test(side) && /left/.test(s)) return true;
      if (/(^|-)a$|pair-a|front a|back a/.test(side) && /(^|-)b$|pair-b|front b|back b/.test(s)) return true;
      if (/(^|-)b$|pair-b|front b|back b/.test(side) && /(^|-)a$|pair-a|front a|back a/.test(s)) return true;
      return false;
    });
    return hit ? hit.id : null;
  }

  function mirrorPlacement(pl, other) {
    return {
      id: uuid(),
      artId: pl.artId,
      pieceId: other.id,
      xIn: Number(other.cutWin) - pl.xIn - pl.wIn,
      yIn: pl.yIn,
      wIn: pl.wIn,
      hIn: pl.hIn,
      rotationDeg: -(pl.rotationDeg || 0),
      flipX: !pl.flipX,
    };
  }

  function mirrorToPair() {
    var piece = currentPiece();
    if (!piece) {
      setStatus("Pick a piece first.");
      return;
    }
    var otherId = pairPieceId(piece.id);
    var other = (state.garment.pieces || []).find(function (p) { return p.id === otherId; });
    if (!otherId || !other) {
      setStatus((piece.label || piece.id) + " has no pair to mirror to.");
      return;
    }
    var source = selected() && selected().pieceId === piece.id
      ? [selected()]
      : placementsOnPiece(piece.id);
    if (!source.length) {
      setStatus("Place artwork on " + (piece.label || piece.id) + " first, then mirror to pair.");
      return;
    }
    var artIds = {};
    source.forEach(function (pl) {
      artIds[pl.artId] = true;
    });
    state.placements = state.placements.filter(function (p) {
      return p.pieceId !== otherId || !artIds[p.artId];
    });
    var copies = [];
    source.forEach(function (pl) {
      var copy = mirrorPlacement(pl, other);
      state.placements.push(copy);
      copies.push(copy);
    });
    state.pieceId = otherId;
    state.selectedId = copies.length === 1 ? copies[0].id : copies[copies.length - 1].id;
    renderPieces();
    syncProps();
    draw();
    setStatus(
      "Mirrored " +
        copies.length +
        (copies.length === 1 ? " graphic" : " graphics") +
        " onto " +
        (other.label || otherId) +
        "."
    );
  }

  function onPointerDown(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var hit = hitTest(x, y);
    if (!hit) {
      state.selectedId = null;
      syncProps();
      draw();
      return;
    }
    state.selectedId = hit.pl.id;
    syncProps();
    var pl = hit.pl;
    drag = {
      type: hit.type,
      handle: hit.handle,
      pl: pl,
      startX: x,
      startY: y,
      orig: { xIn: pl.xIn, yIn: pl.yIn, wIn: pl.wIn, hIn: pl.hIn, rotationDeg: pl.rotationDeg || 0 },
    };
    draw();
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag || !canvas._vt) return;
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var vt = canvas._vt;
    var pl = drag.pl;
    if (drag.type === "move") {
      var dx = (x - drag.startX) / vt.scale;
      var dy = (y - drag.startY) / vt.scale;
      pl.xIn = drag.orig.xIn + dx;
      pl.yIn = drag.orig.yIn + dy;
    } else if (drag.type === "resize") {
      var p0 = canvasToPiece(vt, drag.startX, drag.startY);
      var p1 = canvasToPiece(vt, x, y);
      var dw = p1[0] - p0[0];
      var dh = p1[1] - p0[1];
      var aspect = drag.orig.wIn / drag.orig.hIn;
      var handle = drag.handle;
      var w = drag.orig.wIn;
      var h = drag.orig.hIn;
      var nx = drag.orig.xIn;
      var ny = drag.orig.yIn;
      if (handle === "se") {
        w = Math.max(0.2, drag.orig.wIn + dw);
        h = w / aspect;
      } else if (handle === "ne") {
        w = Math.max(0.2, drag.orig.wIn + dw);
        h = w / aspect;
        ny = drag.orig.yIn + drag.orig.hIn - h;
      } else if (handle === "nw") {
        w = Math.max(0.2, drag.orig.wIn - dw);
        h = w / aspect;
        nx = drag.orig.xIn + drag.orig.wIn - w;
        ny = drag.orig.yIn + drag.orig.hIn - h;
      } else if (handle === "sw") {
        w = Math.max(0.2, drag.orig.wIn - dw);
        h = w / aspect;
        nx = drag.orig.xIn + drag.orig.wIn - w;
      }
      pl.wIn = w;
      pl.hIn = h;
      pl.xIn = nx;
      pl.yIn = ny;
    } else if (drag.type === "rotate") {
      var tl = pieceToCanvas(vt, drag.orig.xIn, drag.orig.yIn);
      var br = pieceToCanvas(vt, drag.orig.xIn + drag.orig.wIn, drag.orig.yIn + drag.orig.hIn);
      var cx = (tl[0] + br[0]) / 2;
      var cy = (tl[1] + br[1]) / 2;
      var ang = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
      pl.rotationDeg = ang;
    }
    syncProps();
    draw();
  }

  function onPointerUp() {
    if (drag) refresh3d(true);
    drag = null;
  }

  function bindCanvas() {
    canvas = qs("piece-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("resize", draw);
    window.addEventListener("keydown", function (e) {
      var tag = ((e.target && e.target.tagName) || "").toUpperCase();
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag)) return;
      var pl = selected();
      if (!pl) return;
      var step = e.shiftKey ? 0.25 : 0.05;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        state.placements = state.placements.filter(function (p) { return p.id !== pl.id; });
        state.selectedId = null;
        syncProps();
        draw();
        return;
      }
      if (e.key === "ArrowLeft") pl.xIn -= step;
      else if (e.key === "ArrowRight") pl.xIn += step;
      else if (e.key === "ArrowUp") pl.yIn -= step;
      else if (e.key === "ArrowDown") pl.yIn += step;
      else return;
      e.preventDefault();
      syncProps();
      draw();
    });
  }

  function bindUi() {
    statusEl = qs("dyesub-status");
    qs("btn-save").addEventListener("click", function () {
      saveJob();
    });
    if (qs("btn-quote")) qs("btn-quote").addEventListener("click", sendQuote);
    if (qs("btn-pack")) qs("btn-pack").addEventListener("click", downloadPack);
    if (qs("btn-add-art") && qs("art-files")) {
      qs("btn-add-art").addEventListener("click", function (e) {
        e.preventDefault();
        qs("art-files").click();
      });
    }
    if (qs("art-files")) {
      qs("art-files").addEventListener("change", function (e) {
        var list = e.target.files;
        uploadFiles(list);
        e.target.value = "";
      });
    }
    qs("job-name").addEventListener("change", function () {
      state.name = qs("job-name").value;
    });
    if (qs("zip-swatch")) {
      qs("zip-swatch").addEventListener("click", function () {
        openPalette({ type: "zip" }, "Zipper color", state.zipColor);
      });
    }
    if (qs("thread-swatch")) {
      qs("thread-swatch").addEventListener("click", function () {
        openPalette({ type: "thread" }, "Thread color", effectiveThreadColor());
      });
    }
    if (qs("thread-opposing")) {
      qs("thread-opposing").addEventListener("change", function (e) {
        state.opposingThread = !!e.target.checked;
        if (state.opposingThread) state.threadColor = contrastInk(fabricThreadColor());
        else state.threadColor = fabricThreadColor();
        syncThreadUi();
        refresh3d(true);
      });
    }
    if (qs("dyesub-palette-close")) {
      qs("dyesub-palette-close").addEventListener("click", closePalette);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePalette();
    });
    ["prop-w", "prop-h", "prop-x", "prop-y", "prop-rot"].forEach(function (id) {
      qs(id).addEventListener("change", function () {
        var pl = selected();
        if (!pl) return;
        pl.wIn = Math.max(0.1, Number(qs("prop-w").value) || pl.wIn);
        pl.hIn = Math.max(0.1, Number(qs("prop-h").value) || pl.hIn);
        pl.xIn = Number(qs("prop-x").value);
        pl.yIn = Number(qs("prop-y").value);
        pl.rotationDeg = Number(qs("prop-rot").value) || 0;
        draw();
      });
    });
    qs("btn-mirror").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      mirrorToPair();
    });
    qs("btn-remove").addEventListener("click", function () {
      var pl = selected();
      if (!pl) return;
      state.placements = state.placements.filter(function (p) { return p.id !== pl.id; });
      state.selectedId = null;
      syncProps();
      draw();
    });
  }

  function pickGarment(list) {
    var q = params();
    var gid = q.get("garment");
    var product = q.get("product");
    var fit = q.get("fit");
    if (gid) {
      return list.find(function (g) { return g.id === gid; }) || list[0];
    }
    if (product) {
      return (
        list.find(function (g) { return g.product === product && (!fit || g.fit === fit); }) ||
        list.find(function (g) { return g.product === product; }) ||
        list[0]
      );
    }
    return list.find(function (g) { return g.ready; }) || list[0];
  }

  function bindPreview() {
    var preview = window.HoodooDyeSub3D;
    if (!preview || !preview.onPickPiece) {
      window.setTimeout(bindPreview, 40);
      return;
    }
    preview.onPickPiece(selectPiece);
    refresh3d();
  }

  function boot() {
    var gate = qs("dyesub-gate");
    var app = qs("dyesub-app");
    if (!window.HoodooApi || !window.HoodooApi.getToken()) {
      gate.hidden = false;
      return;
    }
    bindCanvas();
    bindUi();
    bindPreview();
    api("/auth/me")
      .then(function (u) {
        state.role = (u && u.role) || "";
        syncRoleUi();
        gate.hidden = true;
        app.hidden = false;
        return loadPalettes().then(function () {
          return api("/dyesub/garments");
        });
      })
      .then(function (data) {
        var list = (data && data.garments) || [];
        var meta = pickGarment(list);
        if (!meta) throw new Error("No dye-sub garments yet.");
        var q = params();
        if (q.get("job")) {
          return api("/dyesub/jobs/" + q.get("job")).then(function (job) {
            return api("/dyesub/garments/" + job.garment_id).then(function (g) {
              return { garment: g, job: job };
            });
          });
        }
        return api("/dyesub/garments/" + meta.id).then(function (g) {
          return { garment: g, job: null };
        });
      })
      .then(function (pack) {
        state.garment = pack.garment;
        state.pieceId = (pack.garment.pieces && pack.garment.pieces[0] && pack.garment.pieces[0].id) || null;
        ensurePieceColors();
        if (!state.opposingThread) state.threadColor = fabricThreadColor();
        syncThreadUi();
        qs("garment-kicker").textContent =
          (pack.garment.name || "Garment") +
          (pack.garment.size ? " · size " + pack.garment.size : "") +
          " · Epson F6200 44\"";
        qs("job-name").value = pack.garment.name ? pack.garment.name + " print" : "Untitled print";
        state.name = qs("job-name").value;
        renderPieces();
        if (pack.job) {
          applyJob(pack.job);
          renderPieces();
          return loadArtMeta(pack.job).then(function () {
            renderArts();
            syncProps();
            draw();
            setStatus("Loaded saved job.");
          });
        }
        draw();
        setStatus("Add artwork, place it on each piece, save it to your account, then send it in for a quote.");
      })
      .catch(function (e) {
        if (e.message && e.message.indexOf("Not authenticated") !== -1) {
          gate.hidden = false;
          app.hidden = true;
          return;
        }
        gate.hidden = true;
        app.hidden = false;
        setStatus(e.message || "Could not load dye-sub builder.");
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
