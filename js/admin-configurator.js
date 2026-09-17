(function () {
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || "";
  var state = { products: [], groups: [], materials: {}, meshMap: {}, selected: null };
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

  function groupName(id) {
    var g = (state.groups || []).find(function (x) { return x.id === id; });
    return g ? g.name : "";
  }
  function fillGroupSelect(sel, current) {
    if (!sel) return;
    var cur = current || "";
    sel.innerHTML = '<option value="">None</option>' + (state.groups || []).map(function (g) {
      return '<option value="' + esc(g.id) + '"' + (g.id === cur ? " selected" : "") + ">" + esc(g.name) + "</option>";
    }).join("");
  }
  function garmentButton(p) {
    var sub = groupName(p.groupId) || p.category || p.blurb || p.id;
    return '<button type="button" class="gitem' + (state.selected === p.id ? " is-on" : "") + '" data-id="' + esc(p.id) + '">' +
      esc(p.name) + "<small>" + esc(sub) + "</small></button>";
  }
  function productsInGroup(gid) {
    return (state.products || []).filter(function (p) { return p.groupId === gid; });
  }
  function ungroupedProducts() {
    var ids = (state.groups || []).map(function (g) { return g.id; });
    return (state.products || []).filter(function (p) { return !p.groupId || ids.indexOf(p.groupId) === -1; });
  }

  function renderList() {
    var box = document.getElementById("garment-list");
    var html = "";
    (state.groups || []).forEach(function (g) {
      var items = productsInGroup(g.id);
      html += '<div class="rail-group"><p class="rail-group__title">' + esc(g.name) + "</p>";
      html += items.length ? items.map(garmentButton).join("") : '<p class="muted">No items yet</p>';
      html += "</div>";
    });
    var other = ungroupedProducts();
    if (other.length) {
      html += '<div class="rail-group"><p class="rail-group__title">Ungrouped</p>' + other.map(garmentButton).join("") + "</div>";
    }
    if (!html) html = '<p class="muted">No garments yet</p>';
    box.innerHTML = html;
    box.querySelectorAll(".gitem").forEach(function (b) {
      b.addEventListener("click", function () { select(b.getAttribute("data-id")); });
    });
  }

  function renderGroups() {
    var box = document.getElementById("group-list");
    if (!box) return;
    var groups = state.groups || [];
    box.innerHTML = groups.map(function (g) {
      return '<div class="row group-row" data-id="' + esc(g.id) + '">' +
        '<label>Name <input data-gname value="' + esc(g.name) + '" /></label>' +
        '<button type="button" class="btn" data-rename>Save name</button>' +
        '<button type="button" class="btn" data-del>Delete</button></div>';
    }).join("") || '<p class="muted">No groups yet.</p>';
    box.querySelectorAll("[data-rename]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = b.closest(".group-row");
        var id = row.getAttribute("data-id");
        var name = (row.querySelector("[data-gname]") || {}).value;
        msg("Saving group…");
        api("/admin/config/groups/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ name: name }) })
          .then(function () { msg("Group saved."); return load(); })
          .catch(function (e) { msg(e.message, true); });
      });
    });
    box.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = b.closest(".group-row");
        var id = row.getAttribute("data-id");
        var name = (row.querySelector("[data-gname]") || {}).value || id;
        if (!confirm('Delete group "' + name + '"? Garments stay; they just won’t be in a group.')) return;
        msg("Deleting group…");
        api("/admin/config/groups/" + encodeURIComponent(id), { method: "DELETE" })
          .then(function () { msg("Group deleted."); return load(); })
          .catch(function (e) { msg(e.message, true); });
      });
    });
    fillGroupSelect(document.getElementById("new-group"), (document.getElementById("new-group") || {}).value);
    if (state.selected) fillGroupSelect(document.getElementById("g-group"), (product(state.selected) || {}).groupId);
    else fillGroupSelect(document.getElementById("g-group"), "");
  }

  function renderAssign() {
    var tb = document.getElementById("group-assign");
    if (!tb) return;
    tb.innerHTML = (state.products || []).map(function (p) {
      return "<tr><td>" + esc(p.name) + "</td><td><select data-assign=\"" + esc(p.id) + "\">" +
        '<option value="">None</option>' +
        (state.groups || []).map(function (g) {
          return "<option value=\"" + esc(g.id) + "\"" + (p.groupId === g.id ? " selected" : "") + ">" + esc(g.name) + "</option>";
        }).join("") +
        "</select></td></tr>";
    }).join("") || '<tr><td colspan="2" class="muted">Add a garment first.</td></tr>';
    tb.querySelectorAll("[data-assign]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.getAttribute("data-assign");
        msg("Saving group…");
        api("/admin/config/garments/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ groupId: sel.value }) })
          .then(function () { msg("Group assigned."); return load(); })
          .catch(function (e) { msg(e.message, true); });
      });
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
    fillGroupSelect(document.getElementById("g-group"), p.groupId || "");
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
      groupId: document.getElementById("new-group").value,
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
      groupId: document.getElementById("g-group").value,
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
  document.getElementById("btn-add-group").addEventListener("click", function () {
    var name = document.getElementById("new-group-name").value;
    msg("Adding group…");
    api("/admin/config/groups", { method: "POST", body: JSON.stringify({ name: name }) })
      .then(function (g) {
        document.getElementById("new-group-name").value = "";
        msg("Added " + g.name);
        return load();
      })
      .catch(function (e) { msg(e.message, true); });
  });
  document.getElementById("new-group-name").addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("btn-add-group").click();
  });

  function load() {
    return api("/admin/config/state").then(function (data) {
      state.products = data.products || [];
      state.groups = data.groups || [];
      state.materials = data.materials || {};
      state.meshMap = data.meshMap || {};
      state.meshNotes = data.meshNotes || {};
      renderList();
      renderGroups();
      renderAssign();
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
