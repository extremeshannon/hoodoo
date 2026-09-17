(function () {
  var el = document.getElementById("price-tables");
  if (!el) return;

  function money(n) {
    return "$" + Number(n).toFixed(2);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function table(title, bands, matrix, tiers, labels, bandKey) {
    var head =
      "<tr><th>" +
      esc(bandKey) +
      "</th>" +
      tiers
        .map(function (t) {
          return "<th>" + esc(labels[String(t)] || t + "+") + "</th>";
        })
        .join("") +
      "</tr>";
    var body = bands
      .map(function (b) {
        var row = matrix[b.id] || {};
        var label = esc(b.label) + (b.hint ? "<span class='price-hint'>" + esc(b.hint) + "</span>" : "");
        return (
          "<tr><th>" +
          label +
          "</th>" +
          tiers
            .map(function (t) {
              return "<td>" + money(row[String(t)]) + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    return (
      "<section class='price-block'><h2 class='section-title'>" +
      esc(title) +
      "</h2><div class='config-table-wrap'><table class='config-table price-table'>" +
      head +
      body +
      "</table></div></section>"
    );
  }

  fetch("/api/pricing/decoration")
    .then(function (r) {
      if (!r.ok) throw new Error("Could not load pricing");
      return r.json();
    })
    .then(function (d) {
      var t = d.meta.qtyTiers;
      var labels = d.meta.qtyTierLabels || {};
      var e = d.embroidery;
      var intro = document.getElementById("price-intro");
      if (intro && e.intro) intro.textContent = e.intro;
      var guide = (e.stitchGuide || [])
        .map(function (g) {
          return (
            "<li class='price-guide-card'><strong>" +
            esc(g.label) +
            "</strong><span>~" +
            Number(g.typicalStitches).toLocaleString() +
            " stitches</span><p>" +
            esc(g.note || "") +
            "</p></li>"
          );
        })
        .join("");
      var notes = (d.meta.notes || [])
        .map(function (n) {
          return "<li>" + esc(n) + "</li>";
        })
        .join("");
      el.innerHTML =
        "<section class='price-block'><h2 class='section-title'>Typical stitch counts</h2>" +
        "<ul class='price-guide'>" +
        guide +
        "</ul></section>" +
        table(
          "Embroidery — per garment (stitch band × quantity)",
          e.stitchBands,
          e.perPiece,
          t,
          labels,
          "Stitches"
        ) +
        "<p class='quote-hint'>Decoration only — blank garment is extra. 15,000+ stitches is a custom quote. Extra location on the same piece is 90% of the first-location rate.</p>" +
        "<section class='price-block'><h2 class='section-title'>Setup &amp; add-ons</h2>" +
        "<div class='config-table-wrap'><table class='config-table price-table'><tbody>" +
        "<tr><th>Digitizing — standard logo</th><td>" +
        money(e.digitizingFirst) +
        " first location</td></tr>" +
        "<tr><th>Digitizing — additional location</th><td>" +
        money(e.digitizingAdditional) +
        " each</td></tr>" +
        "<tr><th>Digitizing — name / text only</th><td>" +
        money(e.digitizingTextOnly) +
        "</td></tr>" +
        "<tr><th>Minimum billed stitches</th><td>" +
        Number(e.minStitchesBilled).toLocaleString() +
        "</td></tr>" +
        "<tr><th>Individual names (each)</th><td>" +
        t
          .map(function (q) {
            return esc(labels[String(q)] || q) + " " + money(e.individualName[String(q)]);
          })
          .join(" · ") +
        "</td></tr>" +
        "<tr><th>Hat hoop surcharge (each)</th><td>" +
        t
          .map(function (q) {
            return esc(labels[String(q)] || q) + " " + money(e.hatHoop[String(q)]);
          })
          .join(" · ") +
        "</td></tr>" +
        "</tbody></table></div></section>" +
        "<ul class='price-notes'>" +
        notes +
        "</ul>" +
        table(
          "Screen print — per garment (ink colors × qty)",
          d.screenPrint.colorBands,
          d.screenPrint.perPiece,
          t,
          labels,
          "Colors"
        ) +
        "<p class='quote-hint'>Screen setup $" +
        d.screenPrint.screenFeePerColor +
        " per color, waived at " +
        d.screenPrint.screenFeeWaivedAtQty +
        "+ pieces.</p>" +
        table(
          "Dye sublimation — per garment",
          [{ id: "ds", label: "Full / panel print" }],
          { ds: d.dyeSub.perPiece },
          t,
          labels,
          "Method"
        ) +
        "<p class='quote-hint'>Art setup $" +
        d.dyeSub.setup +
        ".</p>";
    })
    .catch(function (err) {
      el.innerHTML = "<p class='quote-hint'>Could not load the price tables. " + esc(err.message || err) + "</p>";
    });
})();
