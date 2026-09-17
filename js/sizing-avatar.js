import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CACHE_V = "20260911a";
const AVATAR_URL = "/3d/sizing/FemaleAvatar.glb?v=" + CACHE_V;
const WIRE = 0x36b4e5;
const TAPE = 0x1e4d8c;

const MEASURES = {
  height: "No shoes, stand against a wall. Heels, hips, and shoulders touching. Measure from the floor to the top of the head.",
  weight: "Morning weight in street clothes, or as you typically jump. Used with height to sanity-check the other numbers.",
  chest: "This is the standard measurement around the chest over the nipples. For women do one additional measurement above the breast.",
  waist: "While standing erect, measure your waist over your navel. Measure over any appropriate clothing and pull tape measure snug before taking measurement.",
  torso: "Stand straight. One point is the hollow at the base of the neck — follow the collarbones to the dip below the Adam’s apple. The other is the top of the hip bone slightly forward of center, where it flares. Measure diagonally across the front from the neck hollow to that hip point.",
  leg: "Place the end of the tape measure on the curve of the hipbone that you previously located for the torso measurement. Thread the tape measure around the top of the thigh, across the buttocks and back to the starting point. Imagine this is a leg pad and adjust accordingly.",
  inseam: "Stand up straight when taking this measurement and don't wear shoes. Having your feet shoulder-width apart, start the tape high in the crotch and measure straight down to the floor. Don't use the middle seam of the pants as reference, since some pants are looser than others. Be sure to start the tape measure high in the crotch. This measurement is important: The accuracy of the inseam measurement determines the proper fit of your harness.",
  arm: "Shoulder point (the bony tip) to the wrist bone with the arm slightly bent, as if reaching for a toggle.",
};

const TITLES = {
  height: "Height",
  weight: "Weight",
  chest: "Chest",
  waist: "Waist",
  torso: "Torso",
  leg: "Leg",
  inseam: "Inseam",
  arm: "Arm",
};

const FIT_SCALE = {
  female: { x: 1, y: 1, z: 1 },
  male: { x: 1.14, y: 1.06, z: 1.1 },
  youth: { x: 0.78, y: 0.74, z: 0.8 },
};

const SIZE_KEYS = ["height", "weight", "chest", "waist", "torso", "leg", "inseam", "arm"];

function fitId(id) {
  return id === "female" || id === "youth" ? id : "male";
}

function reduceMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function makeHotspot() {
  var g = new THREE.Group();
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 20, 16),
    new THREE.MeshBasicMaterial({ color: WIRE, transparent: true, opacity: 0.28, depthWrite: false })
  );
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.026, 0.0045, 10, 28),
    new THREE.MeshBasicMaterial({ color: WIRE, transparent: true, opacity: 0.95, depthWrite: false })
  );
  var core = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  glow.renderOrder = 2;
  ring.renderOrder = 3;
  core.renderOrder = 4;
  g.add(glow);
  g.add(ring);
  g.add(core);
  g.userData.glow = glow;
  g.userData.ring = ring;
  g.userData.core = core;
  return g;
}

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(function (m) { if (m && m.dispose) m.dispose(); });
      else if (o.material.dispose) o.material.dispose();
    }
  });
}

function tubeFromPoints(pts, closed) {
  var curve = new THREE.CatmullRomCurve3(pts, !!closed, "catmullrom", 0.15);
  var geo = new THREE.TubeGeometry(curve, Math.max(pts.length * 2, 24), 0.008, 8, !!closed);
  var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: TAPE }));
  mesh.renderOrder = 5;
  return mesh;
}

function makeLineTape(p0, p1) {
  var g = new THREE.Group();
  g.add(tubeFromPoints([p0.clone(), p1.clone()], false));
  var a = makeHotspot();
  var b = makeHotspot();
  a.position.copy(p0);
  b.position.copy(p1);
  a.userData.tapeEnd = true;
  b.userData.tapeEnd = true;
  g.add(a);
  g.add(b);
  return g;
}

function ellipseLoop(center, rx, rz, yTilt) {
  var pts = [];
  var n = 40;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(
      center.x + Math.cos(a) * rx,
      center.y + Math.sin(a) * (yTilt || 0),
      center.z + Math.sin(a) * rz
    ));
  }
  return tubeFromPoints(pts, true);
}

