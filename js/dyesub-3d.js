import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const ZIPPER_RE = /zipper|tape|slider|teeth|puller|stopper/;
const THREAD_RE = /stitch|needle|topstitch/;
const SKIP_RE = /button|hardware|avatar|hair|eye|eyelash|tooth|binded/;
const MM = 25.4;

const canvas = document.getElementById("dyesub-3d");
const metaEl = document.getElementById("stage-3d-meta");
const stage = canvas && canvas.parentElement;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let root = null;
let loader = null;
let currentUrl = "";
let pickFn = null;
let lastSnap = null;
let rafPaint = 0;
let loadAbort = null;
const glbCache = {};
const loadEl = document.getElementById("dyesub-3d-load");
const pctEl = document.getElementById("dyesub-3d-pct");
const barEl = document.getElementById("dyesub-3d-bar");
const barWrap = document.getElementById("dyesub-3d-barwrap");
const detailEl = document.getElementById("dyesub-3d-detail");
const loadTitle = document.getElementById("dyesub-3d-load-title");

function setMeta(msg) {
  if (metaEl) metaEl.textContent = msg;
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function setLoad(visible, pct, title, detail) {
  if (!loadEl) return;
  loadEl.hidden = !visible;
  if (!visible) return;
  var n = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if (loadTitle && title) loadTitle.textContent = title;
  if (pctEl) pctEl.textContent = n + "%";
  if (barEl) barEl.style.width = n + "%";
  if (barWrap) barWrap.setAttribute("aria-valuenow", String(n));
  if (detailEl && detail) detailEl.textContent = detail;
}

function hexOf(snap, pieceId) {
  if (!snap) return "#36B4E5";
  var colors = snap.baseColors || {};
  return colors[pieceId] || snap.baseColor || "#36B4E5";
}

function viewportSize() {
  var w = Math.max(1, (stage && stage.clientWidth) || 1);
  var h = Math.max(1, (stage && stage.clientHeight) || 1);
  w = Math.min(w, window.innerWidth || w);
  h = Math.min(h, window.innerHeight || h);
  return { w: w, h: h };
}

function ensure() {
  if (renderer || !canvas) return;
  var s = viewportSize();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(s.w, s.h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd5d8dc);
  camera = new THREE.PerspectiveCamera(38, s.w / Math.max(s.h, 1), 0.05, 80);
  camera.position.set(1.35, 1.15, 2.05);
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  var key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(2.4, 4.4, 3.2);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-3, 1.8, -1.6);
  scene.add(fill);
  var rim = new THREE.DirectionalLight(0xffffff, 0.28);
  rim.position.set(0, 2.4, -4);
  scene.add(rim);
  root = new THREE.Group();
  scene.add(root);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.85, 0);
  controls.addEventListener("start", function () {
    canvas.style.cursor = "grabbing";
  });
  controls.addEventListener("end", function () {
    canvas.style.cursor = "grab";
  });
  loader = new GLTFLoader();
  function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();
  canvas.addEventListener("pointerdown", onPick);
  window.addEventListener("pointerup", releaseCanvasPointer);
  window.addEventListener("pointercancel", releaseCanvasPointer);
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver !== "undefined" && stage) {
    new ResizeObserver(resize).observe(stage);
  }
}

function resize() {
  if (!renderer || !camera || !stage) return;
  var s = viewportSize();
  camera.aspect = s.w / Math.max(s.h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(s.w, s.h, false);
}

function disposeRoot() {
  if (!root) return;
  while (root.children.length) {
    var obj = root.children[0];
    obj.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        var mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(function (m) {
          if (m && m.userData && m.userData.dyesubMap && m.userData.dyesubMap.dispose) {
            m.userData.dyesubMap.dispose();
          }
          if (m && m.dispose) m.dispose();
        });
      }
    });
    root.remove(obj);
  }
}

