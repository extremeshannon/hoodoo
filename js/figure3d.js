/**
 * Solid-white body with a grid overlay (Three.js), built from a real
 * CLO3D avatar export instead of procedural primitives.
 *
 * The source GLB (static/models/avatar_female.glb) was processed offline
 * from the original CLO export (see tools/prep_avatar.py):
 *   - stripped to the bare body (no hair/shoes/eyes/teeth)
 *   - stripped of all PBR textures (we don't need them - just geometry)
 *   - stripped of the skeleton (we display it standing, unposed, so
 *     skinning would be a no-op; dropping it avoids any skinning-related
 *     rendering edge cases)
 *   - split into two meshes at prep time, though only "body_detail" (the
 *     full-resolution mesh) is actually used for rendering now; the
 *     decimated "body_wire" mesh from an earlier iteration is ignored.
 *
 * The grid pattern is NOT a wireframe over a low-poly mesh (that read as
 * a messy tangle of triangulation diagonals). It's a shader overlay on
 * the solid body_detail mesh: MeshLambertMaterial.onBeforeCompile injects
 * a small GLSL snippet that draws evenly-spaced horizontal "ring" lines
 * (by height, vGridPos.y) and vertical "longitude" lines (by angle around
 * the vertical axis, atan2(z, x)) directly on the lit surface. This is
 * cylindrical, not UV-based, because the avatar's baked-in UVs are a
 * garment texture atlas (patchwork islands per body part) - literally
 * tiling those would look broken, not like the clean ring/longitude grid
 * in the reference sizing diagrams.
 *
 * Usage (see sizing.html):
 *   Figure3D.init(canvasEl, { onSelect: (key) => ... });
 *   Figure3D.setActive("chest");
 *   Figure3D.setGender("female"); // "male" is a placeholder until a
 *                                  // matching male GLB is prepped - see
 *                                  // README "Adding a male avatar".
 *
 * Requires THREE (r128 UMD build) + THREE.GLTFLoader loaded globally
 * before this file.
 */