function frontArc(left, right) {
  var mid = left.clone().add(right).multiplyScalar(0.5);
  mid.z = Math.max(left.z, right.z) + 0.045;
  return tubeFromPoints([left.clone(), mid, right.clone()], false);
}

function collectGeo(root) {
  var geos = [];
  root.traverse(function (o) {
    if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
      geos.push(o.geometry);
    }
  });
  return geos;
}

function pickVert(geos, scoreFn, filterFn) {
  var best = null;
  var bestS = -Infinity;
  var v = new THREE.Vector3();
  geos.forEach(function (geo) {
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (filterFn && !filterFn(v)) continue;
      var s = scoreFn(v);
      if (s > bestS) {
        bestS = s;
        best = v.clone();
      }
    }
  });
  return best;
}

function bboxOf(geos) {
  var box = new THREE.Box3();
  geos.forEach(function (g) {
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  });
  return box;
}

function v3(p, fb) {
  return p ? p.clone() : new THREE.Vector3(fb[0], fb[1], fb[2]);
}

function landmarksFrom(root) {
  var geos = collectGeo(root);
  var box = bboxOf(geos);
  var minY = box.min.y;
  var h = Math.max(box.max.y - minY, 0.5);
  var yAt = function (t) { return minY + h * t; };
  var band = function (t, w) {
    var y = yAt(t);
    var hw = (w || 0.035) * h;
    return function (v) { return Math.abs(v.y - y) <= hw; };
  };

  var head = pickVert(geos, function (v) { return v.y; }, function (v) { return Math.abs(v.x) < 0.12; });
  var footR = pickVert(geos, function (v) { return -v.y + v.x * 0.2; }, function (v) { return v.x > 0; });
  var chestL = pickVert(geos, function (v) { return -v.x + v.z * 0.35; }, band(0.72, 0.04));
  var chestR = pickVert(geos, function (v) { return v.x + v.z * 0.35; }, band(0.72, 0.04));
  var chestF = pickVert(geos, function (v) { return v.z; }, function (v) { return band(0.72, 0.03)(v) && Math.abs(v.x) < 0.05; });
  var waistL = pickVert(geos, function (v) { return -v.x; }, band(0.58, 0.03));
  var waistR = pickVert(geos, function (v) { return v.x; }, band(0.58, 0.03));
  var waistF = pickVert(geos, function (v) { return v.z; }, function (v) { return band(0.58, 0.03)(v) && Math.abs(v.x) < 0.05; });
  var neck = pickVert(geos, function (v) { return v.z * 2 - Math.abs(v.x); }, band(0.82, 0.03));
  var hip = pickVert(geos, function (v) { return v.x * 0.55 + v.z; }, function (v) {
    return v.y > yAt(0.5) && v.y < yAt(0.58) && v.x > 0.04;
  });
  var crotch = pickVert(geos, function (v) { return -v.y - Math.abs(v.x) * 3; }, function (v) {
    return v.y > yAt(0.44) && v.y < yAt(0.56) && Math.abs(v.x) < 0.05;
  });
  var shoulder = pickVert(geos, function (v) { return v.x + v.y * 0.15; }, band(0.78, 0.04));
  var wrist = pickVert(geos, function (v) { return v.x - v.y * 0.35; }, function (v) {
    return v.x > 0.12 && v.y > yAt(0.38) && v.y < yAt(0.58);
  });
  var weight = pickVert(geos, function (v) { return v.z - Math.abs(v.x); }, band(0.62, 0.04));
  var inseamFloor = pickVert(geos, function (v) { return -v.y + v.z * 0.2; }, function (v) {
    return v.x > 0 && v.x < 0.12 && v.y < yAt(0.08);
  });
  var thighOut = pickVert(geos, function (v) { return v.x; }, band(0.5, 0.03));
  var thighIn = pickVert(geos, function (v) { return -v.x; }, function (v) {
    return band(0.5, 0.03)(v) && v.x > 0;
  });
  var thighBack = pickVert(geos, function (v) { return -v.z; }, function (v) {
    return band(0.5, 0.035)(v) && v.x > 0.02;
  });

  return {
    height: [v3(head, [0, box.max.y, 0]), v3(footR, [0.08, minY, 0.02])],
    chest: [v3(chestL, [-0.16, yAt(0.72), 0.04]), v3(chestR, [0.16, yAt(0.72), 0.04])],
    waist: [v3(waistL, [-0.13, yAt(0.58), 0.03]), v3(waistR, [0.13, yAt(0.58), 0.03])],
    torso: [v3(neck, [0, yAt(0.82), 0.04]), v3(hip, [0.12, yAt(0.54), 0.03])],
    inseam: [v3(crotch, [0, yAt(0.5), 0.01]), v3(inseamFloor, [0.04, minY, 0.03])],
    arm: [v3(shoulder, [0.18, yAt(0.78), 0]), v3(wrist, [0.22, yAt(0.48), 0.02])],
    weight: [v3(weight, [0, yAt(0.62), 0.06]), v3(waistF, [0, yAt(0.58), 0.05])],
    leg: [v3(hip, [0.12, yAt(0.54), 0.03]), v3(thighOut, [0.14, yAt(0.5), 0.02])],
    extras: {
      chestF: v3(chestF, [0, yAt(0.72), 0.08]),
      waistF: v3(waistF, [0, yAt(0.58), 0.05]),
      hip: v3(hip, [0.12, yAt(0.54), 0.03]),
      thighOut: v3(thighOut, [0.14, yAt(0.5), 0.02]),
      thighIn: v3(thighIn, [0.04, yAt(0.5), 0.01]),
      thighBack: v3(thighBack, [0.1, yAt(0.5), -0.04]),
    },
    box: box,
    heightM: h,
    minY: minY,
  };
}

