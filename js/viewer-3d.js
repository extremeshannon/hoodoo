import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function apiBase() {
  return window.HOODOO_API_BASE || "";
}

function resolveAssetUrl(uri) {
  if (!uri) return "";
  if (/^https?:\/\//i.test(uri)) return uri;
  if (uri.startsWith("/")) return apiBase() + uri;
  return apiBase() + "/" + uri.replace(/^\//, "");
}

function disposeObject3D(root) {
  root.traverse(function (c) {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      var m = c.material;
      if (Array.isArray(m)) m.forEach(function (x) { if (x && x.dispose) x.dispose(); });
      else if (m.dispose) m.dispose();
    }
  });
}

var ctx = null;

function ensureContext() {
  if (ctx) return ctx;
  var canvas = document.getElementById("viewer-canvas");
  var w = canvas.parentElement.clientWidth || window.innerWidth;
  var h = canvas.parentElement.clientHeight || Math.max(320, window.innerHeight - 200);
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b0d);

  var camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
  camera.position.set(1.2, 1.0, 2.2);

  var amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(amb);
  var key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 6, 4);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0x40bff0, 0.35);
  fill.position.set(-4, 2, -2);
  scene.add(fill);

  var modelRoot = new THREE.Group();
  scene.add(modelRoot);

  var controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.4, 0);

  var frame = 0;
  function animate() {
    frame = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    w = canvas.parentElement.clientWidth || window.innerWidth;
    h = canvas.parentElement.clientHeight || 400;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  ctx = {
    scene: scene,
    camera: camera,
    controls: controls,
    renderer: renderer,
    modelRoot: modelRoot,
    canvas: canvas,
  };
  return ctx;
}

function clearModel(c) {
  while (c.modelRoot.children.length) {
    var o = c.modelRoot.children[0];
    c.modelRoot.remove(o);
    disposeObject3D(o);
  }
}

function fitCameraToObject(camera, controls, object) {
  var box = new THREE.Box3().setFromObject(object);
  var size = box.getSize(new THREE.Vector3());
  var center = box.getCenter(new THREE.Vector3());
  var maxDim = Math.max(size.x, size.y, size.z, 0.001);
  var dist = maxDim * 1.8;
  camera.position.set(center.x + dist * 0.6, center.y + dist * 0.45, center.z + dist * 0.7);
  controls.target.copy(center);
  camera.near = Math.max(0.01, dist / 200);
  camera.far = dist * 50;
  camera.updateProjectionMatrix();
}

function loadGlb(url, c, statusEl, emptyEl) {
  var loader = new GLTFLoader();
  loader.load(
    url,
    function (gltf) {
      clearModel(c);
      c.modelRoot.add(gltf.scene);
      fitCameraToObject(c.camera, c.controls, gltf.scene);
      if (statusEl) statusEl.textContent = "Loaded GLB.";
      if (emptyEl) emptyEl.hidden = true;
    },
    undefined,
    function () {
      if (statusEl) statusEl.textContent = "Could not load GLB.";
      if (emptyEl) emptyEl.hidden = false;
    }
  );
}

function runLoad() {
  var slug = (document.getElementById("viewer-slug-input") || {}).value;
  slug = (slug || "").trim();
  if (!slug) {
    var st0 = document.getElementById("viewer-status");
    if (st0) st0.textContent = "Enter a product slug.";
    return;
  }
  if (window.history && window.history.replaceState) {
    var u = new URL(window.location.href);
    u.searchParams.set("slug", slug);
    window.history.replaceState({}, "", u.toString());
  }

  var c = ensureContext();
  var statusEl = document.getElementById("viewer-status");
  var emptyEl = document.getElementById("viewer-empty");
  if (statusEl) statusEl.textContent = "Loading…";
  if (emptyEl) emptyEl.hidden = true;

  fetch(apiBase() + "/api/products/" + encodeURIComponent(slug) + "/3d")
    .then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.detail) || "Could not load assets");
        return j;
      });
    })
    .then(function (assets) {
      var glbs = (assets || []).filter(function (a) {
        return a.kind === "glb" || (a.uri && /\.glb$/i.test(a.uri));
      });
      if (!glbs.length) {
        clearModel(c);
        if (statusEl) statusEl.textContent = "No GLB assets for this slug.";
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      glbs.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
      var url = resolveAssetUrl(glbs[0].uri);
      loadGlb(url, c, statusEl, emptyEl);
    })
    .catch(function (e) {
      if (statusEl) statusEl.textContent = e.message || "Request failed.";
      if (emptyEl) emptyEl.hidden = false;
    });
}

document.getElementById("viewer-load-btn").addEventListener("click", runLoad);

var bootParams = new URLSearchParams(window.location.search);
var slugFromUrl = bootParams.get("slug");
if (slugFromUrl) {
  var slugInput = document.getElementById("viewer-slug-input");
  if (slugInput) slugInput.value = slugFromUrl;
  runLoad();
}
