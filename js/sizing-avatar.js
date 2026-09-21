import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CACHE_V = "20260921c";
const AVATAR_URLS = {
  female: "/3d/sizing/avatar_female.glb?v=" + CACHE_V,
  male: "/3d/sizing/avatar_male.glb?v=" + CACHE_V,
  youth: "/3d/sizing/avatar_youth.glb?v=" + CACHE_V,
};
const AVATAR_JSON_URLS = {};
const WIRE = 0x36b4e5;
const TAPE = 0x1e4d8c;
const BODY = 0xe4f6fb;

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
  male: { x: 1, y: 1, z: 1 },
  youth: { x: 1, y: 1, z: 1 },
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
  var hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 10),
    new THREE.MeshBasicMaterial({
      color: WIRE, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    })
  );
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 14, 12),
    new THREE.MeshBasicMaterial({
      color: WIRE, transparent: true, opacity: 0.28, depthWrite: false, depthTest: true,
    })
  );
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.0035, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x1a1d22, depthWrite: false, depthTest: true })
  );
  var core = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 14, 12),
    new THREE.MeshBasicMaterial({ color: WIRE, depthWrite: true, depthTest: true })
  );
  hit.renderOrder = 6;
  glow.renderOrder = 7;
  ring.renderOrder = 8;
  core.renderOrder = 9;
  ring.visible = false;
  g.add(hit);
  g.add(glow);
  g.add(ring);
  g.add(core);
  g.userData.hit = hit;
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

function collectPoints(root, space) {
  var pts = [];
  if (space) space.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  var inv = space ? new THREE.Matrix4().copy(space.matrixWorld).invert() : new THREE.Matrix4();
  var v = new THREE.Vector3();
  var m = new THREE.Matrix4();
  root.traverse(function (o) {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    if (meshKind(o) !== "body") return;
    m.multiplyMatrices(inv, o.matrixWorld);
    var pos = o.geometry.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
    }
  });
  return pts;
}

function pickVert(pts, scoreFn, filterFn) {
  var best = null;
  var bestS = -Infinity;
  for (var i = 0; i < pts.length; i++) {
    var v = pts[i];
    if (filterFn && !filterFn(v)) continue;
    var s = scoreFn(v);
    if (s > bestS) {
      bestS = s;
      best = v;
    }
  }
  return best;
}

function bboxOf(pts) {
  var box = new THREE.Box3();
  pts.forEach(function (p) { box.expandByPoint(p); });
  return box;
}

function v3(p, fb) {
  return p ? p.clone() : new THREE.Vector3(fb[0], fb[1], fb[2]);
}

function landmarksFrom(root, space) {
  var geos = collectPoints(root, space || root);
  var box = bboxOf(geos);
  if (!geos.length || box.isEmpty()) {
    box.set(new THREE.Vector3(-0.4, 0, -0.2), new THREE.Vector3(0.4, 1.76, 0.2));
  }
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
    /* body hotspot already marks weight */
  } else {
    g.add(tubeFromPoints([pair[0].clone(), pair[1].clone()], false));
  }
  return g;
}

function skipAvatarExtra(name) {
  var n = String(name || "").toLowerCase();
  return n.indexOf("hair") >= 0 || n.indexOf("tooth") >= 0 || n.indexOf("shoe") >= 0
    || n.indexOf("eye") >= 0 || n.indexOf("lash") >= 0 || n.indexOf("brow") >= 0;
}

function meshKind(obj) {
  var n = String(obj.name || "").toLowerCase();
  if (n === "gridlight") return "quad_light";
  if (n === "grid") return "quad";
  if (n.indexOf("quad_detail") >= 0 || n.indexOf("quad_grid") >= 0 || n.indexOf("quad_edges") >= 0) return "quad";
  if (n.indexOf("clean_cage") >= 0) return "cage";
  if (n.indexOf("_grid_overlay") >= 0 || n.indexOf("_quad_grid") >= 0) return "overlay";
  if (n.indexOf("body_wire_lines") >= 0) return "wirelines";
  if (n.indexOf("marker") >= 0) return "marker";
  if (n.indexOf("ring_360") >= 0 || n === "ring_360") return "ring";
  if (n.indexOf("grid_line") >= 0 || n === "grid_lines") return "grid";
  if (n.indexOf("body_wire") >= 0 || n === "body_wire") return "wire";
  if (obj.isLine || obj.isLineSegments) return n.indexOf("ring") >= 0 ? "ring" : "grid";
  if (skipAvatarExtra(obj.name) || skipAvatarExtra(obj.parent && obj.parent.name)) return "skip";
  return "body";
}

