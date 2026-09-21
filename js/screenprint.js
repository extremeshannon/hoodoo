import { mountScreenPrint3D } from "/js/screenprint-3d.js?v=20260921th";

var api = window.HoodooApi;
var preview = null;
var catalog = { garments: [], categories: [], locations: [], meta: {} };
var state = {
  jobId: null,
  name: "Untitled screen print",
  status: "draft",
  category: "tshirt",
  garmentId: "",
  colorId: "",
  quantity: 12,
  sizes: {},
  arts: {},
  placements: [],
  locationId: "front",
  selectedId: null,
  activeArtId: null,
  quote: null,
};

function qs(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  var el = qs("sp-status");
  if (el) el.textContent = msg || "";
}

function authHeaders() {
  var h = {};
  var tok = api.getToken();
  if (tok) h.Authorization = "Bearer " + tok;
  return h;
}

function uid() {
  return "p" + Math.random().toString(36).slice(2, 10);
}

function currentGarment() {
  return (catalog.garments || []).find(function (g) { return g.id === state.garmentId; }) || catalog.garments[0];
}

function locMeta(id) {
  return (catalog.locations || []).find(function (l) { return l.id === id; }) || { id: id, label: id, maxW: 12, maxH: 14, defaultW: 10 };
}

function garmentLocs(g) {
  var ids = (g && g.locationIds) || ["front", "back"];
  return (catalog.locations || []).filter(function (l) { return ids.indexOf(l.id) !== -1; });
}

function garmentColor(g) {
  var colors = (g && g.colors) || [];
  return colors.find(function (c) { return c.id === state.colorId; }) || colors[0] || { hex: "#1a4e8a", name: "Navy", id: "navy" };
}

function qtyFromSizes() {
  var n = 0;
  Object.keys(state.sizes || {}).forEach(function (k) {
    n += Math.max(0, parseInt(state.sizes[k], 10) || 0);
  });
  return n;
}

function inkCount() {
  var used = {};
  Object.keys(state.arts).forEach(function (id) {
    var a = state.arts[id];
    (a.colors || []).forEach(function (c) {
      var hx = String(c.hex || "").toLowerCase();
      if (hx && (a.dropped || []).indexOf(hx) === -1) used[hx] = true;
    });
  });
  var n = Object.keys(used).length;
  return Math.max(1, n || 1);
}

function locationCount() {
  var set = {};
  state.placements.forEach(function (p) {
    if (p.location) set[p.location] = true;
  });
  return Math.max(1, Object.keys(set).length);
}

function dist2(a, b) {
  var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function extractColors(img, maxN) {
  maxN = maxN || 8;
  var c = document.createElement("canvas");
  var w = 72;
  var h = Math.max(1, Math.round((img.height / Math.max(img.width, 1)) * w));
  c.width = w;
  c.height = h;
  var ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  var data = ctx.getImageData(0, 0, w, h).data;
  var buckets = {};
  var i;
  for (i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 48) continue;
    var r = Math.round(data[i] / 24) * 24;
    var g = Math.round(data[i + 1] / 24) * 24;
    var b = Math.round(data[i + 2] / 24) * 24;
    var k = r + "," + g + "," + b;
    buckets[k] = (buckets[k] || 0) + 1;
  }
  var list = Object.keys(buckets).map(function (k) {
    var p = k.split(",").map(Number);
    return { r: p[0], g: p[1], b: p[2], n: buckets[k] };
  }).sort(function (a, b) { return b.n - a.n; });
  var merged = [];
  list.forEach(function (row) {
    var hit = merged.find(function (m) { return dist2([m.r, m.g, m.b], [row.r, row.g, row.b]) < 2200; });
    if (hit) {
      hit.n += row.n;
    } else {
      merged.push(row);
    }
  });
  merged.sort(function (a, b) { return b.n - a.n; });
  return merged.slice(0, maxN).map(function (row) {
    function hx(n) { return ("0" + n.toString(16)).slice(-2); }
    return { hex: "#" + hx(row.r) + hx(row.g) + hx(row.b), r: row.r, g: row.g, b: row.b };
  });
}

