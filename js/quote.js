(function () {
  var form = document.getElementById("quote-form");
  if (!form || !window.HoodooApi) return;

  var garmentSel = document.getElementById("q-garment");
  var qtyEl = document.getElementById("q-qty");
  var stitchesEl = document.getElementById("q-stitches");
  var colorsEl = document.getElementById("q-colors");
  var locEl = document.getElementById("q-locations");
  var presetEl = document.getElementById("q-stitch-preset");
  var dstEl = document.getElementById("q-dst");
  var textOnlyEl = document.getElementById("q-text-only");
  var namesEl = document.getElementById("q-names");
  var embFields = document.getElementById("q-emb-fields");
  var screenFields = document.getElementById("q-screen-fields");
  var subEl = document.getElementById("q-subtotal");
  var eachEl = document.getElementById("q-each");
  var linesEl = document.getElementById("q-lines");
  var discEl = document.getElementById("q-disclaimer");
  var emailEl = document.getElementById("q-email");
  var last = null;

  function method() {
    var el = form.querySelector('input[name="q-method"]:checked');
    return el ? el.value : "embroidery";
  }

  function money(n) {
    return "$" + Number(n).toFixed(2);
  }

  function toggleFields() {
    var m = method();
    embFields.hidden = m !== "embroidery";
    screenFields.hidden = m !== "screen";
  }

  function render(est) {
    last = est;
    subEl.textContent = money(est.subtotal);
    eachEl.textContent = money(est.each) + " each · qty " + est.quantity + " (tier " + est.qtyTier + "+)";
    linesEl.innerHTML = (est.lines || [])
      .map(function (l) {
        return "<li><span>" + l.label + "</span><strong>" + money(l.amount) + "</strong></li>";
      })
      .join("");
    discEl.textContent = [est.disclaimer || ""].concat(est.notes || []).filter(Boolean).join(" ");
    var body = [
      "Hoodoo instant estimate (guide only)",
      "Garment: " + (est.garment && est.garment.name),
      "Qty: " + est.quantity,
      "Method: " + est.method,
      "Subtotal: " + money(est.subtotal),
      "",
      (est.lines || []).map(function (l) { return l.label + " — " + money(l.amount); }).join("\n"),
    ].join("\n");
    emailEl.href =
      "mailto:shannnon@hoodooak.com?subject=" +
      encodeURIComponent("Hoodoo estimate — " + (est.garment && est.garment.name)) +
      "&body=" +
      encodeURIComponent(body);
  }

  function run() {
    toggleFields();
    var body = {
      garment: garmentSel.value || "tee",
      quantity: Number(qtyEl.value || 1),
      method: method(),
      stitches: Number(stitchesEl.value || 5000),
      colors: Number(colorsEl.value || 1),
      locations: Number(locEl.value || 1),
      hasDst: !!(dstEl && dstEl.checked),
      textOnly: !!(textOnlyEl && textOnlyEl.checked),
      names: Number(namesEl && namesEl.value ? namesEl.value : 0),
    };
    fetch((window.HOODOO_API_BASE || "") + "/api/quote/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) throw new Error(x.j.detail || "Estimate failed");
        render(x.j);
      })
      .catch(function (e) {
        subEl.textContent = "—";
        eachEl.textContent = e.message || "Could not estimate";
      });
  }

  if (presetEl && stitchesEl) {
    presetEl.addEventListener("change", function () {
      stitchesEl.value = presetEl.value;
    });
  }

  window.HoodooApi.fetchJson("/pricing/decoration").then(function (data) {
    (data.garments || []).forEach(function (g) {
      var opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.name;
      garmentSel.appendChild(opt);
    });
    run();
  }).catch(run);

  form.addEventListener("input", run);
  form.addEventListener("change", run);
})();