function bboxFromBody(root) {
  var box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse(function (o) {
    if (!o.isMesh || !o.geometry || meshKind(o) !== "body") return;
    o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    var b = o.geometry.boundingBox.clone();
    b.applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

function makeBodyMaterial(box) {
  var minY = box && !box.isEmpty() ? box.min.y : 0;
  var h = box && !box.isEmpty() ? Math.max(box.max.y - minY, 0.5) : 1.758;
  var w = box && !box.isEmpty() ? Math.max(box.max.x - box.min.x, 0.3) : 0.87;
  var sy = h / 1.758;
  var sx = w / 0.87;
  var mat = new THREE.MeshBasicMaterial({
    color: BODY,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
  });
  mat.extensions = { derivatives: true };
  var gridColor = new THREE.Color(WIRE);
  var uRing = 0.045;
  var uLon = 18.0;
  var uWidth = 1.1;
  var uCrotchY = minY + 0.88 * sy;
  var uArmMaxY = minY + 1.47 * sy;
  var uArmMinX = 0.19 * sx;
  var uHeadY = minY + 1.53 * sy;
  var uLegOffX = 0.095 * sx;
  var uArmTopY = minY + 1.43 * sy;
  var uArmLenY = 0.66 * sy;
  var uArmInnerX = 0.18 * sx;
  var uArmOuterX = 0.43 * sx;
  var uLegSpace = 0.032;
  var uTorsoSpaceX = 0.045;
  var uTorsoSpaceZ = 0.040;
  var uMidHalfX = 0.23 * sx;
  var uMidSpacingX = 0.055;
  var uMidRingSpacing = 0.065;
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.gridColor = { value: gridColor };
    shader.uniforms.ringSpacing = { value: uRing };
    shader.uniforms.lonCount = { value: uLon };
    shader.uniforms.gridWidth = { value: uWidth };
    shader.uniforms.crotchY = { value: uCrotchY };
    shader.uniforms.armMaxY = { value: uArmMaxY };
    shader.uniforms.armMinX = { value: uArmMinX };
    shader.uniforms.headY = { value: uHeadY };
    shader.uniforms.legOffX = { value: uLegOffX };
    shader.uniforms.armTopY = { value: uArmTopY };
    shader.uniforms.armLenY = { value: uArmLenY };
    shader.uniforms.armInnerX = { value: uArmInnerX };
    shader.uniforms.armOuterX = { value: uArmOuterX };
    shader.uniforms.legSpace = { value: uLegSpace };
    shader.uniforms.torsoSpaceX = { value: uTorsoSpaceX };
    shader.uniforms.torsoSpaceZ = { value: uTorsoSpaceZ };
    shader.uniforms.midHalfX = { value: uMidHalfX };
    shader.uniforms.midSpacingX = { value: uMidSpacingX };
    shader.uniforms.midRingSpacing = { value: uMidRingSpacing };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGridPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGridPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "varying vec3 vGridPos;",
          "uniform vec3 gridColor;",
          "uniform float ringSpacing;",
          "uniform float lonCount;",
          "uniform float gridWidth;",
          "uniform float crotchY;",
          "uniform float armMaxY;",
          "uniform float armMinX;",
          "uniform float headY;",
          "uniform float legOffX;",
          "uniform float armTopY;",
          "uniform float armLenY;",
          "uniform float armInnerX;",
          "uniform float armOuterX;",
          "uniform float legSpace;",
          "uniform float torsoSpaceX;",
          "uniform float torsoSpaceZ;",
          "uniform float midHalfX;",
          "uniform float midSpacingX;",
          "uniform float midRingSpacing;",
        ].join("\n")
      )
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "float ringX = vGridPos.y / ringSpacing;",
          "float ringFrac = fract(ringX);",
          "float ringD = min(ringFrac, 1.0 - ringFrac);",
          "float ringFw = max(fwidth(ringX) * gridWidth, 0.0008);",
          "float ringLine = 1.0 - smoothstep(0.0, ringFw, ringD);",
          "float localX = vGridPos.x;",
          "float localZ = vGridPos.z;",
          "float localCount = lonCount;",
          "if (vGridPos.y < crotchY) {",
          "  localX -= (vGridPos.x < 0.0 ? -legOffX : legOffX);",
          "  localCount = 10.0;",
          "} else if (vGridPos.y < armMaxY && abs(vGridPos.x) > armMinX) {",
          "  float side = vGridPos.x < 0.0 ? -1.0 : 1.0;",
          "  float t = clamp((armTopY - vGridPos.y) / max(armLenY, 0.001), 0.0, 1.0);",
          "  float armCenterX = side * mix(armInnerX, armOuterX, t);",
          "  localX = vGridPos.x - armCenterX;",
          "  localCount = 8.0;",
          "} else if (vGridPos.y > headY) {",
          "  localCount = 22.0;",
          "}",
          "float verticalLine = 0.0;",
          "if (vGridPos.y > headY) {",
          "  float ang = atan(localZ, localX);",
          "  float lonX = (ang / 6.28318530718) * localCount;",
          "  float lonFrac = fract(lonX);",
          "  float lonD = min(lonFrac, 1.0 - lonFrac);",
          "  float lonFw = max(min(fwidth(lonX), 1.5) * gridWidth, 0.0008);",
          "  verticalLine = 1.0 - smoothstep(0.0, lonFw, lonD);",
          "} else if (vGridPos.y < armMaxY && abs(vGridPos.x) > armMinX) {",
          "  float angA = atan(localZ, localX);",
          "  float lonXA = (angA / 6.28318530718) * localCount;",
          "  float lonFracA = fract(lonXA);",
          "  float lonDA = min(lonFracA, 1.0 - lonFracA);",
          "  float lonFwA = max(min(fwidth(lonXA), 1.5) * gridWidth, 0.0008);",
          "  verticalLine = 1.0 - smoothstep(0.0, lonFwA, lonDA);",
          "} else {",
          "  float spacingX = (vGridPos.y < crotchY) ? legSpace : torsoSpaceX;",
          "  float spacingZ = (vGridPos.y < crotchY) ? legSpace : torsoSpaceZ;",
          "  float gx = localX / spacingX;",
          "  float fx = fract(gx);",
          "  float dx = min(fx, 1.0 - fx);",
          "  float wx = max(fwidth(gx) * gridWidth, 0.0008);",
          "  float xLine = 1.0 - smoothstep(0.0, wx, dx);",
          "  float gz = localZ / spacingZ;",
          "  float fz = fract(gz);",
          "  float dz = min(fz, 1.0 - fz);",
          "  float wz = max(fwidth(gz) * gridWidth, 0.0008);",
          "  float zLine = 1.0 - smoothstep(0.0, wz, dz);",
          "  float ax = abs(localX);",
          "  float az = abs(localZ);",
          "  float frontWeight = smoothstep(0.35, 0.65, az / max(ax + az, 0.0001));",
          "  verticalLine = mix(zLine, xLine, frontWeight);",
          "  bool frontMid = (vGridPos.y > crotchY && vGridPos.y < armMaxY && vGridPos.z > 0.0 && abs(vGridPos.x) < midHalfX);",
          "  if (frontMid) {",
          "    float mgx = vGridPos.x / midSpacingX;",
          "    float mfx = fract(mgx);",
          "    float mdx = min(mfx, 1.0 - mfx);",
          "    float mwx = max(fwidth(mgx) * gridWidth, 0.0008);",
          "    verticalLine = 1.0 - smoothstep(0.0, mwx, mdx);",
          "  }",
          "}",
          "bool cleanFrontRows = (vGridPos.y > crotchY && vGridPos.y < armMaxY && vGridPos.z > 0.0 && abs(vGridPos.x) < midHalfX);",
          "if (cleanFrontRows) {",
          "  float mry = (vGridPos.y - crotchY) / midRingSpacing;",
          "  float mrf = fract(mry);",
          "  float mrd = min(mrf, 1.0 - mrf);",
          "  float mrw = max(fwidth(mry) * gridWidth, 0.0008);",
          "  ringLine = 1.0 - smoothstep(0.0, mrw, mrd);",
          "}",
          "float gridMask = clamp(ringLine + verticalLine, 0.0, 1.0);",
          "diffuseColor.rgb = mix(diffuseColor.rgb, gridColor, gridMask);",
        ].join("\n")
      );
  };
  mat.customProgramCacheKey = function () { return "hoodoo-sizing-grid-ap"; };
  return mat;
}