function makeTape(marks, key) {
  var g = new THREE.Group();
  var pair = marks[key];
  if (!pair) return g;
  var ex = marks.extras || {};
  if (key === "chest") {
    g.add(frontArc(pair[0], pair[1]));
  } else if (key === "waist") {
    var wc = pair[0].clone().add(pair[1]).multiplyScalar(0.5);
    var wrx = pair[0].distanceTo(pair[1]) * 0.52;
    g.add(ellipseLoop(wc, wrx, wrx * 0.62, 0));
  } else if (key === "leg") {
    var hip = ex.hip || pair[0];
    var out = ex.thighOut || pair[1];
    var inn = ex.thighIn || new THREE.Vector3(Math.max(out.x - 0.1, 0.03), out.y, out.z);
    var back = ex.thighBack || new THREE.Vector3((hip.x + out.x) * 0.5, out.y, -0.05);
    g.add(tubeFromPoints([hip.clone(), out.clone(), back.clone(), inn.clone(), hip.clone()], true));
  } else if (key === "weight") {
    var wdot = makeHotspot();
    wdot.position.copy(pair[0]);
    g.add(wdot);
  } else {
    g.add(tubeFromPoints([pair[0].clone(), pair[1].clone()], false));
  }
  var a = makeHotspot();
  a.position.copy(pair[0]);
  a.userData.tapeEnd = true;
  g.add(a);
  if (key !== "weight") {
    var b = makeHotspot();
    b.position.copy(pair[1]);
    b.userData.tapeEnd = true;
    g.add(b);
  }
  return g;
}

function skipAvatarExtra(name) {
  var n = String(name || "").toLowerCase();
  return n.indexOf("hair") >= 0 || n.indexOf("tooth") >= 0 || n.indexOf("shoe") >= 0
    || n.indexOf("eye") >= 0 || n.indexOf("lash") >= 0 || n.indexOf("brow") >= 0;
}

function styleBody(root) {
  var fillMat = new THREE.MeshLambertMaterial({
    color: 0x36b4e5,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  var wireMat = new THREE.MeshBasicMaterial({
    color: WIRE,
    wireframe: true,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  });
  root.traverse(function (o) {
    if (!o.isMesh) return;
    if (skipAvatarExtra(o.name) || skipAvatarExtra(o.parent && o.parent.name)) {
      o.visible = false;
      return;
    }
    o.material = fillMat;
    o.renderOrder = 0;
    var wire = new THREE.Mesh(o.geometry, wireMat);
    wire.renderOrder = 1;
    o.add(wire);
  });
}

function proceduralBody() {
  var g = new THREE.Group();
  g.name = "procedural-humanoid";
  function cap(r, len, x, y, z, rz) {
    var m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14));
    m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    g.add(m);
  }
  cap(0.105, 0.04, 0, 1.62, 0, 0);
  cap(0.04, 0.08, 0, 1.5, 0, 0);
  cap(0.155, 0.42, 0, 1.2, 0, 0);
  cap(0.14, 0.16, 0, 0.92, 0, 0);
  cap(0.055, 0.28, -0.22, 1.28, 0, 1.15);
  cap(0.045, 0.26, -0.28, 0.88, 0.02, 0.2);
  cap(0.055, 0.28, 0.22, 1.28, 0, -1.15);
  cap(0.045, 0.26, 0.28, 0.88, 0.02, -0.2);
  cap(0.075, 0.38, -0.08, 0.55, 0, 0);
  cap(0.06, 0.36, -0.08, 0.18, 0, 0);
  cap(0.075, 0.38, 0.08, 0.55, 0, 0);
  cap(0.06, 0.36, 0.08, 0.18, 0, 0);
  var footL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8));
  footL.scale.set(1.4, 0.45, 2.1);
  footL.position.set(-0.08, 0.03, 0.03);
  g.add(footL);
  var footR = footL.clone();
  footR.position.x = 0.08;
  g.add(footR);
  return g;
}

