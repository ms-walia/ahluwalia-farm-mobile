/* Small rotating 3D jar for the shop size cards.
   This is the SAME jar as the main honey section (glass, honey, cap, surface waves, bubbles, matte label,
   lighting) — it is built from the same code. Only three things differ per card:
   the label (250g / 500g / 1kg), the jar's size, and the honey colour of the variety. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Honey look per variety (blended while the jar spins between cards)
const HONEY = {
  'multiflora':      { c: '#7b3a0d', em: '#3a1503', ei: 0.5,  op: 0.88,  rough: 0.06, cc: 1.0, glow: 0.45, gc: [1.0, 0.55, 0.12], cloud: 0, visc: 0 },
  'mustard':         { c: '#e6cc8e', em: '#6a5320', ei: 0.22, op: 0.99,  rough: 0.42, cc: 0.4, glow: 0.08, gc: [1.0, 0.92, 0.65], cloud: 1, visc: 1 },
  'kashmiri-acacia': { c: '#e2a53a', em: '#a0560a', ei: 0.4,  op: 0.74,  rough: 0.04, cc: 1.0, glow: 0.65, gc: [1.0, 0.7, 0.2],   cloud: 0, visc: 0 },
  'ajwain':          { c: '#b5650f', em: '#6e2c03', ei: 0.4,  op: 0.85,  rough: 0.06, cc: 1.0, glow: 0.5,  gc: [1.0, 0.58, 0.12], cloud: 0, visc: 0 },
  'jamun':           { c: '#5a210a', em: '#2a0c02', ei: 0.5,  op: 0.92,  rough: 0.07, cc: 1.0, glow: 0.32, gc: [1.0, 0.45, 0.15], cloud: 0, visc: 0 },
};
const JAR_URL = 'assets/3d/Multiflora_1kg_jar.glb';
let gltfP = null;
const loadJar = () => (gltfP ||= new GLTFLoader().loadAsync(JAR_URL));

export async function mountJar(el, { variety, size: jarSize, scale = 1 }) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
  el.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const key = new THREE.DirectionalLight(0xfff3e0, 0.8);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd59a, 0.55);
  rim.position.set(3, 2, -3);
  scene.add(rim);

  const FOV = 28, DIST = 10;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);

  const texLoader = new THREE.TextureLoader();
  const labelTex = await new Promise((res, rej) => texLoader.load(`assets/3d/labels/${variety}-${jarSize}.jpg`, (t) => {
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t);
  }, undefined, rej));
  const tex = [labelTex];
  const gltf = await loadJar();

  const jar = gltf.scene.clone(true);
  renderer.localClippingEnabled = true;

  // ---- jar dimensions (GLB units = metres, Y up) ----
  const FILL_Y = 0.100;          // honey surface: middle of the upper glass bulge
  const HONEY_HALF = 0.041;      // inner half-width of the honey at that height
  const GLASS_WALL = 0.0026;     // honey pushed out by the modelled wall thickness
  const HONEY_R = 0.0072 + GLASS_WALL;  // corner radius of the honey surface

  // Keep only the outward-facing triangles of the glass shell (drops the inner wall)
  function outerShellOnly(geo) {
    const g = geo.index ? geo : geo.clone();
    const pos = g.attributes.position;
    const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
    g.computeBoundingBox();
    const yc = (g.boundingBox.min.y + g.boundingBox.max.y) / 2;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const n = new THREE.Vector3(), ctr = new THREE.Vector3();
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
      n.subVectors(c, b).cross(ctr.subVectors(a, b));
      ctr.addVectors(a, b).add(c).divideScalar(3); ctr.y -= yc;
      if (n.dot(ctr) > 0) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const out = g.clone();
    out.setIndex(keep);
    return out;
  }

  // Neck: turn the thread ring into a real helix (its end step shows the turn) and give the
  // glass a slight hand-made unevenness so highlights travel round as the jar spins
  const NECK_Y0 = 0.1185, NECK_K = 0.5;
  const NECK_DROP = (0.134 - NECK_Y0) * (1 - NECK_K);   // how much lower the rim (and the closed cap) sit
  function neckDetail(geo) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const PITCH = 0.0024;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < 0.104) continue;
      const th = Math.atan2(z, x);                  // -π..π
      if (y > 0.1155 && y < 0.1205 && Math.hypot(x, z) < 0.0416) {
        p.setY(i, y + PITCH * (th / (2 * Math.PI)));
      }
      // shorter neck: squash everything above the shoulder
      if (y > NECK_Y0) p.setY(i, NECK_Y0 + (p.getY(i) - NECK_Y0) * NECK_K);
      const w = 0.07 * Math.sin(th * 5 + 1.3) + 0.05 * Math.sin(th * 11 + 0.4) + 0.04 * Math.sin(th * 3 + y * 900);
      n.setXYZ(i, n.getX(i) - Math.sin(th) * w, n.getY(i) + w * 0.4, n.getZ(i) + Math.cos(th) * w);
    }
    n.needsUpdate = true; p.needsUpdate = true;
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  }

  // Move every vertex out along its normal (honey meets the outer glass)
  function pushOut(geo, d) {
    const out = geo.clone();
    const p = out.attributes.position, nr = out.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) + nr.getX(i) * d, p.getY(i) + nr.getY(i) * d, p.getZ(i) + nr.getZ(i) * d);
    }
    out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
  }

  // Honey surface clipping plane (world space, updated every frame)
  const honeyPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

  // Translucent golden honey (light passes through, like the real jar)
  const honeyMat = new THREE.MeshPhysicalMaterial({
    name: 'HoneyLive',
    // No transmission: the canvas is transparent, so refraction would only see black and turn the
    // honey brown. Instead: amber body, a little see-through, glowing gold where the light passes
    // through thin edges, deeper in the middle.
    color: new THREE.Color('#a85a0c'),
    emissive: new THREE.Color('#6e2c03'),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.9,
    roughness: 0.06,
    ior: 1.5,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.7,             // strong white reflections down the sides, like the simulated honey
  });

  const glowU = { uGlowAmt: { value: 0.45 }, uGlowCol: { value: new THREE.Color(1, 0.55, 0.12) } };
  const honeyGlow = (sh) => {
    sh.uniforms.uGlowAmt = glowU.uGlowAmt; sh.uniforms.uGlowCol = glowU.uGlowCol;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowAmt; uniform vec3 uGlowCol;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      float under = clamp(-normalize(normal).y, 0.0, 1.0);
      totalEmissiveRadiance += uGlowCol * (0.03 + pow(rim, 1.6) * uGlowAmt + pow(under, 2.0) * uGlowAmt * 0.6);`);
  };
  // ---- flowing honey surface: shared wave + meniscus height field (surface-local metres) ----
  const SURF_HALF = HONEY_HALF + GLASS_WALL;
  const waveU = { uTime: { value: 0 }, uSlosh: { value: 0 }, uSurfInv: { value: new THREE.Matrix4() } };
  const WAVE_GLSL = `
    uniform float uTime; uniform float uSlosh;
    float sdRB(vec2 p, float b, float r){ vec2 q = abs(p) - vec2(b - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    float honeyH(vec2 p){
      float d = max(-sdRB(p, ${SURF_HALF.toFixed(5)}, ${HONEY_R.toFixed(5)}), 0.0);
      float men = 0.0016 * exp(-d / 0.0022);              // honey creeps up the glass
      float a = 0.00006 + 0.0011 * uSlosh;                 // slow, heavy waves while it moves
      float w = sin(p.x * 95.0 + uTime * 1.3) * 0.55
              + sin(p.y * 72.0 - uTime * 0.95 + 1.7) * 0.35
              + sin((p.x - p.y) * 140.0 + uTime * 1.9) * 0.2;
      return men + a * w;
    }`;
  honeyMat.onBeforeCompile = (sh) => {
    honeyGlow(sh);
    sh.uniforms.uTime = waveU.uTime; sh.uniforms.uSlosh = waveU.uSlosh; sh.uniforms.uSurfInv = waveU.uSurfInv;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHW; uniform mat4 uSurfInv;' + WAVE_GLSL)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec3 hp = (uSurfInv * vec4(vHW, 1.0)).xyz;
        if (hp.y > honeyH(hp.xz)) discard;`);
  };
  honeyMat.customProgramCacheKey = () => 'honeyBody';

  // Glossy clear glass
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'GlassLive',
    color: 0xffffff,
    transparent: true,
    opacity: 0.05,                // nearly invisible face-on…
    roughness: 0.03,              // glossy
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.9,
    side: THREE.DoubleSide,       // near and far wall, each a single thin layer
    depthWrite: false,
  });
  // …brighter at the edges and wherever a highlight lands, like real glass
  glassMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGY;')
      .replace('#include <opaque_fragment>', `
      float fr = pow(1.0 - abs(dot(normalize(geometryNormal), normalize(geometryViewDir))), 3.0);
      vec3 sp = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      // over the label band keep the glass almost clear, so the print stays crisp
      float band = smoothstep(0.010, 0.014, vGY) * (1.0 - smoothstep(0.094, 0.099, vGY));
      float boost = mix(1.0, 0.18, band);
      float neck = smoothstep(0.117, 0.119, vGY);          // soft frost so the neck doesn't vanish
      diffuseColor.a = clamp(diffuseColor.a * mix(1.0, 0.4, band) + (fr * 0.55 + dot(sp, vec3(0.3333)) * 0.9) * boost, 0.0, 0.9);
      #include <opaque_fragment>`);
  };
  glassMat.customProgramCacheKey = () => 'glassBand';

  // Satin brushed-gold lug cap
  const capMat = new THREE.MeshPhysicalMaterial({
    name: 'CapLive', color: new THREE.Color('#cfae62'), metalness: 1, roughness: 0.34, envMapIntensity: 1.1,
  });

  let labelMat = null;
  let capMesh = null;
  let capLive = null;
  const capBase = new THREE.Vector3();
  jar.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material ? o.material.clone() : null;   // own copy per card
    if (!m) return;
    o.material = m;
    if (o.name.startsWith('Label') || m.name === 'Label') {
      labelMat = m;
      m.roughness = 0.9;                     // matte paper: no glossy glare over the text
      m.clearcoat = 0;                       // no shiny layer
      m.clearcoatRoughness = 1;
      m.envMapIntensity = 0.25;              // soft reflections only
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 0.62;            // label is lit from within so shadows can't hide the print
      // draw the label after the glass and pull it onto the outer surface so it reads as stuck on
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      o.renderOrder = 5;
    } else if (m.name === 'Glass') {
      o.geometry = neckDetail(outerShellOnly(o.geometry));   // one thin layer of glass, not two
      o.material = glassMat;
      o.renderOrder = 3;
    } else if (m.name.startsWith('Honey')) {
      o.geometry = pushOut(o.geometry, GLASS_WALL); // honey fills right up to the thin glass
      o.material = honeyMat;
    } else if (m.name === 'GoldCap') {
      capMesh = o;
    }
  });
  if (!labelMat) throw new Error('label mesh not found in GLB');
  labelMat.map = tex[0];
  labelMat.emissiveMap = tex[0];
  labelMat.needsUpdate = true;

  // Replace the plain cap with one that has the stepped rings and sunken centre of the real lug cap
  if (capMesh) {
    capMesh.geometry.computeBoundingBox();
    const cb = capMesh.geometry.boundingBox;
    const R = (cb.max.x - cb.min.x) / 2;
    const H = cb.max.y - cb.min.y;
    const top = cb.max.y, y0 = top - (top - cb.min.y) * 0.7;   // shorter lug cap (~10 mm)
    const mm = 0.001;
    const prof = [
      [R - 0.6 * mm, y0], [R, y0 + 0.8 * mm],
      ...Array.from({ length: 9 }, (_, i) => [R, y0 + 0.8 * mm + (i + 1) * ((top - 2.4 * mm) - (y0 + 0.8 * mm)) / 10]),
      [R, top - 2.4 * mm],
      [R - 0.5 * mm, top - 0.8 * mm], [R - 1.6 * mm, top],            // rounded outer edge
      [R - 3.2 * mm, top],                                             // flat outer rim
      [R - 3.6 * mm, top - 0.5 * mm], [R - 4.6 * mm, top - 0.5 * mm],  // groove
      [R - 5.0 * mm, top - 0.1 * mm], [R - 5.8 * mm, top - 0.1 * mm],  // thin raised ring
      [R - 6.2 * mm, top - 0.6 * mm], [R - 7.2 * mm, top - 0.6 * mm],  // second step
      [R - 8.6 * mm, top - 1.4 * mm], [0, top - 1.4 * mm],             // sunken flat centre
    ].map(([x, y]) => new THREE.Vector2(x, y));
    // pressed-in lugs round the bottom edge of the skirt (they grip the jar's thread), like the real cap
    const capGeo = new THREE.LatheGeometry(prof, 360);
    {
      const LUGS = 4, LUG_W = 4.0 * mm, LUG_H = 5.0 * mm, LUG_D = 1.5 * mm;
      const cp = capGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
        const r = Math.hypot(x, z);
        if (r < R - 0.7 * mm || y > y0 + LUG_H) continue;
        const th = Math.atan2(z, x);
        const step = (2 * Math.PI) / LUGS;
        const dTh = ((th - step / 2) % step + step * 1.5) % step - step / 2;   // angle to nearest lug
        const t = (R * dTh) / LUG_W;
        const wy = Math.pow(Math.max(0, 1 - (y - y0) / LUG_H), 1.3);
        const dent = LUG_D * Math.exp(-t * t) * wy;
        const k = (r - dent) / r;
        cp.setXYZ(i, x * k, y, z * k);
      }
      capGeo.computeVertexNormals();
      // weld the lathe seam so no line shows on the cap
      const cn = capGeo.attributes.normal, P = prof.length, last = 360 * P;
      for (let j = 0; j < P; j++) {
        const nx = cn.getX(j) + cn.getX(last + j), ny = cn.getY(j) + cn.getY(last + j), nz = cn.getZ(j) + cn.getZ(last + j);
        const l = Math.hypot(nx, ny, nz) || 1;
        cn.setXYZ(j, nx / l, ny / l, nz / l); cn.setXYZ(last + j, nx / l, ny / l, nz / l);
      }
    }
    const lathe = new THREE.Mesh(capGeo, capMat);
    lathe.position.copy(capMesh.position);
    lathe.quaternion.copy(capMesh.quaternion);
    lathe.position.y += 0;                  // lathe profile already in the cap's local units
    capMesh.parent.add(lathe);
    capLive = lathe;
    capBase.copy(lathe.position);
    capBase.y -= NECK_DROP;
    lathe.position.copy(capBase);            // lid sits screwed on
    // a raised glass screw thread round the neck, visible when the lid is off
    {
      const R = 0.0401, y0 = NECK_Y0 + 0.0008, PITCH = 0.0026, TURNS = 1.6;
      class Helix extends THREE.Curve {
        getPoint(t, out = new THREE.Vector3()) {
          const a = t * TURNS * Math.PI * 2;
          const taper = Math.min(1, t * 8, (1 - t) * 8);
          return out.set((R + 0.0004 * taper) * Math.cos(a), y0 + PITCH * t * TURNS, (R + 0.0004 * taper) * Math.sin(a));
        }
      }
      const threadMat = glassMat.clone();
      threadMat.opacity = 0.32;
      threadMat.side = THREE.FrontSide;
      const thread = new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 220, 0.00085, 8, false), threadMat);
      thread.renderOrder = 3;
      void thread;   // (not added: it made the open neck look wider than the original)
    }
    capMesh.visible = false;
    void H;
  }

  // Honey surface (a rounded-square sheet that stays level and wobbles)
  const surfShape = new THREE.Shape();
  {
    const h = HONEY_HALF + GLASS_WALL, r = HONEY_R;
    surfShape.moveTo(-h + r, -h);
    surfShape.lineTo(h - r, -h); surfShape.quadraticCurveTo(h, -h, h, -h + r);
    surfShape.lineTo(h, h - r); surfShape.quadraticCurveTo(h, h, h - r, h);
    surfShape.lineTo(-h + r, h); surfShape.quadraticCurveTo(-h, h, -h, h - r);
    surfShape.lineTo(-h, -h + r); surfShape.quadraticCurveTo(-h, -h, -h + r, -h);
  }
  void surfShape;
  const surfGeo = new THREE.PlaneGeometry(SURF_HALF * 2, SURF_HALF * 2, 72, 72);
  surfGeo.rotateX(-Math.PI / 2);           // lie flat in XZ; displaced into waves in the shader
  const surfVert = (vs) => vs
    .replace('#include <common>', '#include <common>\nvarying vec2 vLP;' + WAVE_GLSL)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float h0 = honeyH(position.xz);
      objectNormal = normalize(vec3(h0 - honeyH(position.xz + vec2(0.0006, 0.0)), 0.0006, h0 - honeyH(position.xz + vec2(0.0, 0.0006))));`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += honeyH(position.xz); vLP = position.xz;');
  const surfFrag = (fs) => fs
    .replace('#include <common>', `#include <common>
      varying vec2 vLP;
      float sdRB2(vec2 p, float b, float r){ vec2 q = abs(p) - vec2(b - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }`)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (sdRB2(vLP, ' + SURF_HALF.toFixed(5) + ', ' + HONEY_R.toFixed(5) + ') > 0.0) discard;');
  const surfMat = honeyMat.clone();
  surfMat.clippingPlanes = [];
  surfMat.side = THREE.DoubleSide;
  surfMat.onBeforeCompile = (sh) => {
    honeyGlow(sh);
    sh.uniforms.uTime = waveU.uTime; sh.uniforms.uSlosh = waveU.uSlosh;
    sh.vertexShader = surfVert(sh.vertexShader);
    sh.fragmentShader = surfFrag(sh.fragmentShader);
  };
  surfMat.customProgramCacheKey = () => 'honeySurface';
  const surface = new THREE.Mesh(surfGeo, surfMat);
  scene.add(surface);

  // Golden shimmer on top of the honey: glints off tiny surface bubbles, stronger while it sloshes
  const shimmerMat = new THREE.ShaderMaterial({
    uniforms: { uTime: waveU.uTime, uSlosh: waveU.uSlosh, uAmt: { value: 0.15 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vP;` + WAVE_GLSL + `
      void main(){ vP = position.xz; vec3 q = position; q.y += honeyH(position.xz) + 0.0002;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uAmt; varying vec2 vP;
      float sdRB(vec2 p, float b, float r){ vec2 q = abs(p) - vec2(b - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        if (sdRB(vP, ${SURF_HALF.toFixed(5)}, ${HONEY_R.toFixed(5)}) > 0.0) discard;
        vec2 g = vP * 520.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        float r = h(id);
        vec2 o = vec2(h(id + 3.1), h(id + 7.7)) - 0.5;
        float tw = 0.5 + 0.5 * sin(uTime * (2.5 + r * 6.0) + r * 40.0);
        float spark = smoothstep(0.16, 0.0, length(f - o * 0.6)) * step(0.78, r) * tw * tw * tw;
        float band = pow(0.5 + 0.5 * sin(vP.x * 70.0 + vP.y * 35.0 - uTime * 2.2), 8.0);
        float a = uAmt * (spark * 1.8 + band * 0.35 + 0.06);
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.42) * a, 1.0);
      }`,
  });
  const shimmer = new THREE.Mesh(surfGeo, shimmerMat);
  shimmer.renderOrder = 4;
  surface.add(shimmer);

  // A few tiny air bubbles drifting up through the honey (jar-local, metres)
  const BUBBLES = 22;
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff1cf, roughness: 0.08, metalness: 0, emissive: 0xffe2a0, emissiveIntensity: 0.25,
    clippingPlanes: [honeyPlane],
  });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), bubbleMat, BUBBLES);
  const bub = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < BUBBLES; i++) {
    bub.push({
      x: rand(-0.034, 0.034), y: rand(0.008, FILL_Y - 0.004), z: rand(-0.034, 0.034),
      r: rand(0.00035, 0.0009), v: rand(0.0008, 0.0022), ph: rand(0, Math.PI * 2),
    });
  }
  const tmpM = new THREE.Matrix4();
  bubbles.frustumCulled = false;

  // Centre the jar on its own vertical middle and normalise its height to 1 unit
  const box = new THREE.Box3().setFromObject(jar);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  jar.position.sub(centre);
  const pivot = new THREE.Group();          // spins around the jar's own axis
  pivot.add(jar);
  const mover = new THREE.Group();          // travels along the curve
  mover.add(pivot);
  const baseScale = 1 / size.y;
  jar.add(bubbles);                         // added after measuring so it doesn't affect the size
  scene.add(mover);

  // honey look of this variety (same table and values as the main section)
  const H = HONEY[variety] || HONEY.multiflora;
  const hv = { c: new THREE.Color(H.c), em: new THREE.Color(H.em), gcol: new THREE.Color(...H.gc) };
  for (const mt of [honeyMat, surfMat]) {
    mt.color.copy(hv.c); mt.emissive.copy(hv.em); mt.emissiveIntensity = H.ei;
    mt.opacity = H.op; mt.roughness = H.rough; mt.clearcoat = H.cc;
  }
  glowU.uGlowAmt.value = H.glow; glowU.uGlowCol.value.copy(hv.gcol);
  bubbles.visible = H.cloud < 0.5;
  const fluid = 1 - 0.85 * H.visc, damp = 5.5 + 20 * H.visc;

  // size on the card: the jar scales down for the smaller sizes and rests on a common shelf
  const worldH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const s = 0.86 * scale * worldH * baseScale;
  pivot.scale.setScalar(s);
  mover.position.y = worldH * (0.43 * scale - 0.36);   // bottoms of all sizes line up, clear of the card edge

  // swipe to turn, gentle auto-turn otherwise
  const TAU = Math.PI * 2, AUTO = 0.35;
  let user = -0.32, v = AUTO, drag = null, visible = true, lastAngle = user, raf = 0, last = performance.now();
  const tilt = new THREE.Vector2(), tiltV = new THREE.Vector2();
  canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; v = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag === null) return; const d = (e.clientX - drag) * 0.012; user += d; v = d * 30; drag = e.clientX; });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (drag === null) { v += (AUTO - v) * Math.min(1, dt * 1.5); user += v * dt; }
    const angle = user;
    pivot.rotation.set(0.08, angle, 0);
    mover.updateMatrixWorld(true);

    // liquid: the surface tips and sloshes when the jar is spun (same model as the main section)
    let dA = angle - lastAngle; dA -= Math.round(dA / TAU) * TAU; lastAngle = angle;
    const spin = dA / dt;
    const drive = THREE.MathUtils.clamp(spin * 0.035 * fluid, -3, 3);
    tiltV.x += (-60 * tilt.x - damp * tiltV.x + drive) * dt;
    tiltV.y += (-60 * tilt.y - damp * tiltV.y) * dt;
    tilt.x = THREE.MathUtils.clamp(tilt.x + tiltV.x * dt, -0.22, 0.22);
    tilt.y = THREE.MathUtils.clamp(tilt.y + tiltV.y * dt, -0.22, 0.22);
    const up = new THREE.Vector3(Math.sin(tilt.x), 1, Math.sin(tilt.y)).normalize();
    const fillPt = jar.localToWorld(new THREE.Vector3(0, FILL_Y, 0));
    honeyPlane.setFromNormalAndCoplanarPoint(up.clone().negate(), fillPt);
    surface.position.copy(fillPt);
    surface.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle));
    surface.scale.setScalar(s);
    surface.updateMatrixWorld(true);
    waveU.uSurfInv.value.copy(surface.matrixWorld).invert();
    const t = now / 1000;
    waveU.uTime.value = t;
    waveU.uSlosh.value = fluid * Math.min(1, Math.abs(tilt.x) * 3.5 + Math.abs(tilt.y) * 3.5 + Math.abs(tiltV.x) * 0.4 + Math.abs(tiltV.y) * 0.4);
    shimmerMat.uniforms.uAmt.value = Math.min(1, 0.15 + Math.abs(tilt.x) * 4 + Math.abs(tilt.y) * 4 + Math.abs(tiltV.x) * 0.5) * (1 - 0.75 * H.cloud);

    for (let i = 0; i < BUBBLES; i++) {
      const b = bub[i];
      b.y += b.v * dt * (1 + Math.abs(tiltV.x) * 0.5);
      if (b.y > FILL_Y - 0.003) { b.y = 0.008; b.x = rand(-0.034, 0.034); b.z = rand(-0.034, 0.034); }
      const wx = Math.sin(t * 0.9 + b.ph) * 0.0012 + tilt.x * 0.004;
      tmpM.makeScale(b.r, b.r, b.r).setPosition(b.x + wx, b.y, b.z + Math.cos(t * 0.7 + b.ph) * 0.001);
      bubbles.setMatrixAt(i, tmpM);
    }
    bubbles.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
    raf = visible ? requestAnimationFrame(frame) : 0;
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) start(); }).observe(el);
  start();
}
