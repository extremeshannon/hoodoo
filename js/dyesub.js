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
    selectedId: null,
    notes: "",
  };
  var drag = null;
  var images = {};
  var canvas;
  var ctx;
  var statusEl;

  function qs(id) {
    return document.getElementById(id);
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

  function drawPoly(ptsMm, piece, vt, fill, stroke, dash) {
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
      ctx.lineWidth = 1.5;
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
    var cssW = canvas.clientWidth || 800;
    var cssH = canvas.clientHeight || 900;
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
    var rgb = hexRgb(state.baseColors[piece.id] || state.baseColor);
    drawPoly(piece.cutMm, piece, vt, "rgba(" + rgb.join(",") + ",0.95)", "rgba(255,255,255,0.2)");
    if (piece.sewMm) drawPoly(piece.sewMm, piece, vt, null, "#36B4E5", [6, 4]);
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
        state.pieceId = p.id;
        state.selectedId = null;
        renderPieces();
        syncProps();
        draw();
      });
      li.appendChild(b);
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
      pick.addEventListener("click", function () {
        placeArt(a.id);
      });
      var row = document.createElement("div");
      row.className = "dyesub-art-row";
      var placeBtn = document.createElement("button");
      placeBtn.type = "button";
      placeBtn.className = "btn btn-ghost";
      placeBtn.textContent = "Place";
      placeBtn.addEventListener("click", function () {
        placeArt(a.id);
      });
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-ghost";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
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
    if (images[artId]) return;
    var img = new Image();
    img.onload = function () { draw(); };
    img.src = url;
    images[artId] = img;
  }

  function placeArt(artId) {
    var piece = currentPiece();
    var art = state.arts.find(function (a) { return a.id === artId; });
    if (!piece || !art) return;
    var img = images[artId];
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
    state.placements = layout.placements || [];
    qs("job-name").value = state.name;
    qs("base-color").value = state.baseColor;
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
            state.arts.push({ id: a.id, filename: a.filename, url: url });
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

  function uploadFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var start = state.jobId ? Promise.resolve() : saveJob();
    start
      .then(function () {
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
            var url = URL.createObjectURL(file);
            state.arts.push({ id: meta.id, filename: meta.filename, url: url });
            ensureImage(meta.id, url);
            placeArt(meta.id);
          });
        });
        return chain;
      })
      .then(function () {
        renderArts();
        return saveJob();
      })
      .catch(function (e) {
        setStatus(e.message || "Upload failed.");
      });
  }

  function deleteArt(artId) {
    if (!state.jobId) return;
    if (!window.confirm("Delete this artwork from the job?")) return;
    api("/dyesub/jobs/" + state.jobId + "/art/" + artId, { method: "DELETE" })
      .then(function () {
        state.arts = state.arts.filter(function (a) { return a.id !== artId; });
        state.placements = state.placements.filter(function (p) { return p.artId !== artId; });
        if (selected() && selected().artId === artId) state.selectedId = null;
        delete images[artId];
        renderArts();
        syncProps();
        draw();
        setStatus("Artwork removed.");
      })
      .catch(function (e) {
        setStatus(e.message || "Could not delete art.");
      });
  }

  function downloadPack() {
    var go = state.jobId ? saveJob() : saveJob();
    go.then(function () {
      setStatus("Building print pack…");
      return fetch("/api/dyesub/jobs/" + state.jobId + "/pack", {
        headers: authHeaders(),
        credentials: "same-origin",
      });
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Pack failed");
        var disp = r.headers.get("Content-Disposition") || "";
        var m = /filename="([^"]+)"/.exec(disp);
        return r.blob().then(function (blob) {
          return { blob: blob, name: (m && m[1]) || "hoodoo-dyesub.zip" };
        });
      })
      .then(function (file) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(file.blob);
        a.download = file.name;
        a.click();
        setStatus("Downloaded. PRINT PNGs are 300 DPI for the F6200; CLO folder is named for pattern pieces.");
      })
      .catch(function (e) {
        setStatus(e.message || "Could not build pack.");
      });
  }

  function mirrorToPair() {
    var pl = selected();
    var pairs = (state.garment && state.garment.pairs) || {};
    if (!pl) return;
    var otherId = pairs[pl.pieceId];
    if (!otherId) {
      setStatus("This piece has no pair.");
      return;
    }
    var piece = (state.garment.pieces || []).find(function (p) { return p.id === pl.pieceId; });
    var other = (state.garment.pieces || []).find(function (p) { return p.id === otherId; });
    if (!piece || !other) return;
    var copy = {
      id: uuid(),
      artId: pl.artId,
      pieceId: otherId,
      xIn: other.cutWin - pl.xIn - pl.wIn,
      yIn: pl.yIn,
      wIn: pl.wIn,
      hIn: pl.hIn,
      rotationDeg: -(pl.rotationDeg || 0),
    };
    state.placements.push(copy);
    state.pieceId = otherId;
    state.selectedId = copy.id;
    renderPieces();
    syncProps();
    draw();
    setStatus("Mirrored onto " + (other.label || otherId) + ".");
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
    qs("btn-pack").addEventListener("click", downloadPack);
    qs("art-files").addEventListener("change", function (e) {
      uploadFiles(e.target.files);
      e.target.value = "";
    });
    qs("base-color").addEventListener("input", function (e) {
      state.baseColor = e.target.value;
      var piece = currentPiece();
      if (piece) state.baseColors[piece.id] = state.baseColor;
      draw();
    });
    qs("job-name").addEventListener("change", function () {
      state.name = qs("job-name").value;
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
    qs("btn-mirror").addEventListener("click", mirrorToPair);
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

  function boot() {
    var gate = qs("dyesub-gate");
    var app = qs("dyesub-app");
    if (!window.HoodooApi || !window.HoodooApi.getToken()) {
      gate.hidden = false;
      return;
    }
    bindCanvas();
    bindUi();
    api("/auth/me")
      .then(function () {
        gate.hidden = true;
        app.hidden = false;
        return api("/dyesub/garments");
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
        qs("garment-kicker").textContent =
          (pack.garment.name || "Garment") +
          (pack.garment.size ? " · size " + pack.garment.size : "") +
          " · Epson F6200 44\"";
        qs("job-name").value = pack.garment.name ? pack.garment.name + " print" : "Untitled print";
        state.name = qs("job-name").value;
        renderPieces();
        if (pack.job) {
          applyJob(pack.job);
          return loadArtMeta(pack.job).then(function () {
            renderArts();
            syncProps();
            draw();
            setStatus("Loaded saved job.");
          });
        }
        draw();
        setStatus("Add artwork, place it on each piece, save, then download the print pack.");
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
