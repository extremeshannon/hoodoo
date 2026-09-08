(function () {
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  function setNavOpen(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    if (header) header.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.style.overflow = open ? "hidden" : "";
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setNavOpen(!nav.classList.contains("is-open"));
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setNavOpen(false);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNavOpen(false);
    });
  }

  function refreshCartBadge() {
    var el = document.getElementById("cart-nav-count");
    if (!el) return;
    fetch((window.HOODOO_API_BASE || "") + "/api/cart", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(function (data) {
        var n = typeof data.item_count === "number" ? data.item_count : 0;
        el.textContent = n > 0 ? "(" + n + ")" : "";
      })
      .catch(function () {
        el.textContent = "";
      });
  }

  refreshCartBadge();
  window.HoodooRefreshCartBadge = refreshCartBadge;

  var ul = document.querySelector(".nav-list");
  if (ul) {
    function ensureNav(href, label, beforeHref) {
      if (ul.querySelector('a[href="' + href + '"]')) return;
      var li = document.createElement("li");
      li.innerHTML = '<a href="' + href + '">' + label + "</a>";
      var before = beforeHref ? ul.querySelector('a[href="' + beforeHref + '"]') : null;
      var beforeLi = before ? before.closest("li") : ul.querySelector("a.nav-cta") && ul.querySelector("a.nav-cta").closest("li");
      if (beforeLi) ul.insertBefore(li, beforeLi);
      else ul.appendChild(li);
    }
    ensureNav("/suit.html", "Jumpsuits", "/cart.html");
    ensureNav("/pricing.html", "Pricing", "/cart.html");
    ensureNav("/quote.html", "Get a quote");
  }
})();