function filteredCanvas(art) {
  var img = art.img;
  var c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  var ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  var dropped = (art.dropped || []).map(function (h) { return h.toLowerCase(); });
  if (!dropped.length || !art.colors || !art.colors.length) return c;
  var kept = art.colors.filter(function (col) { return dropped.indexOf(String(col.hex).toLowerCase()) === -1; });
  var data = ctx.getImageData(0, 0, c.width, c.height);
  var px = data.data;
  var i;
  for (i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 40) continue;
    var r = px[i], g = px[i + 1], b = px[i + 2];
    var nearest = null;
    var best = 1e9;
    art.colors.forEach(function (col) {
      var d = dist2([r, g, b], [col.r, col.g, col.b]);
      if (d < best) {
        best = d;
        nearest = col;
      }
    });
    if (!nearest) continue;
    if (dropped.indexOf(String(nearest.hex).toLowerCase()) !== -1) {
      px[i + 3] = 0;
    } else if (kept.length) {
      var k = kept[0];
      var kb = 1e9;
      kept.forEach(function (col) {
        var d = dist2([r, g, b], [col.r, col.g, col.b]);
        if (d < kb) {
          kb = d;
          k = col;
        }
      });
      px[i] = k.r;
      px[i + 1] = k.g;
      px[i + 2] = k.b;
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

function layoutPayload() {
  var artMeta = {};
  Object.keys(state.arts).forEach(function (id) {
    var a = state.arts[id];
    artMeta[id] = {
      colors: a.colors || [],
      dropped: a.dropped || [],
    };
  });
  return {
    colorId: state.colorId,
    quantity: state.quantity,
    sizes: state.sizes,
    placements: state.placements,
    art: artMeta,
    colors: inkCount(),
    quote: state.quote,
  };
}

function money(n) {
  return "$" + Number(n || 0).toFixed(2);
}

function renderQuote(est) {
  state.quote = est;
  qs("sp-total").textContent = est ? money(est.subtotal) : "—";
  qs("sp-each").textContent = est ? money(est.each) + " each · " + inkCount() + " color / " + locationCount() + " location" : "";
  var ul = qs("sp-lines");
  ul.innerHTML = "";
  (est && est.lines ? est.lines : []).forEach(function (line) {
    var li = document.createElement("li");
    li.innerHTML = "<span>" + line.label + "</span><span>" + money(line.amount) + "</span>";
    ul.appendChild(li);
  });
}

var quoteTimer = null;
function refreshQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(function () {
    var g = currentGarment();
    if (!g) return;
    var color = garmentColor(g);
    api.fetchJson("/screenprint/estimate", {
      method: "POST",
      body: JSON.stringify({
        garment_id: g.id,
        quantity: state.quantity,
        colors: inkCount(),
        locations: locationCount(),
        garment_name: g.vendor + " " + g.model + " " + g.name + " · " + color.name,
        blank_price: g.price,
      }),
    }).then(renderQuote).catch(function () {});
  }, 280);
}

function syncKicker() {
  var g = currentGarment();
  var c = garmentColor(g);
  qs("sp-kicker").textContent = g
    ? g.vendor + " " + g.model + " · " + c.name + " · $" + Number(g.price).toFixed(0)
    : "Screen print";
}

function renderCats() {
  var wrap = qs("sp-cats");
  wrap.innerHTML = "";
  (catalog.categories || []).forEach(function (cat) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sp-cat" + (cat.id === state.category ? " is-on" : "");
    b.textContent = cat.label;
    b.addEventListener("click", function () {
      state.category = cat.id;
      var first = (catalog.garments || []).find(function (g) { return g.category === cat.id; });
      if (first) selectGarment(first.id);
      else renderGarments();
    });
    wrap.appendChild(b);
  });
}

function renderGarments() {
  var ul = qs("sp-garment-list");
  ul.innerHTML = "";
  (catalog.garments || []).filter(function (g) { return g.category === state.category; }).forEach(function (g) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sp-gbtn" + (g.id === state.garmentId ? " is-on" : "");
    b.innerHTML = "<strong>" + g.vendor + " " + g.model + "</strong><span>" + g.name + " · $" + Number(g.price).toFixed(0) + "</span>";
    b.addEventListener("click", function () { selectGarment(g.id); });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

function renderColors() {
  var g = currentGarment();
  var wrap = qs("sp-colors");
  wrap.innerHTML = "";
  ((g && g.colors) || []).forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sp-swatch" + (c.id === state.colorId ? " is-on" : "");
    b.style.background = c.hex;
    b.title = c.name;
    b.setAttribute("aria-label", c.name);
    b.addEventListener("click", function () {
      state.colorId = c.id;
      renderColors();
      syncKicker();
      drawPlace();
      update3D();
      refreshQuote();
    });
    wrap.appendChild(b);
  });
}