function makeMaleFillMaterial() {
  return new THREE.MeshStandardMaterial({
    color: BODY,
    roughness: 0.5,
    metalness: 0.05,
    emissive: 0x36b4e5,
    emissiveIntensity: 0.055,
    side: THREE.FrontSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 2,
  });
}

function makeQuadLineMaterial(opacity, color) {
  return new THREE.LineBasicMaterial({
    color: color == null ? WIRE : color,
    transparent: opacity != null && opacity < 1,
    opacity: opacity == null ? 1 : opacity,
    depthTest: true,
    depthWrite: false,
  });
}

function styleBody(root) {
  if (viewer) viewer.bakedRing = false;
  var items = [];
  var hasQuad = false;
  root.traverse(function (obj) {
    if (obj.isMesh || obj.isLine || obj.isLineSegments) items.push(obj);
    var k = meshKind(obj);
    if (k === "quad" || k === "quad_light") hasQuad = true;
  });
  var box = bboxFromBody(root);
  var fillMat = hasQuad ? makeMaleFillMaterial() : makeBodyMaterial(box);
  items.forEach(function (obj) {
    var kind = meshKind(obj);
    if (kind === "overlay" || kind === "wirelines" || kind === "cage") {
      if (obj.parent) obj.parent.remove(obj);
      return;
    }
    if (kind === "quad" || kind === "quad_light") {
      obj.material = makeQuadLineMaterial(1, WIRE);
      obj.visible = true;
      obj.renderOrder = 3;
      obj.frustumCulled = false;
      return;
    }
    if (kind === "skip" || kind === "marker" || kind === "grid" || kind === "wire" || kind === "ring") {
      obj.visible = false;
      return;
    }
    obj.material = fillMat;
    obj.visible = true;
    obj.renderOrder = 1;
    obj.castShadow = false;
    obj.receiveShadow = false;
    if (obj.geometry && obj.geometry.computeVertexNormals) obj.geometry.computeVertexNormals();
  });
}

