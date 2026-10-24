// Time to First Token: the 3D site.
// One fixed sun. The camera moves; the light never does, so every shadow lands in the same place from
// the first stage to the last. The site fills in physically in the order a data center is really built.
import * as THREE from "three";
import { STAGES } from "./model.js";

const C = {
  bg: 0xffffff, ground: 0xf3f3f1, earth: 0xdcd6c8, pad: 0xe9e8e3, grid: 0xd9d9d4, road: 0xb9b8b2,
  concrete: 0xd3d2cd, steel: 0x8f949c, wall: 0xf6f6f4, roof: 0xe4e4e1, dark: 0x3a3d44, cab: 0x5d6168,
  rack: 0x2b2e34, rackFace: 0x3e424a, cooler: 0xc9ccd2, pipe: 0x7f8892, accent: 0x2d5bff, glass: 0xdfe6f5,
  panel: 0x2f3a55, gravel: 0xe2e0d8, fence: 0xa9aba7, flag: 0xff5a1f, tower: 0x9a9ea5, line: 0x6b6f76,
};
const ease = (x) => x <= 0 ? 0 : x >= 1 ? 1 : (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// progress of a sub-step inside a stage progress p: from a to b
const sub = (p, a, b) => ease(clamp01((p - a) / (b - a)));

export class Site {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts;
    this.config = { power: "grid", bridge: "gas_turbine", cool: "liquid", mw: 100, redund: "n1" };
    this.time = 0; this.plan = null; this.cut = 0; this.cutTarget = 0; this.live = 0; this.held = null;
    this.needs = true; this.dirty = true; this.frames = 0; this.lastT = 0; this.fps = 0; this.triangles = 0;
    this.reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.weak = (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    this.phone = Math.min(innerWidth, innerHeight) < 640;
    this.ok = this._init();
  }

  _init() {
    let renderer;
    try {
      const probe = document.createElement("canvas"); if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return false;
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.weak, alpha: false, powerPreference: "high-performance" });
    } catch (e) { return false; }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.weak ? 1 : 2));
    renderer.setClearColor(C.bg, 1);
    renderer.shadowMap.enabled = !this.weak; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.localClippingEnabled = true;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bg);
    const cam = this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 500);
    this.orbit = { theta: -0.75, phi: 0.98, dist: 140, target: new THREE.Vector3(-1, 1.0, 1.5) };
    this._applyOrbit();

    // ---- the one fixed sun (position never changes after this line) ----
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
    sun.position.set(-26, 38, 18); sun.target.position.set(0, 0, 0); scene.add(sun.target);
    sun.castShadow = !this.weak;
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 10; sc.far = 110;
    sun.shadow.mapSize.set(this.phone ? 1024 : 2048, this.phone ? 1024 : 2048);
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d6cf, 0.85));
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    // ---- clipping plane for the section view (cuts the near half of the building) ----
    this.clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 60);

    this._build();
    this._bindInput();
    this._resize();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this._resize()).observe(this.canvas);
    addEventListener("resize", () => this._resize());
    this._loop();
    return true;
  }

  // ---------------------------------------------------------------------------------------------------
  // geometry helpers
  // ---------------------------------------------------------------------------------------------------
  _mat(color, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.0, ...extra });
    if (extra.clipped) { m.clippingPlanes = [this.clip]; m.clipShadows = true; }
    delete m.clipped; return m;
  }
  _box(w, h, d, color, extra = {}) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); // grows from the ground
    const m = new THREE.Mesh(g, this._mat(color, extra)); m.castShadow = true; m.receiveShadow = true; this.triangles += 12; return m;
  }
  _cyl(r, h, color, extra = {}, seg = 14) {
    const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, this._mat(color, extra)); m.castShadow = true; m.receiveShadow = true; this.triangles += seg * 4; return m;
  }
  _inst(geo, color, count, extra = {}) {
    const m = new THREE.InstancedMesh(geo, this._mat(color, extra), count); m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false;
    this.triangles += geo.index ? geo.index.count / 3 * count : geo.attributes.position.count / 3 * count; return m;
  }

  _build() {
    const S = this.scene; const g = this.groups = {};
    const add = (name, obj) => { g[name] = obj; S.add(obj); return obj; };

    // ground catches shadows; the page colour shows through. A faint drafting grid under the parcel.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.ShadowMaterial({ opacity: 0.3 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; S.add(ground);
    const grid = new THREE.GridHelper(120, 60, C.grid, C.grid); grid.material.opacity = 0.55; grid.material.transparent = true; grid.position.y = 0.002; S.add(grid);

    // ---- stage 1: land ----
    const land = add("land", new THREE.Group());
    const parcel = this.parcel = new THREE.Mesh(new THREE.PlaneGeometry(56, 38), this._mat(C.earth));
    parcel.rotation.x = -Math.PI / 2; parcel.position.y = 0.01; parcel.receiveShadow = true; land.add(parcel);
    const pad = this.padMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), this._mat(C.pad));
    pad.rotation.x = -Math.PI / 2; pad.position.set(-2, 0.02, 0); pad.receiveShadow = true; land.add(pad);
    // survey stakes at the four corners
    this.stakes = [];
    for (const [x, z] of [[-27, -18], [27, -18], [27, 18], [-27, 18]]) {
      const s = this._cyl(0.08, 1.2, C.fence, {}, 6); s.position.set(x, 0, z); land.add(s);
      const f = this._box(0.5, 0.3, 0.02, C.flag); f.position.set(x + 0.25, 0.9, z); land.add(f); this.stakes.push(s, f);
    }
    // fence posts and rails
    const postGeo = new THREE.BoxGeometry(0.14, 1.6, 0.14); postGeo.translate(0, 0.8, 0);
    const posts = this.posts = this._inst(postGeo, C.fence, 120); land.add(posts);
    const pts = []; const W = 28, D = 19;
    for (let x = -W; x <= W; x += 2) { pts.push([x, -D]); pts.push([x, D]); }
    for (let z = -D + 2; z <= D - 2; z += 2) { pts.push([-W, z]); pts.push([W, z]); }
    this.postPts = pts;
    const rails = this.rails = new THREE.Group(); land.add(rails);
    for (const [w, d, x, z] of [[2 * W, 0.06, 0, -D], [2 * W, 0.06, 0, D], [0.06, 2 * D, -W, 0], [0.06, 2 * D, W, 0]]) {
      for (const y of [0.55, 1.1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), this._mat(C.fence)); r.position.set(x, y, z); r.castShadow = true; rails.add(r); }
    }
    // access road from the front edge to the pad
    const road = this.road = this._box(5, 0.05, 20, C.road); road.position.set(-16, 0, 19); road.scale.z = 0.001; land.add(road);
    // a small sign board at the gate (permits)
    const sign = this.sign = new THREE.Group(); const sp = this._cyl(0.08, 2.2, C.steel, {}, 6); sign.add(sp);
    const sb = this._box(2.6, 1.3, 0.08, C.wall); sb.position.y = 1.6; sign.add(sb); sign.position.set(-12, 0, 19.2); sign.scale.setScalar(0.001); land.add(sign);

    // ---- stage 3: power ----
    const power = add("power", new THREE.Group());
    // transmission towers along the back edge, lines down to the substation
    this.towers = [];
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Group(); const x = -26 + i * 24;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 9, 6), this._mat(C.tower)); mast.position.y = 4.5; mast.castShadow = true; t.add(mast);
      const arm = this._box(4.2, 0.18, 0.18, C.tower); arm.position.y = 7.4; t.add(arm);
      const arm2 = this._box(3.2, 0.18, 0.18, C.tower); arm2.position.y = 8.4; t.add(arm2);
      t.position.set(x, 0, -24); t.scale.y = 0.001; power.add(t); this.towers.push(t);
    }
    const lineMat = new THREE.LineBasicMaterial({ color: C.line, transparent: true, opacity: 0.0 });
    const lg = new THREE.BufferGeometry(); const lp = [];
    for (const dy of [7.4, 8.4]) for (const dx of [-2, 2]) { for (let i = 0; i < 2; i++) { const x0 = -26 + i * 24 + dx, x1 = x0 + 24; for (let k = 0; k < 8; k++) { const a = k / 8, b = (k + 1) / 8; lp.push(x0 + (x1 - x0) * a, dy - Math.sin(a * Math.PI) * 0.8, -24, x0 + (x1 - x0) * b, dy - Math.sin(b * Math.PI) * 0.8, -24); } } }
    // drop to the substation
    lp.push(22 + 2, 8.4, -24, 24, 4.2, -16);
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    this.wires = new THREE.LineSegments(lg, lineMat); power.add(this.wires);
    // substation yard
    const yard = this.yard = new THREE.Group(); yard.position.set(22, 0, -13); power.add(yard);
    const gravel = new THREE.Mesh(new THREE.PlaneGeometry(10, 9), this._mat(C.gravel)); gravel.rotation.x = -Math.PI / 2; gravel.position.y = 0.03; gravel.receiveShadow = true; yard.add(gravel);
    this.transformers = [];
    for (let i = 0; i < 3; i++) {
      const tr = new THREE.Group();
      const tank = this._box(1.8, 2.2, 1.4, C.cab); tr.add(tank);
      for (const s of [-1, 1]) { const fin = this._box(0.5, 1.8, 1.3, C.steel); fin.position.set(s * 1.15, 0.15, 0); tr.add(fin); }
      for (let b = 0; b < 3; b++) { const bush = this._cyl(0.1, 0.9, C.wall, {}, 6); bush.position.set(-0.5 + b * 0.5, 2.2, 0); tr.add(bush); }
      tr.position.set(-3 + i * 3, 0, 1.5); tr.scale.setScalar(0.001); yard.add(tr); this.transformers.push(tr);
    }
    const bus = this.bus = new THREE.Group(); yard.add(bus);
    for (let i = 0; i < 4; i++) { const p = this._cyl(0.1, 4.2, C.steel, {}, 6); p.position.set(-3.6 + i * 2.4, 0, -2.5); bus.add(p); }
    const bar = this._box(8, 0.12, 0.12, C.steel); bar.position.set(0, 4.1, -2.5); bus.add(bar);
    bus.scale.y = 0.001;
    // onsite generation (which one shows depends on the choice)
    this.onsite = {};
    const mk = (name, fn) => { const grp = new THREE.Group(); grp.position.set(-30, 0, -8); grp.visible = false; fn(grp); power.add(grp); this.onsite[name] = grp; };
    mk("gas_turbine", (grp) => { for (let i = 0; i < 3; i++) { const u = new THREE.Group(); const body = this._box(9, 2.6, 2.6, C.cooler); u.add(body); const st = this._cyl(0.7, 6, C.steel, {}, 10); st.position.set(3.2, 2.6, 0); u.add(st); const filt = this._box(2.6, 3.4, 2.8, C.cab); filt.position.set(-4.4, 0, 0); u.add(filt); u.position.set(0, 0, -4 + i * 4); grp.add(u); } });
    mk("recip", (grp) => { for (let i = 0; i < 8; i++) { const u = this._box(6, 2.4, 2.2, C.cooler); u.position.set(((i % 2) ? 3.5 : -3.5), 0, -7 + Math.floor(i / 2) * 3.2); grp.add(u); const ex = this._cyl(0.18, 3.4, C.steel, {}, 6); ex.position.set(u.position.x + 2.4, 2.4, u.position.z); grp.add(ex); } });
    mk("fuel_cell", (grp) => { for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) { const u = this._box(1.6, 2.0, 1.1, C.cab); u.position.set(-5 + i * 2, 0, -6 + r * 3); grp.add(u); } });
    mk("solar_bess", (grp) => { const pg = new THREE.BoxGeometry(3.6, 0.06, 1.6); pg.rotateX(-0.45); pg.translate(0, 0.9, 0); const pv = this._inst(pg, C.panel, 60); grp.add(pv); const mtx = new THREE.Matrix4(); let k = 0; for (let r = 0; r < 5; r++) for (let i = 0; i < 12; i++) { mtx.makeTranslation(-20 + i * 3.8, 0, -8 + r * 3.2); pv.setMatrixAt(k++, mtx); } pv.count = 60; pv.instanceMatrix.needsUpdate = true; this.pvMesh = pv; for (let i = 0; i < 4; i++) { const b = this._box(6, 2.6, 2.4, C.wall); b.position.set(-16 + i * 7, 0, 10); grp.add(b); } });

    // ---- stage 4: shell ----
    const bld = add("building", new THREE.Group()); bld.position.set(-6, 0, 0);
    const BW = 26, BD = 15, BH = 5.2;
    this.B = { BW, BD, BH };
    const slab = this.slab = this._box(BW + 1, 0.3, BD + 1, C.concrete, { clipped: true }); slab.scale.setScalar(0.001); bld.add(slab);
    // column footings and columns
    const colGeo = new THREE.BoxGeometry(0.36, BH, 0.36); colGeo.translate(0, BH / 2, 0);
    const cols = this.cols = this._inst(colGeo, C.steel, 40, { clipped: true }); bld.add(cols);
    this.colPts = []; for (let x = -BW / 2; x <= BW / 2 + 0.01; x += BW / 6) for (let z = -BD / 2; z <= BD / 2 + 0.01; z += BD / 3) this.colPts.push([x, z]);
    const beams = this.beams = new THREE.Group(); bld.add(beams);
    for (let z = -BD / 2; z <= BD / 2 + 0.01; z += BD / 3) { const b = new THREE.Mesh(new THREE.BoxGeometry(BW, 0.3, 0.3), this._mat(C.steel, { clipped: true })); b.position.set(0, BH - 0.15, z); b.castShadow = true; beams.add(b); }
    for (let x = -BW / 2; x <= BW / 2 + 0.01; x += BW / 6) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, BD), this._mat(C.steel, { clipped: true })); b.position.set(x, BH - 0.15, 0); b.castShadow = true; beams.add(b); }
    beams.scale.setScalar(0.001);
    const roof = this.roof = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.6, 0.35, BD + 0.6), this._mat(C.roof, { clipped: true })); roof.position.y = BH + 0.18; roof.castShadow = true; roof.receiveShadow = true; roof.scale.setScalar(0.001); bld.add(roof);
    this.walls = [];
    const wallMat = this._mat(C.wall, { clipped: true });
    for (const [w, d, x, z] of [[BW, 0.25, 0, -BD / 2], [BW, 0.25, 0, BD / 2], [0.25, BD, -BW / 2, 0], [0.25, BD, BW / 2, 0]]) {
      const wg = new THREE.BoxGeometry(w, BH, d); wg.translate(0, BH / 2, 0); const wm = new THREE.Mesh(wg, wallMat); wm.position.set(x, 0, z); wm.castShadow = true; wm.receiveShadow = true; wm.scale.y = 0.001; bld.add(wm); this.walls.push(wm);
    }
    // ---- stage 5: electrical ----
    const elec = this.elec = new THREE.Group(); bld.add(elec);
    this.elecCabs = [];
    for (let i = 0; i < 6; i++) { const c = this._box(1.2, 2.3, 0.9, C.cab, { clipped: true }); c.position.set(-BW / 2 + 1.5 + i * 1.5, 0, -BD / 2 + 1.2); c.scale.y = 0.001; elec.add(c); this.elecCabs.push(c); }
    for (let i = 0; i < 4; i++) { const u = this._box(1.0, 2.0, 0.9, C.cab, { clipped: true }); u.position.set(-BW / 2 + 11.5 + i * 1.3, 0, -BD / 2 + 1.2); u.scale.y = 0.001; elec.add(u); this.elecCabs.push(u); }
    this.busway = []; for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(BW - 3, 0.18, 0.3), this._mat(C.accent, { clipped: true })); b.position.set(0.5, BH - 0.9, -3.5 + k * 7); b.castShadow = true; b.scale.x = 0.001; elec.add(b); this.busway.push(b); }
    // standby generators along the far side of the building
    this.gens = []; const gens = this.genGroup = new THREE.Group(); gens.position.set(0, 0, -BD / 2 - 3.2); bld.add(gens);
    const nGen = 6; for (let i = 0; i < nGen; i++) { const u = new THREE.Group(); const b = this._box(4.4, 2.6, 1.9, C.wall); u.add(b); const ex = this._cyl(0.22, 1.4, C.steel, {}, 6); ex.position.set(1.4, 2.6, 0.3); u.add(ex); u.position.set(-BW / 2 + 2.6 + i * 4.9, 0, 0); u.scale.setScalar(0.001); gens.add(u); this.gens.push(u); }
    // ---- stage 6: cooling ----
    this.coolYard = new THREE.Group(); this.coolYard.position.set(BW / 2 + 5, 0, 0); bld.add(this.coolYard);
    this.coolUnits = {};
    const mkCool = (name, fn) => { const grp = new THREE.Group(); grp.visible = false; fn(grp); this.coolYard.add(grp); this.coolUnits[name] = grp; };
    mkCool("liquid", (grp) => { for (let i = 0; i < 5; i++) { const u = new THREE.Group(); const b = this._box(3.0, 2.2, 2.2, C.cooler); u.add(b); const fan = this._cyl(0.95, 0.25, C.steel, {}, 16); fan.position.set(0, 2.2, 0); u.add(fan); u.position.set(0, 0, -6.4 + i * 3.2); grp.add(u); } });
    mkCool("liquid_tower", (grp) => { for (let i = 0; i < 3; i++) { const u = new THREE.Group(); const b = this._box(4.0, 3.6, 4.0, C.cooler); u.add(b); const fan = this._cyl(1.5, 0.3, C.steel, {}, 18); fan.position.set(0, 3.6, 0); u.add(fan); u.position.set(0, 0, -5 + i * 5); grp.add(u); } });
    mkCool("air", (grp) => { for (let i = 0; i < 4; i++) { const u = new THREE.Group(); const b = this._box(3.2, 2.4, 2.4, C.cooler); u.add(b); const fan = this._cyl(1.0, 0.25, C.steel, {}, 16); fan.position.set(0, 2.4, 0); u.add(fan); u.position.set(0, 0, -5.2 + i * 3.5); grp.add(u); } });
    // inside: CDUs at row ends and the liquid loop
    this.cdus = []; for (let i = 0; i < 4; i++) { const c = this._box(0.9, 2.0, 1.2, C.cooler, { clipped: true }); c.position.set(BW / 2 - 1.6, 0, -5 + i * 3.2); c.scale.y = 0.001; bld.add(c); this.cdus.push(c); }
    this.pipes = []; for (let k = 0; k < 2; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, BW - 4, 8), this._mat(C.pipe, { clipped: true })); p.rotation.z = Math.PI / 2; p.position.set(0, BH - 1.4, -BD / 2 + 1.0 + k * 0.5); p.castShadow = true; p.scale.y = 0.001; bld.add(p); this.pipes.push(p); }
    // ---- stage 7 and 8: white space and racks ----
    const nRows = 4, perRow = 16; this.rackN = nRows * perRow;
    const rowGeo = new THREE.BoxGeometry(BW - 8, 0.06, 1.3); rowGeo.translate(0, 0.03, 0);
    this.rows = []; for (let r = 0; r < nRows; r++) { const m = new THREE.Mesh(rowGeo, this._mat(C.concrete, { clipped: true })); m.position.set(1.0, 0.3, -5.6 + r * 3.2); m.receiveShadow = true; m.scale.x = 0.001; bld.add(m); this.rows.push(m); }
    const contGeo = new THREE.BoxGeometry(BW - 8, 2.4, 1.6); contGeo.translate(0, 1.2, 0);
    this.cont = []; for (let r = 0; r < nRows; r++) { const m = new THREE.Mesh(contGeo, new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: 0.0, roughness: 0.3, clippingPlanes: [this.clip], depthWrite: false })); m.position.set(1.0, 0.3, -5.6 + r * 3.2); m.castShadow = false; bld.add(m); this.cont.push(m); }
    const rackGeo = new THREE.BoxGeometry(0.9, 2.2, 1.1); rackGeo.translate(0, 1.1, 0);
    this.rackEmpty = this._inst(rackGeo, C.rack, this.rackN, { clipped: true, roughness: 0.7 }); bld.add(this.rackEmpty);
    this.rackLit = this._inst(rackGeo, C.rackFace, this.rackN, { clipped: true, roughness: 0.6 }); bld.add(this.rackLit);
    const stripGeo = new THREE.BoxGeometry(0.7, 0.06, 0.03); stripGeo.translate(0, 1.9, 0.57);
    this.rackLed = this._inst(stripGeo, 0xffffff, this.rackN, { clipped: true, roughness: 0.3, emissive: new THREE.Color(C.accent), emissiveIntensity: 0 }); this.rackLed.castShadow = false; bld.add(this.rackLed);
    this.rackPts = []; for (let r = 0; r < nRows; r++) for (let i = 0; i < perRow; i++) this.rackPts.push([1.0 - (BW - 8) / 2 + 0.6 + i * 1.12, 0.3, -5.6 + r * 3.2]);
    // ---- commissioning indicators: small lamps on the big systems ----
    this.lamps = {};
    const lampGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const mkLamp = (name, parent, x, y, z) => { const m = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(C.accent), emissiveIntensity: 0, roughness: 0.4 })); m.position.set(x, y, z); m.visible = false; parent.add(m); this.lamps[name] = m; this.triangles += 160; };
    mkLamp("substation", this.yard, 0, 4.6, -2.5); mkLamp("gens", gens, 0, 3.4, 0); mkLamp("ups", elec, -BW / 2 + 13, 2.6, -BD / 2 + 1.2);
    mkLamp("cooling", this.coolYard, 0, 3.2, 0); mkLamp("racks", bld, 1.0, 3.4, 0);
    // ---- live: heat haze over the coolers, and the first token ----
    const hazeMat = this.hazeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uA;
        float n(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){ float y = vUv.y; float w = sin(vUv.x*22.0 + uT*3.0 + sin(y*9.0+uT)*2.0)*0.5+0.5; float v = w * (1.0 - y) * y * 4.0;
          float g = n(floor(vUv*40.0 + uT*8.0)); gl_FragColor = vec4(0.93,0.93,0.92, uA * v * (0.3 + 0.3*g)); }`
    });
    const haze = this.haze = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), hazeMat); haze.position.set(0.6, 4.2, 0); this.coolYard.add(haze);
    const haze2 = haze.clone(); haze2.rotation.y = Math.PI / 2; this.coolYard.add(haze2); this.haze2 = haze2;
    const tok = this.token = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(C.accent), emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0 }));
    tok.position.set(0, BH + 2.5, 0); tok.castShadow = false; bld.add(tok);
    this.bld = bld;
    this.update();
  }

  // ---------------------------------------------------------------------------------------------------
  // state in → geometry out. p[stage] = eased progress 0..1 of each stage at the current time.
  // ---------------------------------------------------------------------------------------------------
  setPlan(plan, config) { this.plan = plan; this.config = { ...this.config, ...config }; this.dirty = true; }
  setTime(months) { this.time = months; this.dirty = true; }
  setHeld(stage) { this.held = stage; this.dirty = true; }
  setCut(on) { this.cutTarget = on ? 1 : 0; this.needs = true; }

  // progress of every task at the current time: 0 before it starts, 1 when it is done. A stress-test slip is
  // waited out first (the site stands still), then the work runs.
  progress() {
    const tp = {}; const pl = this.plan;
    if (!pl) return tp;
    for (const t of pl.tasks) {
      const slip = t.slip || 0, a = t.es + slip, b = t.ef;
      tp[t.id] = b <= a ? (this.time >= b ? 1 : 0) : clamp01((this.time - a) / (b - a));
    }
    return tp;
  }

  update() {
    const tp = this.progress(); const cfg = this.config; const mtx = new THREE.Matrix4();
    const T = (id) => tp[id] ?? 0;
    // land: stakes with the survey; pad, fence and road with the grading
    const G = T("grading");
    for (const s of this.stakes) s.visible = T("survey") > 0.02;
    this.parcel.material.color.setHex(C.earth); this.parcel.material.color.lerp(new THREE.Color(C.pad), sub(G, 0.2, 0.6) * 0.6);
    this.padMesh.visible = G > 0.2;
    let n = Math.round(sub(G, 0.45, 0.85) * this.postPts.length); this.posts.count = n;
    for (let i = 0; i < n; i++) { mtx.makeTranslation(this.postPts[i][0], 0, this.postPts[i][1]); this.posts.setMatrixAt(i, mtx); }
    this.posts.instanceMatrix.needsUpdate = true;
    this.rails.visible = G > 0.85;
    this.road.scale.z = Math.max(0.001, sub(G, 0.7, 1.0)); this.road.position.z = 19 - (1 - this.road.scale.z) * 10;
    // permits: the sign board goes up when the zoning case is approved
    this.sign.scale.setScalar(Math.max(0.001, sub(T("zoning"), 0.9, 1.0)));
    // power: towers, wires and bus with the substation build; transformers once they have arrived and the yard is ready
    const Sb = T("substation"), Lp = T("lpt");
    for (let i = 0; i < 3; i++) this.towers[i].scale.y = Math.max(0.001, sub(Sb, 0.0 + i * 0.08, 0.3 + i * 0.08));
    this.wires.material.opacity = sub(Sb, 0.35, 0.5) * 0.9;
    this.bus.scale.y = Math.max(0.001, sub(Sb, 0.3, 0.5));
    for (let i = 0; i < 3; i++) this.transformers[i].scale.setScalar(Math.max(0.001, Lp >= 1 ? sub(Sb, 0.5 + i * 0.1, 0.7 + i * 0.1) : 0));
    const Gi = T("geninst");
    for (const [k, grp] of Object.entries(this.onsite)) { const on = cfg.power !== "grid" && cfg.bridge === k; grp.visible = on && Gi > 0.02; if (on) grp.scale.setScalar(Math.max(0.001, sub(Gi, 0.0, 0.95))); }
    // shell
    const Fd = T("foundations"), Sh = T("shell");
    this.slab.scale.set(1, Math.max(0.001, sub(Fd, 0.1, 0.9)), 1);
    n = Math.round(sub(Sh, 0.0, 0.35) * this.colPts.length); this.cols.count = n;
    for (let i = 0; i < n; i++) { mtx.makeTranslation(this.colPts[i][0], 0, this.colPts[i][1]); this.cols.setMatrixAt(i, mtx); }
    this.cols.instanceMatrix.needsUpdate = true;
    this.beams.scale.setScalar(Math.max(0.001, sub(Sh, 0.3, 0.5)));
    this.roof.scale.setScalar(Math.max(0.001, sub(Sh, 0.5, 0.7)));
    for (let i = 0; i < 4; i++) this.walls[i].scale.y = Math.max(0.001, sub(Sh, 0.65 + i * 0.05, 0.85 + i * 0.04));
    // electrical
    const E = T("electrical");
    this.elecCabs.forEach((c, i) => c.scale.y = Math.max(0.001, sub(E, 0.1 + i * 0.04, 0.4 + i * 0.04)));
    this.busway.forEach((b, i) => b.scale.x = Math.max(0.001, sub(E, 0.55 + i * 0.1, 0.8 + i * 0.1)));
    this.gens.forEach((g, i) => g.scale.setScalar(Math.max(0.001, sub(E, 0.3 + i * 0.06, 0.55 + i * 0.06))));
    const nGenShow = cfg.redund === "n1" ? 4 : 6; this.gens.forEach((g, i) => g.visible = i < nGenShow);
    // cooling
    const Co = T("mechanical");
    for (const [k, grp] of Object.entries(this.coolUnits)) { const on = cfg.cool === k; grp.visible = on && Co > 0.05; if (on) grp.children.forEach((u, i) => { if (u.isMesh && u.geometry.type === "PlaneGeometry") return; u.scale.setScalar(Math.max(0.001, sub(Co, 0.05 + i * 0.08, 0.4 + i * 0.08))); }); }
    const liquid = cfg.cool !== "air";
    this.cdus.forEach((c, i) => { c.visible = liquid; c.scale.y = Math.max(0.001, sub(Co, 0.5 + i * 0.06, 0.75 + i * 0.06)); });
    this.pipes.forEach((pp, i) => { pp.visible = liquid; pp.scale.y = Math.max(0.001, sub(Co, 0.7 + i * 0.1, 0.95 + i * 0.05)); });
    // white space
    const Wsp = T("whitespace");
    this.rows.forEach((r, i) => r.scale.x = Math.max(0.001, sub(Wsp, 0.0 + i * 0.1, 0.35 + i * 0.1)));
    this.cont.forEach((c, i) => c.material.opacity = 0.28 * sub(Wsp, 0.4 + i * 0.1, 0.7 + i * 0.1));
    const nEmpty = Math.round(sub(Wsp, 0.5, 1.0) * this.rackN);
    // compute: lit racks replace empty ones row by row
    const ps = this.config.phaseShare || 1;
    const nLit = Math.round(ease(T("compute")) * this.rackN * ps + (ps < 1 ? ease(T("compute2")) * this.rackN * (1 - ps) : 0));
    let ce = 0, cl = 0;
    for (let i = 0; i < this.rackN; i++) {
      const [x, y, z] = this.rackPts[i];
      if (i < nLit) { mtx.makeTranslation(x, y, z); this.rackLit.setMatrixAt(cl, mtx); this.rackLed.setMatrixAt(cl, mtx); cl++; }
      else if (i < nEmpty) { mtx.makeTranslation(x, y, z); this.rackEmpty.setMatrixAt(ce++, mtx); }
    }
    this.rackEmpty.count = ce; this.rackLit.count = cl; this.rackLed.count = cl; this.rackEmpty.instanceMatrix.needsUpdate = true; this.rackLit.instanceMatrix.needsUpdate = true; this.rackLed.instanceMatrix.needsUpdate = true;
    // commissioning: L1 to L2 lights the incoming power, L3 to L4 the house systems, L5 pulses everything together
    const C12 = T("cx12"), C34 = T("cx34");
    const lampOn = { substation: sub(C12, 0.2, 0.6), gens: sub(C12, 0.6, 1.0), ups: sub(C34, 0.0, 0.35), cooling: sub(C34, 0.35, 0.7), racks: sub(C34, 0.7, 1.0) };
    for (const [k, on] of Object.entries(lampOn)) { const l = this.lamps[k]; l.visible = on > 0; l.material.emissiveIntensity = 1.6 * on; l.scale.setScalar(0.6 + 0.4 * on); }
    this.lamps.gens.visible = this.lamps.gens.visible && this.gens[0].visible;
    this.ist = T("cx5") > 0 && T("cx5") < 1 ? 1 : 0;
    // live
    this.live = T("bringup");
    this.rackLed.material.emissiveIntensity = 2.2 * Math.max(this.ist * 0.5, this.live);
    this.hazeMat.uniforms.uA.value = 0.5 * sub(this.live, 0.1, 0.6);
    const tk = sub(this.live, 0.55, 1.0);
    this.token.material.opacity = tk; this.token.material.emissiveIntensity = 1.2 * tk; this.token.position.y = this.B.BH + 1.2 + tk * 1.6; this.token.rotation.y = tk * 1.3;
    // anything still at its unbuilt scale is not drawn at all
    this.scene.traverse((o) => { if (o.userData.builtOnly !== undefined) return; if (o.scale && (o.scale.y <= 0.0015 || o.scale.x <= 0.0015) && (o.isMesh || o.isGroup)) { o.userData.hidden = true; o.visible = false; } else if (o.userData.hidden) { o.userData.hidden = false; o.visible = true; } });
    for (const [k, grp] of Object.entries(this.onsite)) if (!(cfg.power !== "grid" && cfg.bridge === k)) grp.visible = false;
    for (const [k, grp] of Object.entries(this.coolUnits)) if (cfg.cool !== k) grp.visible = false;
    this.cdus.forEach(c => { if (!liquid) c.visible = false; }); this.pipes.forEach(p => { if (!liquid) p.visible = false; });
    this.gens.forEach((g, i) => { if (i >= nGenShow) g.visible = false; });
    this.lamps.gens.visible = this.lamps.gens.visible && this.gens[0].visible;
    this.dirty = false; this.needs = true;
  }

  // ---------------------------------------------------------------------------------------------------
  // camera, input, loop
  // ---------------------------------------------------------------------------------------------------
  _applyOrbit() {
    const o = this.orbit; const c = this.camera;
    c.position.set(o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta), o.target.y + o.dist * Math.cos(o.phi), o.target.z + o.dist * Math.sin(o.phi) * Math.cos(o.theta));
    c.lookAt(o.target); this.needs = true;
  }
  _bindInput() {
    const el = this.canvas; let drag = null; const pts = new Map(); let pinch = 0;
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) drag = [e.clientX, e.clientY]; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    el.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this._zoom(pinch / d); pinch = d; return; }
      if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY];
      this.orbit.theta -= dx * 0.006; this.orbit.phi = Math.max(0.28, Math.min(1.38, this.orbit.phi - dy * 0.005)); this._applyOrbit(); this.userMoved = true;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (pts.size === 0) drag = null; else { const [a] = [...pts.values()]; drag = a; } };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => { e.preventDefault(); this._zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }
  _zoom(f) { this.orbit.dist = Math.max(30, Math.min(260, this.orbit.dist * f)); this._applyOrbit(); this.userMoved = true; }
  fitDist() { const a = (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1); return 128 / Math.min(1, a / 1.25); }
  setView(name) { const v = { overview: [-0.75, 0.98, this.fitDist()], inside: [-0.55, 1.0, this.fitDist() * 0.45], power: [-1.9, 0.9, this.fitDist() * 0.65] }[name]; if (!v) return; this.orbit.theta = v[0]; this.orbit.phi = v[1]; this.orbit.dist = v[2]; this._applyOrbit(); }
  _resize() {
    const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 400;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (!this.userMoved) { this.orbit.dist = this.fitDist(); this._applyOrbit(); } this.needs = true;
  }
  _loop() {
    const tick = (t) => {
      requestAnimationFrame(tick);
      const rawDt = (t - (this.lastT || t)) / 1000; const dt = Math.min(0.05, rawDt); this.lastT = t;
      // section cut eases in and out
      if (Math.abs(this.cut - this.cutTarget) > 0.001) { const step = this.reduced ? 1 : Math.max(0.08, Math.min(1, rawDt * 4)); this.cut += (this.cutTarget - this.cut) * step; if (Math.abs(this.cut - this.cutTarget) < 0.01) this.cut = this.cutTarget; this.clip.constant = 60 - this.cut * (60 - 0.3); this.needs = true; }
      if (this.drift && !this.userMoved && !this.reduced) { this.orbit.theta += dt * 0.025; this._applyOrbit(); }
      if (this.dirty) this.update();
      const animating = this.live > 0.1 || this.ist > 0;
      if (animating && !this.reduced) { this.hazeMat.uniforms.uT.value += dt; if (this.ist > 0 && this.live < 0.2) { const pulse = 0.5 + 0.5 * Math.sin(t / 240); for (const l of Object.values(this.lamps)) if (l.visible) l.material.emissiveIntensity = 0.8 + 1.4 * pulse * this.ist; this.rackLed.material.emissiveIntensity = 1.2 * pulse * this.ist; } this.needs = true; }
      if (this.needs) { this.renderer.render(this.scene, this.camera); this.needs = false; this.frames++; }
      if (this.opts.onFrame) this.opts.onFrame(t);
    };
    requestAnimationFrame(tick);
  }
  still(w = 1200, h = 700) { // a still render for the share card
    const r = this.renderer; const cam = this.camera.clone(); cam.aspect = w / h; cam.updateProjectionMatrix();
    const target = new THREE.WebGLRenderTarget(w, h); r.setRenderTarget(target); r.render(this.scene, cam); r.setRenderTarget(null);
    const buf = new Uint8Array(w * h * 4); r.readRenderTargetPixels(target, 0, 0, w, h, buf); target.dispose(); return { w, h, buf };
  }
}

// ---------------------------------------------------------------------------------------------------
// flat fallback: the same site, drawn with 2D canvas, for browsers without WebGL
// ---------------------------------------------------------------------------------------------------
export function drawFallback(canvas, plan, time, cfg) {
  const x = canvas.getContext("2d"); const W = canvas.width, H = canvas.height; x.clearRect(0, 0, W, H);
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  const p = {}; for (const s of STAGES) { const a = plan.stageStart[s.id], b = plan.stageEnd[s.id]; p[s.id] = b <= a ? (time >= b ? 1 : 0) : clamp01((time - a) / (b - a)); }
  const iso = (px, pz, py = 0) => [W / 2 + (px - pz) * 9, H * 0.62 + (px + pz) * 4.5 - py * 9];
  const poly = (pts, fill) => { x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(...q) : x.moveTo(...q)); x.closePath(); x.fillStyle = fill; x.fill(); };
  const box = (cx, cz, w, d, h, top, side) => { const a = iso(cx - w / 2, cz - d / 2, h), b = iso(cx + w / 2, cz - d / 2, h), c = iso(cx + w / 2, cz + d / 2, h), dd = iso(cx - w / 2, cz + d / 2, h); poly([a, b, c, dd], top); const c0 = iso(cx + w / 2, cz + d / 2, 0), d0 = iso(cx - w / 2, cz + d / 2, 0), b0 = iso(cx + w / 2, cz - d / 2, 0); poly([dd, c, c0, d0], side); poly([c, b, b0, c0], side); };
  poly([iso(-28, -19), iso(28, -19), iso(28, 19), iso(-28, 19)], p.land > 0.5 ? "#e9e8e3" : "#dcd6c8");
  if (p.power > 0.5) { box(22, -13, 10, 9, 0.1, "#e2e0d8", "#d8d6ce"); for (let i = 0; i < 3; i++) if (p.power > 0.5 + i * 0.1) box(19 + i * 3, -11.5, 1.8, 1.4, 2.2, "#7a7e86", "#5d6168"); }
  if (cfg.power !== "grid" && p.power > 0.3) for (let i = 0; i < 3; i++) box(-30, -12 + i * 4, 9, 2.6, 2.6, "#d9dce2", "#c9ccd2");
  const h = 5.2 * clamp01(p.shell * 1.4);
  if (p.shell > 0.05) box(-6, 0, 26, 15, h, "#e4e4e1", "#f0f0ee");
  if (p.cooling > 0.1) for (let i = 0; i < 5; i++) box(12, -6.4 + i * 3.2, 3, 2.2, 2.2, "#d9dce2", "#c9ccd2");
  if (p.electrical > 0.3) for (let i = 0; i < 4; i++) box(-16 + i * 4.9, -10.7, 4.4, 1.9, 2.6, "#f6f6f4", "#e4e4e1");
  const nLit = Math.round(p.compute * 64);
  if (p.whitespace > 0.5 && h > 5) for (let r = 0; r < 4; r++) for (let i = 0; i < 16; i++) { const k = r * 16 + i; x.fillStyle = k < nLit ? (p.live > 0.5 ? "#2d5bff" : "#3e424a") : "#b7b9bd"; const [px, py] = iso(-14 + i * 1.12, -5.6 + r * 3.2, 5.4); x.fillRect(px - 2, py - 2, 4, 4); }
  x.fillStyle = "#7a7d85"; x.font = "12px system-ui, sans-serif"; x.fillText("Flat view", 16, 24);
}
