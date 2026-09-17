import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

var fig = document.getElementById("panel-photo");
var canvas = document.getElementById("panel-photo-3d");
if (!fig || !canvas) {
  /* photo slot not on this page */
} else {
  var renderer = null;
  var scene = null;
  var camera = null;
  var model = null;
  var frame = 0;
  var currentUrl = "";
  var loader = new GLTFLoader();
  var running = false;

  function size() {
    var w = Math.max(120, fig.clientWidth || 200);
    var h = Math.max(120, fig.clientHeight || 200);
    if (!renderer) return { w: w, h: h };
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    return { w: w, h: h };
  }

  function ensure() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8eef2);
    camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    var key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(2.4, 4.2, 3.2);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x36b4e5, 0.35);
    fill.position.set(-3, 1.4, -1.6);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffffff, 0.25);
    rim.position.set(0, 2, -4);
    scene.add(rim);
    size();
  }

  function disposeModel() {
    if (!model) return;
    model.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        var m = c.material;
        if (Array.isArray(m)) m.forEach(function (x) { if (x && x.dispose) x.dispose(); });
        else if (m.dispose) m.dispose();
      }
    });
    scene.remove(model);
    model = null;
  }

  function fit(root) {
    var box = new THREE.Box3().setFromObject(root);
    var center = box.getCenter(new THREE.Vector3());
    var dim = box.getSize(new THREE.Vector3());
    root.position.sub(center);
    var maxDim = Math.max(dim.x, dim.y, dim.z, 0.001);
    camera.position.set(maxDim * 0.85, maxDim * 0.28, maxDim * 1.55);
    camera.near = maxDim / 100;
    camera.far = maxDim * 20;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  function tick() {
    frame = requestAnimationFrame(tick);
    if (model) model.rotation.y += 0.006;
    renderer.render(scene, camera);
  }

  function startLoop() {
    if (running) return;
    running = true;
    tick();
  }

  function stopLoop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function hide() {
    currentUrl = "";
    fig.classList.remove("has-preview");
    canvas.hidden = true;
    stopLoop();
    disposeModel();
  }

  function show(url) {
    if (!url) {
      hide();
      return;
    }
    ensure();
    size();
    if (url === currentUrl && model) {
      fig.classList.add("has-preview");
      canvas.hidden = false;
      startLoop();
      return;
    }
    currentUrl = url;
    fig.classList.add("has-preview");
    canvas.hidden = false;
    startLoop();
    loader.load(
      url,
      function (gltf) {
        if (currentUrl !== url) return;
        disposeModel();
        model = gltf.scene;
        scene.add(model);
        fit(model);
        size();
      },
      undefined,
      function () {
        if (currentUrl === url) hide();
      }
    );
  }

  window.HoodooConfigPreview = { show: show, hide: hide };

  var ro = new ResizeObserver(function () {
    if (renderer && !canvas.hidden) size();
  });
  ro.observe(fig);

  fig.addEventListener("hoodoo-preview", function () {
    var url = fig.getAttribute("data-glb") || "";
    if (url) show(url);
    else hide();
  });

  if (fig.getAttribute("data-glb")) show(fig.getAttribute("data-glb"));
}