function buildQuadAvatar(data) {
  var pos = new THREE.Float32BufferAttribute(new Float32Array(data.pos), 3);
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", pos);
  var ao = data.ao && data.ao.length ? Uint8Array.from(data.ao) : new Uint8Array(pos.count).fill(255);
  g.setAttribute("ao", new THREE.BufferAttribute(ao, 1, true));
  g.setIndex(data.tris);
  g.computeVertexNormals();
  var skin = new THREE.Mesh(g, makeMaleFillMaterial());
  skin.name = "body_detail";
  var group = new THREE.Group();
  group.name = "quad-avatar";
  group.add(skin);
  function addLines(idx, name, opacity) {
    if (!idx || !idx.length) return;
    var lg = new THREE.BufferGeometry();
    lg.setAttribute("position", pos);
    lg.setIndex(idx);
    var lines = new THREE.LineSegments(lg, makeQuadLineMaterial(opacity));
    lines.name = name;
    lines.userData.quadOpacity = opacity;
    lines.renderOrder = 3;
    lines.frustumCulled = false;
    group.add(lines);
  }
  addLines(data.detail, "quad_detail", 0.3);
  addLines(data.grid, "quad_grid", 0.95);
  if (!data.grid && data.edges) addLines(data.edges, "quad_edges", 0.85);
  return group;
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
  scene.background = new THREE.Color(0xffffff);
  scene.add(new THREE.HemisphereLight(0xeaf8fc, 0xa8c8d4, 0.5));
  var keyL = new THREE.DirectionalLight(0xffffff, 2.6);
  keyL.position.set(2.4, 3.6, 3.2);
  scene.add(keyL);
  var fillL = new THREE.DirectionalLight(0xe4eef8, 0.55);
  fillL.position.set(-2.6, 1.0, 1.6);
  scene.add(fillL);
  var rimL = new THREE.DirectionalLight(0x7fbfe6, 1.8);
  rimL.position.set(-1.6, 2.2, -3.4);
  scene.add(rimL);

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
  rendererA.setClearColor(0xffffff, 1);
  rendererB.setClearColor(0xffffff, 1);
  rendererA.outputColorSpace = THREE.SRGBColorSpace;
  rendererB.outputColorSpace = THREE.SRGBColorSpace;
  rendererA.toneMapping = THREE.ACESFilmicToneMapping;
  rendererB.toneMapping = THREE.ACESFilmicToneMapping;
  rendererA.toneMappingExposure = 1.12;
  rendererB.toneMappingExposure = 1.12;

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
    azimuth: 0,
    auto: false,
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
    bodies: {},
    bodyKey: "",
    pendingKey: "",
    centerY: 0.9,
    heightM: 1.7,
    radius: 2.4,
    raf: 0,
  };

  var ray = new THREE.Raycaster();
  var ptr = new THREE.Vector2();
  var down = { x: 0, y: 0, hotspot: null };

  function pickHotspotAt(clientX, clientY) {
    if (!viewer.ready) return null;
    var r = canvasA.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ptr.x = ((clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camA);
    var hits = ray.intersectObjects(viewer.hotspots, true);
    if (!hits.length) return null;
    var obj = hits[0].object;
    while (obj && !obj.userData.measure) obj = obj.parent;
    return obj && obj.userData.measure ? obj : null;
  }

  fig.addEventListener("pointerdown", function (e) {
    var hit = pickHotspotAt(e.clientX, e.clientY);
    down = { x: e.clientX, y: e.clientY, hotspot: hit };
    if (hit) {
      viewer.drag = false;
      fig.style.cursor = "pointer";
      return;
    }
    viewer.drag = true;
    viewer.auto = false;
    viewer.lastX = e.clientX;
    fig.classList.add("is-dragging");
    fig.style.cursor = "grabbing";
    try { fig.setPointerCapture(e.pointerId); } catch (err) {}
  });
  fig.addEventListener("pointermove", function (e) {
    if (viewer.drag) {
      viewer.azimuth += (e.clientX - viewer.lastX) * 0.008;
      viewer.lastX = e.clientX;
      return;
    }
    var hover = pickHotspotAt(e.clientX, e.clientY);
    fig.style.cursor = hover ? "pointer" : "grab";
    viewer.hotspots.forEach(function (h) {
      if (h.userData.measure === viewer.measure) return;
      h.userData.glow.material.opacity = hover === h ? 0.4 : 0.18;
    });
  });
  function up(e) {
    var moved = e ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 0;
    if (down.hotspot && moved < 8) {
      selectMeasure(down.hotspot.userData.measure, true);
    }
    viewer.drag = false;
    down.hotspot = null;
    fig.classList.remove("is-dragging");
    fig.style.cursor = "grab";
  }
  fig.addEventListener("pointerup", up);
  fig.addEventListener("pointercancel", up);
  fig.style.cursor = "grab";

  var label = document.getElementById("size-360-label");
  if (label) {
    label.title = "Click to auto-rotate";
    label.addEventListener("click", function () { viewer.auto = !viewer.auto; });
  }

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
  if (!viewer) return;
  if (viewer.tape) {
    viewer.bodyRoot.remove(viewer.tape);
    disposeObject(viewer.tape);
    viewer.tape = null;
  }
}

