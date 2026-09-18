/** 2D dye-sub piece placer: drag / resize / rotate art on CLO cut outlines. */

const MM = 25.4;
const HANDLE = 9;

export function yDown(pts, heightMm) {
  return (pts || []).map(function (pt) {
    return [pt[0], heightMm - pt[1]];
  });
}

export function piecesForPart(garment, partId) {
  var map = (garment && garment.partPieces) || {
    front: ["front-pair-a", "front-pair-b"],
    back: ["back-pair-a", "back-pair-b"],
    sleeves: ["sleeve-left", "sleeve-right"],
    collar: ["collar-left", "collar-right"],
    waistband: ["waist-left", "waist-right"],
    frontTorso: ["front-pair-a", "front-pair-b"],
    backTorso: ["back-pair-a", "back-pair-b"],
  };
  var ids = map[partId] || [];
  var pieces = (garment && garment.pieces) || [];
  var hit = pieces.filter(function (p) {
    return ids.indexOf(p.id) !== -1;
  });
  if (hit.length) return hit;
  return pieces.filter(function (p) {
    return p.role && partId && partId.indexOf(p.role) !== -1;
  });
}

export function loadGarmentSpec(product, fit) {
  var gid =
    product === "freefly-jacket" && (fit === "male" || !fit)
      ? "male-jacket"
      : product === "freefly-jacket"
        ? "male-jacket"
        : "";
  var api = "/api/dyesub/garments/" + (gid || "male-jacket");
  var file = "/data/dyesub/" + (gid || "male-jacket") + "-pieces.json";
  return fetch(api, { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) throw new Error("api");
      return r.json();
    })
    .catch(function () {
      return fetch(file).then(function (r) {
        if (!r.ok) throw new Error("No print pieces for this garment yet.");
        return r.json();
      });
    });
}