function fit(obj) {
  var box = new THREE.Box3().setFromObject(obj);
  var center = box.getCenter(new THREE.Vector3());
  var dim = box.getSize(new THREE.Vector3());
  obj.position.sub(center);
  obj.position.y += dim.y * 0.02;
  var maxDim = Math.max(dim.x, dim.y, dim.z, 0.001);
  camera.position.set(maxDim * 0.9, maxDim * 0.35, maxDim * 1.55);
  camera.near = maxDim / 120;
  camera.far = maxDim * 24;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function collectNames(obj, mat) {
  var names = [];
  if (obj && obj.name) names.push(obj.name);
  if (mat && mat.name) names.push(mat.name);
  else if (obj && obj.material) {
    var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(function (m) {
      if (m && m.name) names.push(m.name);
    });
  }
  return names;
}

function hardwareKind(mesh, mat) {
  var blob = collectNames(mesh, mat).join(" ").toLowerCase();
  if (THREAD_RE.test(blob)) return "thread";
  if (ZIPPER_RE.test(blob)) return "zipper";
  if (SKIP_RE.test(blob)) return "skip";
  return null;
}

function toPreviewMat(mat) {
  if (!mat || mat.userData.preview) return mat;
  var m = new THREE.MeshLambertMaterial({
    name: mat.name,
    color: 0xffffff,
    side: mat.side != null ? mat.side : THREE.FrontSide,
  });
  m.userData = Object.assign({}, mat.userData || {});
  m.userData.preview = true;
  if ("toneMapped" in m) m.toneMapped = false;
  return m;
}

function cloneOne(mat, mesh) {
  var kind = hardwareKind(mesh, mat);
  if (kind === "skip") {
    var keep = mat.clone();
    keep.name = mat.name;
    keep.userData = Object.assign({}, mat.userData || {}, { hw: "skip" });
    return keep;
  }
  if (kind === "zipper" || kind === "thread") {
    var hw = mat.clone();
    hw.name = mat.name;
    hw.userData = Object.assign({}, mat.userData || {}, { hw: kind });
    hw.map = null;
    if (hw.metalness != null) hw.metalness = kind === "zipper" ? 0.35 : 0;
    if (hw.roughness != null) hw.roughness = kind === "zipper" ? 0.45 : 0.85;
    return hw;
  }
  return toPreviewMat(mat);
}

function uniquify(obj) {
  var groups = obj.geometry && obj.geometry.groups;
  if (groups && groups.length > 1) {
    var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    obj.material = groups.map(function (gr) {
      var src = mats[Math.min(gr.materialIndex || 0, mats.length - 1)] || mats[0];
      return cloneOne(src, obj);
    });
    groups.forEach(function (gr, i) {
      gr.materialIndex = i;
    });
    return;
  }
  if (Array.isArray(obj.material)) {
    obj.material = obj.material.map(function (m) {
      return cloneOne(m, obj);
    });
    return;
  }
  obj.material = cloneOne(obj.material, obj);
}

function primitiveCentroid(mesh, materialIndex) {
  var geo = mesh.geometry;
  if (!geo || !geo.attributes || !geo.attributes.position) return null;
  mesh.updateWorldMatrix(true, false);
  var pos = geo.attributes.position;
  var index = geo.index;
  var v = new THREE.Vector3();
  var acc = new THREE.Vector3();
  var n = 0;
  function addVert(i) {
    v.fromBufferAttribute(pos, i);
    v.applyMatrix4(mesh.matrixWorld);
    acc.add(v);
    n += 1;
  }
  var groups = geo.groups || [];
  if (groups.length && materialIndex != null) {
    groups.forEach(function (gr) {
      if (gr.materialIndex !== materialIndex) return;
      var start = gr.start;
      var end = start + gr.count;
      var i;
      if (index) {
        for (i = start; i < end; i++) addVert(index.getX(i));
      } else {
        for (i = start; i < end; i++) addVert(i);
      }
    });
  }
  if (!n) {
    var step = pos.count > 4000 ? Math.ceil(pos.count / 2000) : 1;
    for (var i = 0; i < pos.count; i += step) addVert(i);
  }
  if (!n) return null;
  acc.multiplyScalar(1 / n);
  return acc;
}

function uvBoundsOf(mesh, materialIndex) {
  var geo = mesh.geometry;
  if (!geo || !geo.attributes || !geo.attributes.uv) return null;
  var uv = geo.attributes.uv;
  var index = geo.index;
  var minU = Infinity;
  var maxU = -Infinity;
  var minV = Infinity;
  var maxV = -Infinity;
  var n = 0;
  function add(i) {
    var u = uv.getX(i);
    var v = uv.getY(i);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    n += 1;
  }
  var groups = geo.groups || [];
  if (groups.length && materialIndex != null) {
    groups.forEach(function (gr) {
      if (gr.materialIndex !== materialIndex) return;
      var start = gr.start;
      var end = start + gr.count;
      var i;
      if (index) {
        for (i = start; i < end; i++) add(index.getX(i));
      } else {
        for (i = start; i < end; i++) add(i);
      }
    });
  }
  if (!n) {
    for (var i = 0; i < uv.count; i++) add(i);
  }
  if (!n || !isFinite(minU)) return null;
  return { minU: minU, maxU: maxU, minV: minV, maxV: maxV };
}

function fitTextureToUv(tex, bounds) {
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  var maxAniso = renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (bounds) {
    var spanU = Math.max(Math.abs(bounds.maxU - bounds.minU), 1e-4);
    var spanV = Math.max(Math.abs(bounds.maxV - bounds.minV), 1e-4);
    tex.repeat.set(1 / spanU, -1 / spanV);
    tex.offset.set(-bounds.minU / spanU, bounds.maxV / spanV);
  } else {
    tex.repeat.set(1, -1);
    tex.offset.set(0, 1);
  }
  tex.needsUpdate = true;
}

function garmentYInfo(obj) {
  var box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return { minY: 0, maxY: 2.2, midY: 1.1 };
  return { minY: box.min.y, maxY: box.max.y, midY: (box.min.y + box.max.y) * 0.5 };
}

function pieceIds(garment) {
  return ((garment && garment.pieces) || []).map(function (p) {
    return p.id;
  });
}

function hasPiece(garment, id) {
  return pieceIds(garment).indexOf(id) !== -1;
}

function pickPieceId(blob, c, yInfo, garment) {
  var midY = yInfo.midY;
  var wearersRight = c && c.x < 0;
  var front = !c || c.z >= 0;
  if (/sleeve/.test(blob)) {
    return wearersRight ? "sleeve-right" : "sleeve-left";
  }
  if (/spandex|collar|waist|hem/.test(blob) && !/talsan|taslan|^body/.test(blob)) {
    var collar = c && c.y >= midY;
    if (collar) return wearersRight ? "collar-right" : "collar-left";
    return wearersRight ? "waist-right" : "waist-left";
  }
  if (/talsan|taslan|body|front|back/.test(blob)) {
    if (front) return wearersRight ? "front-pair-b" : "front-pair-a";
    return wearersRight ? "back-pair-b" : "back-pair-a";
  }
  if (/collar/.test(blob)) return wearersRight ? "collar-right" : "collar-left";
  if (/waist/.test(blob)) return wearersRight ? "waist-right" : "waist-left";
  return null;
}

function assignPiece(mesh, mat, materialIndex, yInfo, garment) {
  var names = collectNames(mesh, mat);
  var blob = names.join(" ").toLowerCase();
  if (!blob || SKIP_RE.test(blob) || ZIPPER_RE.test(blob) || THREAD_RE.test(blob)) return null;
  var c = primitiveCentroid(mesh, materialIndex);
  var id = pickPieceId(blob, c, yInfo, garment);
  if (id && !hasPiece(garment, id)) {
    var fallback = {
      "front-pair-a": "front-pair-b",
      "front-pair-b": "front-pair-a",
      "back-pair-a": "back-pair-b",
      "back-pair-b": "back-pair-a",
      "sleeve-left": "sleeve-right",
      "sleeve-right": "sleeve-left",
      "collar-left": "collar-right",
      "collar-right": "collar-left",
      "waist-left": "waist-right",
      "waist-right": "waist-left",
    };
    id = fallback[id] && hasPiece(garment, fallback[id]) ? fallback[id] : null;
  }
  return id;
}

function prepare(model, garment) {
  var yInfo = garmentYInfo(model);
  model.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    uniquify(obj);
    if (Array.isArray(obj.material)) {
      obj.userData.pieceIds = obj.material.map(function (m, i) {
        var id = assignPiece(obj, m, i, yInfo, garment);
        if (m) {
          m.userData.pieceId = id;
          m.userData.uvBounds = uvBoundsOf(obj, i);
        }
        return id;
      });
      obj.userData.pieceId = obj.userData.pieceIds.find(Boolean) || null;
    } else {
      var id = assignPiece(obj, obj.material, null, yInfo, garment);
      obj.userData.pieceId = id;
      obj.userData.pieceIds = null;
      if (obj.material) {
        obj.material.userData.pieceId = id;
        obj.material.userData.uvBounds = uvBoundsOf(obj, null);
      }
    }
  });
}

