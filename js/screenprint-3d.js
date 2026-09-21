import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

var IN = 0.0254;
var CACHE_V = "20260921th";
var MESH_URLS = {
  tee: "/3d/screenprint/tee.glb?v=" + CACHE_V,
};
var SKIP_RE = /avatar|hair|eye|eyelash|tooth|body_avatar/;
var HARDWARE_RE = /zipper|tape|slider|button|hardware|stitch|needle/;
var loader = new GLTFLoader();
var glbCache = {};

function clothMat(hex) {
  var c = new THREE.Color(hex || "#c41e3a");
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.74,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

function ribMat(hex) {
  var c = new THREE.Color(hex || "#c41e3a");
  c.offsetHSL(0, 0.02, -0.1);
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

function extrude(shape, depth) {
  var geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

function garmentShape(kind) {
  var s = new THREE.Shape();
  var hem = kind === "hoodie" || kind === "crew" ? 0.30 : kind === "jersey" ? 0.29 : 0.255;
  var chest = hem * 0.96;
  var yHem = kind === "hoodie" || kind === "crew" ? -0.42 : -0.38;
  var yArm = kind === "tank" ? 0.02 : 0.08;
  var yShoulder = 0.30;
  var neck = kind === "tank" ? 0.09 : 0.07;
  var sleeve = 0.17;
  var sleeveH = 0.07;
  if (kind === "longsleeve" || kind === "hoodie" || kind === "crew") {
    sleeve = 0.40;
    sleeveH = 0.052;
  }
  if (kind === "jersey") {
    sleeve = 0.15;
    sleeveH = 0.08;
    yShoulder = 0.32;
  }

  s.moveTo(-hem, yHem);
  s.lineTo(-hem * 0.98, yArm - 0.04);

  if (kind === "tank") {
    s.bezierCurveTo(-hem * 0.72, yArm + 0.10, -neck - 0.05, yShoulder - 0.02, -neck, yShoulder + 0.02);
  } else {
    s.lineTo(-chest, yArm);
    s.quadraticCurveTo(-chest - sleeve * 0.45, yArm + 0.01, -chest - sleeve, yArm + 0.015);
    s.lineTo(-chest - sleeve, yArm + sleeveH * 2);
    s.quadraticCurveTo(-chest - sleeve * 0.35, yShoulder - 0.01, -chest * 0.42, yShoulder);
    s.lineTo(-neck, yShoulder + 0.015);
  }

  if (kind === "hoodie") {
    s.bezierCurveTo(-0.16, 0.52, 0.16, 0.52, neck, yShoulder + 0.015);
  } else if (kind === "jersey") {
    s.lineTo(0, yShoulder - 0.11);
    s.lineTo(neck, yShoulder + 0.015);
  } else {
    s.quadraticCurveTo(0, yShoulder - (kind === "polo" ? 0.04 : 0.055), neck, yShoulder + 0.015);
  }

  if (kind === "tank") {
    s.bezierCurveTo(neck + 0.05, yShoulder - 0.02, hem * 0.72, yArm + 0.10, hem * 0.98, yArm - 0.04);
  } else {
    s.lineTo(chest * 0.42, yShoulder);
    s.quadraticCurveTo(chest + sleeve * 0.35, yShoulder - 0.01, chest + sleeve, yArm + sleeveH * 2);
    s.lineTo(chest + sleeve, yArm + 0.015);
    s.quadraticCurveTo(chest + sleeve * 0.45, yArm + 0.01, chest, yArm);
    s.lineTo(hem * 0.98, yArm - 0.04);
  }

  s.lineTo(hem, yHem);
  s.closePath();
  return s;
}

function locMap(kind) {
  var z = kind === "hoodie" || kind === "crew" ? 0.075 : 0.062;
  var sleeveX = kind === "longsleeve" || kind === "hoodie" || kind === "crew" ? 0.52 : 0.38;
  return {
    front: { pos: [0, 0.02, z], rot: [0, 0, 0], areaW: 12, areaH: 14 },
    back: { pos: [0, 0.02, -z], rot: [0, Math.PI, 0], areaW: 12, areaH: 16 },
    left_chest: { pos: [-0.10, 0.14, z], rot: [0, 0, 0], areaW: 4.5, areaH: 4.5 },
    right_chest: { pos: [0.10, 0.14, z], rot: [0, 0, 0], areaW: 4.5, areaH: 4.5 },
    left_sleeve: { pos: [-sleeveX, 0.15, 0.02], rot: [0.05, 0.85, 0.15], areaW: 4, areaH: 4 },
    right_sleeve: { pos: [sleeveX, 0.15, 0.02], rot: [0.05, -0.85, -0.15], areaW: 4, areaH: 4 },
    nape: { pos: [0, 0.28, -z + 0.01], rot: [0.25, Math.PI, 0], areaW: 5, areaH: 3 },
  };
}

var ANCHOR_TO_LOC = {
  Anchor_front: "front",
  Anchor_back: "back",
  Anchor_left_chest: "left_chest",
  Anchor_right_chest: "right_chest",
  Anchor_left_sleeve: "left_sleeve",
  Anchor_right_sleeve: "right_sleeve",
  Anchor_nape: "nape",
};

function locAreas() {
  return {
    front: { areaW: 12, areaH: 14 },
    back: { areaW: 12, areaH: 16 },
    left_chest: { areaW: 4.5, areaH: 4.5 },
    right_chest: { areaW: 4.5, areaH: 4.5 },
    left_sleeve: { areaW: 4, areaH: 4 },
    right_sleeve: { areaW: 4, areaH: 4 },
    nape: { areaW: 5, areaH: 3 },
  };
}

function locMapFromAnchors(root) {
  var map = {};
  var areas = locAreas();
  root.updateMatrixWorld(true);
  var inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  var qInv = new THREE.Quaternion();
  root.getWorldQuaternion(qInv);
  qInv.invert();
  root.traverse(function (ch) {
    var loc = ANCHOR_TO_LOC[ch.name];
    if (!loc) return;
    var p = new THREE.Vector3();
    var q = new THREE.Quaternion();
    var s = new THREE.Vector3();
    ch.matrixWorld.decompose(p, q, s);
    p.applyMatrix4(inv);
    q.premultiply(qInv);
    var area = areas[loc] || { areaW: 12, areaH: 14 };
    map[loc] = {
      pos: [p.x, p.y, p.z],
      quat: [q.x, q.y, q.z, q.w],
      blender: true,
      areaW: area.areaW,
      areaH: area.areaH,
    };
  });
  return Object.keys(map).length ? map : null;
}

function locMapFromBox(box) {
  var size = box.getSize(new THREE.Vector3());
  var zFront = box.max.z + 0.006;
  var zBack = box.min.z - 0.006;
  var cy = (box.min.y + box.max.y) * 0.5;
  var chestY = box.min.y + size.y * 0.68;
  var sleeveY = box.min.y + size.y * 0.62;
  var sleeveX = size.x * 0.42;
  return {
    front: { pos: [0, cy + size.y * 0.04, zFront], rot: [0, 0, 0], areaW: 12, areaH: 14 },
    back: { pos: [0, cy + size.y * 0.02, zBack], rot: [0, Math.PI, 0], areaW: 12, areaH: 16 },
    left_chest: { pos: [-size.x * 0.16, chestY, zFront], rot: [0, 0, 0], areaW: 4.5, areaH: 4.5 },
    right_chest: { pos: [size.x * 0.16, chestY, zFront], rot: [0, 0, 0], areaW: 4.5, areaH: 4.5 },
    left_sleeve: { pos: [-sleeveX, sleeveY, (zFront + zBack) / 2 + 0.02], rot: [0.05, 0.9, 0.12], areaW: 4, areaH: 4 },
    right_sleeve: { pos: [sleeveX, sleeveY, (zFront + zBack) / 2 + 0.02], rot: [0.05, -0.9, -0.12], areaW: 4, areaH: 4 },
    nape: { pos: [0, box.max.y - size.y * 0.08, zBack], rot: [0.2, Math.PI, 0], areaW: 5, areaH: 3 },
  };
}

function buildGarment(kind, hex) {
  var g = new THREE.Group();
  var mat = clothMat(hex);
  var rib = ribMat(hex);
  var depth = kind === "hoodie" || kind === "crew" ? 0.13 : 0.10;
  var body = new THREE.Mesh(extrude(garmentShape(kind), depth), mat);
  g.add(body);

  var hemW = kind === "hoodie" || kind === "crew" ? 0.31 : 0.265;
  var hem = new THREE.Mesh(new THREE.BoxGeometry(hemW * 2.02, 0.035, depth + 0.02), rib);
  hem.position.y = kind === "hoodie" || kind === "crew" ? -0.43 : -0.395;
  g.add(hem);

  var collar = new THREE.Mesh(
    new THREE.TorusGeometry(kind === "tank" ? 0.09 : 0.072, 0.014, 10, 24, Math.PI * 1.35),
    rib
  );
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = Math.PI;
  collar.position.set(0, 0.265, 0.01);
  g.add(collar);

  if (kind === "polo") {
    var collGeo = new THREE.BoxGeometry(0.16, 0.04, 0.07);
    var coll = new THREE.Mesh(collGeo, rib);
    coll.position.set(0, 0.30, 0.02);
    coll.rotation.x = -0.35;
    g.add(coll);
    var placket = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.012), rib);
    placket.position.set(0, 0.20, depth / 2 + 0.004);
    g.add(placket);
  }

  if (kind === "hoodie" || kind === "crew") {
    var pocket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.025), rib);
    pocket.position.set(0, -0.16, depth / 2 + 0.008);
    g.add(pocket);
  }

  if (kind === "hoodie") {
    var hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
    hood.position.set(0, 0.38, -0.04);
    hood.scale.set(1.15, 0.95, 1.2);
    g.add(hood);
  }

  return g;
}

