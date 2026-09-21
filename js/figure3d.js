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
        // MeshBasicMaterial - fully unlit/flat. A lit material (Lambert)
        // put a real shadow gradient on the far side of every limb, and
        // that soft, faded-to-gray edge read as the body being partly
        // see-through rather than just shaded. Flat white removes that
        // ambiguity outright and matches the reference's flat product-shot
        // look (no directional shadow, just the grid for form/depth cues).
        const fillMat = new THREE.MeshBasicMaterial({
          color: FILL,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: 1,
        });

        // Cylindrical grid overlay: evenly-spaced horizontal "ring" lines
        // (by height) and vertical "longitude" lines (by angle around the
        // vertical axis), drawn straight into the flat white fragment
        // color via onBeforeCompile - no separate wireframe mesh needed.
        // Requires derivative (fwidth) support for stable, non-aliased
        // lines regardless of surface curvature/distance - three.js
        // injects the right extension pragma for whichever GL context is
        // actually in use when this flag is set (WebGL2 has it natively).
        fillMat.extensions = { derivatives: true };
        fillMat.onBeforeCompile = (shader) => {
          shader.uniforms.gridColor = { value: new THREE.Color(GRID) };
          shader.uniforms.ringSpacing = { value: 0.045 };
          shader.uniforms.lonCount = { value: 18.0 };
          shader.uniforms.gridWidth = { value: 1.1 };
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vGridPos;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGridPos = position;");
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vGridPos;\nuniform vec3 gridColor;\nuniform float ringSpacing;\nuniform float lonCount;\nuniform float gridWidth;"
            )
            .replace(
              "#include <color_fragment>",
              `#include <color_fragment>
              // Screen-space-derivative-based line AA: the line stays a
              // stable ~1px wide no matter how the surface curves away
              // from the camera, instead of aliasing into dots/dashes.
              float ringX = vGridPos.y / ringSpacing;
              float ringFrac = fract( ringX );
              float ringD = min( ringFrac, 1.0 - ringFrac );
              float ringFw = max( fwidth( ringX ) * gridWidth, 0.0008 );
              float ringLine = 1.0 - smoothstep( 0.0, ringFw, ringD );

              // Choose a local centerline so the grid wraps each limb instead of
              // treating the whole person like one giant cylinder.
              float localX = vGridPos.x;
              float localZ = vGridPos.z;
              float localCount = lonCount;

              // Separate left/right legs below the crotch.
              if (vGridPos.y < 0.88) {
                localX -= (vGridPos.x < 0.0 ? -0.095 : 0.095);
                localCount = 10.0;
              }
              // Arms: use an approximate sloping arm centerline. This keeps
              // the long blue lines attached to the arm instead of fanning
              // out from the center of the torso.
              else if (vGridPos.y < 1.47 && abs(vGridPos.x) > 0.19) {
                float side = vGridPos.x < 0.0 ? -1.0 : 1.0;
                float t = clamp((1.43 - vGridPos.y) / 0.66, 0.0, 1.0);
                float armCenterX = side * mix(0.18, 0.43, t);
                localX = vGridPos.x - armCenterX;
                localCount = 8.0;
              }
              // Head gets a little more detail, like the reference.
              else if (vGridPos.y > 1.53) {
                localCount = 22.0;
              }

              // Straighter, cage-like verticals. The earlier longitude grid
              // used atan(), so every line bowed toward the waist/chest like
              // latitude/longitude on a globe. The reference uses much more
              // rectilinear quad topology. For torso and legs we therefore
              // draw intersections with evenly spaced X/Z planes. Because the
              // test is still evaluated on the actual body fragments, the
              // lines remain glued to the CLO surface while reading much
              // straighter from the front/3-quarter views.
              float verticalLine = 0.0;

              if (vGridPos.y > 1.53) {
                // Head: cylindrical topology is useful here and matches the
                // denser facial cage in the reference.
                float ang = atan( localZ, localX );
                float lonX = ( ang / 6.28318530718 ) * localCount;
                float lonFrac = fract( lonX );
                float lonD = min( lonFrac, 1.0 - lonFrac );
                float lonFw = max( min( fwidth( lonX ), 1.5 ) * gridWidth, 0.0008 );
                verticalLine = 1.0 - smoothstep( 0.0, lonFw, lonD );
              }
              else if (vGridPos.y < 1.47 && abs(vGridPos.x) > 0.19) {
                // Arms are angled, so retain a modest radial wrap rather than
                // projecting torso lines through them.
                float ang = atan( localZ, localX );
                float lonX = ( ang / 6.28318530718 ) * localCount;
                float lonFrac = fract( lonX );
                float lonD = min( lonFrac, 1.0 - lonFrac );
                float lonFw = max( min( fwidth( lonX ), 1.5 ) * gridWidth, 0.0008 );
                verticalLine = 1.0 - smoothstep( 0.0, lonFw, lonD );
              }
              else {
                // Torso + each leg: rectangular section grid. X-plane lines
                // dominate front/back; Z-plane lines take over around the
                // sides, giving a continuous but substantially straighter cage.
                float spacingX = (vGridPos.y < 0.88) ? 0.032 : 0.045;
                float spacingZ = (vGridPos.y < 0.88) ? 0.032 : 0.040;

                float gx = localX / spacingX;
                float fx = fract(gx);
                float dx = min(fx, 1.0 - fx);
                float wx = max(fwidth(gx) * gridWidth, 0.0008);
                float xLine = 1.0 - smoothstep(0.0, wx, dx);

                float gz = localZ / spacingZ;
                float fz = fract(gz);
                float dz = min(fz, 1.0 - fz);
                float wz = max(fwidth(gz) * gridWidth, 0.0008);
                float zLine = 1.0 - smoothstep(0.0, wz, dz);

                // Prefer X planes on front/back and Z planes on the sides.
                // Smooth blending prevents a visible seam at the transition.
                float ax = abs(localX);
                float az = abs(localZ);
                float frontWeight = smoothstep(0.35, 0.65, az / max(ax + az, 0.0001));
                verticalLine = mix(zLine, xLine, frontWeight);

                // FRONT MIDSECTION CLEANUP
                // On the front of the torso/pelvis, override the generic cage with
                // a calmer rectilinear grid. This avoids the breast/hip loops and
                // keeps the abdomen reading like the clean reference topology.
                bool frontMid = (vGridPos.y > 0.88 && vGridPos.y < 1.47 &&
                                 vGridPos.z > 0.0 && abs(vGridPos.x) < 0.23);
                if (frontMid) {
                  // Five main vertical columns, centered on x=0. The X-plane test
                  // is evaluated on the real body surface, so these remain attached
                  // while appearing straight from the front.
                  float midSpacingX = 0.055;
                  float mgx = vGridPos.x / midSpacingX;
                  float mfx = fract(mgx);
                  float mdx = min(mfx, 1.0 - mfx);
                  float mwx = max(fwidth(mgx) * gridWidth, 0.0008);
                  verticalLine = 1.0 - smoothstep(0.0, mwx, mdx);
                }
              }

              // Fewer, cleaner horizontal rows across the front midsection.
              // This suppresses the busy contour-map look between underbust and hips.
              bool cleanFrontRows = (vGridPos.y > 0.88 && vGridPos.y < 1.47 &&
                                     vGridPos.z > 0.0 && abs(vGridPos.x) < 0.23);
              if (cleanFrontRows) {
                float midRingSpacing = 0.065;
                float mry = (vGridPos.y - 0.88) / midRingSpacing;
                float mrf = fract(mry);
                float mrd = min(mrf, 1.0 - mrf);
                float mrw = max(fwidth(mry) * gridWidth, 0.0008);
                ringLine = 1.0 - smoothstep(0.0, mrw, mrd);
              }

              float gridMask = clamp( ringLine + verticalLine, 0.0, 1.0 );
              diffuseColor.rgb = mix( diffuseColor.rgb, gridColor, gridMask );`
            );
        };

        // Collect mesh references FIRST, then re-parent in a separate pass.
        // (group.add() below removes each mesh from gltf.scene, which
        // mutates gltf.scene.children while .traverse() is still walking
        // that same live array - corrupting the iteration. Two passes
        // avoids mutating the array we're iterating over.)
        const meshes = [];
        gltf.scene.traverse((obj) => { if (obj.isMesh) meshes.push(obj); });

        meshes.forEach((obj) => {
          if (obj.name === "body_wire") return; // superseded by the shader grid above
          obj.material = fillMat;
          group.add(obj);
        });

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