function renderSizes() {
  var wrap = qs("sp-sizes");
  wrap.innerHTML = "";
  var keys = (catalog.meta && catalog.meta.sizes) || ["S", "M", "L", "XL", "XXL"];
  keys.forEach(function (sz) {
    var lab = document.createElement("label");
    lab.className = "sp-size";
    lab.textContent = sz;
    var inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.max = "999";
    inp.value = String(state.sizes[sz] || 0);
    inp.addEventListener("input", function () {
      state.sizes[sz] = Math.max(0, parseInt(inp.value, 10) || 0);
      var sum = qtyFromSizes();
      if (sum > 0) {
        state.quantity = sum;
        qs("sp-qty").value = String(sum);
      }
      refreshQuote();
    });
    lab.appendChild(inp);
    wrap.appendChild(lab);
  });
}

function renderLocs() {
  var g = currentGarment();
  var wrap = qs("sp-locs");
  wrap.innerHTML = "";
  var locs = garmentLocs(g);
  if (!locs.find(function (l) { return l.id === state.locationId; })) {
    state.locationId = locs[0] ? locs[0].id : "front";
  }
  locs.forEach(function (l) {
    var n = state.placements.filter(function (p) { return p.location === l.id; }).length;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sp-loc" + (l.id === state.locationId ? " is-on" : "");
    b.textContent = l.label + (n ? " · " + n : "");
    b.addEventListener("click", function () {
      state.locationId = l.id;
      renderLocs();
      drawPlace();
    });
    wrap.appendChild(b);
  });
  var sel = qs("sp-move-loc");
  sel.innerHTML = "";
  locs.forEach(function (l) {
    var o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.label;
    sel.appendChild(o);
  });
  var p = selectedPlacement();
  if (p) sel.value = p.location;
}

function renderArt() {
  var ul = qs("sp-art-list");
  ul.innerHTML = "";
  Object.keys(state.arts).forEach(function (id) {
    var a = state.arts[id];
    var li = document.createElement("li");
    li.className = "sp-art-row";
    var img = document.createElement("img");
    img.src = a.url;
    img.alt = a.filename || "art";
    var mid = document.createElement("div");
    var name = document.createElement("div");
    name.textContent = a.filename || "Artwork";
    name.style.fontSize = "0.75rem";
    var ink = document.createElement("div");
    ink.className = "sp-ink";
    (a.colors || []).forEach(function (c) {
      var hx = String(c.hex).toLowerCase();
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "sp-ink-chip" + ((a.dropped || []).indexOf(hx) !== -1 ? " is-off" : "");
      chip.title = "Drop this ink color";
      chip.innerHTML = '<span class="sp-ink-dot" style="background:' + c.hex + '"></span>' + c.hex;
      chip.addEventListener("click", function () {
        a.dropped = a.dropped || [];
        var i = a.dropped.indexOf(hx);
        if (i === -1) a.dropped.push(hx);
        else a.dropped.splice(i, 1);
        a.filtered = filteredCanvas(a);
        renderArt();
        drawPlace();
        update3D();
        refreshQuote();
      });
      ink.appendChild(chip);
    });
    mid.appendChild(name);
    mid.appendChild(ink);
    var add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-ghost";
    add.textContent = "Place";
    add.addEventListener("click", function () {
      state.activeArtId = id;
      addPlacement(id, state.locationId);
    });
    li.appendChild(img);
    li.appendChild(mid);
    li.appendChild(add);
    ul.appendChild(li);
  });
}

function selectedPlacement() {
  return state.placements.find(function (p) { return p.id === state.selectedId; }) || null;
}

function renderSel() {
  var p = selectedPlacement();
  var box = qs("sp-sel");
  box.hidden = !p;
  if (!p) return;
  qs("sp-w").value = String(p.wIn);
  qs("sp-h").value = String(p.hIn);
  qs("sp-move-loc").value = p.location;
}