function yDown(pts, heightMm) {
  return (pts || []).map(function (pt) {
    return [pt[0], heightMm - pt[1]];
  });
}

function paintPiece(piece, snap) {
  var bleed = Number((snap.garment && snap.garment.bleedIn) || 0.25);
  var win = Number(piece.cutWin) + bleed * 2;
  var hin = Number(piece.cutHin) + bleed * 2;
  var maxDim = 2048;
  var scale = maxDim / Math.max(win, hin, 0.01);
  var w = Math.max(8, Math.round(win * scale));
  var h = Math.max(8, Math.round(hin * scale));
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var g = c.getContext("2d");
  var hex = hexOf(snap, piece.id);
  g.fillStyle = hex;
  g.fillRect(0, 0, w, h);
  function toPx(xIn, yIn) {
    return [(bleed + xIn) * scale, (bleed + yIn) * scale];
  }
  if (piece.cutMm && piece.cutMm.length > 2) {
    var hMm = Number(piece.cutHin) * MM;
    var pts = yDown(piece.cutMm, hMm);
    g.beginPath();
    pts.forEach(function (pt, i) {
      var p = toPx(pt[0] / MM, pt[1] / MM);
      if (i === 0) g.moveTo(p[0], p[1]);
      else g.lineTo(p[0], p[1]);
    });
    g.closePath();
    g.fillStyle = hex;
    g.fill();
  }
  (snap.placements || [])
    .filter(function (pl) {
      return pl.pieceId === piece.id;
    })
    .forEach(function (pl) {
      var img = snap.images && snap.images[pl.artId];
      var tl = toPx(pl.xIn, pl.yIn);
      var br = toPx(pl.xIn + pl.wIn, pl.yIn + pl.hIn);
      var pw = br[0] - tl[0];
      var ph = br[1] - tl[1];
      var cx = (tl[0] + br[0]) / 2;
      var cy = (tl[1] + br[1]) / 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(((pl.rotationDeg || 0) * Math.PI) / 180);
      if (pl.flipX) g.scale(-1, 1);
      if (img && img.complete && img.naturalWidth) {
        g.drawImage(img, -pw / 2, -ph / 2, pw, ph);
      } else {
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(-pw / 2, -ph / 2, pw, ph);
      }
      g.restore();
    });
  return c;
}

