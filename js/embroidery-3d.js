import * as THREE from "three";

var IN = 0.0254;

function clothMat(hex) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex || "#1a1a1a"),
    roughness: 0.78,
    metalness: 0.03,
    side: THREE.DoubleSide,
  });
}

function locMap(kind) {
  if (kind === "beanie") {
    return {
      front: { pos: [0, 0.08, 0.18], rot: [0, 0, 0], areaW: 2.75, areaH: 2.5 },
      cuff: { pos: [0, -0.12, 0.19], rot: [0, 0, 0], areaW: 4.5, areaH: 2.0 },
      back: { pos: [0, 0.08, -0.18], rot: [0, Math.PI, 0], areaW: 3.5, areaH: 2.25 },
    };
  }
  if (kind === "bucket") {
    return {
      front: { pos: [0, 0.06, 0.18], rot: [0, 0, 0], areaW: 2.75, areaH: 2.5 },
      back: { pos: [0, 0.06, -0.18], rot: [0, Math.PI, 0], areaW: 3.5, areaH: 2.25 },
    };
  }
  return {
    front: { pos: [0, 0.06, 0.175], rot: [-0.08, 0, 0], areaW: 2.75, areaH: 2.5 },
    back: { pos: [0, 0.04, -0.17], rot: [0, Math.PI, 0], areaW: 3.5, areaH: 2.25 },
    left_side: { pos: [-0.17, 0.04, 0.05], rot: [0, -1.15, 0], areaW: 2.25, areaH: 2.0 },
    right_side: { pos: [0.17, 0.04, 0.05], rot: [0, 1.15, 0], areaW: 2.25, areaH: 2.0 },
  };
}

function buildBallcap(mat, rib) {
  var g = new THREE.Group();
  var crown = new THREE.Mesh(new THREE.SphereGeometry(0.18, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), mat);
  crown.position.y = 0.02;
  crown.scale.set(1.08, 0.95, 1.05);
  g.add(crown);
  var band = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.045, 28, 1, true), rib);
  band.position.y = -0.01;
  g.add(band);
  var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.018, 22, 1, false, -1.05, 2.1), mat);
  brim.scale.set(1.15, 1, 1.55);
  brim.rotation.x = 0.12;
  brim.position.set(0, -0.035, 0.13);
  g.add(brim);
  var button = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), rib);
  button.position.y = 0.185;
  g.add(button);
  return g;
}

function buildBeanie(mat, rib) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.72), mat);
  body.scale.set(1.05, 1.2, 1.05);
  body.position.y = 0.04;
  g.add(body);
  var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.08, 28), rib);
  cuff.position.y = -0.12;
  g.add(cuff);
  return g;
}

function buildBucket(mat, rib) {
  var g = new THREE.Group();
  var crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.16, 28), mat);
  crown.position.y = 0.05;
  g.add(crown);
  var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.02, 28), rib);
  brim.position.y = -0.03;
  g.add(brim);
  return g;
}

function buildHat(kind, hex) {
  var mat = clothMat(hex);
  var rib = clothMat(hex);
  rib.color.offsetHSL(0, 0, -0.08);
  if (kind === "beanie") return buildBeanie(mat, rib);
  if (kind === "bucket") return buildBucket(mat, rib);
  return buildBallcap(mat, rib);
}

export function mountEmbroidery3D(canvas) {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12151a);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(0xf2f6fa, 0x2a3340, 0.8));
  var key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(1.4, 2.2, 2.4);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xdce8f2, 0.4);
  fill.position.set(-2.0, 0.6, 1.2);
  scene.add(fill);

  var stage = new THREE.Group();
  scene.add(stage);
  var hat = new THREE.Group();
  stage.add(hat);
  var decals = new THREE.Group();
  stage.add(decals);

  var cam = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
  cam.position.set(0.28, 0.18, 0.85);
  cam.lookAt(0, 0.04, 0);
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x12151a, 1);

  var dragging = false;
  var lastX = 0;
  var rotY = 0.25;
  stage.rotation.y = rotY;
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", function () { dragging = false; });
  canvas.addEventListener("pointerleave", function () { dragging = false; });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
    stage.rotation.y = rotY;
  });

  var kind = "ballcap";
  var hex = "#1a1a1a";
  var running = true;

  function resize() {
    var frame = canvas.parentElement || canvas;
    var w = Math.max(1, frame.clientWidth || 1);
    var h = Math.max(1, frame.clientHeight || 1);
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  function disposeObj(obj) {
    obj.traverse(function (ch) {
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) {
        if (ch.material.map) ch.material.map.dispose();
        ch.material.dispose();
      }
    });
  }

  function rebuild() {
    while (hat.children.length) {
      var ch = hat.children[0];
      hat.remove(ch);
      disposeObj(ch);
    }
    hat.add(buildHat(kind, hex));
  }

  function setGarment(nextKind, nextHex) {
    kind = nextKind || "ballcap";
    hex = nextHex || "#1a1a1a";
    rebuild();
  }

  function clearDecals() {
    while (decals.children.length) {
      var d = decals.children[0];
      decals.remove(d);
      disposeObj(d);
    }
  }

  function setDecals(items) {
    clearDecals();
    var map = locMap(kind);
    (items || []).forEach(function (item) {
      var spec = map[item.location] || map.front;
      if (!spec || !item.image) return;
      var tex = new THREE.CanvasTexture(item.image);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      var mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      var w = Math.max(0.02, (item.wIn || 2) * IN);
      var h = Math.max(0.02, (item.hIn || 2) * IN);
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      var nx = (item.xIn || spec.areaW / 2) / spec.areaW - 0.5;
      var ny = 0.5 - (item.yIn || spec.areaH / 2) / spec.areaH;
      mesh.position.set(spec.pos[0] + nx * spec.areaW * IN, spec.pos[1] + ny * spec.areaH * IN, spec.pos[2]);
      mesh.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
      mesh.renderOrder = 2;
      decals.add(mesh);
    });
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
    ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);
  }

  return {
    setGarment: setGarment,
    setDecals: setDecals,
    resize: resize,
    dispose: function () {
      running = false;
      window.removeEventListener("resize", resize);
      if (ro) ro.disconnect();
      clearDecals();
      renderer.dispose();
    },
  };
}