const Figure3D = (function () {
  "use strict";

  const GRID = 0x3f6fa8; // grid lines + marker dots - medium blue on white
  const ORANGE = 0xe07800;
  const FILL = 0xffffff; // solid opaque white body

  const MODEL_URLS = {
    female: "/static/models/avatar_female.glb",
    // male: "/static/models/avatar_male.glb",  <- add once you export one
  };

  let scene, camera, renderer, canvas;
  let figureGroup = null; // holds the currently-loaded avatar + markers
  let loadedByGender = {}; // gender -> THREE.Group (cached after first load)
  let markers = {}, guideLines = {}, activeKey = null, gender = "female";
  let onSelect = () => {};
  let onGenderUnavailable = () => {};

  let dragging = false, lastX = 0, pointerDownAt = null;
  let autoRotate = true, autoRotateTimer = null;

  // Landmark positions, measured directly off the processed avatar mesh
  // (see tools/prep_avatar.py's landmark-sampling step) - not eyeballed.
  // Coordinates are in the model's own local space (meters, feet ~y=0).
  const LANDMARKS = {
    chest: { pos: [0, 1.295, 0.048] },
    waist: { pos: [0, 1.10, 0.046] },
    torso: { pos: [0, 1.597, 0.062], line: [[0, 1.597, 0.062], [0.07, 1.02, 0.048]] },
    leg: { pos: [0.095, 1.015, 0.045], line: [[0.095, 1.015, 0.045], [0.095, 0.145, -0.039]] },
    inseam: { pos: [0.015, 0.97, 0.055], line: [[0.015, 0.97, 0.055], [0.067, 0.156, -0.082]] },
  };

  function buildMarkers(group) {
    Object.keys(markers).forEach((k) => group.remove(markers[k]));
    Object.keys(guideLines).forEach((k) => group.remove(guideLines[k]));
    markers = {}; guideLines = {};

    Object.entries(LANDMARKS).forEach(([key, def]) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 14, 12),
        new THREE.MeshBasicMaterial({ color: GRID, depthTest: false })
      );
      dot.renderOrder = 10;
      dot.position.set(...def.pos);
      dot.userData.key = key;
      group.add(dot);
      markers[key] = dot;

      if (def.line) {
        const points = def.line.map((p) => new THREE.Vector3(...p));
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineDashedMaterial({ color: ORANGE, dashSize: 0.018, gapSize: 0.012, linewidth: 2, depthTest: false })
        );
        line.computeLineDistances();
        line.renderOrder = 9;
        line.visible = false;
        group.add(line);
        guideLines[key] = line;
      }
    });
  }

  function applyActiveVisuals() {
    Object.entries(markers).forEach(([key, mesh]) => {
      mesh.material.color.setHex(key === activeKey ? ORANGE : GRID);
      mesh.scale.setScalar(key === activeKey ? 1.6 : 1);
    });
    Object.entries(guideLines).forEach(([key, line]) => { line.visible = key === activeKey; });
  }

  function loadAvatar(genderKey, cb) {
    if (loadedByGender[genderKey]) {
      cb(loadedByGender[genderKey]);
      return;
    }
    const url = MODEL_URLS[genderKey];
    if (!url) {
      onGenderUnavailable(genderKey);
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const group = new THREE.Group();
        // Two-pass rendering is deliberate here. The avatar body is one
        // completely opaque white pass. The blue sizing grid is a second
        // transparent pass laid over the same surface. Keeping the passes
        // separate prevents the grid shader from ever making the body look
        // translucent, which was the main visual mismatch with the reference.
        const fillMat = new THREE.MeshBasicMaterial({
          color: FILL,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1,
          depthWrite: true,
          depthTest: true,
        });

        // Clean UPT-style latitude/longitude grid. This follows the body
        // surface instead of exposing the GLB's triangle topology, so the
        // result reads as an intentional sizing grid rather than a pile of
        // triangulation diagonals.
        const gridMat = new THREE.ShaderMaterial({
          uniforms: {
            gridColor: { value: new THREE.Color(GRID) },
            ringSpacing: { value: 0.043 },
            lonCount: { value: 28.0 },
            gridWidth: { value: 1.0 },
          },
          vertexShader: `
            varying vec3 vGridPos;
            void main() {
              vGridPos = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            #extension GL_OES_standard_derivatives : enable
            varying vec3 vGridPos;
            uniform vec3 gridColor;
            uniform float ringSpacing;
            uniform float lonCount;
            uniform float gridWidth;

            void main() {
              float ringX = vGridPos.y / ringSpacing;
              float ringD = abs(fract(ringX + 0.5) - 0.5);
              float ringAA = max(fwidth(ringX) * gridWidth, 0.001);
              float ringLine = 1.0 - smoothstep(0.0, ringAA, ringD);

              float ang = atan(vGridPos.z, vGridPos.x);
              float lonX = (ang / 6.28318530718) * lonCount;
              float lonD = abs(fract(lonX + 0.5) - 0.5);
              float lonAA = max(min(fwidth(lonX), 1.5) * gridWidth, 0.001);
              float lonLine = 1.0 - smoothstep(0.0, lonAA, lonD);

              float a = clamp(ringLine + lonLine, 0.0, 1.0);
              if (a < 0.02) discard;
              gl_FragColor = vec4(gridColor, a);
            }
          `,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
          extensions: { derivatives: true },
        });

        // Keep the GLTF hierarchy intact. CLO/GLB exports can carry transforms
        // on parent nodes; pulling meshes out and re-parenting them can lose
        // those transforms. Each visible body mesh gets an opaque white base
        // plus a child mesh using the exact same geometry for the blue grid.
        const bodyMeshes = [];
        gltf.scene.traverse((obj) => {
          if (obj.isMesh && obj.name !== "body_wire") bodyMeshes.push(obj);
        });

        bodyMeshes.forEach((obj) => {
          obj.material = fillMat;
          obj.renderOrder = 1;

          const overlay = new THREE.Mesh(obj.geometry, gridMat);
          overlay.name = `${obj.name || "body"}_grid_overlay`;
          overlay.frustumCulled = obj.frustumCulled;
          overlay.renderOrder = 2;
          // As a child it inherits the body's transform. Geometry coordinates
          // are therefore identical and the polygon offset handles z-fighting.
          obj.add(overlay);
        });

        // The old decimated body_wire mesh is retained in the GLB for backwards
        // compatibility but hidden. Its triangle diagonals are not the look we
        // want for the sizing figure.
        gltf.scene.traverse((obj) => {
          if (obj.isMesh && obj.name === "body_wire") obj.visible = false;
        });

        group.add(gltf.scene);

        loadedByGender[genderKey] = group;
        cb(group);
      },
      undefined,
      (err) => console.error("Figure3D: failed to load", url, err)
    );
  }

  function showFigure(group) {
    const prevRotY = figureGroup ? figureGroup.rotation.y : 0;
    if (figureGroup) scene.remove(figureGroup);
    figureGroup = group;
    figureGroup.rotation.y = prevRotY;
    buildMarkers(figureGroup);
    applyActiveVisuals();
    scene.add(figureGroup);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function onPointerDown(e) {
    dragging = true; autoRotate = false;
    clearTimeout(autoRotateTimer);
    lastX = e.clientX;
    pointerDownAt = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging || !figureGroup) return;
    figureGroup.rotation.y += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  }
  function onPointerUp(e) {
    dragging = false;
    autoRotateTimer = setTimeout(() => { autoRotate = true; }, 2200);
    if (!pointerDownAt) return;
    const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y);
    if (moved > 5) return;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(Object.values(markers));
    if (hits.length) onSelect(hits[0].object.userData.key);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (autoRotate && !dragging && figureGroup) figureGroup.rotation.y += 0.0035;
    renderer.render(scene, camera);
  }

  function init(canvasEl, opts) {
    canvas = canvasEl;
    onSelect = (opts && opts.onSelect) || onSelect;
    onGenderUnavailable = (opts && opts.onGenderUnavailable) || onGenderUnavailable;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    camera.position.set(0, 0.95, 3.5);
    camera.lookAt(0, 0.9, 0);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // No scene lights needed - the body is MeshBasicMaterial (unlit/flat)
    // and the markers/guide lines are MeshBasicMaterial/LineBasicMaterial
    // too, so nothing in this scene reacts to lighting.

    loadAvatar(gender, showFigure);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.style.touchAction = "none";

    window.addEventListener("resize", resize);
    resize();
    animate();
  }

  function setActive(key) {
    activeKey = key;
    if (figureGroup) applyActiveVisuals();
  }

  function setGender(g) {
    if (g === gender) return;
    if (!MODEL_URLS[g]) { onGenderUnavailable(g); return; }
    gender = g;
    loadAvatar(gender, showFigure);
  }

  return { init, setActive, setGender };
})();