function findPrintMesh(root) {
  var best = null;
  var bestN = 0;
  root.traverse(function (ch) {
    if (!ch.isMesh || !ch.geometry) return;
    var attr = ch.geometry.getAttribute("position");
    var n = attr ? attr.count : 0;
    if (n > bestN) {
      best = ch;
      bestN = n;
    }
  });
  return best;
}

function projectorDummy(spec, item) {
  var dummy = new THREE.Object3D();
  if (spec.blender && spec.quat) {
    dummy.quaternion.set(spec.quat[0], spec.quat[1], spec.quat[2], spec.quat[3]);
    dummy.rotateX(-Math.PI / 2);
  } else if (spec.rot) {
    dummy.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2] || 0);
  }
  if (item.rotation) dummy.rotateZ((item.rotation * Math.PI) / 180);
  dummy.updateMatrix();
  return dummy;
}

function locSpec(location, kind, map) {
  var used = map || locMap(kind);
  if (kind === "tank" && (location === "left_sleeve" || location === "right_sleeve")) return null;
  return used[location] || used.front;
}

function meshBlob(mesh, mat) {
  var names = [];
  if (mesh && mesh.name) names.push(mesh.name);
  if (mat && mat.name) names.push(mat.name);
  return names.join(" ").toLowerCase();
}

