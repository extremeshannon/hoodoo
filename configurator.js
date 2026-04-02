(function () {
  var apiBase = window.HOODOO_API_BASE || "";

  function apiUrl(path) {
    return apiBase + "/api" + path;
  }

  var catalog = null;
  var meta = null;
  var catIndex = 0;
  var productIndex = 0;
  var selectedVariantId = null;
  var selectedOptionIds = {};
  var addonState = {};

  var el = {
    meta: document.getElementById("catalog-meta"),
    categories: document.getElementById("categories"),
    productList: document.getElementById("product-list"),
    empty: document.getElementById("config-empty"),
    panel: document.getElementById("config-panel"),
    panelCategory: document.getElementById("panel-category"),
    panelTitle: document.getElementById("panel-title"),
    panelSku: document.getElementById("panel-sku"),
    panelSummary: document.getElementById("panel-summary"),
    panelStock: document.getElementById("panel-stock"),
    panelOptions: document.getElementById("panel-options"),
    panelAddonsWrap: document.getElementById("panel-addons-wrap"),
    panelAddons: document.getElementById("panel-addons"),
    qty: document.getElementById("config-qty"),
    priceUnit: document.getElementById("price-unit"),
    priceTotal: document.getElementById("price-total"),
    priceDisclaimer: document.getElementById("price-disclaimer"),
    btnAddCart: document.getElementById("btn-add-cart"),
    btnQuote: document.getElementById("btn-quote"),
    btnCopy: document.getElementById("btn-copy"),
    addCartFeedback: document.getElementById("add-cart-feedback"),
    copyFeedback: document.getElementById("copy-feedback"),
    inventoryTbody: document.getElementById("inventory-tbody"),
  };

  function fmtMoney(n) {
    if (meta && meta.currencySymbol) {
      return meta.currencySymbol + n.toFixed(2);
    }
    return "$" + n.toFixed(2);
  }

  function currentCategory() {
    if (!catalog || !catalog.categories[catIndex]) return null;
    return catalog.categories[catIndex];
  }

  function currentProduct() {
    var c = currentCategory();
    if (!c || !c.products[productIndex]) return null;
    return c.products[productIndex];
  }

  function lowThreshold() {
    return (meta && meta.lowStockThreshold) || 10;
  }

  function stockClass(qty) {
    if (qty <= 0) return "stock-out";
    if (qty < lowThreshold()) return "stock-low";
    return "stock-ok";
  }

  function stockLabel(qty) {
    if (qty <= 0) return "Made to order / backorder";
    if (qty < lowThreshold()) return "Low stock · " + qty + " on hand";
    return "In stock · " + qty + " on hand";
  }

  function getVariant(product) {
    if (!product || product.pricingModel !== "variants" || !product.variants) return null;
    var v = product.variants.find(function (x) {
      return x.id === selectedVariantId;
    });
    return v || product.variants[0] || null;
  }

  function ensureOptionDefaults(product) {
    selectedOptionIds = {};
    if (!product || product.pricingModel !== "options" || !product.optionGroups) return;
    product.optionGroups.forEach(function (g) {
      if (g.choices && g.choices[0]) {
        selectedOptionIds[g.id] = g.choices[0].id;
      }
    });
  }

  function ensureVariantDefault(product) {
    if (!product || product.pricingModel !== "variants" || !product.variants || !product.variants[0]) {
      selectedVariantId = null;
      return;
    }
    selectedVariantId = product.variants[0].id;
  }

  function computeUnitPrice(product) {
    if (!product) return 0;
    if (product.pricingModel === "variants") {
      var v = getVariant(product);
      return v ? v.price : 0;
    }
    if (product.pricingModel === "options") {
      var base = product.basePrice || 0;
      var adj = 0;
      (product.optionGroups || []).forEach(function (g) {
        var cid = selectedOptionIds[g.id];
        var ch = (g.choices || []).find(function (c) {
          return c.id === cid;
        });
        if (ch) adj += ch.priceAdjust || 0;
      });
      return base + adj;
    }
    return 0;
  }

  function computeStockQty(product) {
    if (!product) return null;
    if (product.pricingModel === "variants") {
      var v = getVariant(product);
      return v ? v.inventory : null;
    }
    if (product.pricingModel === "options") {
      var min = null;
      var allPicked = true;
      (product.optionGroups || []).forEach(function (g) {
        if (!g.required) return;
        var cid = selectedOptionIds[g.id];
        if (!cid) {
          allPicked = false;
          return;
        }
        var ch = (g.choices || []).find(function (c) {
          return c.id === cid;
        });
        if (!ch || typeof ch.inventory !== "number") {
          allPicked = false;
          return;
        }
        min = min === null ? ch.inventory : Math.min(min, ch.inventory);
      });
      if (!allPicked) return null;
      return min;
    }
    return null;
  }

  function computeAddonTotalPerUnit(product) {
    var sum = 0;
    if (!product || !product.addons) return sum;
    product.addons.forEach(function (a) {
      if (addonState[a.id]) sum += a.price || 0;
    });
    return sum;
  }

  function getQty() {
    var q = parseInt(el.qty && el.qty.value, 10);
    if (isNaN(q) || q < 1) q = 1;
    if (q > 999) q = 999;
    return q;
  }

  function refreshTotals() {
    var product = currentProduct();
    if (!product) return;
    var unit = computeUnitPrice(product) + computeAddonTotalPerUnit(product);
    var qty = getQty();
    el.priceUnit.textContent = fmtMoney(unit);
    el.priceTotal.textContent = fmtMoney(unit * qty);
    if (el.priceDisclaimer) {
      el.priceDisclaimer.textContent = (meta && meta.priceDisclaimer) || "";
    }

    var sq = computeStockQty(product);
    el.panelStock.className = "config-panel-stock";
    if (sq === null) {
      el.panelStock.classList.add("stock-pending");
      el.panelStock.textContent = "Select all options to see inventory";
    } else {
      el.panelStock.classList.add(stockClass(sq));
      el.panelStock.textContent = stockLabel(sq);
    }
  }

  function buildSummary() {
    var c = currentCategory();
    var product = currentProduct();
    if (!c || !product) return "";

    var lines = [];
    lines.push("Hoodoo Alaska — configuration summary");
    lines.push("---");
    lines.push("Category: " + c.name);
    lines.push("Product: " + product.name);
    lines.push("SKU: " + (product.sku || product.id));

    if (product.pricingModel === "variants") {
      var v = getVariant(product);
      if (v) lines.push("Variant: " + v.label);
    } else if (product.pricingModel === "options") {
      (product.optionGroups || []).forEach(function (g) {
        var cid = selectedOptionIds[g.id];
        var ch = (g.choices || []).find(function (x) {
          return x.id === cid;
        });
        if (ch) lines.push(g.label + ": " + ch.label);
      });
    }

    var adds = [];
    (product.addons || []).forEach(function (a) {
      if (addonState[a.id]) adds.push(a.label + " (" + fmtMoney(a.price) + ")");
    });
    if (adds.length) lines.push("Add-ons: " + adds.join(", "));

    var qty = getQty();
    var unit = computeUnitPrice(product) + computeAddonTotalPerUnit(product);
    lines.push("Quantity: " + qty);
    lines.push("Guide unit price: " + fmtMoney(unit));
    lines.push("Guide line total: " + fmtMoney(unit * qty));
    lines.push("---");
    lines.push("Contact: shannon@hoodooak.com · 907.202.5634 · Wasilla, AK");

    return lines.join("\n");
  }

  function buildConfiguration() {
    var product = currentProduct();
    if (!product) return null;
    var addons = [];
    (product.addons || []).forEach(function (a) {
      if (addonState[a.id]) addons.push(a.id);
    });
    if (product.pricingModel === "variants") {
      return { variant_id: selectedVariantId, addon_ids: addons };
    }
    return { option_selections: Object.assign({}, selectedOptionIds), addon_ids: addons };
  }

  function parseErrorDetail(data) {
    if (!data || typeof data !== "object") return "Request failed";
    var d = data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && d[0].msg) return d[0].msg;
    return "Request failed";
  }

  function addToCart() {
    var product = currentProduct();
    if (!product || !el.btnAddCart) return;
    var cfg = buildConfiguration();
    if (el.addCartFeedback) el.addCartFeedback.textContent = "";
    fetch(apiUrl("/cart/items"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_slug: product.id,
        quantity: getQty(),
        configuration: cfg || {},
      }),
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (j) {
            throw new Error(parseErrorDetail(j));
          });
        }
        return r.json();
      })
      .then(function () {
        if (el.addCartFeedback) el.addCartFeedback.textContent = "Added to cart.";
        if (window.HoodooRefreshCartBadge) window.HoodooRefreshCartBadge();
      })
      .catch(function (e) {
        if (el.addCartFeedback) el.addCartFeedback.textContent = e.message || "Could not add to cart.";
      });
  }

  function renderCategories() {
    if (!el.categories || !catalog) return;
    el.categories.innerHTML = "";
    catalog.categories.forEach(function (cat, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "config-cat-btn" + (cat.featured ? " config-cat-btn-featured" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", i === catIndex ? "true" : "false");
      btn.dataset.index = String(i);
      var main = document.createElement("span");
      main.textContent = cat.name;
      btn.appendChild(main);
      if (cat.subtitle) {
        var sub = document.createElement("span");
        sub.className = "config-cat-sub";
        sub.textContent = cat.subtitle;
        btn.appendChild(sub);
      }
      btn.addEventListener("click", function () {
        catIndex = i;
        productIndex = 0;
        renderCategories();
        renderProductList();
        var cat = currentCategory();
        if (cat && cat.products && cat.products.length) {
          selectProduct(0);
        } else {
          if (el.empty) el.empty.hidden = false;
          if (el.panel) el.panel.hidden = true;
        }
      });
      el.categories.appendChild(btn);
    });
  }

  function renderProductList() {
    if (!el.productList) return;
    var cat = currentCategory();
    el.productList.innerHTML = "";
    if (!cat) return;

    cat.products.forEach(function (p, i) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "config-product-btn";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", i === productIndex ? "true" : "false");
      btn.dataset.index = String(i);

      var spanName = document.createElement("span");
      spanName.className = "config-product-btn-name";
      spanName.textContent = p.name;
      btn.appendChild(spanName);

      var metaLine = document.createElement("span");
      metaLine.className = "config-product-btn-meta";
      if (p.pricingModel === "variants" && p.variants && p.variants.length) {
        var prices = p.variants.map(function (v) {
          return v.price;
        });
        var lo = Math.min.apply(null, prices);
        var hi = Math.max.apply(null, prices);
        metaLine.textContent = lo === hi ? "From " + fmtMoney(lo) : fmtMoney(lo) + " – " + fmtMoney(hi);
      } else {
        metaLine.textContent = "From " + fmtMoney(p.basePrice || 0);
      }
      btn.appendChild(metaLine);

      btn.addEventListener("click", function () {
        selectProduct(i);
      });
      li.appendChild(btn);
      el.productList.appendChild(li);
    });
  }

  function renderAddons(product) {
    if (!el.panelAddons || !el.panelAddonsWrap) return;
    el.panelAddons.innerHTML = "";
    if (!product.addons || !product.addons.length) {
      el.panelAddonsWrap.hidden = true;
      return;
    }
    el.panelAddonsWrap.hidden = false;
    product.addons.forEach(function (a) {
      var label = document.createElement("label");
      label.className = "config-addon";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!addonState[a.id];
      input.addEventListener("change", function () {
        addonState[a.id] = input.checked;
        refreshTotals();
      });
      var text = document.createElement("span");
      text.className = "config-addon-text";
      text.textContent = a.label;
      var price = document.createElement("span");
      price.className = "config-addon-price";
      price.textContent = "+" + fmtMoney(a.price);
      label.appendChild(input);
      label.appendChild(text);
      label.appendChild(price);
      el.panelAddons.appendChild(label);
    });
  }

  function renderOptions(product) {
    if (!el.panelOptions) return;
    el.panelOptions.innerHTML = "";

    if (product.pricingModel === "variants" && product.variants) {
      var fieldset = document.createElement("fieldset");
      fieldset.className = "config-option-group";
      var leg = document.createElement("legend");
      leg.className = "config-fieldset-legend";
      leg.textContent = "Variant";
      fieldset.appendChild(leg);
      var sel = document.createElement("select");
      sel.className = "config-select";
      sel.id = "config-variant-select";
      product.variants.forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = v.label + " · " + fmtMoney(v.price) + " · qty " + v.inventory;
        sel.appendChild(opt);
      });
      sel.value = selectedVariantId || product.variants[0].id;
      selectedVariantId = sel.value;
      sel.addEventListener("change", function () {
        selectedVariantId = sel.value;
        refreshTotals();
      });
      fieldset.appendChild(sel);
      el.panelOptions.appendChild(fieldset);
      return;
    }

    if (product.pricingModel === "options" && product.optionGroups) {
      product.optionGroups.forEach(function (g) {
        var fieldset = document.createElement("fieldset");
        fieldset.className = "config-option-group";
        var leg = document.createElement("legend");
        leg.className = "config-fieldset-legend";
        leg.textContent = g.label + (g.required ? "" : " (optional)");
        fieldset.appendChild(leg);
        var grid = document.createElement("div");
        grid.className = "config-chip-grid";
        (g.choices || []).forEach(function (ch) {
          var lab = document.createElement("label");
          lab.className = "config-chip";
          var input = document.createElement("input");
          input.type = "radio";
          input.name = "opt-" + product.id + "-" + g.id;
          input.value = ch.id;
          input.checked = selectedOptionIds[g.id] === ch.id;
          input.addEventListener("change", function () {
            selectedOptionIds[g.id] = ch.id;
            refreshTotals();
          });
          var span = document.createElement("span");
          var labelText = ch.label;
          if (ch.priceAdjust) labelText += " (+" + fmtMoney(ch.priceAdjust) + ")";
          span.textContent = labelText;
          lab.appendChild(input);
          lab.appendChild(span);
          grid.appendChild(lab);
        });
        fieldset.appendChild(grid);
        el.panelOptions.appendChild(fieldset);
      });
    }
  }

  function selectProduct(index) {
    var cat = currentCategory();
    if (!cat || !cat.products || !cat.products[index]) return;
    productIndex = index;
    var product = cat.products[index];

    ensureVariantDefault(product);
    ensureOptionDefaults(product);
    addonState = {};
    (product.addons || []).forEach(function (a) {
      addonState[a.id] = false;
    });
    if (el.qty) el.qty.value = "1";

    renderProductList();
    if (el.empty) el.empty.hidden = true;
    if (el.panel) el.panel.hidden = false;

    el.panelCategory.textContent = cat.name;
    el.panelTitle.textContent = product.name;
    el.panelSku.textContent = product.sku ? "SKU " + product.sku : "";
    el.panelSummary.textContent = product.summary || "";

    renderOptions(product);
    renderAddons(product);
    refreshTotals();

    if (el.copyFeedback) el.copyFeedback.textContent = "";
    if (el.addCartFeedback) el.addCartFeedback.textContent = "";

    document.querySelectorAll(".config-product-btn").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.index === String(index) ? "true" : "false");
    });
  }

  function optionProductPriceRange(product) {
    if (!product || product.pricingModel !== "options") return { min: 0, max: 0 };
    var base = product.basePrice || 0;
    var groups = product.optionGroups || [];
    var minTotal = base;
    var maxTotal = base;
    groups.forEach(function (g) {
      var adj = (g.choices || []).map(function (c) {
        return c.priceAdjust || 0;
      });
      if (!adj.length) return;
      minTotal += Math.min.apply(null, adj);
      maxTotal += Math.max.apply(null, adj);
    });
    return { min: minTotal, max: maxTotal };
  }

  function optionProductApproxQty(product) {
    var groups = product.optionGroups || [];
    var sizeG = groups.find(function (g) {
      return g.id === "size";
    });
    var g0 = sizeG || groups[0];
    if (!g0 || !g0.choices) return "—";
    var sum = g0.choices.reduce(function (s, c) {
      return s + (typeof c.inventory === "number" ? c.inventory : 0);
    }, 0);
    return sum;
  }

  function renderInventoryTable() {
    if (!el.inventoryTbody || !catalog) return;
    el.inventoryTbody.innerHTML = "";
    var th = lowThreshold();

    catalog.categories.forEach(function (cat) {
      cat.products.forEach(function (p) {
        if (p.pricingModel === "variants" && p.variants) {
          p.variants.forEach(function (v) {
            var tr = document.createElement("tr");
            var sku = (p.sku || p.id) + "-" + v.id;
            tr.innerHTML =
              "<td>" +
              escapeHtml(cat.name) +
              "</td><td>" +
              escapeHtml(p.name) +
              "</td><td>" +
              escapeHtml(v.label) +
              "</td><td>" +
              escapeHtml(sku) +
              "</td><td class=\"config-td-num\">" +
              fmtMoney(v.price) +
              "</td><td class=\"config-td-qty " +
              qtyClass(v.inventory, th) +
              "\">" +
              v.inventory +
              "</td>";
            el.inventoryTbody.appendChild(tr);
          });
        } else {
          var range = optionProductPriceRange(p);
          var priceCell =
            range.min === range.max
              ? fmtMoney(range.min)
              : fmtMoney(range.min) + " – " + fmtMoney(range.max);
          var qtyApprox = optionProductApproxQty(p);
          var tr = document.createElement("tr");
          tr.innerHTML =
            "<td>" +
            escapeHtml(cat.name) +
            "</td><td>" +
            escapeHtml(p.name) +
            "</td><td>Configurable (sizes / options)</td><td>" +
            escapeHtml(p.sku || p.id) +
            "</td><td class=\"config-td-num\">" +
            priceCell +
            "</td><td class=\"config-td-qty\">" +
            qtyApprox +
            " est.</td>";
          el.inventoryTbody.appendChild(tr);
        }
      });
    });
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function qtyClass(qty, th) {
    if (qty <= 0) return "config-td-out";
    if (qty < th) return "config-td-low";
    return "";
  }

  function init() {
    if (el.btnQuote) {
      el.btnQuote.addEventListener("click", function () {
        var email = (meta && meta.contactEmail) || "shannon@hoodooak.com";
        var body = encodeURIComponent(buildSummary());
        var subject = encodeURIComponent("Hoodoo — product configuration");
        window.location.href = "mailto:" + email + "?subject=" + subject + "&body=" + body;
      });
    }

    if (el.btnCopy) {
      el.btnCopy.addEventListener("click", function () {
        var text = buildSummary();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              if (el.copyFeedback) el.copyFeedback.textContent = "Copied to clipboard.";
            },
            function () {
              fallbackCopy(text);
            }
          );
        } else {
          fallbackCopy(text);
        }
      });
    }

    function fallbackCopy(text) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        if (el.copyFeedback) el.copyFeedback.textContent = "Copied to clipboard.";
      } catch (e) {
        if (el.copyFeedback) el.copyFeedback.textContent = "Copy failed — try Email instead.";
      }
      document.body.removeChild(ta);
    }

    if (el.qty) {
      el.qty.addEventListener("input", refreshTotals);
      el.qty.addEventListener("change", refreshTotals);
    }

    if (el.btnAddCart) {
      el.btnAddCart.addEventListener("click", addToCart);
    }

    function loadCatalog() {
      return fetch(apiUrl("/catalog"), { credentials: "same-origin" }).then(function (r) {
        if (r.ok) return r.json();
        return fetch("data/catalog.json").then(function (r2) {
          if (!r2.ok) throw new Error("Bad response");
          return r2.json();
        });
      });
    }

    loadCatalog()
      .then(function (data) {
        catalog = data;
        meta = data.meta || {};
        if (el.meta) {
          var parts = [];
          if (meta.lastUpdated) parts.push("Catalog updated " + meta.lastUpdated);
          if (meta.currency) parts.push(meta.currency);
          el.meta.textContent = parts.join(" · ");
        }
        renderCategories();
        renderProductList();
        var firstCat = catalog.categories[0];
        if (firstCat && firstCat.products && firstCat.products.length) {
          selectProduct(0);
        } else {
          if (el.empty) el.empty.hidden = false;
          if (el.panel) el.panel.hidden = true;
        }
        renderInventoryTable();
      })
      .catch(function () {
        if (el.meta) {
          el.meta.textContent =
            "Could not load catalog. Run the API (docker compose / uvicorn) or ensure data/catalog.json is available for static hosting.";
        }
        if (el.empty) {
          el.empty.hidden = false;
          el.empty.querySelector(".config-empty-text").textContent =
            "No catalog source found. Use the full stack, or open via a server with data/catalog.json.";
        }
        if (el.panel) el.panel.hidden = true;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