function addPlacement(artId, locationId) {
  var art = state.arts[artId];
  if (!art || !art.img) return;
  var loc = locMeta(locationId);
  var aspect = (art.img.naturalWidth || 1) / Math.max(art.img.naturalHeight || 1, 1);
  var w = Math.min(loc.defaultW || 4, loc.maxW || 12);
  var h = w / aspect;
  if (h > (loc.maxH || 14)) {
    h = loc.maxH || 14;
    w = h * aspect;
  }
  var p = {
    id: uid(),
    artId: artId,
    location: locationId,
    xIn: (loc.maxW || 12) / 2,
    yIn: (loc.maxH || 14) / 2,
    wIn: Math.round(w * 20) / 20,
    hIn: Math.round(h * 20) / 20,
    rotation: 0,
  };
  state.placements.push(p);
  state.selectedId = p.id;
  renderLocs();
  renderSel();
  drawPlace();
  update3D();
  refreshQuote();
}

function canvasMetrics(canvas, loc) {
  var w = canvas.clientWidth || 1;
  var h = canvas.clientHeight || 1;
  var pad = 28;
  var areaW = loc.maxW || 12;
  var areaH = loc.maxH || 14;
  var scale = Math.min((w - pad * 2) / areaW, (h - pad * 2) / areaH);
  var ox = (w - areaW * scale) / 2;
  var oy = (h - areaH * scale) / 2;
  return { w: w, h: h, scale: scale, ox: ox, oy: oy, areaW: areaW, areaH: areaH };
}