function makeRing(radius) {
  var g = new THREE.Group();
  var stroke = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.92, radius, 64),
    new THREE.MeshBasicMaterial({ color: WIRE, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
  );
  stroke.rotation.x = -Math.PI / 2;
  var fill = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.92, 64),
    new THREE.MeshBasicMaterial({ color: WIRE, side: THREE.DoubleSide, transparent: true, opacity: 0.12 })
  );
  fill.rotation.x = -Math.PI / 2;
  stroke.position.y = 0.002;
  g.add(fill);
  g.add(stroke);
  return g;
}

var viewer = null;

function ensureViewer() {
  if (viewer) return viewer;
  var fig = document.getElementById("size-figure");
  var guide = document.getElementById("size-guide-art");
  var canvasA = document.getElementById("size-avatar-canvas");
  var canvasB = document.getElementById("size-guide-canvas");
  if (!fig || !guide || !canvasA || !canvasB) return null;

  var scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  var key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(0.6, 1.8, 1.4);
  scene.add(key);
  var fillL = new THREE.DirectionalLight(0x36b4e5, 0.25);
  fillL.position.set(-1.2, 0.8, -0.6);
  scene.add(fillL);

  var stage = new THREE.Group();
  scene.add(stage);
  var bodyRoot = new THREE.Group();
  stage.add(bodyRoot);

  var camA = new THREE.PerspectiveCamera(28, 1, 0.05, 40);
  var camB = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
  var rendererA = new THREE.WebGLRenderer({ canvas: canvasA, antialias: true, alpha: false });
  var rendererB = new THREE.WebGLRenderer({ canvas: canvasB, antialias: true, alpha: false });
  rendererA.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendererB.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendererA.setClearColor(0xf4f7f9, 1);
  rendererB.setClearColor(0xf4f7f9, 1);
  rendererA.outputColorSpace = THREE.SRGBColorSpace;
  rendererB.outputColorSpace = THREE.SRGBColorSpace;

  viewer = {
    fig: fig,
    guide: guide,
    scene: scene,
    stage: stage,
    bodyRoot: bodyRoot,
    camA: camA,
    camB: camB,
    rendererA: rendererA,
    rendererB: rendererB,
    azimuth: 0.18,
    auto: !reduceMotion(),
    drag: false,
    lastX: 0,
    fit: "male",
    measure: "chest",
    marks: null,
    hotspots: [],
    tape: null,
    ring: null,
    ready: false,
    loaded: false,
    centerY: 0.9,
    heightM: 1.7,
    radius: 2.4,
    raf: 0,
  };

  fig.addEventListener("pointerdown", function (e) {
    viewer.drag = true;
    viewer.lastX = e.clientX;
    fig.classList.add("is-dragging");
    try { fig.setPointerCapture(e.pointerId); } catch (err) {}
  });
  fig.addEventListener("pointermove", function (e) {
    if (!viewer.drag) return;
    viewer.azimuth += (e.clientX - viewer.lastX) * 0.008;
    viewer.lastX = e.clientX;
  });
  function up() {
    viewer.drag = false;
    fig.classList.remove("is-dragging");
  }
  fig.addEventListener("pointerup", up);
  fig.addEventListener("pointercancel", up);

  var label = document.getElementById("size-360-label");
  if (label) {
    label.addEventListener("click", function () { viewer.auto = !viewer.auto; });
  }

  var ray = new THREE.Raycaster();
  var ptr = new THREE.Vector2();
  canvasA.addEventListener("click", function (e) {
    if (!viewer.ready) return;
    var r = canvasA.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camA);
    var hits = ray.intersectObjects(viewer.hotspots, true);
    if (!hits.length) return;
    var obj = hits[0].object;
    while (obj && !obj.userData.measure) obj = obj.parent;
    if (obj && obj.userData.measure) selectMeasure(obj.userData.measure, true);
  });

  window.addEventListener("resize", resizeViewers);
  return viewer;
}