function tintMat(mat, hex, mesh) {
  if (!mat) return mat;
  var blob = meshBlob(mesh, mat);
  if (SKIP_RE.test(blob)) {
    if (mesh) mesh.visible = false;
    return mat;
  }
  var m = mat.clone();
  if (HARDWARE_RE.test(blob)) return m;
  if (m.color) {
    if (/rib/.test(blob)) {
      var rib = new THREE.Color(hex);
      rib.offsetHSL(0, 0.02, -0.08);
      m.color.copy(rib);
    } else {
      m.color.set(hex);
    }
  }
  if (m.roughness != null) m.roughness = 0.74;
  if (m.metalness != null) m.metalness = 0.02;
  m.side = THREE.DoubleSide;
  m.userData = Object.assign({}, m.userData || {}, { spTinted: true, spRib: /rib/.test(blob) });
  return m;
}

function applyTint(root, hex) {
  root.traverse(function (ch) {
    if (!ch.isMesh) return;
    var mats = Array.isArray(ch.material) ? ch.material : [ch.material];
    var next = mats.map(function (m) {
      if (!m) return m;
      var blob = meshBlob(ch, m);
      if (SKIP_RE.test(blob) || HARDWARE_RE.test(blob)) return m;
      if (!m.userData || !m.userData.spTinted) m = m.clone();
      if (m.color) {
        if (m.userData.spRib || /rib/.test(blob)) {
          var rib = new THREE.Color(hex);
          rib.offsetHSL(0, 0.02, -0.08);
          m.color.copy(rib);
        } else {
          m.color.set(hex);
        }
      }
      m.userData = Object.assign({}, m.userData || {}, { spTinted: true, spRib: m.userData.spRib || /rib/.test(blob) });
      return m;
    });
    ch.material = Array.isArray(ch.material) ? next : next[0];
  });
}