function drawPlace() {
  var canvas = qs("sp-place");
  var g = currentGarment();
  var color = garmentColor(g);
  var loc = locMeta(state.locationId);
  var m = canvasMetrics(canvas, loc);
  if (canvas.width !== m.w || canvas.height !== m.h) {
    canvas.width = m.w;
    canvas.height = m.h;
  }
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, m.w, m.h);
  ctx.fillStyle = "#0e1116";
  ctx.fillRect(0, 0, m.w, m.h);
  ctx.fillStyle = color.hex;
  var bodyX = m.ox - 18;
  var bodyY = m.oy - 22;
  var bodyW = m.areaW * m.scale + 36;
  var bodyH = m.areaH * m.scale + 48;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(54,180,229,0.85)";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m.ox, m.oy, m.areaW * m.scale, m.areaH * m.scale);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(232,236,241,0.7)";
  ctx.font = "12px DM Sans, sans-serif";
  ctx.fillText(loc.label + " · " + loc.maxW + " × " + loc.maxH + " in", m.ox, Math.max(16, m.oy - 8));

  state.placements.filter(function (p) { return p.location === state.locationId; }).forEach(function (p) {
    var art = state.arts[p.artId];
    var img = art && (art.filtered || art.img);
    var x = m.ox + (p.xIn - p.wIn / 2) * m.scale;
    var y = m.oy + (p.yIn - p.hIn / 2) * m.scale;
    var w = p.wIn * m.scale;
    var h = p.hIn * m.scale;
    if (img) ctx.drawImage(img, x, y, w, h);
    ctx.strokeStyle = p.id === state.selectedId ? "#36b4e5" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = p.id === state.selectedId ? 2 : 1;
    ctx.strokeRect(x, y, w, h);
    if (p.id === state.selectedId) {
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(function (pt) {
        ctx.fillStyle = "#36b4e5";
        ctx.fillRect(pt[0] - 4, pt[1] - 4, 8, 8);
      });
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hitPlacement(mx, my) {
  var loc = locMeta(state.locationId);
  var m = canvasMetrics(qs("sp-place"), loc);
  var hits = state.placements.filter(function (p) { return p.location === state.locationId; });
  for (var i = hits.length - 1; i >= 0; i--) {
    var p = hits[i];
    var x = m.ox + (p.xIn - p.wIn / 2) * m.scale;
    var y = m.oy + (p.yIn - p.hIn / 2) * m.scale;
    var w = p.wIn * m.scale;
    var h = p.hIn * m.scale;
    var handles = [
      { hx: x, hy: y, corner: "tl" },
      { hx: x + w, hy: y, corner: "tr" },
      { hx: x, hy: y + h, corner: "bl" },
      { hx: x + w, hy: y + h, corner: "br" },
    ];
    for (var k = 0; k < handles.length; k++) {
      if (Math.abs(mx - handles[k].hx) <= 8 && Math.abs(my - handles[k].hy) <= 8) {
        return { p: p, corner: handles[k].corner };
      }
    }
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) return { p: p, corner: null };
  }
  return null;
}

function bindPlaceCanvas() {
  var canvas = qs("sp-place");
  var drag = null;
  canvas.addEventListener("pointerdown", function (e) {
    var r = canvas.getBoundingClientRect();
    var mx = e.clientX - r.left;
    var my = e.clientY - r.top;
    var hit = hitPlacement(mx, my);
    if (!hit) {
      state.selectedId = null;
      renderSel();
      drawPlace();
      return;
    }
    state.selectedId = hit.p.id;
    renderSel();
    drag = { p: hit.p, corner: hit.corner, mx: mx, my: my, xIn: hit.p.xIn, yIn: hit.p.yIn, wIn: hit.p.wIn, hIn: hit.p.hIn };
    canvas.setPointerCapture(e.pointerId);
    drawPlace();
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var loc = locMeta(state.locationId);
    var m = canvasMetrics(canvas, loc);
    var r = canvas.getBoundingClientRect();
    var mx = e.clientX - r.left;
    var my = e.clientY - r.top;
    var dx = (mx - drag.mx) / m.scale;
    var dy = (my - drag.my) / m.scale;
    var p = drag.p;
    if (!drag.corner) {
      p.xIn = clamp(drag.xIn + dx, p.wIn / 2, loc.maxW - p.wIn / 2);
      p.yIn = clamp(drag.yIn + dy, p.hIn / 2, loc.maxH - p.hIn / 2);
    } else {
      var aspect = drag.wIn / Math.max(drag.hIn, 0.05);
      var nw = Math.max(0.5, drag.wIn + dx * (drag.corner.indexOf("r") !== -1 ? 1 : -1));
      nw = Math.min(nw, loc.maxW);
      var nh = nw / aspect;
      if (nh > loc.maxH) {
        nh = loc.maxH;
        nw = nh * aspect;
      }
      p.wIn = Math.round(nw * 20) / 20;
      p.hIn = Math.round(nh * 20) / 20;
      p.xIn = clamp(drag.xIn, p.wIn / 2, loc.maxW - p.wIn / 2);
      p.yIn = clamp(drag.yIn, p.hIn / 2, loc.maxH - p.hIn / 2);
    }
    renderSel();
    drawPlace();
    update3D();
  });
  canvas.addEventListener("pointerup", function () {
    if (drag) refreshQuote();
    drag = null;
  });
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function update3D() {
  if (!preview) return;
  var g = currentGarment();
  var c = garmentColor(g);
  preview.setGarment(g.mesh || "tee", c.hex);
  preview.setDecals(state.placements.map(function (p) {
    var art = state.arts[p.artId];
    return {
      location: p.location,
      image: art && (art.filtered || art.img),
      wIn: p.wIn,
      hIn: p.hIn,
      xIn: p.xIn,
      yIn: p.yIn,
      rotation: p.rotation || 0,
    };
  }));
}

function selectGarment(id) {
  var g = (catalog.garments || []).find(function (x) { return x.id === id; });
  if (!g) return;
  state.garmentId = g.id;
  state.category = g.category;
  if (!(g.colors || []).some(function (c) { return c.id === state.colorId; })) {
    state.colorId = g.colors && g.colors[0] ? g.colors[0].id : "";
  }
  var allowed = g.locationIds || [];
  state.placements = state.placements.filter(function (p) { return allowed.indexOf(p.location) !== -1; });
  if (allowed.indexOf(state.locationId) === -1) state.locationId = allowed[0] || "front";
  renderCats();
  renderGarments();
  renderColors();
  renderLocs();
  syncKicker();
  drawPlace();
  update3D();
  refreshQuote();
}

function ensureJob() {
  if (state.jobId) {
    return Promise.resolve(state.jobId);
  }
  return api.fetchJson("/screenprint/jobs", {
    method: "POST",
    body: JSON.stringify({
      garment_id: state.garmentId,
      name: state.name,
      layout: layoutPayload(),
    }),
  }).then(function (job) {
    state.jobId = job.id;
    state.status = job.status;
    history.replaceState({}, "", "/screenprint.html?job=" + encodeURIComponent(job.id));
    return job.id;
  });
}

function saveJob() {
  setStatus("Saving…");
  return ensureJob().then(function (id) {
    return api.fetchJson("/screenprint/jobs/" + id, {
      method: "PUT",
      body: JSON.stringify({
        garment_id: state.garmentId,
        name: state.name,
        layout: layoutPayload(),
      }),
    });
  }).then(function (job) {
    state.status = job.status;
    setStatus("Saved to your account.");
    return job;
  }).catch(function (e) {
    setStatus(e.message || "Could not save.");
    throw e;
  });
}

function loadArtImage(jobId, art) {
  return fetch("/api/screenprint/jobs/" + jobId + "/art/" + art.id, {
    headers: authHeaders(),
    credentials: "same-origin",
  }).then(function (r) {
    if (!r.ok) throw new Error("Could not load artwork");
    return r.blob();
  }).then(function (blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var rec = {
          id: art.id,
          filename: art.filename,
          url: url,
          img: img,
          colors: [],
          dropped: [],
        };
        rec.colors = extractColors(img);
        rec.filtered = filteredCanvas(rec);
        state.arts[art.id] = rec;
        resolve(rec);
      };
      img.onerror = reject;
      img.src = url;
    });
  });
}