export class PiecePlacer {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = opts || {};
    this.garment = null;
    this.piece = null;
    this.placements = [];
    this.images = {};
    this.selectedId = null;
    this.drag = null;
    this.baseColor = "#36B4E5";
    var self = this;
    canvas.addEventListener("pointerdown", function (e) {
      self.onDown(e);
    });
    window.addEventListener("pointermove", function (e) {
      self.onMove(e);
    });
    window.addEventListener("pointerup", function () {
      self.drag = null;
    });
  }

  setGarment(g) {
    this.garment = g;
    if (g && g.pieces && g.pieces[0] && !this.piece) this.piece = g.pieces[0];
  }

  setPiece(pieceOrId) {
    if (!this.garment) return;
    if (typeof pieceOrId === "string") {
      this.piece = (this.garment.pieces || []).find(function (p) {
        return p.id === pieceOrId;
      }) || this.piece;
    } else {
      this.piece = pieceOrId;
    }
    this.draw();
  }

  setBaseColor(hex) {
    this.baseColor = hex || this.baseColor;
    this.draw();
  }

  setImage(artId, img) {
    this.images[artId] = img;
    this.draw();
  }

  setPlacements(list) {
    this.placements = list || [];
    this.draw();
  }

  selected() {
    var id = this.selectedId;
    return this.placements.find(function (p) {
      return p.id === id;
    }) || null;
  }

  emit() {
    if (this.opts.onChange) this.opts.onChange(this);
  }

  view() {
    var piece = this.piece;
    var cssW = this.canvas.clientWidth || 640;
    var cssH = this.canvas.clientHeight || 720;
    var bleed = Number((this.garment && this.garment.bleedIn) || 0.25);
    var win = Number(piece.cutWin) + bleed * 2;
    var hin = Number(piece.cutHin) + bleed * 2;
    var pad = 12;
    var scale = Math.min((cssW - pad * 2) / win, (cssH - pad * 2) / hin);
    return {
      scale: scale,
      ox: (cssW - win * scale) / 2,
      oy: (cssH - hin * scale) / 2,
      bleed: bleed,
      cssW: cssW,
      cssH: cssH,
    };
  }

  toCanvas(vt, xIn, yIn) {
    return [vt.ox + (vt.bleed + xIn) * vt.scale, vt.oy + (vt.bleed + yIn) * vt.scale];
  }

  toPiece(vt, x, y) {
    return [(x - vt.ox) / vt.scale - vt.bleed, (y - vt.oy) / vt.scale - vt.bleed];
  }

  drawPoly(ptsMm, vt, fill, stroke, dash) {
    var piece = this.piece;
    var hMm = Number(piece.cutHin) * MM;
    var pts = yDown(ptsMm, hMm);
    if (pts.length < 2) return;
    var ctx = this.ctx;
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var c = this.toCanvas(vt, pts[i][0] / MM, pts[i][1] / MM);
      if (i === 0) ctx.moveTo(c[0], c[1]);
      else ctx.lineTo(c[0], c[1]);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.restore();
    }
  }

  draw() {
    var canvas = this.canvas;
    var ctx = this.ctx;
    var piece = this.piece;
    if (!canvas || !ctx) return;
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 640;
    var cssH = canvas.clientHeight || 720;
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#1a1d22";
    ctx.fillRect(0, 0, cssW, cssH);
    if (!piece) {
      ctx.fillStyle = "#8b95a5";
      ctx.fillText("No pattern piece", 16, 28);
      return;
    }
    var vt = this.view();
    canvas._vt = vt;
    this.drawPoly(piece.cutMm, vt, this.baseColor, "rgba(255,255,255,0.25)");
    if (piece.sewMm) this.drawPoly(piece.sewMm, vt, null, "#36B4E5", [6, 4]);
    var self = this;
    this.placements
      .filter(function (p) {
        return p.pieceId === piece.id;
      })
      .forEach(function (pl) {
        self.drawPlacement(pl, vt, pl.id === self.selectedId);
      });
  }

  drawPlacement(pl, vt, selected) {
    var img = this.images[pl.artId];
    var tl = this.toCanvas(vt, pl.xIn, pl.yIn);
    var br = this.toCanvas(vt, pl.xIn + pl.wIn, pl.yIn + pl.hIn);
    var w = br[0] - tl[0];
    var h = br[1] - tl[1];
    var cx = (tl[0] + br[0]) / 2;
    var cy = (tl[1] + br[1]) / 2;
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((pl.rotationDeg || 0) * Math.PI) / 180);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -w / 2, -h / 2, w, h);
    else {
      ctx.fillStyle = "rgba(10,11,13,0.5)";
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    if (selected) {
      ctx.strokeStyle = "#36B4E5";
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      var hs = HANDLE;
      [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ].forEach(function (p) {
        ctx.fillStyle = "#36B4E5";
        ctx.fillRect(p[0] - hs / 2, p[1] - hs / 2, hs, hs);
      });
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(0, -h / 2 - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -h / 2 - 22, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  hit(cssX, cssY) {
    var piece = this.piece;
    if (!piece || !this.canvas._vt) return null;
    var vt = this.canvas._vt;
    var list = this.placements
      .filter(function (p) {
        return p.pieceId === piece.id;
      })
      .slice()
      .reverse();
    for (var i = 0; i < list.length; i++) {
      var pl = list[i];
      var tl = this.toCanvas(vt, pl.xIn, pl.yIn);
      var br = this.toCanvas(vt, pl.xIn + pl.wIn, pl.yIn + pl.hIn);
      var w = br[0] - tl[0];
      var h = br[1] - tl[1];
      var cx = (tl[0] + br[0]) / 2;
      var cy = (tl[1] + br[1]) / 2;
      var r = (-(pl.rotationDeg || 0) * Math.PI) / 180;
      var dx = cssX - cx;
      var dy = cssY - cy;
      var lx = dx * Math.cos(r) - dy * Math.sin(r);
      var ly = dx * Math.sin(r) + dy * Math.cos(r);
      var hs = HANDLE + 4;
      var corners = [
        { name: "nw", x: -w / 2, y: -h / 2 },
        { name: "ne", x: w / 2, y: -h / 2 },
        { name: "se", x: w / 2, y: h / 2 },
        { name: "sw", x: -w / 2, y: h / 2 },
      ];
      for (var c = 0; c < corners.length; c++) {
        if (Math.abs(lx - corners[c].x) <= hs && Math.abs(ly - corners[c].y) <= hs) {
          return { type: "resize", handle: corners[c].name, pl: pl };
        }
      }
      if (Math.abs(lx) <= hs && Math.abs(ly - (-h / 2 - 22)) <= hs + 2) return { type: "rotate", pl: pl };
      if (lx >= -w / 2 && lx <= w / 2 && ly >= -h / 2 && ly <= h / 2) return { type: "move", pl: pl };
    }
    return null;
  }

  onDown(e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var hit = this.hit(x, y);
    if (!hit) {
      this.selectedId = null;
      this.draw();
      this.emit();
      return;
    }
    this.selectedId = hit.pl.id;
    var pl = hit.pl;
    this.drag = {
      type: hit.type,
      handle: hit.handle,
      pl: pl,
      startX: x,
      startY: y,
      orig: { xIn: pl.xIn, yIn: pl.yIn, wIn: pl.wIn, hIn: pl.hIn, rotationDeg: pl.rotationDeg || 0 },
    };
    this.draw();
    this.emit();
    e.preventDefault();
  }

  onMove(e) {
    if (!this.drag || !this.canvas._vt) return;
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var vt = this.canvas._vt;
    var pl = this.drag.pl;
    if (this.drag.type === "move") {
      pl.xIn = this.drag.orig.xIn + (x - this.drag.startX) / vt.scale;
      pl.yIn = this.drag.orig.yIn + (y - this.drag.startY) / vt.scale;
    } else if (this.drag.type === "resize") {
      var p0 = this.toPiece(vt, this.drag.startX, this.drag.startY);
      var p1 = this.toPiece(vt, x, y);
      var dw = p1[0] - p0[0];
      var aspect = this.drag.orig.wIn / this.drag.orig.hIn;
      var handle = this.drag.handle;
      var w = this.drag.orig.wIn;
      var nx = this.drag.orig.xIn;
      var ny = this.drag.orig.yIn;
      if (handle === "se" || handle === "ne") w = Math.max(0.2, this.drag.orig.wIn + dw);
      else w = Math.max(0.2, this.drag.orig.wIn - dw);
      var h = w / aspect;
      if (handle === "ne" || handle === "nw") ny = this.drag.orig.yIn + this.drag.orig.hIn - h;
      if (handle === "nw" || handle === "sw") nx = this.drag.orig.xIn + this.drag.orig.wIn - w;
      pl.wIn = w;
      pl.hIn = h;
      pl.xIn = nx;
      pl.yIn = ny;
    } else if (this.drag.type === "rotate") {
      var tl = this.toCanvas(vt, this.drag.orig.xIn, this.drag.orig.yIn);
      var br = this.toCanvas(vt, this.drag.orig.xIn + this.drag.orig.wIn, this.drag.orig.yIn + this.drag.orig.hIn);
      var cx = (tl[0] + br[0]) / 2;
      var cy = (tl[1] + br[1]) / 2;
      pl.rotationDeg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
    }
    this.draw();
    this.emit();
  }
}

export function defaultPlacement(piece, artId, aspect) {
  aspect = aspect || 1;
  var w = Math.min(piece.cutWin * 0.45, 8);
  var h = w / aspect;
  if (h > piece.cutHin * 0.45) {
    h = piece.cutHin * 0.45;
    w = h * aspect;
  }
  return {
    id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    artId: artId,
    pieceId: piece.id,
    xIn: (piece.cutWin - w) / 2,
    yIn: (piece.cutHin - h) / 3,
    wIn: w,
    hIn: h,
    rotationDeg: 0,
  };
}
