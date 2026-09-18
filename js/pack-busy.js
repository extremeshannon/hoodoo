(function (global) {
  var timer = 0;
  var started = 0;
  var finished = false;
  var steps = [];

  function el(id) {
    return document.getElementById(id);
  }

  function overlay() {
    return el("pack-overlay");
  }

  function setPageLocked(on) {
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node.id === "pack-overlay") return;
      if (on) node.setAttribute("inert", "");
      else node.removeAttribute("inert");
    });
    if (on) document.body.classList.add("is-pack-busy");
    else document.body.classList.remove("is-pack-busy");
  }

  function setBar(pct) {
    var capped = finished ? 100 : Math.max(0, Math.min(99.4, pct));
    var bar = el("pack-busy-bar");
    var pctEl = el("pack-busy-pct");
    var wrap = el("pack-busy-barwrap");
    var label = capped >= 95 && capped < 100 ? capped.toFixed(1) : String(Math.round(capped));
    if (bar) bar.style.width = capped + "%";
    if (pctEl) pctEl.textContent = label + "%";
    if (wrap) wrap.setAttribute("aria-valuenow", String(Math.round(capped)));
  }

  function setDetail(text) {
    var d = el("pack-busy-detail");
    if (d) d.textContent = text || "";
  }

  function tick() {
    if (finished) return;
    var elapsed = Date.now() - started;
    // Ease toward 99% so a long zip never sits on a round number.
    var pct = 99.4 - 95.4 * Math.exp(-elapsed / 22000);
    setBar(pct);
    if (elapsed > 28000) {
      setDetail("Still writing the zip — this is normal for a full 300 DPI pack.");
    } else if (steps.length) {
      var span = Math.max(1, steps.length);
      var idx = Math.min(span - 1, Math.floor((elapsed / 28000) * span));
      setDetail(steps[idx]);
    }
    timer = window.setTimeout(tick, 120);
  }

  function showCard(mode) {
    var card = el("pack-busy-card");
    var title = el("pack-busy-title");
    var banner = el("pack-busy-banner");
    var done = el("pack-busy-done");
    var kicker = el("pack-busy-kicker");
    if (card) {
      card.classList.toggle("is-done", mode === "done");
      card.classList.toggle("is-fail", mode === "fail");
    }
    if (title) title.textContent = mode === "done" ? "Print pack complete" : mode === "fail" ? "Print pack failed" : "Building print pack";
    if (kicker) kicker.textContent = mode === "done" ? "Ready to print" : "Epson F6200 · 300 DPI";
    if (banner) {
      banner.hidden = mode !== "done";
      banner.textContent = "Completed";
    }
    if (done) {
      done.hidden = mode === "run";
      done.textContent = mode === "fail" ? "Close" : "Done";
      if (mode !== "run") {
        window.setTimeout(function () {
          try {
            done.focus();
          } catch (e) {}
        }, 0);
      }
    }
  }

  function start(opts) {
    opts = opts || {};
    finished = false;
    started = Date.now();
    steps = opts.steps && opts.steps.length ? opts.steps.slice() : ["Saving job…", "Rendering pieces…", "Nesting on 44 in roll…", "Zipping PRINT, CLO, CUT…"];
    var root = overlay();
    if (!root) return;
    root.hidden = false;
    setPageLocked(true);
    showCard("run");
    setBar(4);
    setDetail(steps[0]);
    if (timer) window.clearTimeout(timer);
    tick();
  }

  function complete(msg) {
    finished = true;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    setBar(100);
    setDetail(msg || "Downloaded. PRINT PNGs are 300 DPI for the F6200.");
    showCard("done");
  }

  function fail(msg) {
    finished = true;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    setDetail(msg || "Could not build pack.");
    showCard("fail");
  }

  function hide() {
    finished = true;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    var root = overlay();
    if (root) root.hidden = true;
    setPageLocked(false);
    showCard("run");
  }

  function bind() {
    var done = el("pack-busy-done");
    if (done && !done.dataset.bound) {
      done.dataset.bound = "1";
      done.addEventListener("click", hide);
    }
    if (!document.documentElement.dataset.packBusyEsc) {
      document.documentElement.dataset.packBusyEsc = "1";
      document.addEventListener("keydown", function (e) {
        var root = overlay();
        if (!root || root.hidden) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (finished) hide();
        } else if (!finished && e.key === "Tab") {
          e.preventDefault();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  global.HoodooPackBusy = {
    start: start,
    complete: complete,
    fail: fail,
    hide: hide,
  };
})(typeof window !== "undefined" ? window : this);