function uploadFiles(files) {
  var list = Array.prototype.slice.call(files || []);
  if (!list.length) return;
  setStatus("Uploading artwork…");
  ensureJob().then(function (jobId) {
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        var fd = new FormData();
        fd.append("file", file);
        return fetch("/api/screenprint/jobs/" + jobId + "/art", {
          method: "POST",
          headers: authHeaders(),
          credentials: "same-origin",
          body: fd,
        }).then(function (r) { return r.text().then(function (t) { return { r: r, t: t }; }); })
          .then(function (pack) {
            var parsed = api.parseResponse(pack.r, pack.t);
            if (!parsed.ok) throw new Error(parsed.error);
            return loadArtImage(jobId, parsed.data);
          }).then(function (rec) {
            state.activeArtId = rec.id;
            addPlacement(rec.id, state.locationId);
          });
      });
    });
    return chain;
  }).then(function () {
    renderArt();
    setStatus("Artwork loaded. Drop a color chip to skip that ink.");
    return saveJob();
  }).catch(function (e) {
    setStatus(e.message || "Upload failed.");
  });
}

function applyJob(job) {
  state.jobId = job.id;
  state.name = job.name || state.name;
  state.status = job.status;
  state.garmentId = job.garment_id;
  qs("sp-name").value = state.name;
  var layout = job.layout || {};
  state.colorId = layout.colorId || state.colorId;
  state.quantity = layout.quantity || state.quantity;
  state.sizes = layout.sizes || {};
  state.placements = layout.placements || [];
  qs("sp-qty").value = String(state.quantity);
  var g = currentGarment();
  if (g) state.category = g.category;
  var artMeta = layout.art || {};
  return Promise.all((job.artworks || []).map(function (a) {
    return loadArtImage(job.id, a).then(function (rec) {
      var meta = artMeta[a.id] || artMeta[String(a.id)] || {};
      if (meta.colors && meta.colors.length) rec.colors = meta.colors;
      rec.dropped = meta.dropped || [];
      rec.filtered = filteredCanvas(rec);
    });
  })).then(function () {
    renderCats();
    renderGarments();
    renderColors();
    renderSizes();
    renderLocs();
    renderArt();
    renderSel();
    syncKicker();
    drawPlace();
    update3D();
    if (layout.quote) renderQuote(layout.quote);
    else refreshQuote();
  });
}

