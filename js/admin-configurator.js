(function () {
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || "";
  var state = { products: [], materials: {}, meshMap: {}, selected: null };
  var statusEl = document.getElementById("status");

  function msg(t, err) {
    statusEl.textContent = t || "";
    statusEl.className = "status" + (err ? " err" : "");
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ "X-CSRF-Token": csrf }, opts.headers || {});
    if (opts.body && typeof opts.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(path, Object.assign({ credentials: "same-origin", headers: headers }, opts)).then(function (r) {
      return r.text().then(function (text) {
        var j = null;
        try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
        if (r.status === 401 || r.status === 403) {
          location.href = "/admin/login?next=/admin/configurator";
          throw new Error("Not authenticated");
        }
        if (!r.ok) {
          var d = j && j.detail;
          throw new Error(typeof d === "string" ? d : r.statusText || "Request failed");
        }
        return j;
      });
    });
  }
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fitsOf(el) {
    return Array.prototype.slice.call(el.querySelectorAll("input[type=checkbox]:checked")).map(function (i) { return i.value; });
  }

  function renderList() {
    var box = document.getElementById("garment-list");
    box.innerHTML = state.products.map(function (p) {
      return '<button type="button" class="gitem' + (state.selected === p.id ? " is-on" : "") + '" data-id="' + esc(p.id) + '">' +
        esc(p.name) + "<small>" + esc(p.category || p.blurb || p.id) + "</small></button>";
    }).join("");
    box.querySelectorAll(".gitem").forEach(function (b) {
      b.addEventListener("click", function () { select(b.getAttribute("data-id")); });
    });
  }

  function product(id) {
    return state.products.find(function (p) { return p.id === id; });
  }

  function select(id) {
    state.selected = id;
    renderList();
    var p = product(id);
    if (!p) return;
    document.getElementById("add-card").hidden = true;
    document.getElementById("edit-card").hidden = false;
    document.getElementById("edit-title").textContent = p.name + " · " + p.id;
    document.getElementById("g-name").value = p.name || "";
    document.getElementById("g-cat").value = p.category || "";
    document.getElementById("g-blurb").value = p.blurb || "";
    document.getElementById("g-emb").checked = p.embroideryText !== false && ((p.parts || []).some(function (x) { return x.id === "embroidery"; }) || p.embroideryText === true);
    document.getElementById("g-await").value = p.awaitingFile || "";
    var fitIds = (p.fits || []).map(function (f) { return f.id; });
    if (p.oneFit && fitIds.indexOf("unisex") === -1) fitIds.push("unisex");
    document.getElementById("g-fits").innerHTML = ["male", "female", "unisex", "youth"].map(function (f) {
      return '<label><input type="checkbox" value="' + f + '"' + (fitIds.indexOf(f) !== -1 ? " checked" : "") + " /> " + f.charAt(0).toUpperCase() + f.slice(1) + "</label>";
    }).join("");
    renderParts(p.parts || []);
    renderGlbs(p);
    document.getElementById("g-mesh").value = JSON.stringify(p.meshMap || {}, null, 2);
  }

  function renderParts(parts) {
    var tb = document.getElementById("g-parts");
    tb.innerHTML = parts.map(function (part, i) {
      var pal = part.palette || "taslan";
      return "<tr><td><input data-k=id data-i=" + i + ' value="' + esc(part.id) + '" /></td>' +
        "<td><input data-k=label data-i=" + i + ' value="' + esc(part.label) + '" /></td>' +
        "<td><select data-k=palette data-i=" + i + ">" +
        ["taslan", "spandex", "body", "stitch", "embroidery"].map(function (k) {
          return "<option" + (pal === k ? " selected" : "") + ">" + k + "</option>";
        }).join("") + "</select></td>" +
        '<td><button type="button" class="btn" data-rm="' + i + '">×</button></td></tr>';
    }).join("");
    tb.querySelectorAll("[data-rm]").forEach(function (b) {
      b.addEventListener("click", function () {
        var rows = collectParts();
        rows.splice(Number(b.getAttribute("data-rm")), 1);
        renderParts(rows);
      });
    });
  }
  function collectParts() {
    var rows = [];
    document.querySelectorAll("#g-parts tr").forEach(function (tr) {
      var id = (tr.querySelector("[data-k=id]") || {}).value;
      var label = (tr.querySelector("[data-k=label]") || {}).value;
      var palette = (tr.querySelector("[data-k=palette]") || {}).value;
      if (id) rows.push({ id: id, label: label, palette: palette });
    });
    return rows;
  }
  function renderGlbs(p) {
    var fits = (p.fits && p.fits.length) ? p.fits : [{ id: p.oneFit ? "unisex" : "male", name: "File" }];
    var by = p.glbByFit || {};
    document.getElementById("g-glbs").innerHTML = fits.map(function (f) {
      var cur = by[f.id] || p.glb || "";
      if (Array.isArray(cur)) cur = cur[0] || "";
      return '<div class="row" style="align-items:flex-end;margin-bottom:.6rem">' +
        "<label>" + esc(f.name || f.id) + " GLB <input type=file accept=.glb data-fit=" + esc(f.id) + " /></label>" +
        "<span class=muted>" + esc(cur || "(none yet)") + "</span></div>";
    }).join("");
    document.querySelectorAll("#g-glbs input[type=file]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var file = inp.files && inp.files[0];
        if (!file) return;
        var fd = new FormData();
        fd.append("file", file);
        fd.append("fit", inp.getAttribute("data-fit"));
        msg("Uploading GLB…");
        fetch("/admin/config/garments/" + encodeURIComponent(p.id) + "/glb", {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-CSRF-Token": csrf },
          body: fd,
        }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
          .then(function (x) {
            if (!x.r.ok) throw new Error((x.j && x.j.detail) || "Upload failed");
            msg("Uploaded " + file.name);
            return load();
          })
          .then(function () { select(p.id); })
          .catch(function (e) { msg(e.message, true); });
      });
    });
  }

  function renderColors() {
    var host = document.getElementById("palettes");
    var keys = ["taslan", "spandex", "body", "stitch", "embroidery"];
    host.innerHTML = keys.map(function (k) {
      var pal = state.materials[k] || { label: k, colors: [] };
      var rows = (pal.colors || []).map(function (c, i) {
        return '<div class="row" data-pal="' + k + '" data-i="' + i + '">' +
          '<label>Name <input data-f=name value="' + esc(c.name) + '" /></label>' +
          '<label>Hex <input data-f=hex value="' + esc(c.hex) + '" /></label>' +
          '<label>Swatch <input type=color data-f=picker value="' + esc(/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : "#000000") + '" /></label>' +
          '<button type="button" class="btn" data-del="' + k + ':' + i + '">×</button></div>';
      }).join("");
      return '<h3 class="muted">' + esc(pal.label || k) +
        ' <button type="button" class="btn" data-add="' + k + '">Add color</button></h3>' +
        '<label style="flex-direction:row;color:var(--paper)"><input type=checkbox data-lock="' + k + '"' + (pal.locked ? " checked" : "") + " /> Locked (single color)</label>" +
        '<label>Note <input data-note="' + k + '" value="' + esc(pal.note || "") + '" /></label>' +
        rows;
    }).join("");
    host.querySelectorAll("[data-add]").forEach(function (b) {
      b.addEventListener("click", function () {
        collectColors();
        var k = b.getAttribute("data-add");
        state.materials[k] = state.materials[k] || { id: k, label: k, colors: [] };
        state.materials[k].colors.push({ id: "new", name: "New", hex: "#000000" });
        renderColors();
      });
    });
    host.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        collectColors();
        var bits = b.getAttribute("data-del").split(":");
        state.materials[bits[0]].colors.splice(Number(bits[1]), 1);
        renderColors();
      });
    });
    host.querySelectorAll("[data-f=picker]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var row = inp.closest(".row");
        var hex = row.querySelector("[data-f=hex]");
        if (hex) hex.value = inp.value;
      });
    });
  }
  function collectColors() {
    ["taslan", "spandex", "body", "stitch", "embroidery"].forEach(function (k) {
      var pal = state.materials[k] || { id: k, label: k, colors: [] };
      pal.locked = !!(document.querySelector("[data-lock=" + k + "]") || {}).checked;
      pal.note = (document.querySelector("[data-note=" + k + "]") || {}).value || pal.note;
      pal.colors = [];
      document.querySelectorAll('.row[data-pal="' + k + '"]').forEach(function (row) {
        pal.colors.push({
          name: (row.querySelector("[data-f=name]") || {}).value,
          hex: (row.querySelector("[data-f=hex]") || {}).value,
        });
      });
      state.materials[k] = pal;
    });
  }

  document.getElementById("btn-new").addEventListener("click", function () {
    document.getElementById("add-card").hidden = false;
    document.getElementById("edit-card").hidden = true;
    state.selected = null;
    renderList();
  });
  document.getElementById("btn-create").addEventListener("click", function () {
    var body = {
      name: document.getElementById("new-name").value,
      category: document.getElementById("new-cat").value,
      template: document.getElementById("new-tmpl").value,
      fits: fitsOf(document.getElementById("new-fits")),
    };
    msg("Creating…");
    api("/admin/config/garments", { method: "POST", body: JSON.stringify(body) })
      .then(function (p) { msg("Added " + p.name); return load().then(function () { select(p.id); }); })
      .catch(function (e) { msg(e.message, true); });
  });
  document.getElementById("btn-add-part").addEventListener("click", function () {
    var rows = collectParts();
    rows.push({ id: "part", label: "Part", palette: "taslan" });
    renderParts(rows);
  });
  document.getElementById("btn-save-g").addEventListener("click", function () {
    if (!state.selected) return;
    var mesh = {};
    try { mesh = JSON.parse(document.getElementById("g-mesh").value || "{}"); }
    catch (e) { msg("Mesh map JSON is invalid", true); return; }
    var body = {
      name: document.getElementById("g-name").value,
      category: document.getElementById("g-cat").value,
      blurb: document.getElementById("g-blurb").value,
      embroideryText: document.getElementById("g-emb").checked,
      awaitingFile: document.getElementById("g-await").value,
      fits: fitsOf(document.getElementById("g-fits")),
      parts: collectParts(),
      meshMap: mesh,
    };
    msg("Saving garment…");
    api("/admin/config/garments/" + encodeURIComponent(state.selected), { method: "PATCH", body: JSON.stringify(body) })
      .then(function () { msg("Garment saved. Public /suit.html will pick it up."); return load(); })
      .then(function () { select(state.selected); })
      .catch(function (e) { msg(e.message, true); });
  });
  document.getElementById("btn-save-colors").addEventListener("click", function () {
    collectColors();
    msg("Saving colors…");
    api("/admin/config/materials", { method: "PUT", body: JSON.stringify(state.materials) })
      .then(function (m) { state.materials = m; renderColors(); msg("Colors saved."); })
      .catch(function (e) { msg(e.message, true); });
  });
  document.getElementById("btn-save-maps").addEventListener("click", function () {
    var mm;
    try { mm = JSON.parse(document.getElementById("global-mesh").value || "{}"); }
    catch (e) { msg("Global mesh map JSON is invalid", true); return; }
    api("/admin/config/maps", { method: "PUT", body: JSON.stringify({ meshMap: mm, meshNotes: state.meshNotes || {} }) })
      .then(function () { msg("Mesh map saved."); })
      .catch(function (e) { msg(e.message, true); });
  });

  function load() {
    return api("/admin/config/state").then(function (data) {
      state.products = data.products || [];
      state.materials = data.materials || {};
      state.meshMap = data.meshMap || {};
      state.meshNotes = data.meshNotes || {};
      renderList();
      renderColors();
      document.getElementById("global-mesh").value = JSON.stringify(state.meshMap, null, 2);
      if (state.selected) {
        var still = product(state.selected);
        if (still) select(state.selected);
      }
    });
  }
  load().catch(function (e) { msg(e.message, true); });
})();
