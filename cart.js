(function () {
  var base = window.HOODOO_API_BASE || "";
  var methods = null;
  var lastCart = null;
  var saveTimer = null;
  var filling = false;

  function apiUrl(path) {
    return base + "/api" + path;
  }

  var el = {
    loading: document.getElementById("cart-loading"),
    empty: document.getElementById("cart-empty"),
    content: document.getElementById("cart-content"),
    lines: document.getElementById("cart-lines"),
    subtotal: document.getElementById("cart-subtotal"),
    shipping: document.getElementById("cart-shipping"),
    shippingLabel: document.getElementById("cart-shipping-label"),
    total: document.getElementById("cart-total"),
    email: document.getElementById("cart-email"),
    clear: document.getElementById("cart-clear"),
    saveOrder: document.getElementById("cart-save-order"),
    feedback: document.getElementById("cart-feedback"),
    methodPickup: document.getElementById("method-pickup"),
    methodShipping: document.getElementById("method-shipping"),
    pickupPanel: document.getElementById("cart-pickup-panel"),
    shippingPanel: document.getElementById("cart-shipping-panel"),
    pickupTitle: document.getElementById("cart-pickup-title"),
    pickupAddr: document.getElementById("cart-pickup-addr"),
    pickupNote: document.getElementById("cart-pickup-note"),
    pickupPhone: document.getElementById("pickup-phone"),
    shipName: document.getElementById("ship-name"),
    shipLine1: document.getElementById("ship-line1"),
    shipLine2: document.getElementById("ship-line2"),
    shipCity: document.getElementById("ship-city"),
    shipRegion: document.getElementById("ship-region"),
    shipPostal: document.getElementById("ship-postal"),
    shipCountry: document.getElementById("ship-country"),
    shipPhone: document.getElementById("ship-phone"),
    rateNote: document.getElementById("cart-rate-note"),
    payNote: document.getElementById("cart-pay-note"),
  };

  function parseErrorDetail(data) {
    if (!data || typeof data !== "object") return "Request failed";
    var d = data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && d[0].msg) return d[0].msg;
    return "Request failed";
  }

  function money(n) {
    var s = String(n == null ? "0.00" : n);
    if (s.indexOf(".") === -1) s += ".00";
    return "$" + s;
  }

  function currentMethod() {
    if (el.methodShipping && el.methodShipping.getAttribute("aria-pressed") === "true") return "shipping";
    return "pickup";
  }

  function setMethodUi(method) {
    var ship = method === "shipping";
    if (el.methodPickup) el.methodPickup.setAttribute("aria-pressed", ship ? "false" : "true");
    if (el.methodShipping) el.methodShipping.setAttribute("aria-pressed", ship ? "true" : "false");
    if (el.pickupPanel) el.pickupPanel.hidden = ship;
    if (el.shippingPanel) el.shippingPanel.hidden = !ship;
  }

  function fillRegions(country) {
    if (!el.shipRegion) return;
    var regions = (methods && methods.regions && methods.regions[country]) || [];
    var prev = el.shipRegion.value;
    el.shipRegion.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select";
    el.shipRegion.appendChild(blank);
    regions.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.label;
      el.shipRegion.appendChild(opt);
    });
    if (country === "CA") {
      ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"].forEach(function (code) {
        var opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code;
        el.shipRegion.appendChild(opt);
      });
    }
    if (prev) el.shipRegion.value = prev;
  }

  function applyPickupCopy() {
    var p = (methods && methods.pickup) || {};
    if (el.pickupTitle) el.pickupTitle.textContent = p.title || "Pickup in Wasilla";
    if (el.pickupAddr) {
      el.pickupAddr.textContent = [p.line1, p.city + (p.region ? ", " + p.region : "") + " " + (p.postal || "")]
        .filter(Boolean)
        .join(" · ");
    }
    if (el.pickupNote) {
      el.pickupNote.textContent = [p.detail, p.hours, p.phone ? "Shop: " + p.phone : ""].filter(Boolean).join(" ");
    }
    if (el.payNote && methods && methods.checkout && methods.checkout.message) {
      el.payNote.textContent = methods.checkout.message;
    }
  }

  function fulfillmentPayload() {
    var method = currentMethod();
    if (method === "pickup") {
      return {
        method: "pickup",
        phone: (el.pickupPhone && el.pickupPhone.value) || "",
      };
    }
    return {
      method: "shipping",
      name: (el.shipName && el.shipName.value) || "",
      line1: (el.shipLine1 && el.shipLine1.value) || "",
      line2: (el.shipLine2 && el.shipLine2.value) || "",
      city: (el.shipCity && el.shipCity.value) || "",
      region: (el.shipRegion && el.shipRegion.value) || "",
      postal: (el.shipPostal && el.shipPostal.value) || "",
      country: (el.shipCountry && el.shipCountry.value) || "US",
      phone: (el.shipPhone && el.shipPhone.value) || "",
    };
  }

  function fillFulfillmentForm(ful) {
    filling = true;
    var method = (ful && ful.method) || "pickup";
    setMethodUi(method);
    var dest = (ful && ful.destination) || {};
    if (method === "pickup") {
      if (el.pickupPhone && dest.phone) el.pickupPhone.value = dest.phone;
      else if (el.pickupPhone && ful && ful.pickup && !el.pickupPhone.value) {
        /* leave blank so they enter a callback number */
      }
    } else {
      if (el.shipCountry) {
        el.shipCountry.value = dest.country || "US";
        fillRegions(el.shipCountry.value);
      }
      if (el.shipName) el.shipName.value = dest.name || "";
      if (el.shipLine1) el.shipLine1.value = dest.line1 || "";
      if (el.shipLine2) el.shipLine2.value = dest.line2 || "";
      if (el.shipCity) el.shipCity.value = dest.city || "";
      if (el.shipRegion) el.shipRegion.value = dest.region || "";
      if (el.shipPostal) el.shipPostal.value = dest.postal || "";
      if (el.shipPhone) el.shipPhone.value = dest.phone || "";
    }
    filling = false;
  }

  function applyTotals(data) {
    var ful = data.fulfillment || {};
    if (el.subtotal) el.subtotal.textContent = money(data.subtotal);
    if (el.shipping) {
      el.shipping.textContent = ful.quoted ? "Quoted" : money(data.shipping || "0.00");
    }
    if (el.shippingLabel) {
      el.shippingLabel.textContent = ful.method === "shipping" ? ful.rate_label || "Shipping" : "Pickup";
    }
    if (el.total) el.total.textContent = money(data.total || data.subtotal);
    if (el.rateNote) {
      if (ful.method === "shipping") el.rateNote.textContent = ful.detail || "";
      else el.rateNote.textContent = "";
    }
  }

  function loadCart() {
    return fetch(apiUrl("/cart"), { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("Could not load cart");
      return r.json();
    });
  }

  function saveFulfillment() {
    if (filling) return Promise.resolve(lastCart);
    return fetch(apiUrl("/cart/fulfillment"), {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fulfillmentPayload()),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (j) {
          throw new Error(parseErrorDetail(j));
        });
      }
      return r.json();
    });
  }

  function scheduleSave() {
    if (filling) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveFulfillment()
        .then(function (data) {
          lastCart = data;
          applyTotals(data);
        })
        .catch(function (e) {
          if (el.feedback) el.feedback.textContent = e.message || "Could not save shipping.";
        });
    }, 280);
  }

  function render(data) {
    lastCart = data;
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

    fillFulfillmentForm(data.fulfillment);
    applyTotals(data);
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
      .then(function (data) {
        return saveFulfillment().then(function () { return data; });
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
    var ful = data.fulfillment || {};
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
    if (ful.method === "shipping") {
      var dest = ful.destination || {};
      lines.push("Fulfillment: Shipping — " + (ful.rate_label || ""));
      lines.push("Ship to: " + [dest.name, dest.line1, dest.line2, dest.city, dest.region, dest.postal, dest.country].filter(Boolean).join(", "));
      lines.push(ful.quoted ? "Shipping: quoted before payment" : "Shipping (guide): $" + (data.shipping || "0.00"));
    } else {
      lines.push("Fulfillment: Pickup in Wasilla");
      lines.push("Pickup: 7362 W Parks Hwy PMB 213, Wasilla, AK 99623");
      if (el.pickupPhone && el.pickupPhone.value) lines.push("Callback phone: " + el.pickupPhone.value);
    }
    lines.push("Total (guide): $" + (data.total || data.subtotal));
    lines.push("---");
    lines.push("shannnon@hoodooak.com · 907.202.5634 · Wasilla, AK");
    var body = encodeURIComponent(lines.join("\n"));
    window.location.href = "mailto:shannnon@hoodooak.com?subject=" + encodeURIComponent("Hoodoo — cart quote") + "&body=" + body;
  }

  function saveOrderToAccount() {
    if (!window.HoodooApi || !window.HoodooApi.getToken()) {
      window.location.href = "/login?next=" + encodeURIComponent("/cart.html");
      return;
    }
    saveFulfillment()
      .then(function (data) {
        var items = (data && data.items) || [];
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
          body: JSON.stringify({
            lines: lines,
            customer_note: null,
            fulfillment: fulfillmentPayload(),
          }),
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
    applyPickupCopy();
    fillRegions((el.shipCountry && el.shipCountry.value) || "US");

    if (el.methodPickup) {
      el.methodPickup.addEventListener("click", function () {
        setMethodUi("pickup");
        scheduleSave();
      });
    }
    if (el.methodShipping) {
      el.methodShipping.addEventListener("click", function () {
        setMethodUi("shipping");
        scheduleSave();
      });
    }
    if (el.shipCountry) {
      el.shipCountry.addEventListener("change", function () {
        fillRegions(el.shipCountry.value);
        scheduleSave();
      });
    }
    [
      el.pickupPhone,
      el.shipName,
      el.shipLine1,
      el.shipLine2,
      el.shipCity,
      el.shipRegion,
      el.shipPostal,
      el.shipPhone,
    ].forEach(function (field) {
      if (!field) return;
      field.addEventListener("input", scheduleSave);
      field.addEventListener("change", scheduleSave);
    });

    if (el.clear) el.clear.addEventListener("click", clearCart);
    if (el.saveOrder) el.saveOrder.addEventListener("click", saveOrderToAccount);
    if (el.email) {
      el.email.addEventListener("click", function () {
        saveFulfillment()
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

    Promise.all([
      fetch(apiUrl("/shipping/methods"), { credentials: "same-origin" }).then(function (r) {
        if (!r.ok) return {};
        return r.json();
      }),
      loadCart(),
    ])
      .then(function (pair) {
        methods = pair[0] || {};
        applyPickupCopy();
        fillRegions((el.shipCountry && el.shipCountry.value) || "US");
        render(pair[1]);
      })
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