function boot() {
  var gate = qs("sp-gate");
  var app = qs("sp-app");
  if (!api.getToken()) {
    gate.hidden = false;
    return;
  }
  preview = mountScreenPrint3D(qs("sp-3d"));
  bindPlaceCanvas();
  api.fetchJson("/auth/me").then(function () {
    return api.fetchJson("/screenprint/garments");
  }).then(function (data) {
    catalog = data;
    var params = new URLSearchParams(window.location.search);
    var jobId = params.get("job");
    state.garmentId = (catalog.garments[0] && catalog.garments[0].id) || "";
    state.colorId = catalog.garments[0] && catalog.garments[0].colors[0] ? catalog.garments[0].colors[0].id : "";
    (catalog.meta.sizes || []).forEach(function (sz) { state.sizes[sz] = state.sizes[sz] || 0; });
    state.sizes.L = state.sizes.L || 6;
    state.sizes.XL = state.sizes.XL || 6;
    state.quantity = qtyFromSizes() || 12;
    qs("sp-qty").value = String(state.quantity);
    renderCats();
    renderGarments();
    renderColors();
    renderSizes();
    renderLocs();
    syncKicker();
    drawPlace();
    update3D();
    refreshQuote();
    app.hidden = false;
    requestAnimationFrame(function () {
      drawPlace();
      if (preview) preview.resize();
    });
    if (jobId) {
      return api.fetchJson("/screenprint/jobs/" + jobId).then(applyJob);
    }
  }).catch(function (e) {
    if (String(e.message || "").indexOf("Not authenticated") !== -1) {
      gate.hidden = false;
      app.hidden = true;
      return;
    }
    setStatus(e.message || "Could not load screen print.");
    app.hidden = false;
  });

  qs("sp-add-art").addEventListener("click", function () { qs("sp-files").click(); });
  qs("sp-files").addEventListener("change", function () {
    uploadFiles(qs("sp-files").files);
    qs("sp-files").value = "";
  });
  qs("sp-name").addEventListener("input", function () { state.name = qs("sp-name").value; });
  qs("sp-qty").addEventListener("input", function () {
    state.quantity = Math.max(1, parseInt(qs("sp-qty").value, 10) || 1);
    refreshQuote();
  });
  qs("sp-w").addEventListener("input", function () {
    var p = selectedPlacement();
    if (!p) return;
    var loc = locMeta(p.location);
    var aspect = p.wIn / Math.max(p.hIn, 0.05);
    p.wIn = clamp(parseFloat(qs("sp-w").value) || p.wIn, 0.5, loc.maxW);
    p.hIn = clamp(p.wIn / aspect, 0.5, loc.maxH);
    qs("sp-h").value = String(p.hIn);
    drawPlace();
    update3D();
    refreshQuote();
  });
  qs("sp-h").addEventListener("input", function () {
    var p = selectedPlacement();
    if (!p) return;
    var loc = locMeta(p.location);
    var aspect = p.wIn / Math.max(p.hIn, 0.05);
    p.hIn = clamp(parseFloat(qs("sp-h").value) || p.hIn, 0.5, loc.maxH);
    p.wIn = clamp(p.hIn * aspect, 0.5, loc.maxW);
    qs("sp-w").value = String(p.wIn);
    drawPlace();
    update3D();
    refreshQuote();
  });
  qs("sp-move-loc").addEventListener("change", function () {
    var p = selectedPlacement();
    if (!p) return;
    p.location = qs("sp-move-loc").value;
    state.locationId = p.location;
    renderLocs();
    drawPlace();
    update3D();
    refreshQuote();
  });
  qs("sp-place-here").addEventListener("click", function () {
    var p = selectedPlacement();
    var artId = (p && p.artId) || state.activeArtId;
    if (artId) addPlacement(artId, state.locationId);
  });
  qs("sp-remove").addEventListener("click", function () {
    state.placements = state.placements.filter(function (p) { return p.id !== state.selectedId; });
    state.selectedId = null;
    renderLocs();
    renderSel();
    drawPlace();
    update3D();
    refreshQuote();
  });
  qs("sp-save").addEventListener("click", function () { saveJob(); });
  qs("sp-quote").addEventListener("click", function () {
    if (!state.placements.length) {
      setStatus("Place at least one logo first.");
      return;
    }
    setStatus("Submitting quote…");
    saveJob().then(function (job) {
      return api.fetchJson("/screenprint/jobs/" + job.id + "/quote", { method: "POST" });
    }).then(function (job) {
      state.status = job.status;
      if (job.quote) renderQuote(job.quote);
      setStatus("Quote sent. Artwork, placement, size, and price are on your account.");
    }).catch(function (e) {
      setStatus(e.message || "Could not submit quote.");
    });
  });
  window.addEventListener("resize", function () {
    drawPlace();
    if (preview) preview.resize();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