function textureFor(mat, piece, snap) {
  var canvas2d = paintPiece(piece, snap);
  var tex = mat.userData.fittedMap;
  if (!tex) {
    tex = new THREE.CanvasTexture(canvas2d);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    mat.userData.fittedMap = tex;
  } else {
    tex.image = canvas2d;
  }
  fitTextureToUv(tex, mat.userData.uvBounds);
  tex.needsUpdate = true;
  return tex;
}

function applyLook(snap) {
  if (!root) return;
  var garment = snap && snap.garment;
  var pieces = (garment && garment.pieces) || [];
  var byId = {};
  pieces.forEach(function (p) {
    byId[p.id] = p;
  });
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(function (m, i) {
      if (!m) return;
      var pid = (obj.userData.pieceIds && obj.userData.pieceIds[i]) || obj.userData.pieceId || m.userData.pieceId;
      var hw = m.userData.hw;
      if (hw === "zipper") {
        m.map = null;
        m.color.set(snap.zipColor || "#9AA3AD");
        m.needsUpdate = true;
        return;
      }
      if (hw === "thread") {
        m.map = null;
        m.color.set(snap.threadColor || "#111111");
        m.needsUpdate = true;
        return;
      }
      if (!pid || !byId[pid]) return;
      var piece = byId[pid];
      m.map = textureFor(m, piece, snap);
      m.color.set("#ffffff");
      m.needsUpdate = true;
    });
  });
}

function releaseCanvasPointer(ev) {
  if (!canvas || ev.pointerId == null) return;
  try {
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
  } catch (err) {}
}

