(function () {
  var base = window.HOODOO_API_BASE || "";

  function apiUrl(path) {
    return base + "/api" + path;
  }

  var el = {
    loading: document.getElementById("cart-loading"),
    empty: document.getElementById("cart-empty"),
    content: document.getElementById("cart-content"),
    lines: document.getElementById("cart-lines"),
    subtotal: document.getElementById("cart-subtotal"),
    email: document.getElementById("cart-email"),
    clear: document.getElementById("cart-clear"),
    saveOrder: document.getElementById("cart-save-order"),
    feedback: document.getElementById("cart-feedback"),
  };

  function parseErrorDetail(data) {
    if (!data || typeof data !== "object") return "Request failed";
    var d = data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && d[0].msg) return d[0].msg;
    return "Request failed";
  }

  function loadCart() {
    return fetch(apiUrl("/cart"), { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("Could not load cart");
      return r.json();
    });
  }

  function render(data) {
    if (el.loading) el.loading.hidden = true;
    var items = data.items || [];
    if (!items.length) {
      if (el.empty) el.empty.hidden = false;
      if (el.content) el.content.hidden = true;
      if (window.HoodooRefreshCartBadge) window.HoodooRefreshCartBadge();
      return;
    }
    if (el.empty) el.empty.hidden = true;
    if (el.content) el.content.hidden = false;
    if (el.lines) el.lines.innerHTML = "";

    items.forEach(function (line) {
      var wrap = document.createElement("article");
      wrap.className = "cart-line";
      wrap.dataset.itemId = String(line.id);

      var left = document.createElement("div");
      var h = document.createElement("h2");
      h.className = "cart-line-title";
      h.textContent = line.product_name;
      var p = document.createElement("p");
      p.className = "cart-line-meta";
      p.textContent = (line.category_name ? line.category_name + " · " : "") + line.label;
      left.appendChild(h);
      left.appendChild(p);

      var qtyWrap = document.createElement("div");
      qtyWrap.className = "cart-line-qty";
      var ql = document.createElement("label");
      ql.textContent = "Qty ";
      var input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "999";
      input.value = String(line.quantity);
      input.setAttribute("aria-label", "Quantity for " + line.product_name);
      input.addEventListener("change", function () {
        var q = parseInt(input.value, 10);
        if (isNaN(q) || q < 1) q = 1;
        patchQty(line.id, q, input);
      });
      ql.appendChild(input);
      qtyWrap.appendChild(ql);

      var right = document.createElement("div");
      right.className = "cart-line-actions";
      var total = document.createElement("div");
      total.className = "cart-line-total";
      total.textContent = "$" + line.line_total;
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn btn-ghost";
      rm.textContent = "Remove";
      rm.addEventListener("click", function () {
        removeLine(line.id);
      });
      right.appendChild(total);
      right.appendChild(rm);

      wrap.appendChild(left);
      wrap.appendChild(qtyWrap);
      wrap.appendChild(right);
      if (el.lines) el.lines.appendChild(wrap);
    });

    if (el.subtotal) el.subtotal.textContent = "$" + data.subtotal;
    if (window.HoodooRefreshCartBadge) window.HoodooRefreshCartBadge();
  }

  function patchQty(itemId, qty, inputEl) {
    fetch(apiUrl("/cart/items/" + itemId), {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: qty }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(parseErrorDetail(j)); });
        return r.json();
      })
      .then(render)
      .catch(function (e) {
        if (el.feedback) el.feedback.textContent = e.message || "Update failed";
        if (inputEl) loadCart().then(render).catch(function () {});
      });
  }

  function removeLine(itemId) {
    fetch(apiUrl("/cart/items/" + itemId), {
      method: "DELETE",
      credentials: "same-origin",
    })
      .then(function (r) {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(render)
      .catch(function () {
        if (el.feedback) el.feedback.textContent = "Could not remove line.";
      });
  }

  function clearCart() {
    fetch(apiUrl("/cart"), { method: "DELETE", credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error();
        if (el.feedback) el.feedback.textContent = "Cart cleared.";
        return loadCart();
      })
      .then(render)
      .catch(function () {
        if (el.feedback) el.feedback.textContent = "Could not clear cart.";
      });
  }

  function emailQuote(data) {
    var lines = [];
    lines.push("Hoodoo Alaska — cart quote request");
    lines.push("---");
    (data.items || []).forEach(function (line) {
      lines.push(line.quantity + " × " + line.product_name);
      lines.push("  " + line.label);
      lines.push("  Unit " + line.unit_price + " · Line " + line.line_total);
      lines.push("");
    });
    lines.push("Subtotal (guide): $" + data.subtotal);
    lines.push("---");
    lines.push("shannon@hoodooak.com · 907.202.5634 · Wasilla, AK");
    var body = encodeURIComponent(lines.join("\n"));
    window.location.href = "mailto:shannon@hoodooak.com?subject=" + encodeURIComponent("Hoodoo — cart quote") + "&body=" + body;
  }

  function saveOrderToAccount() {
    if (!window.HoodooApi || !window.HoodooApi.getToken()) {
      window.location.href = "/login?next=" + encodeURIComponent("/cart.html");
      return;
    }
    loadCart()
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          if (el.feedback) el.feedback.textContent = "Cart is empty.";
          return;
        }
        var lines = items.map(function (line) {
          return {
            product_slug: line.product_slug,
            quantity: line.quantity,
            configuration: line.configuration,
          };
        });
        return window.HoodooApi.fetchJson("/orders", {
          method: "POST",
          body: JSON.stringify({ lines: lines, customer_note: null }),
        });
      })
      .then(function (order) {
        if (!order) return;
        if (el.feedback) el.feedback.textContent = "Order saved.";
        window.location.href = "/order.html?id=" + encodeURIComponent(order.id);
      })
      .catch(function (e) {
        if (el.feedback) el.feedback.textContent = e.message || "Could not save order.";
      });
  }

  function init() {
    if (el.clear) el.clear.addEventListener("click", clearCart);
    if (el.saveOrder) el.saveOrder.addEventListener("click", saveOrderToAccount);
    if (el.email) {
      el.email.addEventListener("click", function () {
        loadCart()
          .then(function (data) {
            if (!(data.items && data.items.length)) {
              if (el.feedback) el.feedback.textContent = "Cart is empty.";
              return;
            }
            emailQuote(data);
          })
          .catch(function () {
            if (el.feedback) el.feedback.textContent = "Could not load cart.";
          });
      });
    }

    loadCart()
      .then(render)
      .catch(function () {
        if (el.loading) el.loading.textContent = "Cart unavailable. Start the API (e.g. docker compose up) and reload.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