function fitToStage(obj) {
  obj.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(obj);
  var size = box.getSize(new THREE.Vector3());
  var center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  if (size.y > 2.4 || size.y < 0.25) {
    obj.scale.multiplyScalar(0.82 / Math.max(size.y, 0.001));
  }
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

function loadGlb(url) {
  if (glbCache[url]) return Promise.resolve(glbCache[url]);
  return new Promise(function (resolve, reject) {
    loader.load(
      url,
      function (gltf) {
        glbCache[url] = gltf.scene;
        resolve(gltf.scene);
      },
      undefined,
      reject
    );
  });
}

function cloneTinted(src, hex) {
  var obj = src.clone(true);
  obj.traverse(function (ch) {
    if (!ch.isMesh) return;
    if (Array.isArray(ch.material)) {
      ch.material = ch.material.map(function (m) { return tintMat(m, hex, ch); });
    } else {
      ch.material = tintMat(ch.material, hex, ch);
    }
  });
  return obj;
}

export function mountScreenPrint3D(canvas) {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12151a);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  scene.add(new THREE.HemisphereLight(0xf2f6fa, 0x2a3340, 0.85));
  var key = new THREE.DirectionalLight(0xffffff, 1.55);
  key.position.set(1.6, 2.4, 2.6);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xdce8f2, 0.45);
  fill.position.set(-2.2, 0.8, 1.4);
  scene.add(fill);
  var rim = new THREE.DirectionalLight(0x36b4e5, 0.35);
  rim.position.set(-0.8, 1.6, -2.6);
  scene.add(rim);

  var stage = new THREE.Group();
  scene.add(stage);
  var garment = new THREE.Group();
  stage.add(garment);
  var decalMeshes = [];

  var cam = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
  cam.position.set(0.22, 0.12, 1.55);
  cam.lookAt(0, 0.0, 0);
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x12151a, 1);

  var dragging = false;
  var lastX = 0;
  var rotY = 0.18;
  stage.rotation.y = rotY;

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", function () {
    dragging = false;
  });
  canvas.addEventListener("pointerleave", function () {
    dragging = false;
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
    stage.rotation.y = rotY;
  });

  var kind = "tee";
  var hex = "#c41e3a";
  var running = true;
  var loadGen = 0;
  var loadedFromGlb = false;
  var liveLocs = locMap("tee");
  var pendingDecals = [];

  function resize() {
    var frame = canvas.parentElement || canvas;
    var w = Math.max(1, frame.clientWidth || canvas.clientWidth || 1);
    var h = Math.max(1, frame.clientHeight || canvas.clientHeight || 1);
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  function disposeObj(obj, dropMaps) {
    obj.traverse(function (ch) {
      if (ch.geometry) ch.geometry.dispose();
      var mats = ch.material ? (Array.isArray(ch.material) ? ch.material : [ch.material]) : [];
      mats.forEach(function (m) {
        if (!m) return;
        if (dropMaps && m.map && m.map.dispose) m.map.dispose();
        if (m.dispose) m.dispose();
      });
    });
  }

  function clearGarment() {
    clearDecals();
    while (garment.children.length) {
      var ch = garment.children[0];
      garment.remove(ch);
      disposeObj(ch, false);
    }
  }

  function frameBox(box) {
    var size = box.getSize(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z, 0.4);
    cam.position.set(maxDim * 0.22, maxDim * 0.08, maxDim * 1.75);
    cam.near = maxDim / 80;
    cam.far = maxDim * 20;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }

  function showSilhouette() {
    clearGarment();
    garment.add(buildGarment(kind, hex));
    loadedFromGlb = false;
    liveLocs = locMap(kind);
    paintDecals(pendingDecals);
  }

  function rebuild() {
    var url = MESH_URLS[kind];
    showSilhouette();
    if (!url) return;
    var wantKind = kind;
    var wantHex = hex;
    var gen = ++loadGen;
    loadGlb(url)
      .then(function (src) {
        if (gen !== loadGen || kind !== wantKind) return;
        clearGarment();
        var mesh = cloneTinted(src, wantHex);
        var box = fitToStage(mesh);
        garment.add(mesh);
        loadedFromGlb = true;
        liveLocs = locMapFromAnchors(mesh) || locMapFromBox(box);
        frameBox(box);
        paintDecals(pendingDecals);
      })
      .catch(function () {
        if (gen !== loadGen) return;
        if (!garment.children.length) showSilhouette();
      });
  }

  function setGarment(nextKind, nextHex) {
    var k = nextKind || "tee";
    var h = nextHex || "#c41e3a";
    if (k === kind && h === hex && garment.children.length) return;
    hex = h;
    if (k === kind && loadedFromGlb && garment.children.length) {
      applyTint(garment, hex);
      return;
    }
    kind = k;
    rebuild();
  }

  function clearDecals() {
    decalMeshes.forEach(function (d) {
      if (d.parent) d.parent.remove(d);
      disposeObj(d, true);
    });
    decalMeshes = [];
  }

  function paintDecals(items) {
    clearDecals();
    var parent = loadedFromGlb && garment.children[0] ? garment.children[0] : garment;
    parent.updateMatrixWorld(true);
    var body = loadedFromGlb ? findPrintMesh(parent) : null;
    (items || []).forEach(function (item) {
      var spec = locSpec(item.location, kind, liveLocs);
      if (!spec || !item.image) return;
      var tex = new THREE.CanvasTexture(item.image);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      var mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      var w = Math.max(0.03, (item.wIn || 3) * IN);
      var h = Math.max(0.03, (item.hIn || 3) * IN);
      var areaW = spec.areaW * IN;
      var areaH = spec.areaH * IN;
      var nx = (item.xIn || spec.areaW / 2) / spec.areaW - 0.5;
      var ny = 0.5 - (item.yIn || spec.areaH / 2) / spec.areaH;
      var dummy = projectorDummy(spec, item);
      var local = new THREE.Vector3(nx * areaW, ny * areaH, 0);
      local.applyQuaternion(dummy.quaternion);
      var pos = new THREE.Vector3(spec.pos[0], spec.pos[1], spec.pos[2]).add(local);
      var sleeve = item.location === "left_sleeve" || item.location === "right_sleeve";
      var mesh = null;
      if (body && !sleeve) {
        var posWorld = pos.clone();
        parent.localToWorld(posWorld);
        var qWorld = new THREE.Quaternion();
        parent.getWorldQuaternion(qWorld);
        qWorld.multiply(dummy.quaternion);
        var euler = new THREE.Euler().setFromQuaternion(qWorld);
        var geo = new DecalGeometry(body, posWorld, euler, new THREE.Vector3(w, h, 0.07));
        var attr = geo.getAttribute("position");
        if (attr && attr.count > 2) {
          geo.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
          mesh = new THREE.Mesh(geo, mat);
        } else {
          geo.dispose();
        }
      }
      if (!mesh) {
        var push = new THREE.Vector3(0, 0, sleeve ? 0.014 : loadedFromGlb ? 0.02 : 0.004);
        push.applyQuaternion(dummy.quaternion);
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.quaternion.copy(dummy.quaternion);
        mesh.position.copy(pos).add(push);
      }
      mesh.renderOrder = 3;
      parent.add(mesh);
      decalMeshes.push(mesh);
    });
  }

  function setDecals(items) {
    pendingDecals = items || [];
    paintDecals(pendingDecals);
  }

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    renderer.render(scene, cam);
  }

  rebuild();
  resize();
  tick();
  window.addEventListener("resize", resize);
  var ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(function () {
      resize();
    });
    ro.observe(canvas.parentElement || canvas);
  }

  return {
    setGarment: setGarment,
    setDecals: setDecals,
    resize: resize,
    dispose: function () {
      running = false;
      loadGen += 1;
      window.removeEventListener("resize", resize);
      if (ro) ro.disconnect();
      clearDecals();
      renderer.dispose();
    },
  };
}