function onPick(ev) {
  if (!renderer || !camera || !root || ev.button !== 0) return;
  var rect = canvas.getBoundingClientRect();
  var pointer = new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1
  );
  var raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  var hits = raycaster.intersectObject(root, true);
  for (var i = 0; i < hits.length; i++) {
    var obj = hits[i].object;
    if (!obj || !obj.isMesh) continue;
    var pid = obj.userData.pieceId;
    if (Array.isArray(obj.material) && hits[i].face && obj.userData.pieceIds) {
      pid = obj.userData.pieceIds[hits[i].face.materialIndex] || pid;
    }
    if (pid && pickFn) {
      pickFn(pid);
      break;
    }
  }
}

function glbUrl(garment) {
  var files = (garment && garment.files) || {};
  var path = files.glb || "";
  if (!path) return "";
  if (path.charAt(0) === "/") return path;
  return "/" + path;
}

function applyGltf(gltf, url, garment) {
  if (currentUrl !== url) return;
  setLoad(true, 96, "Loading 3D jacket", "Building preview…");
  disposeRoot();
  var model = gltf.scene;
  root.add(model);
  fit(model);
  prepare(model, garment);
  if (lastSnap) applyLook(lastSnap);
  setLoad(true, 100, "Loading 3D jacket", "Ready");
  window.requestAnimationFrame(function () {
    setLoad(false);
    setMeta("3D preview · drag to orbit · click a panel to edit that piece");
  });
}

function fetchBuffer(url) {
  if (glbCache[url]) return Promise.resolve(glbCache[url]);
  if (loadAbort) loadAbort.abort();
  loadAbort = new AbortController();
  return fetch(url, { credentials: "same-origin", signal: loadAbort.signal }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    var total = Number(res.headers.get("content-length") || 0);
    if (!res.body || !res.body.getReader) {
      setLoad(true, 40, "Loading 3D jacket", "Downloading jacket…");
      return res.arrayBuffer();
    }
    var reader = res.body.getReader();
    var chunks = [];
    var loaded = 0;
    var estimate = 24 * 1024 * 1024;
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) {
          return new Blob(chunks).arrayBuffer();
        }
        chunks.push(step.value);
        loaded += step.value.byteLength;
        var denom = total || estimate;
        var pct = Math.min(90, Math.round((loaded / denom) * 90));
        var detail = total
          ? "Downloading " + formatMb(loaded) + " / " + formatMb(total) + " MB"
          : "Downloading " + formatMb(loaded) + " MB";
        setLoad(true, pct, "Loading 3D jacket", detail);
        return pump();
      });
    }
    return pump();
  }).then(function (buf) {
    glbCache[url] = buf;
    return buf;
  });
}

function mountBuffer(buffer, url, garment) {
  setLoad(true, 92, "Loading 3D jacket", "Unpacking model…");
  loader.parse(
    buffer,
    "",
    function (gltf) {
      applyGltf(gltf, url, garment);
    },
    function () {
      if (currentUrl === url) {
        setLoad(false);
        setMeta("Could not load 3D jacket.");
      }
    }
  );
}

function load(garment) {
  if (!canvas) return;
  ensure();
  resize();
  var url = glbUrl(garment);
  if (!url) {
    setMeta("No CLO GLB on this garment yet.");
    return;
  }
  if (url === currentUrl && root && root.children.length) {
    prepare(root, garment);
    if (lastSnap) applyLook(lastSnap);
    return;
  }
  if (url === currentUrl && loadEl && !loadEl.hidden) return;
  currentUrl = url;
  setMeta("Loading 3D jacket…");
  setLoad(
    true,
    glbCache[url] ? 90 : 1,
    "Loading 3D jacket",
    glbCache[url] ? "Unpacking model…" : "Starting download…"
  );
  fetchBuffer(url)
    .then(function (buf) {
      if (currentUrl !== url) return;
      mountBuffer(buf, url, garment);
    })
    .catch(function (err) {
      if (err && err.name === "AbortError") return;
      if (currentUrl === url) {
        setLoad(false);
        setMeta("Could not load 3D jacket.");
      }
    });
}

function refresh(snap) {
  lastSnap = snap || lastSnap;
  if (!lastSnap || !lastSnap.garment) return;
  if (!canvas) return;
  ensure();
  load(lastSnap.garment);
  if (rafPaint) cancelAnimationFrame(rafPaint);
  rafPaint = requestAnimationFrame(function () {
    rafPaint = 0;
    applyLook(lastSnap);
  });
}

window.HoodooDyeSub3D = {
  refresh: refresh,
  onPickPiece: function (fn) {
    pickFn = fn;
  },
};