function resizeViewers() {
  if (!viewer) return;
  function size(renderer, cam, el) {
    var w = Math.max(el.clientWidth || 1, 1);
    var h = Math.max(el.clientHeight || 1, 360);
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  size(viewer.rendererA, viewer.camA, viewer.fig);
  size(viewer.rendererB, viewer.camB, viewer.guide);
}

function applyFit() {
  if (!viewer) return;
  var s = FIT_SCALE[viewer.fit] || FIT_SCALE.male;
  viewer.bodyRoot.scale.set(s.x, s.y, s.z);
  var fig = document.getElementById("size-figure");
  var g = document.getElementById("size-guide-art");
  if (fig) fig.setAttribute("data-fit", viewer.fit);
  if (g) g.setAttribute("data-fit", viewer.fit);
}

function setTape() {
  if (!viewer || !viewer.marks) return;
  if (viewer.tape) {
    viewer.bodyRoot.remove(viewer.tape);
    disposeObject(viewer.tape);
    viewer.tape = null;
  }
  viewer.tape = makeTape(viewer.marks, viewer.measure);
  viewer.bodyRoot.add(viewer.tape);
  viewer.hotspots.forEach(function (h) {
    var on = h.userData.measure === viewer.measure;
    h.userData.glow.material.opacity = on ? 0.5 : 0.18;
    h.scale.setScalar(on ? 1.25 : 0.85);
  });
}

function placeMainCam() {
  var y = viewer.centerY * (FIT_SCALE[viewer.fit] || FIT_SCALE.male).y;
  var r = viewer.radius;
  viewer.camA.position.set(Math.sin(viewer.azimuth) * r, y, Math.cos(viewer.azimuth) * r);
  viewer.camA.lookAt(0, y, 0);
}

function placeGuideCam() {
  if (!viewer.marks) return;
  var pair = viewer.marks[viewer.measure] || viewer.marks.chest;
  var s = FIT_SCALE[viewer.fit] || FIT_SCALE.male;
  var a = pair[0].clone().multiply(new THREE.Vector3(s.x, s.y, s.z));
  var b = pair[1].clone().multiply(new THREE.Vector3(s.x, s.y, s.z));
  var mid = a.clone().add(b).multiplyScalar(0.5);
  var span = Math.max(a.distanceTo(b), 0.22);
  var dist = span * (viewer.measure === "height" ? 3.4 : viewer.measure === "inseam" ? 2.6 : 2.4);
  dist = Math.min(Math.max(dist, 0.55), 2.8);
  var offset = new THREE.Vector3(0.22, 0.06, dist);
  if (viewer.measure === "arm") offset = new THREE.Vector3(0.55, 0.08, 0.55);
  if (viewer.measure === "leg") offset = new THREE.Vector3(0.45, 0.12, 0.7);
  if (viewer.measure === "inseam") offset = new THREE.Vector3(0.25, 0.05, dist);
  viewer.camB.fov = viewer.measure === "height" ? 28 : 34;
  viewer.camB.position.copy(mid).add(offset);
  viewer.camB.lookAt(mid);
  viewer.camB.updateProjectionMatrix();
}

function applyMeasureCopy() {
  var title = document.getElementById("measure-title");
  var copy = document.getElementById("measure-copy");
  if (title) title.textContent = TITLES[viewer.measure] || viewer.measure;
  if (copy) copy.textContent = MEASURES[viewer.measure] || "";
  var fig = document.getElementById("size-figure");
  var g = document.getElementById("size-guide-art");
  if (fig) fig.setAttribute("data-measure", viewer.measure);
  if (g) g.setAttribute("data-measure", viewer.measure);
}

function selectMeasure(key, focusField) {
  if (!key || key === "units") return;
  ensureViewer();
  if (!viewer) return;
  viewer.measure = key;
  applyMeasureCopy();
  setTape();
  if (focusField) {
    var field = document.getElementById("sz-" + key);
    if (field) field.focus();
  }
}

function tick() {
  if (!viewer) return;
  viewer.raf = requestAnimationFrame(tick);
  var stepEl = document.getElementById("step-3");
  if (!stepEl || stepEl.hidden) return;
  if (viewer.auto && !viewer.drag) viewer.azimuth += 0.004;
  placeMainCam();
  placeGuideCam();
  var t = performance.now() * 0.003;
  viewer.hotspots.forEach(function (h) {
    if (h.userData.measure === viewer.measure) {
      h.scale.setScalar(1.2 + Math.sin(t) * 0.12);
    }
  });
  viewer.rendererA.render(viewer.scene, viewer.camA);
  viewer.rendererB.render(viewer.scene, viewer.camB);
}

function setupLandmarks(root) {
  viewer.marks = landmarksFrom(root);
  viewer.heightM = viewer.marks.heightM;
  viewer.centerY = viewer.marks.minY + viewer.heightM * 0.48;
  viewer.radius = viewer.heightM * 1.55;
  SIZE_KEYS.forEach(function (key) {
    var pair = viewer.marks[key];
    if (!pair) return;
    pair.forEach(function (p, i) {
      if (key === "weight" && i === 1) return;
      var h = makeHotspot();
      h.position.copy(p);
      h.userData.measure = key;
      viewer.bodyRoot.add(h);
      viewer.hotspots.push(h);
    });
  });
  if (viewer.marks.extras && viewer.marks.extras.chestF) {
    var cf = makeHotspot();
    cf.position.copy(viewer.marks.extras.chestF);
    cf.userData.measure = "chest";
    viewer.bodyRoot.add(cf);
    viewer.hotspots.push(cf);
  }
  if (viewer.ring) viewer.stage.remove(viewer.ring);
  viewer.ring = makeRing(0.32);
  viewer.ring.position.y = viewer.marks.minY;
  viewer.stage.add(viewer.ring);
  applyFit();
  setTape();
  applyMeasureCopy();
  viewer.ready = true;
  resizeViewers();
}

function mountBody(obj) {
  while (viewer.bodyRoot.children.length) viewer.bodyRoot.remove(viewer.bodyRoot.children[0]);
  viewer.hotspots = [];
  styleBody(obj);
  viewer.bodyRoot.add(obj);
  setupLandmarks(obj);
}

function loadAvatar() {
  ensureViewer();
  if (!viewer) return;
  requestAnimationFrame(function () {
    resizeViewers();
    if (!viewer.raf) tick();
  });
  if (viewer.loaded) {
    resizeViewers();
    return;
  }
  viewer.loaded = true;
  mountBody(proceduralBody());
  var loader = new GLTFLoader();
  loader.load(
    AVATAR_URL,
    function (gltf) {
      mountBody(gltf.scene);
      resizeViewers();
      console.info("Hoodoo sizing avatar: FemaleAvatar.glb cyan wireframe");
    },
    undefined,
    function (err) {
      console.warn("Hoodoo sizing: CLO avatar GLB failed, keeping procedural humanoid", err);
    }
  );
}

window.hoodooSizeFit = function (id) {
  var g = fitId(id);
  ensureViewer();
  if (viewer) viewer.fit = g;
  var fig = document.getElementById("size-figure");
  var art = document.getElementById("size-guide-art");
  if (fig) fig.setAttribute("data-fit", g);
  if (art) art.setAttribute("data-fit", g);
  applyFit();
  var row = document.getElementById("size-fit");
  if (row) {
    row.querySelectorAll("[data-g]").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.g === g);
    });
  }
};

window.hoodooSizeMeasure = function (key) {
  selectMeasure(key, false);
};
window.hoodooSizingShow = loadAvatar;

(function bindUi() {
  var row = document.getElementById("size-fit");
  if (row) {
    row.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-g]");
      if (btn) window.hoodooSizeFit(btn.dataset.g);
    });
  }
  var form = document.getElementById("size-form");
  if (form) {
    form.addEventListener("focusin", function (e) {
      var el = e.target.closest("input, select");
      if (!el || !el.id || el.id.indexOf("sz-") !== 0) return;
      var key = el.id.slice(3);
      if (key === "units") return;
      selectMeasure(key, false);
    });
  }
  var step = document.getElementById("step-3");
  if (step) {
    new MutationObserver(function () {
      if (!step.hidden) loadAvatar();
    }).observe(step, { attributes: true, attributeFilter: ["hidden"] });
    if (!step.hidden) loadAvatar();
  }
})();