function placeMainCam() {
  var s = FIT_SCALE[viewer.fit] || FIT_SCALE.male;
  var minY = (viewer.marks ? viewer.marks.minY : 0) * s.y;
  var h = viewer.heightM * s.y;
  var lookY = minY + h * 0.52;
  var r = Math.max(h * 2.32, 2.7);
  viewer.camA.fov = 28;
  viewer.camA.position.set(Math.sin(viewer.azimuth) * r, lookY + h * 0.02, Math.cos(viewer.azimuth) * r);
  viewer.camA.lookAt(0, lookY, 0);
  viewer.camA.updateProjectionMatrix();
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
  viewer.rendererA.render(viewer.scene, viewer.camA);
  viewer.rendererB.render(viewer.scene, viewer.camB);
}

function hotspotPos(marks, key) {
  var pair = marks[key];
  var ex = marks.extras || {};
  if (!pair) return null;
  if (key === "chest") return ex.chestF || pair[0].clone().add(pair[1]).multiplyScalar(0.5);
  if (key === "waist") return ex.waistF || pair[0].clone().add(pair[1]).multiplyScalar(0.5);
  if (key === "height") return pair[0];
  if (key === "weight") return pair[0];
  if (key === "torso") return pair[0];
  if (key === "leg") return ex.hip || pair[0];
  if (key === "inseam") return pair[0];
  if (key === "arm") return pair[0];
  return pair[0].z >= pair[1].z ? pair[0] : pair[1];
}

