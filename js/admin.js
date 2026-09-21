(function () {
  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());

  var loginEl = document.getElementById("admin-login");
  var deniedEl = document.getElementById("admin-denied");
  var bodyEl = document.getElementById("admin-body");
  var errEl = document.getElementById("admin-error");

  if (!window.HoodooApi.getToken()) {
    loginEl.hidden = false;
    return;
  }

  window.HoodooApi
    .fetchJson("/auth/me")
    .then(function (u) {
      if (u.role !== "staff" && u.role !== "admin") {
        deniedEl.hidden = false;
        return;
      }
      bodyEl.hidden = false;
      if (u.role === "admin") {
        var tabs = document.getElementById("admin-tabs");
        var shop = document.getElementById("admin-shop");
        if (tabs) tabs.hidden = false;
        if (shop) shop.hidden = false;
        loadShop();
      }
      loadInventory();
      loadProductSelect().then(function () {
        refresh3dList();
      });
    })
    .catch(function () {
      window.HoodooApi.clearToken();
      loginEl.hidden = false;
    });

  function loadShop() {
    var st = document.getElementById("admin-shop-status");
    if (st) st.textContent = "Loading shop…";
    return window.HoodooApi
      .fetchJson("/admin/shop")
      .then(function (data) {
        if (st) st.textContent = "";
        renderCustomers(data.customers || []);
        renderShopOrders(data.orders || []);
        renderPrints(data.prints || []);
      })
      .catch(function (e) {
        if (st) st.textContent = e.message || "Could not load shop.";
      });
  }

  function customerLabel(row) {
    var name = row.owner_name || row.full_name || "";
    var email = row.owner_email || row.email || "";
    if (name && email) return name + " · " + email;
    return name || email || "—";
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return String(iso);
    }
  }

  function renderCustomers(rows) {
    var tb = document.querySelector("#admin-table-customers tbody");
    if (!tb) return;
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(customerLabel(r)) +
        (r.username ? '<br /><span class="muted">@' + escapeHtml(r.username) + "</span>" : "") +
        "</td><td>" +
        escapeHtml(r.role) +
        "</td><td>" +
        r.order_count +
        "</td><td>" +
        r.print_count +
        "</td><td>" +
        escapeHtml(fmtWhen(r.created_at)) +
        "</td>";
      tb.appendChild(tr);
    });
  }

  function statusSelect(current, kind, id) {
    var opts =
      kind === "order"
        ? ["submitted", "acknowledged", "in_production", "fulfilled", "cancelled"]
        : ["draft", "quote_requested", "quoted", "in_production", "fulfilled", "cancelled"];
    var html = '<select class="admin-status-select" data-kind="' + kind + '" data-id="' + escapeHtml(id) + '">';
    if (current && opts.indexOf(current) === -1) opts.unshift(current);
    opts.forEach(function (s) {
      html +=
        '<option value="' +
        escapeHtml(s) +
        '"' +
        (s === current ? " selected" : "") +
        ">" +
        escapeHtml(s.replace(/_/g, " ")) +
        "</option>";
    });
    html += "</select>";
    return html;
  }

  function renderShopOrders(rows) {
    var tb = document.querySelector("#admin-table-orders tbody");
    if (!tb) return;
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(fmtWhen(r.created_at)) +
        "</td><td>" +
        escapeHtml(customerLabel(r)) +
        (r.line_count ? '<br /><span class="muted">' + r.line_count + " line(s)</span>" : "") +
        "</td><td>$" +
        escapeHtml(r.total || r.subtotal || "0.00") +
        "</td><td>" +
        statusSelect(r.status, "order", r.id) +
        '</td><td><a class="btn btn-ghost" href="/order.html?id=' +
        encodeURIComponent(r.id) +
        '">Open</a></td>';
      tb.appendChild(tr);
    });
    bindStatusSelects(tb);
  }

  function renderPrints(rows) {
    var tb = document.querySelector("#admin-table-prints tbody");
    if (!tb) return;
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(r.name || "Print") +
        '<br /><span class="muted">' +
        escapeHtml(r.garment_id || "") +
        (r.kind === "embroidery" ? " · embroidery" : r.kind === "screenprint" ? " · screen" : " · dye-sub") +
        "</span></td><td>" +
        escapeHtml(customerLabel(r)) +
        "</td><td>" +
        statusSelect(r.status, "print", r.id) +
        "</td><td>" +
        r.art_count +
        "</td><td>" +
        escapeHtml(fmtWhen(r.updated_at || r.created_at)) +
        '</td><td class="admin-shop-actions"><a class="btn btn-ghost" href="' +
        (r.kind === "embroidery" ? "/embroidery.html?job=" : r.kind === "screenprint" ? "/screenprint.html?job=" : "/dyesub.html?job=") +
        encodeURIComponent(r.id) +
        '">Open</a> <button type="button" class="btn btn-primary admin-pack-btn" data-kind="' +
        escapeHtml(r.kind || "dyesub") +
        '" data-id="' +
        escapeHtml(r.id) +
        '" data-name="' +
        escapeHtml(r.name || "print") +
        '">Print pack</button></td>';
      tb.appendChild(tr);
    });
    bindStatusSelects(tb);
    tb.querySelectorAll(".admin-pack-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        downloadPrintPack(btn.getAttribute("data-id"), btn.getAttribute("data-name"), btn.getAttribute("data-kind"));
      });
    });
  }

  function bindStatusSelects(root) {
    root.querySelectorAll(".admin-status-select").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var kind = sel.getAttribute("data-kind");
        var id = sel.getAttribute("data-id");
        var path = kind === "order" ? "/admin/orders/" + id : "/admin/prints/" + id;
        var st = document.getElementById("admin-shop-status");
        window.HoodooApi
          .fetchJson(path, { method: "PATCH", body: JSON.stringify({ status: sel.value }) })
          .then(function () {
            if (st) st.textContent = "Status saved.";
            setTimeout(function () {
              if (st) st.textContent = "";
            }, 1500);
          })
          .catch(function (e) {
            if (st) st.textContent = e.message || "Could not update status.";
          });
      });
    });
  }

  function downloadPrintPack(id, name, kind) {
    var st = document.getElementById("admin-shop-status");
    var isScreen = kind === "screenprint";
    var isEmb = kind === "embroidery";
    if (window.HoodooPackBusy) {
      window.HoodooPackBusy.start({
        steps: isScreen || isEmb
          ? ["Loading job…", "Collecting artwork…", "Writing placement spec…", "Zipping art and quote…"]
          : ["Loading job…", "Rendering pieces at 300 DPI…", "Nesting on 44 in roll…", "Zipping PRINT, CLO, and CUT files…"],
      });
    } else if (st) {
      st.textContent = "Building print pack… this can take a minute.";
    }
    var headers = {};
    var tok = window.HoodooApi.getToken();
    if (tok) headers.Authorization = "Bearer " + tok;
    var packUrl = isEmb
      ? "/api/embroidery/jobs/" + id + "/pack"
      : isScreen
        ? "/api/screenprint/jobs/" + id + "/pack"
        : "/api/dyesub/jobs/" + id + "/pack";
    return fetch((window.HoodooApi.base() || "") + packUrl, {
      headers: headers,
      credentials: "same-origin",
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
            var parsed = window.HoodooApi.parseResponse(r, text);
            throw new Error(parsed.error || "Pack failed");
          }
          var disp = r.headers.get("Content-Disposition") || "";
          var m = /filename="([^"]+)"/.exec(disp);
          return { blob: new Blob([buf], { type: "application/zip" }), name: (m && m[1]) || "hoodoo-" + (name || "print") + ".zip" };
        });
      })
      .then(function (file) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(file.blob);
        a.download = file.name;
        a.click();
        if (st) st.textContent = "Print pack complete.";
        if (window.HoodooPackBusy) window.HoodooPackBusy.complete("Print pack downloaded.");
      })
      .catch(function (e) {
        var msg = e.message || "Could not build pack.";
        if (st) st.textContent = msg;
        if (window.HoodooPackBusy) window.HoodooPackBusy.fail(msg);
      });
  }

  function loadInventory() {
    var st = document.getElementById("admin-inv-status");
    if (st) st.textContent = "Loading inventory…";
    return window.HoodooApi
      .fetchJson("/admin/inventory")
      .then(function (data) {
        if (st) st.textContent = "";
        renderVariantRows(data.variant_rows || []);
        renderChoiceRows(data.choice_rows || []);
        renderAddonRows(data.addon_rows || []);
      })
      .catch(function (e) {
        if (st) st.textContent = e.message || "Could not load inventory.";
      });
  }

  function renderVariantRows(rows) {
    var tb = document.querySelector("#admin-table-variants tbody");
    if (!tb) return;
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(r.product_slug) +
        "<br /><span class=\"muted\">" +
        escapeHtml(r.product_name) +
        "</span></td><td>" +
        escapeHtml(r.label) +
        '</td><td><input type="number" min="0" max="999999" class="admin-inv-input" data-kind="variant" data-id="' +
        r.id +
        '" value="' +
        r.inventory +
        '" /></td>';
      tb.appendChild(tr);
    });
    bindInvInputs(tb);
  }

  function renderChoiceRows(rows) {
    var tb = document.querySelector("#admin-table-choices tbody");
    if (!tb) return;
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(r.product_slug) +
        "</td><td>" +
        escapeHtml(r.group_label) +
        "</td><td>" +
        escapeHtml(r.choice_label) +
        '</td><td><input type="number" min="0" max="999999" class="admin-inv-input" data-kind="choice" data-id="' +
        r.id +
        '" value="' +
        r.inventory +
        '" /></td>';
      tb.appendChild(tr);
    });
    bindInvInputs(tb);
  }

  function renderAddonRows(rows) {
    var tb = document.querySelector("#admin-table-addons tbody");
    if (!tb) return;
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        escapeHtml(r.product_slug) +
        "<br /><span class=\"muted\">" +
        escapeHtml(r.product_name) +
        "</span></td><td>" +
        escapeHtml(r.label) +
        '</td><td><input type="number" min="0" max="999999" class="admin-inv-input" data-kind="addon" data-id="' +
        r.id +
        '" value="' +
        r.inventory +
        '" /></td>';
      tb.appendChild(tr);
    });
    bindInvInputs(tb);
  }

  function bindInvInputs(root) {
    root.querySelectorAll(".admin-inv-input").forEach(function (input) {
      input.addEventListener("change", function () {
        var kind = input.getAttribute("data-kind");
        var id = input.getAttribute("data-id");
        var val = parseInt(input.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        input.value = String(val);
        var path =
          kind === "variant"
            ? "/admin/inventory/variant/" + id
            : kind === "choice"
              ? "/admin/inventory/choice/" + id
              : "/admin/inventory/addon/" + id;
        var st = document.getElementById("admin-inv-status");
        window.HoodooApi
          .fetchJson(path, { method: "PATCH", body: JSON.stringify({ inventory: val }) })
          .then(function () {
            if (st) st.textContent = "Saved.";
            setTimeout(function () {
              if (st) st.textContent = "";
            }, 1500);
          })
          .catch(function (e) {
            if (st) st.textContent = e.message || "Save failed.";
          });
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadProductSelect() {
    return fetch((window.HOODOO_API_BASE || "") + "/api/catalog")
      .then(function (r) {
        return r.json();
      })
      .then(function (cat) {
        var sel = document.getElementById("admin-product-slug");
        if (!sel) return;
        sel.innerHTML = "";
        var slugs = [];
        (cat.categories || []).forEach(function (c) {
          (c.products || []).forEach(function (p) {
            slugs.push({ slug: p.id, name: p.name });
          });
        });
        slugs.sort(function (a, b) {
          return a.slug.localeCompare(b.slug);
        });
        slugs.forEach(function (p) {
          var opt = document.createElement("option");
          opt.value = p.slug;
          opt.textContent = p.slug + " — " + p.name;
          sel.appendChild(opt);
        });
      })
      .catch(function (e) {
        if (errEl) errEl.textContent = e.message || "Could not load catalog.";
      });
  }

  function currentSlug() {
    var sel = document.getElementById("admin-product-slug");
    return sel ? sel.value : "";
  }

  function refresh3dList() {
    var slug = currentSlug();
    var st = document.getElementById("admin-3d-status");
    var list = document.getElementById("admin-3d-list");
    if (!slug) {
      if (list) list.innerHTML = "";
      return;
    }
    if (st) st.textContent = "Loading…";
    return window.HoodooApi
      .fetchJson("/admin/products/" + encodeURIComponent(slug) + "/3d-assets")
      .then(function (rows) {
        if (st) st.textContent = "";
        if (!list) return;
        list.innerHTML = "";
        (rows || []).forEach(function (a) {
          var li = document.createElement("li");
          li.className = "admin-asset-row";
          li.innerHTML =
            "<div><strong>" +
            escapeHtml(a.kind) +
            "</strong> · " +
            escapeHtml(a.uri) +
            (a.label ? " · " + escapeHtml(a.label) : "") +
            "</div>" +
            '<button type="button" class="btn btn-ghost admin-asset-del" data-id="' +
            a.id +
            '">Delete</button>';
          list.appendChild(li);
        });
        list.querySelectorAll(".admin-asset-del").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            window.HoodooApi
              .fetchJson("/admin/3d-assets/" + id, { method: "DELETE" })
              .then(function () {
                return refresh3dList();
              })
              .catch(function (e) {
                if (st) st.textContent = e.message || "Delete failed.";
              });
          });
        });
      })
      .catch(function (e) {
        if (st) st.textContent = e.message || "Could not load 3D assets.";
      });
  }

  var refreshBtn = document.getElementById("admin-3d-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", refresh3dList);
  var sel = document.getElementById("admin-product-slug");
  if (sel) sel.addEventListener("change", refresh3dList);

  var addForm = document.getElementById("admin-3d-add");
  if (addForm) {
    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var slug = currentSlug();
      if (!slug) return;
      var fd = new FormData(addForm);
      var body = {
        kind: (fd.get("kind") || "").toString().trim(),
        uri: (fd.get("uri") || "").toString().trim(),
        label: (fd.get("label") || "").toString().trim() || null,
        sort_order: parseInt((fd.get("sort_order") || "0").toString(), 10) || 0,
      };
      var st = document.getElementById("admin-3d-status");
      window.HoodooApi
        .fetchJson("/admin/products/" + encodeURIComponent(slug) + "/3d-assets", {
          method: "POST",
          body: JSON.stringify(body),
        })
        .then(function () {
          addForm.reset();
          return refresh3dList();
        })
        .catch(function (err) {
          if (st) st.textContent = err.message || "Could not add asset.";
        });
    });
  }
})();