function setupLandmarks(root) {
  viewer.marks = landmarksFrom(root, viewer.bodyRoot);
  viewer.heightM = viewer.marks.heightM;
  viewer.centerY = viewer.marks.minY + viewer.heightM * 0.52;
  viewer.radius = Math.max(3.45, viewer.heightM * 2.08);
  viewer.hotspots = [];
  if (viewer.ring) {
    viewer.stage.remove(viewer.ring);
    viewer.ring = null;
  }
  if (!viewer.bakedRing) {
    viewer.ring = makeRing(0.38 * (viewer.heightM / 1.78));
    viewer.ring.position.y = viewer.marks.minY;
    viewer.stage.add(viewer.ring);
  }
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

function avatarKey(fit) {
  if (fit === "female" || fit === "youth") return fit;
  return "male";
}

function showCachedBody(key) {
  var obj = viewer.bodies[key];
  if (!obj) return false;
  if (viewer.bodyKey === key && viewer.bodyRoot.children.length) {
    applyFit();
    return true;
  }
  mountBody(obj);
  viewer.bodyKey = key;
  resizeViewers();
  return true;
}

function setAvatarLoader(visible, pct) {
  var el = document.getElementById("size-avatar-loader");
  var p = document.getElementById("size-avatar-loader-pct");
  if (!el) return;
  el.hidden = !visible;
  if (p && visible) p.textContent = Math.max(0, Math.min(100, Math.round(pct || 0))) + "%";
}

function loadFitAvatar() {
  var key = avatarKey(viewer.fit);
  if (showCachedBody(key)) {
    setAvatarLoader(false);
    return;
  }
  viewer.pendingKey = key;
  setAvatarLoader(true, 0);
  var jsonUrl = AVATAR_JSON_URLS[key];
  if (jsonUrl) {
    fetch(jsonUrl, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("avatar json " + r.status);
        setAvatarLoader(true, 70);
        return r.json();
      })
      .then(function (data) {
        var obj = buildQuadAvatar(data);
        viewer.bodies[key] = obj;
        if (avatarKey(viewer.fit) !== key) return;
        setAvatarLoader(true, 100);
        mountBody(obj);
        viewer.bodyKey = key;
        resizeViewers();
        setAvatarLoader(false);
      })
      .catch(function (err) {
        console.warn("Hoodoo sizing: quad avatar JSON failed for", key, err);
        if (avatarKey(viewer.fit) !== key) return;
        setAvatarLoader(false);
        if (!viewer.bodyRoot.children.length) mountBody(proceduralBody());
      });
    return;
  }
  var loader = new GLTFLoader();
  loader.load(
    AVATAR_URLS[key],
    function (gltf) {
      viewer.bodies[key] = gltf.scene;
      if (avatarKey(viewer.fit) !== key) return;
      setAvatarLoader(true, 100);
      mountBody(gltf.scene);
      viewer.bodyKey = key;
      resizeViewers();
      setAvatarLoader(false);
    },
    function (xhr) {
      if (viewer.pendingKey !== key) return;
      var pct = 0;
      if (xhr && xhr.total) pct = (xhr.loaded / xhr.total) * 100;
      else if (xhr && xhr.loaded) pct = Math.min(90, (xhr.loaded / 1400000) * 100);
      setAvatarLoader(true, pct);
    },
    function (err) {
      console.warn("Hoodoo sizing: CLO avatar GLB failed for", key, err);
      if (avatarKey(viewer.fit) !== key) return;
      setAvatarLoader(false);
      if (!viewer.bodyRoot.children.length) mountBody(proceduralBody());
    }
  );
}

function loadAvatar() {
  ensureViewer();
  if (!viewer) return;
  requestAnimationFrame(function () {
    resizeViewers();
    if (!viewer.raf) tick();
  });
  if (viewer.loaded) {
    loadFitAvatar();
    resizeViewers();
    return;
  }
  viewer.loaded = true;
  setAvatarLoader(true, 0);
  loadFitAvatar();
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
  if (viewer && viewer.loaded) loadFitAvatar();
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
