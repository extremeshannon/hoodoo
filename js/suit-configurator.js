import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PiecePlacer, defaultPlacement, loadGarmentSpec, piecesForPart } from "./dyesub-place.js";

const JACKET_PART_IDS = ["collar", "front", "back", "sleeves", "zipper", "waistband", "stitch"];
const JUMPSUIT_PART_IDS = ["collar", "frontTorso", "backTorso", "sleeves", "frontLegs", "backLegs", "zipper", "stitch"];
const UPC_PART_IDS = ["body", "trim", "embroidery"];
const CACHE_V = "20260918m";

/* Hoodoo Colors — teal torso, gray raglan sleeves, black collar/waist (Taslan stock hex). */
const HOODOO_TURQUOISE = { hex: "#00aea7", name: "Turquoise" };
const HOODOO_SILVER = { hex: "#9fa4a5", name: "Silver" };
const HOODOO_RAVEN = { hex: "#000000", name: "Raven" };
const HOODOO_BLACK = { hex: "#000000", name: "Black" };
const JACKET_DEFAULT_COLORS = {
  collar: HOODOO_BLACK,
  front: HOODOO_TURQUOISE,
  back: HOODOO_TURQUOISE,
  sleeves: HOODOO_SILVER,
  zipper: HOODOO_SILVER,
  waistband: HOODOO_BLACK,
  stitch: HOODOO_RAVEN,
};
const PANTS_DEFAULT_COLORS = {
  legs: HOODOO_TURQUOISE,
  booties: HOODOO_BLACK,
  cordura: HOODOO_SILVER,
  trim: HOODOO_TURQUOISE,
};

const STITCH_MESH_KEYS = [
  "Double Needle",
  "DoubleNeedle",
  "Topstitch",
  "top stitch",
  "topstitch",
  "stitch",
  "thread",
  "bartack",
  "overlock",
  "Coverstitch",
  "BindedTrim",
];

const PARTS = [
  { id: "collar", label: "Collar" },
  { id: "yoke", label: "Yoke" },
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "frontTorso", label: "Front Torso" },
  { id: "backTorso", label: "Back Torso" },
  { id: "sleeves", label: "Sleeves" },
  { id: "sleeveStripe1", label: "Sleeve stripe 1" },
  { id: "sleeveStripe2", label: "Sleeve stripe 2" },
  { id: "sleeveStripe3", label: "Sleeve stripe 3" },
  { id: "hemStripe1", label: "Hem stripe 1" },
  { id: "hemStripe2", label: "Hem stripe 2" },
  { id: "hemStripe3", label: "Hem stripe 3" },
  { id: "zipper", label: "Zipper" },
  { id: "waistband", label: "Waist Band" },
  { id: "stitch", label: "Stitch" },
  { id: "legs", label: "Legs" },
  { id: "frontLegs", label: "Front Legs" },
  { id: "backLegs", label: "Back Legs" },
  { id: "booties", label: "Booties" },
  { id: "cordura", label: "Cordura" },
  { id: "trim", label: "Trim" },
  { id: "body", label: "Body" },
  { id: "embroidery", label: "Embroidery" },
  { id: "hand", label: "Back of hand" },
  { id: "palm", label: "Palm" },
  { id: "cuff", label: "Cuff" },
];

const JUMPSUIT_DEFAULT_COLORS = {
  collar: HOODOO_BLACK,
  frontTorso: HOODOO_TURQUOISE,
  backTorso: HOODOO_TURQUOISE,
  sleeves: HOODOO_SILVER,
  frontLegs: HOODOO_TURQUOISE,
  backLegs: HOODOO_TURQUOISE,
  zipper: HOODOO_SILVER,
  stitch: HOODOO_RAVEN,
};

const JUMPSUIT_MESH_MAP = {
  collar: ["Spandex_8607", "Spandex_8301", "Spandex_8601", "collar", "neck"],
  frontTorso: ["Body_8601"],
  backTorso: ["Body_8595"],
  sleeves: ["Sleeves_8604", "Sleeves_8304", "Sleeves_8595", "Sleeves_1303603", "Sleeves", "Sleeve"],
  frontLegs: ["Pants Front"],
  backLegs: ["Pants Back"],
  zipper: ["TapeFabric", "Zipper 1_Tape"],
  stitch: STITCH_MESH_KEYS.slice(),
};

const MATERIALS_URL = "/data/materials.json?v=" + CACHE_V;
const EMBROIDERY_THREAD = [
  { id: "raven", name: "Raven", hex: "#000000" },
  { id: "white", name: "White", hex: "#FFFFFF" },
  { id: "red", name: "Red", hex: "#ba1637" },
  { id: "navy", name: "Navy", hex: "#2b3347" },
  { id: "royal", name: "Royal", hex: "#364490" },
  { id: "canary", name: "Canary", hex: "#ecd733" },
];

const FALLBACK_MATERIALS = {
  taslan: {
    id: "taslan",
    label: "Taslan",
    anyColor: false,
    colors: [
      { id: "red", name: "Red", hex: "#ba1637" },
      { id: "charcoal", name: "Charcoal", hex: "#424242" },
      { id: "navy", name: "Navy", hex: "#2b3347" },
      { id: "white", name: "White", hex: "#FFFFFF" },
      { id: "royal", name: "Royal", hex: "#364490" },
      { id: "od-khaki", name: "OD-Khaki", hex: "#525344" },
      { id: "crimson", name: "Crimson", hex: "#852839" },
      { id: "khaki", name: "Khaki", hex: "#92795b" },
      { id: "chocolate", name: "Chocolate", hex: "#3d322c" },
      { id: "silver", name: "Silver", hex: "#9fa4a5" },
      { id: "raven", name: "Raven", hex: "#000000" },
      { id: "canary", name: "Canary", hex: "#ecd733" },
      { id: "blooming-pink", name: "Blooming Pink", hex: "#ff7bc6" },
      { id: "tangerine", name: "Tangerine", hex: "#d24628" },
      { id: "apple-green", name: "Apple Green", hex: "#00913c" },
      { id: "cobalt", name: "Cobalt", hex: "#2a4285" },
      { id: "turquoise", name: "Turquoise", hex: "#00aea7" },
      { id: "purple", name: "Purple", hex: "#534196" },
    ],
  },
  spandex: {
    id: "spandex",
    label: "Spandex",
    anyColor: false,
    locked: true,
    note: "Black only until a Spandex color chart is provided.",
    colors: [{ id: "black", name: "Black", hex: "#000000", alias: "Raven" }],
  },
  stitch: {
    id: "stitch",
    label: "Stitch",
    anyColor: false,
    colors: [
      { id: "raven", name: "Raven", hex: "#000000" },
      { id: "white", name: "White", hex: "#FFFFFF" },
      { id: "red", name: "Red", hex: "#ba1637" },
      { id: "navy", name: "Navy", hex: "#2b3347" },
    ],
  },
  parts: {
    front: "taslan",
    back: "taslan",
    sleeves: "taslan",
    zipper: "taslan",
    collar: "spandex",
    waistband: "spandex",
    stitch: "stitch",
    frontTorso: "taslan",
    backTorso: "taslan",
    frontLegs: "taslan",
    backLegs: "taslan",
    legs: "taslan",
    booties: "taslan",
    cordura: "taslan",
    trim: "taslan",
    yoke: "taslan",
    sleeveStripe1: "taslan",
    sleeveStripe2: "taslan",
    sleeveStripe3: "taslan",
    hemStripe1: "taslan",
    hemStripe2: "taslan",
    hemStripe3: "taslan",
    body: "body",
    embroidery: "embroidery",
    hand: "taslan",
    palm: "taslan",
    cuff: "spandex",
  },
  body: {
    id: "body",
    label: "Body",
    anyColor: false,
    locked: true,
    note: "Includes the cuff (the folded wrist pieces). Black only for now.",
    colors: [{ id: "black", name: "Black", hex: "#000000" }],
  },
  embroidery: {
    id: "embroidery",
    label: "Embroidery",
    anyColor: false,
    note: "Thread color for the embroidered text.",
    colors: EMBROIDERY_THREAD.slice(),
  },
};

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

const DEFAULT_GROUPS = [
  { id: "hoodoo-suits", name: "Hoodoo Suits" },
  { id: "apparel", name: "Apparel" },
  { id: "ultimate-dog", name: "Ultimate Dog" },
];
const DEFAULT_PRODUCTS = [
  {
    id: "freefly-jacket",
    name: "Freefly Jacket",
    blurb: "Head-down / sit-fly top.",
    groupId: "hoodoo-suits",
    parts: JACKET_PART_IDS.slice(),
    defaultColors: Object.assign({}, JACKET_DEFAULT_COLORS),
  },
  {
    id: "jumpsuit",
    name: "Jumpsuit",
    blurb: "Full custom suit.",
    groupId: "hoodoo-suits",
    parts: JUMPSUIT_PART_IDS.slice(),
    defaultColors: Object.assign({}, JUMPSUIT_DEFAULT_COLORS),
    meshMap: Object.assign({}, JUMPSUIT_MESH_MAP),
    glbByFit: {
      male: "/3d/clo/male-jumpsuit/MaleJumpSuit.glb?v=" + CACHE_V,
      female: [
        "/3d/clo/female-jumpsuit/FemaleJumpSuit.glb?v=" + CACHE_V,
        "/3d/clo/female-jumpsuit/FamaleJumpSuit.glb?v=" + CACHE_V,
      ],
      youth: "/3d/clo/jumpsuit-youth.glb?v=" + CACHE_V,
    },
  },
  {
    id: "pants",
    name: "Pants",
    blurb: "Jumpsuit pants.",
    groupId: "hoodoo-suits",
    parts: ["legs", "booties", "cordura", "trim"],
    defaultColors: Object.assign({}, PANTS_DEFAULT_COLORS),
  },
  {
    id: "camera-jacket",
    name: "Camera Jacket",
    blurb: "Camera-flyer top.",
    groupId: "hoodoo-suits",
    parts: JACKET_PART_IDS.slice(),
    defaultColors: Object.assign({}, JACKET_DEFAULT_COLORS),
  },
  {
    id: "ultimate-paw-covers",
    name: "Ultimate Paw Covers",
    blurb: "Snowmachine gauntlets.",
    groupId: "ultimate-dog",
    oneFit: true,
    fits: [{ id: "unisex", name: "Unisex" }],
    parts: UPC_PART_IDS.slice(),
    glb: "/3d/clo/upc/UPC.glb?v=" + CACHE_V,
    glbByFit: { unisex: "/3d/clo/upc/UPC.glb?v=" + CACHE_V },
    meshMap: {
      body: ["Talsan", "Taslan", "Body", "FABRIC", "Cloth", "cuff", "gauntlet", "wrist"],
      trim: ["piping", "binding", "tape"],
      embroidery: ["embroider", "embroidery", "logo", "graphic", "letter", "monogram"],
    },
  },
  {
    id: "male-jersey-blunt-collar",
    name: "Male Jersey (Blunt Collar)",
    blurb: "Cut & sew jersey. Blunt collar.",
    groupId: "apparel",
    active: true,
    oneFit: true,
    solidRecolor: true,
    fits: [{ id: "male", name: "Male" }],
    parts: [
      { id: "collar", label: "Collar", palette: "taslan" },
      { id: "front", label: "Front", palette: "taslan" },
      { id: "back", label: "Back", palette: "taslan" },
      { id: "sleeves", label: "Sleeves", palette: "taslan" },
      { id: "waistband", label: "Hem", palette: "taslan" },
      { id: "stitch", label: "Stitch", palette: "stitch" },
    ],
    defaultColors: {
      collar: { hex: "#424242", name: "Charcoal" },
      front: { hex: "#FFFFFF", name: "White" },
      back: { hex: "#9fa4a5", name: "Silver" },
      sleeves: { hex: "#9fa4a5", name: "Silver" },
      waistband: { hex: "#9fa4a5", name: "Silver" },
      stitch: { hex: "#000000", name: "Raven" },
    },
    meshMap: {
      collar: ["Collar"],
      front: ["Front"],
      back: ["Back"],
      sleeves: ["Sleeves"],
      waistband: ["Hem", "Waistband", "waistband"],
      stitch: STITCH_MESH_KEYS.slice(),
    },
    partPalette: {
      collar: "taslan",
      front: "taslan",
      back: "taslan",
      sleeves: "taslan",
      waistband: "taslan",
      stitch: "stitch",
    },
    glb: "/3d/clo/male-jersey-blunt-collar/MaleJersey-BluntCollar.glb?v=" + CACHE_V,
    glbByFit: { male: "/3d/clo/male-jersey-blunt-collar/MaleJersey-BluntCollar.glb?v=" + CACHE_V },
  },
  {
    id: "hockey",
    name: "Hockey",
    blurb: "Hockey jersey.",
    groupId: "apparel",
    active: true,
    oneFit: true,
    solidRecolor: true,
    fits: [{ id: "unisex", name: "Unisex" }],
    parts: [
      { id: "collar", label: "Collar", palette: "taslan" },
      { id: "yoke", label: "Yoke", palette: "taslan" },
      { id: "front", label: "Front", palette: "taslan" },
      { id: "back", label: "Back", palette: "taslan" },
      { id: "sleeves", label: "Sleeves", palette: "taslan" },
      { id: "sleeveStripe1", label: "Sleeve stripe 1", palette: "taslan" },
      { id: "sleeveStripe2", label: "Sleeve stripe 2", palette: "taslan" },
      { id: "sleeveStripe3", label: "Sleeve stripe 3", palette: "taslan" },
      { id: "hemStripe1", label: "Hem stripe 1", palette: "taslan" },
      { id: "hemStripe2", label: "Hem stripe 2", palette: "taslan" },
      { id: "hemStripe3", label: "Hem stripe 3", palette: "taslan" },
      { id: "stitch", label: "Stitch", palette: "stitch" },
    ],
    defaultColors: {
      collar: { hex: "#424242", name: "Charcoal" },
      yoke: { hex: "#9fa4a5", name: "Silver" },
      front: { hex: "#FFFFFF", name: "White" },
      back: { hex: "#9fa4a5", name: "Silver" },
      sleeves: { hex: "#9fa4a5", name: "Silver" },
      sleeveStripe1: { hex: "#424242", name: "Charcoal" },
      sleeveStripe2: { hex: "#9fa4a5", name: "Silver" },
      sleeveStripe3: { hex: "#FFFFFF", name: "White" },
      hemStripe1: { hex: "#424242", name: "Charcoal" },
      hemStripe2: { hex: "#9fa4a5", name: "Silver" },
      hemStripe3: { hex: "#FFFFFF", name: "White" },
      stitch: { hex: "#000000", name: "Raven" },
    },
    meshMap: {
      collar: ["HockeyBasic_477649"],
      yoke: ["HockeyBasic_477593", "HockeyBasic_477621"],
      front: ["HockeyBasic_477565"],
      back: ["HockeyBasic_477985"],
      sleeves: ["HockeyBasic_477789", "HockeyBasic_477677"],
      sleeveStripe1: ["HockeyBasic_477817", "HockeyBasic_477733"],
      sleeveStripe2: ["HockeyBasic_477845", "HockeyBasic_477705"],
      sleeveStripe3: ["HockeyBasic_477873", "HockeyBasic_477761"],
      hemStripe1: ["HockeyBasic_477901", "HockeyBasic_478013"],
      hemStripe2: ["HockeyBasic_477929", "HockeyBasic_478041"],
      hemStripe3: ["HockeyBasic_477957", "HockeyBasic_478069"],
      stitch: STITCH_MESH_KEYS.slice(),
    },
    partPalette: {
      collar: "taslan",
      yoke: "taslan",
      front: "taslan",
      back: "taslan",
      sleeves: "taslan",
      sleeveStripe1: "taslan",
      sleeveStripe2: "taslan",
      sleeveStripe3: "taslan",
      hemStripe1: "taslan",
      hemStripe2: "taslan",
      hemStripe3: "taslan",
      stitch: "stitch",
    },
    glb: "/3d/clo/hockey/Hockey.glb?v=" + CACHE_V,
    glbByFit: { unisex: "/3d/clo/hockey/Hockey.glb?v=" + CACHE_V },
  },
];
const DEFAULT_FITS = [
  { id: "male", name: "Male" },
  { id: "female", name: "Female" },
  { id: "youth", name: "Youth", comingSoon: true },
];

const HARDWARE_RE = /zipper obj|slider_|puller_|stopper_|_teeth|teeth_/;

const state = {
  step: 1,
  product: "freefly-jacket",
  fit: "male",
  part: "front",
  colors: {
    collar: "#000000",
    front: "#00aea7",
    back: "#00aea7",
    sleeves: "#9fa4a5",
    zipper: "#9fa4a5",
    waistband: "#000000",
    stitch: "#000000",
    frontTorso: "#00aea7",
    backTorso: "#00aea7",
    frontLegs: "#00aea7",
    backLegs: "#00aea7",
    legs: "#00aea7",
    booties: "#000000",
    cordura: "#9fa4a5",
    trim: "#00aea7",
    body: "#000000",
    embroidery: "#FFFFFF",
    hand: "#2b3347",
    palm: "#424242",
    cuff: "#000000",
    yoke: "#9fa4a5",
    sleeveStripe1: "#424242",
    sleeveStripe2: "#9fa4a5",
    sleeveStripe3: "#FFFFFF",
    hemStripe1: "#424242",
    hemStripe2: "#9fa4a5",
    hemStripe3: "#FFFFFF",
  },
  embroideryText: "",
  colorNames: {
    collar: "Black",
    front: "Turquoise",
    back: "Turquoise",
    sleeves: "Silver",
    zipper: "Silver",
    waistband: "Black",
    stitch: "Raven",
    yoke: "Silver",
    sleeveStripe1: "Charcoal",
    sleeveStripe2: "Silver",
    sleeveStripe3: "White",
    hemStripe1: "Charcoal",
    hemStripe2: "Silver",
    hemStripe3: "White",
    frontTorso: "Turquoise",
    backTorso: "Turquoise",
    frontLegs: "Turquoise",
    backLegs: "Turquoise",
    legs: "Turquoise",
    booties: "Black",
    cordura: "Silver",
    trim: "Turquoise",
    body: "Black",
    embroidery: "White",
    hand: "Navy",
    palm: "Charcoal",
    cuff: "Black",
  },
  art: {},
  gender: "male",
  suitType: "standard",
  handles: "none",
  extras: { booties: true, cordura: false, embroidery: false },
  rail: "",
  materials: {},
  meshMap: {
    collar: ["Spandex_8601", "collar", "neck"],
    front: ["Body_8589", "Front"],
    back: ["Body_8592", "Back"],
    sleeves: ["Sleeves_8595", "Sleeves_1303603", "Sleeves", "Sleeve"],
    zipper: ["TapeFabric", "Zipper 1_Tape"],
    waistband: ["Spandex_8598", "waistband", "hem"],
    stitch: [
      "Double Needle",
      "DoubleNeedle",
      "Topstitch",
      "top stitch",
      "topstitch",
      "stitch",
      "thread",
      "bartack",
      "overlock",
    ],
    frontTorso: ["Body_8601"],
    backTorso: ["Body_8595"],
    frontLegs: ["Pants Front"],
    backLegs: ["Pants Back"],
    legs: ["leg", "thigh", "pant", "Leg", "Thigh", "Legs"],
    booties: ["bootie", "boot", "foot"],
    cordura: ["cordura", "knee", "seat"],
    trim: ["TapeFabric", "Tape", "piping", "binding"],
    body: ["Talsan", "Taslan", "Body", "hand", "dorsal", "knuckle", "backhand", "palm", "inner", "grip", "cuff", "gauntlet", "wrist"],
    embroidery: ["embroider", "embroidery", "logo", "graphic", "letter", "monogram"],
    hand: ["Talsan", "Taslan", "Body", "hand", "dorsal", "knuckle", "backhand"],
    palm: ["palm", "inner", "grip"],
    cuff: ["cuff", "gauntlet", "wrist", "Spandex"],
  },
};

let ctx = null;
let manifest = { products: DEFAULT_PRODUCTS, fits: DEFAULT_FITS, meshMap: {} };
let materials = FALLBACK_MATERIALS;
const texLoader = new THREE.TextureLoader();
window.__hoodooConfigurator = true;

function products() {
  return manifest.products && manifest.products.length ? manifest.products : DEFAULT_PRODUCTS;
}
function groups() {
  return manifest.groups && manifest.groups.length ? manifest.groups : DEFAULT_GROUPS;
}
function fits() {
  return manifest.fits && manifest.fits.length ? manifest.fits : DEFAULT_FITS;
}
function currentProduct() {
  return products().find(function (p) { return p.id === state.product; }) || products()[0];
}
function productFits(p) {
  p = p || currentProduct();
  if (p && p.fits && p.fits.length) return p.fits;
  return fits();
}
function currentFit() {
  var list = productFits();
  return list.find(function (f) { return f.id === state.fit; }) || list[0];
}
function glbUrlList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    var out = [];
    value.forEach(function (v) {
      glbUrlList(v).forEach(function (u) { out.push(u); });
    });
    return out;
  }
  return [String(value)];
}
function glbCandidatesForProduct(p, fit) {
  if (!p) return [];
  var list = [];
  if (p.glbByFit) {
    if (p.glbByFit[fit] != null && p.glbByFit[fit] !== "") {
      list = glbUrlList(p.glbByFit[fit]);
    } else {
      var keys = Object.keys(p.glbByFit);
      for (var i = 0; i < keys.length; i++) {
        if (p.glbByFit[keys[i]]) {
          list = glbUrlList(p.glbByFit[keys[i]]);
          break;
        }
      }
    }
  }
  if (!list.length && p.glb) list = glbUrlList(p.glb);
  return list;
}
function currentGlbCandidates() {
  return glbCandidatesForProduct(currentProduct(), state.fit);
}
function currentGlb() {
  var list = currentGlbCandidates();
  return list.length ? list[0] : "";
}
function syncProductFit() {
  var p = currentProduct();
  if (p && p.oneFit) {
    var pf = productFits(p)[0];
    if (pf) state.fit = pf.id;
    return;
  }
  var global = fits();
  if (!global.some(function (f) { return f.id === state.fit; })) {
    state.fit = (global[0] && global[0].id) || "male";
    setFit(state.fit);
  }
}
function waitingNote(style, url) {
  if (style && style.awaitingFile) return "waiting for " + style.awaitingFile;
  if (state.fit === "youth") return "Youth slot ready — drop GLB in 3d/clo/ when you have it.";
  if (isDuckOrMissing(url)) return "Stand-in — drop your CLO3D GLB in 3d/clo/";
  return "awaiting CLO3D export";
}
function partIdList(p) {
  return ((p && p.parts) || []).map(function (x) {
    return typeof x === "string" ? x : (x && x.id);
  }).filter(Boolean);
}
function currentParts() {
  var p = currentProduct();
  var ids = partIdList(p);
  if (!ids.length) ids = PARTS.map(function (x) { return x.id; });
  var hasObj = ((p && p.parts) || []).some(function (x) { return x && typeof x === "object"; });
  if (p && p.id === "jumpsuit" && !hasObj) ids = JUMPSUIT_PART_IDS.slice();
  var byId = {};
  PARTS.forEach(function (x) { byId[x.id] = x; });
  var defs = {};
  ((p && p.parts) || []).forEach(function (x) {
    if (x && typeof x === "object" && x.id) defs[x.id] = x;
  });
  return ids.map(function (id) {
    var d = defs[id] || {};
    var fb = byId[id] || { id: id, label: id };
    return { id: id, label: d.label || fb.label, palette: d.palette };
  });
}
function isApparelProduct() {
  var p = currentProduct();
  if (!p) return false;
  if (p.groupId === "apparel") return true;
  return p.id === "hockey" || p.id === "male-jersey-blunt-collar";
}
function isBluntCollarJersey() {
  var p = currentProduct();
  return !!(p && p.id === "male-jersey-blunt-collar");
}
function isHockeyProduct() {
  var p = currentProduct();
  return !!(p && p.id === "hockey");
}
function isJacketProduct() {
  var p = currentProduct();
  if (!p || p.id === "jumpsuit") return false;
  if (isApparelProduct()) return false;
  if (partIdList(p).indexOf("front") !== -1) return true;
  return String(p.id || "").indexOf("jacket") !== -1;
}
function isJumpsuitProduct() {
  var p = currentProduct();
  if (!p) return false;
  if (p.id === "jumpsuit") return true;
  var ids = partIdList(p);
  return ids.indexOf("frontTorso") !== -1 && ids.indexOf("frontLegs") !== -1;
}
function applyJumpsuitColorway(force) {
  if (!isJumpsuitProduct()) {
    state._jumpsuitColorway = false;
    return;
  }
  if (!force && state._jumpsuitColorway) return;
  Object.keys(JUMPSUIT_DEFAULT_COLORS).forEach(function (id) {
    var c = JUMPSUIT_DEFAULT_COLORS[id];
    state.colors[id] = c.hex;
    state.colorNames[id] = c.name;
  });
  state._jumpsuitColorway = true;
}
function fallbackHoodooSuitColors(p) {
  if (!p || p.groupId !== "hoodoo-suits") return null;
  if (p.id === "pants") return PANTS_DEFAULT_COLORS;
  if (String(p.id || "").indexOf("jacket") !== -1) return JACKET_DEFAULT_COLORS;
  return null;
}
function applyProductColorway(force) {
  var p = currentProduct();
  if (isJumpsuitProduct()) {
    applyJumpsuitColorway(force);
    return;
  }
  state._jumpsuitColorway = false;
  var colors = (p && p.defaultColors) || fallbackHoodooSuitColors(p);
  if (!colors) {
    state._colorwayProduct = p ? p.id : "";
    return;
  }
  if (!force && state._colorwayProduct === p.id) return;
  Object.keys(colors).forEach(function (id) {
    var c = colors[id];
    if (!c) return;
    if (typeof c === "string") {
      state.colors[id] = c;
      state.colorNames[id] = nameForPartColor(id, c);
    } else {
      state.colors[id] = c.hex;
      state.colorNames[id] = c.name || nameForPartColor(id, c.hex);
    }
  });
  state._colorwayProduct = p.id;
}
function isUpcProduct() {
  var p = currentProduct();
  return !!(p && p.id === "ultimate-paw-covers");
}
function activeMeshMap() {
  var p = currentProduct();
  var base = state.meshMap || {};
  if (isJumpsuitProduct()) {
    return Object.assign({}, base, JUMPSUIT_MESH_MAP, (p && p.meshMap) || {});
  }
  if (isApparelProduct() && p && p.meshMap) {
    return Object.assign({}, p.meshMap);
  }
  return (p && p.meshMap) ? Object.assign({}, base, p.meshMap) : Object.assign({}, base);
}
function partLabel(id) {
  var cur = currentParts().find(function (x) { return x.id === id; });
  if (cur && cur.label) return cur.label;
  var p = PARTS.find(function (x) { return x.id === id; });
  return p ? p.label : id;
}
function materialKeyForPart(partId) {
  var part = currentParts().find(function (x) { return x.id === partId; });
  if (part && part.palette) return part.palette;
  var prod = currentProduct();
  if (prod && prod.partPalette && prod.partPalette[partId]) return prod.partPalette[partId];
  var map = (materials && materials.parts) || FALLBACK_MATERIALS.parts;
  return (map && map[partId]) || "taslan";
}
function paletteForPart(partId) {
  var key = materialKeyForPart(partId);
  return (materials && materials[key]) || FALLBACK_MATERIALS[key] || FALLBACK_MATERIALS.taslan;
}
function materialLabel(partId) {
  var pal = paletteForPart(partId);
  return (pal && pal.label) || keyToLabel(materialKeyForPart(partId));
}
function keyToLabel(key) {
  if (key === "taslan") return "Taslan";
  if (key === "spandex") return "Spandex";
  if (key === "stitch") return "Stitch";
  if (key === "body") return "Body";
  if (key === "embroidery") return "Embroidery";
  return key;
}
function findStockColor(partId, hex) {
  var colors = (paletteForPart(partId) && paletteForPart(partId).colors) || [];
  for (var i = 0; i < colors.length; i++) {
    if (sameHex(colors[i].hex, hex)) return colors[i];
  }
  return null;
}
function nameForPartColor(partId, hex) {
  var hit = findStockColor(partId, hex);
  if (hit) return hit.name;
  return state.colorNames[partId] || hex;
}
function paletteHeading(partId) {
  var pal = paletteForPart(partId);
  var key = materialKeyForPart(partId);
  if (partId === "body" || key === "body") return "Body · Black";
  if (partId === "embroidery" || key === "embroidery") return "Embroidery";
  if (key === "spandex" && pal && pal.locked) return "Spandex · Black";
  if (key === "stitch") return "Stitch · Thread";
  return materialLabel(partId) + " · " + partLabel(partId);
}
function garmentHasPart(partId) {
  if (!ctx || !ctx.root || !partId) return false;
  var found = false;
  ctx.root.traverse(function (obj) {
    if (!obj.isMesh || found) return;
    if (obj.userData.partId === partId) found = true;
    else if (obj.userData.partIds && obj.userData.partIds.indexOf(partId) !== -1) found = true;
  });
  return found;
}
function upcPaletteNote(partId, fallback) {
  if (!isUpcProduct()) return fallback || "";
  if (partId === "body") return "Includes the cuff. Black only for now.";
  if (partId === "trim" && !garmentHasPart("trim")) {
    return "Trim isn’t in this CLO export yet. Add piping, binding, or edge tape in CLO and re-export UPC.glb.";
  }
  return fallback || "";
}
function hexLuminance(hex) {
  var h = toPickerHex(hex).slice(1);
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function snapPartToStock(partId) {
  if (partId === "body") {
    state.colors.body = "#000000";
    state.colorNames.body = "Black";
    return;
  }
  var pal = paletteForPart(partId);
  var colors = (pal && pal.colors) || [];
  if (!colors.length) return;
  if (findStockColor(partId, state.colors[partId])) return;
  state.colors[partId] = colors[0].hex;
  state.colorNames[partId] = colors[0].name;
}
function setFit(id) {
  state.fit = id;
  state.gender = id;
  document.querySelectorAll("#fit-row button, #size-fit button").forEach(function (b) {
    b.classList.toggle("is-on", b.dataset.g === id || b.dataset.fit === id);
  });
  var note = document.getElementById("youth-note");
  if (note) note.hidden = id !== "youth";
  if (window.hoodooSizeFit) window.hoodooSizeFit(id);
  var a = document.getElementById("btn-dyesub");
  if (a) {
    a.href =
      "/dyesub.html?product=" +
      encodeURIComponent(state.product || "freefly-jacket") +
      "&fit=" +
      encodeURIComponent(state.fit || "male");
  }
}

function go(step) {
  state.step = step;
  document.querySelectorAll(".suit-step").forEach(function (el, i) {
    el.hidden = i !== step - 1;
  });
  document.querySelectorAll(".suit-steps button").forEach(function (b) {
    b.classList.toggle("is-active", Number(b.dataset.step) === step);
  });
  if (step === 2) requestAnimationFrame(function () {
    applyProductColorway();
    buildParts();
    loadStyle();
    syncPalette();
  });
  if (step === 3) {
    buildSizeFit();
    setFit(state.fit);
    if (window.hoodooSizingShow) window.hoodooSizingShow();
  }
}

function buildPatternCards() {
  var row = document.getElementById("fit-row");
  row.innerHTML = fits()
    .map(function (f) {
      var soon = f.comingSoon ? " is-soon" : "";
      var on = f.id === state.fit ? " is-on" : "";
      var extra = f.comingSoon ? " · add later" : "";
      return (
        '<button type="button" data-fit="' +
        f.id +
        '" class="' +
        on +
        soon +
        '">' +
        f.name +
        extra +
        "</button>"
      );
    })
    .join("");
  row.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      setFit(b.dataset.fit);
      highlightProducts();
    });
  });
  setFit(state.fit);

  var grid = document.getElementById("pattern-grid");
  function productCardHtml(s) {
    return (
      '<button type="button" class="suit-pattern-card' +
      (s.id === state.product ? " is-on" : "") +
      '" data-id="' +
      s.id +
      '"><h2>' +
      s.name +
      "</h2><p>" +
      (s.blurb || "CLO3D · dye-sub + sew") +
      '</p><p class="suit-card-meta" data-meta></p></button>'
    );
  }
  function groupBlockHtml(g, items) {
    var inner = items.length
      ? '<div class="suit-pattern-grid">' + items.map(productCardHtml).join("") + "</div>"
      : '<p class="suit-pattern-empty">No items yet</p>';
    return (
      '<section class="suit-pattern-group">' +
      '<h2 class="suit-pattern-group__title">' +
      g.name +
      "</h2>" +
      inner +
      "</section>"
    );
  }
  var html = "";
  var used = {};
  groups().forEach(function (g) {
    var items = products().filter(function (p) { return p.groupId === g.id; });
    items.forEach(function (p) { used[p.id] = true; });
    html += groupBlockHtml(g, items);
  });
  var leftover = products().filter(function (p) { return !used[p.id]; });
  if (leftover.length) html += groupBlockHtml({ id: "other", name: "Other" }, leftover);
  if (!html) html = '<div class="suit-pattern-grid">' + products().map(productCardHtml).join("") + "</div>";
  grid.innerHTML = html;
  grid.querySelectorAll(".suit-pattern-card").forEach(function (b) {
    b.addEventListener("click", function () {
      state.product = b.dataset.id;
      syncProductFit();
      applyProductColorway(true);
      highlightProducts();
      buildParts();
      go(2);
      loadStyle();
    });
  });
  highlightProducts();
  probeAwaitingGlbs();
}

function highlightProducts() {
  var fit = fits().find(function (f) { return f.id === state.fit; }) || fits()[0];
  document.querySelectorAll("#pattern-grid .suit-pattern-card").forEach(function (b) {
    b.classList.toggle("is-on", b.dataset.id === state.product);
    var meta = b.querySelector("[data-meta]");
    if (!meta) return;
    var p = products().find(function (x) { return x.id === b.dataset.id; });
    if (p && p.oneFit) {
      var fname = (p.fits && p.fits[0] && p.fits[0].name) || "Unisex";
      var wait = p.awaitingFile && p.awaitingGlb !== false;
      meta.textContent = fname + (wait ? " · waiting for " + p.awaitingFile : "");
      return;
    }
    meta.textContent = fit
      ? fit.name + (fit.comingSoon ? " — CLO slot ready" : "")
      : "";
  });
}

function probeAwaitingGlbs() {
  products().forEach(function (p) {
    if (!p.awaitingFile) return;
    var url = firstExistingCandidateHint(p);
    if (!url || isDuckOrMissing(url)) {
      p.awaitingGlb = true;
      return;
    }
    fetch(url, { method: "HEAD", cache: "no-store" })
      .then(function (r) {
        p.awaitingGlb = !r.ok;
        highlightProducts();
      })
      .catch(function () {
        p.awaitingGlb = true;
        highlightProducts();
      });
  });
}
function firstExistingCandidateHint(p) {
  var fit = p.oneFit ? ((p.fits && p.fits[0] && p.fits[0].id) || "unisex") : "male";
  var list = glbCandidatesForProduct(p, fit);
  return list[0] || "";
}

function buildSizeFit() {
  var row = document.getElementById("size-fit");
  if (!row) return;
  var list = productFits();
  row.innerHTML = list
    .map(function (f) {
      return (
        '<button type="button" data-g="' +
        f.id +
        '"' +
        (f.id === state.fit ? ' class="is-on"' : "") +
        ">" +
        f.name +
        "</button>"
      );
    })
    .join("");
  row.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      setFit(b.dataset.g);
    });
  });
}

function selectPart(id) {
  if (!id) return;
  var allowed = currentParts();
  if (allowed.every(function (p) { return p.id !== id; })) return;
  state.part = id;
  document.querySelectorAll("#suit-part-tabs .suit-part").forEach(function (x) {
    x.classList.toggle("is-on", x.dataset.id === id);
  });
  syncPalette();
  applyColors();
}

function buildParts() {
  var el = document.getElementById("suit-part-tabs") || document.getElementById("suit-parts");
  if (!el) return;
  var list = currentParts();
  if (list.length && list.every(function (p) { return p.id !== state.part; })) {
    state.part = list[0].id;
  }
  el.innerHTML = list.map(function (p) {
    return (
      '<button type="button" class="suit-part' +
      (p.id === state.part ? " is-on" : "") +
      '" data-id="' +
      p.id +
      '"><span class="suit-part-dot" style="background:' +
      (state.colors[p.id] || "#888") +
      '"></span>' +
      p.label +
      "</button>"
    );
  }).join("");
  el.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      selectPart(b.dataset.id);
    });
  });
  syncPalette();
}

function dyesubBuilderHref() {
  var p = currentProduct();
  var q = new URLSearchParams();
  if (p && p.id) q.set("product", p.id);
  if (state.fit) q.set("fit", state.fit);
  if (p && p.id === "freefly-jacket") q.set("garment", "male-jacket");
  return "/dyesub.html?" + q.toString();
}

function setRail(id) {
  state.rail = state.rail === id ? "" : (id || "");
  document.querySelectorAll("#suit-cats .suit-cat").forEach(function (b) {
    var on = b.dataset.rail === state.rail;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  renderFlyout();
}

function renderFlyout() {
  var el = document.getElementById("suit-flyout");
  if (!el) return;
  if (!state.rail) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  var html = "";
  if (state.rail === "type") {
    html += "<h2>Suit type</h2>";
    [
      { id: "standard", label: "Standard", hint: "Regular cut. Solid Taslan panels." },
      { id: "fitted", label: "Fitted", hint: "Closer cut. Same color workflow." },
      { id: "printed", label: "Printed", hint: "Dye-sub print. Place art on pattern pieces." },
    ].forEach(function (opt) {
      html +=
        '<button type="button" class="suit-choice' +
        (state.suitType === opt.id ? " is-on" : "") +
        '" data-suit-type="' +
        opt.id +
        '">' +
        opt.label +
        "<small>" +
        opt.hint +
        "</small></button>";
    });
    if (state.suitType === "printed") {
      html += '<a class="btn btn-primary" id="flyout-dyesub" href="' + dyesubBuilderHref() + '">Open print builder</a>';
      html += '<button type="button" class="btn btn-ghost" id="flyout-place">Place art on this panel</button>';
    }
  } else if (state.rail === "options") {
    html += "<h2>Options</h2>";
    html +=
      '<label class="suit-check"><input type="checkbox" data-extra="booties"' +
      (state.extras.booties ? " checked" : "") +
      " /> Booties</label>";
    html +=
      '<label class="suit-check"><input type="checkbox" data-extra="cordura"' +
      (state.extras.cordura ? " checked" : "") +
      " /> Cordura reinforcements</label>";
    html +=
      '<label class="suit-check"><input type="checkbox" data-extra="embroidery"' +
      (state.extras.embroidery ? " checked" : "") +
      " /> Name embroidery</label>";
  } else if (state.rail === "handles") {
    html += "<h2>Handles</h2>";
    [
      { id: "none", label: "None", hint: "No extra grab handles." },
      { id: "hip", label: "Hip handles", hint: "Standard hip grips." },
      { id: "hip-leg", label: "Hip and leg handles", hint: "Hip plus lower-leg grabs." },
    ].forEach(function (opt) {
      html +=
        '<button type="button" class="suit-choice' +
        (state.handles === opt.id ? " is-on" : "") +
        '" data-handles="' +
        opt.id +
        '">' +
        opt.label +
        "<small>" +
        opt.hint +
        "</small></button>";
    });
  }
  el.innerHTML = html;
  el.querySelectorAll("[data-suit-type]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.suitType = b.getAttribute("data-suit-type");
      renderFlyout();
      syncPalette();
    });
  });
  el.querySelectorAll("[data-handles]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.handles = b.getAttribute("data-handles");
      renderFlyout();
    });
  });
  el.querySelectorAll("[data-extra]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      state.extras[inp.getAttribute("data-extra")] = !!inp.checked;
      syncPalette();
    });
  });
  var place = document.getElementById("flyout-place");
  if (place) {
    place.addEventListener("click", function () {
      var btn = document.getElementById("btn-place-pattern");
      if (btn) btn.click();
    });
  }
}

function bindRail() {
  var nav = document.getElementById("suit-cats");
  if (!nav || nav.dataset.bound) return;
  nav.dataset.bound = "1";
  nav.addEventListener("click", function (e) {
    var b = e.target.closest(".suit-cat");
    if (!b) return;
    setRail(b.dataset.rail);
  });
}

function syncPalette() {
  snapPartToStock(state.part);
  buildSwatches();
  var label = document.getElementById("palette-part-label");
  if (label) label.textContent = paletteHeading(state.part);
  var note = document.getElementById("palette-note");
  var pal = paletteForPart(state.part);
  if (note) {
    var extra = upcPaletteNote(state.part, (pal && pal.note) || "");
    if (state.suitType === "printed") {
      extra = (extra ? extra + " · " : "") + "Printed dye-sub. Panel color is the base fabric under the print.";
    }
    note.textContent = extra;
    note.hidden = !note.textContent;
  }
  var pickerWrap = document.getElementById("part-color-picker-wrap");
  if (pickerWrap) pickerWrap.hidden = true;
  var picker = document.getElementById("part-color-picker");
  if (picker) picker.hidden = true;
  var scale = document.getElementById("part-art-scale");
  if (scale) scale.value = String((state.art[state.part] && state.art[state.part].repeat) || 1);
  var ox = document.getElementById("part-art-x");
  var oy = document.getElementById("part-art-y");
  if (ox) ox.value = String((state.art[state.part] && state.art[state.part].offsetX) || 0);
  if (oy) oy.value = String((state.art[state.part] && state.art[state.part].offsetY) || 0);
  var embWrap = document.getElementById("embroidery-fields");
  if (embWrap) {
    embWrap.hidden = state.part !== "embroidery" && !(state.extras && state.extras.embroidery);
    var inp = document.getElementById("embroidery-text");
    if (inp && inp.value !== (state.embroideryText || "")) inp.value = state.embroideryText || "";
  }
  var hideArt = state.part === "embroidery" || !!(pal && pal.locked);
  var artUpload = document.querySelector(".suit-art-upload");
  var artClear = document.getElementById("part-art-clear");
  var placeBtn = document.getElementById("btn-place-pattern");
  if (artUpload) artUpload.hidden = hideArt;
  if (artClear) artClear.hidden = hideArt;
  if (placeBtn) placeBtn.hidden = hideArt;
  document.querySelectorAll(".suit-art-scale").forEach(function (el) {
    el.hidden = hideArt;
  });
  var hint = document.querySelector(".suit-art-hint");
  if (hint) hint.hidden = hideArt;
  document.querySelectorAll("#swatches .suit-swatch").forEach(function (b) {
    b.classList.toggle("is-on", sameHex(b.dataset.c, state.colors[state.part]));
  });
}

function toPickerHex(hex) {
  var h = String(hex || "#000000").trim();
  if (h.charAt(0) !== "#") h = "#" + h;
  if (h.length === 4) {
    return "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return h.slice(0, 7);
}
function sameHex(a, b) {
  return toPickerHex(a).toLowerCase() === toPickerHex(b).toLowerCase();
}

function setPartColor(hex, name) {
  var stock = findStockColor(state.part, hex);
  if (stock) {
    hex = stock.hex;
    name = stock.name;
  } else {
    snapPartToStock(state.part);
    hex = state.colors[state.part];
    name = state.colorNames[state.part];
  }
  state.colors[state.part] = hex;
  state.colorNames[state.part] = name || nameForPartColor(state.part, hex);
  document.querySelectorAll("#suit-part-tabs .suit-part").forEach(function (b) {
    if (b.dataset.id === state.part) {
      var dot = b.querySelector(".suit-part-dot");
      if (dot) dot.style.background = hex;
    }
  });
  syncPalette();
  applyColors();
}

var overlayState = {
  garment: null,
  placer: null,
  arts: [],
  placements: [],
  jobId: null,
  partId: "front",
};

function overlayStatus(msg) {
  var el = document.getElementById("dyesub-overlay-status");
  if (el) el.textContent = msg || "";
}

function uuidArt() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function renderOverlayPieces() {
  var ul = document.getElementById("dyesub-overlay-pieces");
  if (!ul || !overlayState.garment || !overlayState.placer) return;
  var list = piecesForPart(overlayState.garment, overlayState.partId);
  if (!list.length) list = overlayState.garment.pieces || [];
  ul.innerHTML = "";
  list.forEach(function (p) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.className = overlayState.placer.piece && overlayState.placer.piece.id === p.id ? "is-on" : "";
    b.textContent = (p.label || p.id) + " · " + Number(p.cutWin).toFixed(1) + "×" + Number(p.cutHin).toFixed(1) + " in";
    b.addEventListener("click", function () {
      overlayState.placer.setPiece(p);
      renderOverlayPieces();
    });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

function ensureOverlayPlacer() {
  var canvas = document.getElementById("dyesub-overlay-canvas");
  if (!canvas) return null;
  if (!overlayState.placer) {
    overlayState.placer = new PiecePlacer(canvas, {
      onChange: function (placer) {
        overlayState.placements = placer.placements;
        syncDecalFromPlacement();
      },
    });
  }
  return overlayState.placer;
}

function syncDecalFromPlacement() {
  var piece = overlayState.placer && overlayState.placer.piece;
  var art = state.art[overlayState.partId];
  if (!piece || !art) return;
  var pl = overlayState.placements.filter(function (p) {
    return p.pieceId === piece.id;
  })[0];
  if (!pl) return;
  art.repeat = Math.max(0.2, (pl.wIn / piece.cutWin) / 0.38);
  art.offsetX = (pl.xIn + pl.wIn / 2) / piece.cutWin - 0.5;
  art.offsetY = 0.5 - (pl.yIn + pl.hIn / 2) / piece.cutHin;
  var ox = document.getElementById("part-art-x");
  var oy = document.getElementById("part-art-y");
  var sc = document.getElementById("part-art-scale");
  if (ox) ox.value = String(art.offsetX);
  if (oy) oy.value = String(art.offsetY);
  if (sc) sc.value = String(art.repeat);
  applyColors();
}

function addOverlayArt(dataUrl, filename, aspect, partId) {
  var placer = ensureOverlayPlacer();
  if (!placer || !overlayState.garment) return;
  var img = new Image();
  var artId = uuidArt();
  img.onload = function () {
    placer.setImage(artId, img);
    var list = piecesForPart(overlayState.garment, partId || overlayState.partId);
    var piece = (placer.piece && list.some(function (p) { return p.id === placer.piece.id; }))
      ? placer.piece
      : list[0] || overlayState.garment.pieces[0];
    if (!piece) return;
    placer.setPiece(piece);
    var pl = defaultPlacement(piece, artId, aspect || img.width / img.height);
    overlayState.placements.push(pl);
    overlayState.arts.push({ id: artId, filename: filename || "art.png", dataUrl: dataUrl, local: true });
    placer.setPlacements(overlayState.placements);
    placer.selectedId = pl.id;
    placer.draw();
    renderOverlayPieces();
    syncDecalFromPlacement();
    overlayStatus("Drag the art on the cut piece. That placement is what prints.");
  };
  img.src = dataUrl;
}

function showOverlay() {
  var el = document.getElementById("dyesub-overlay");
  if (el) el.hidden = false;
  var full = document.getElementById("dyesub-overlay-full");
  if (full) {
    full.href =
      "/dyesub.html?product=" +
      encodeURIComponent(state.product || "freefly-jacket") +
      "&fit=" +
      encodeURIComponent(state.fit || "male");
  }
  requestAnimationFrame(function () {
    if (overlayState.placer) overlayState.placer.draw();
  });
}

function hideOverlay() {
  var el = document.getElementById("dyesub-overlay");
  if (el) el.hidden = true;
}

function queuePatternArt(partId, dataUrl, filename) {
  loadGarmentSpec(state.product, state.fit)
    .then(function (g) {
      overlayState.garment = g;
      overlayState.partId = partId;
      var placer = ensureOverlayPlacer();
      placer.setGarment(g);
      placer.setBaseColor(state.colors[partId] || "#00aea7");
      addOverlayArt(dataUrl, filename, 1, partId);
      showOverlay();
    })
    .catch(function (e) {
      overlayStatus(e.message || "Could not load pattern pieces.");
      showOverlay();
    });
}

function openPatternPlacer(partId, dataUrl, filename, aspect, isNew) {
  overlayState.partId = partId || state.part;
  loadGarmentSpec(state.product, state.fit)
    .then(function (g) {
      overlayState.garment = g;
      var placer = ensureOverlayPlacer();
      placer.setGarment(g);
      placer.setBaseColor(state.colors[overlayState.partId] || "#00aea7");
      var list = piecesForPart(g, overlayState.partId);
      placer.setPiece(list[0] || g.pieces[0]);
      placer.setPlacements(overlayState.placements);
      if (isNew && dataUrl) addOverlayArt(dataUrl, filename, aspect, overlayState.partId);
      else {
        renderOverlayPieces();
        placer.draw();
      }
      showOverlay();
      if (!isNew && !overlayState.placements.length) overlayStatus("Upload art first, then place it on this cut piece.");
    })
    .catch(function (e) {
      overlayStatus(e.message || "Print pieces for this garment are not ready yet.");
      showOverlay();
    });
}

function dyesubAuthHeaders() {
  var h = {};
  var tok = window.HoodooApi && window.HoodooApi.getToken();
  if (tok) h.Authorization = "Bearer " + tok;
  return h;
}

function dataUrlToBlob(dataUrl) {
  var m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  var bin = atob(m[2]);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] });
}

function saveOverlayJob() {
  if (!window.HoodooApi || !window.HoodooApi.getToken()) {
    overlayStatus("Sign in to save this print to your account.");
    window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname + window.location.search);
    return Promise.reject(new Error("Not authenticated"));
  }
  if (!overlayState.garment) return Promise.reject(new Error("No garment"));
  overlayStatus("Saving…");
  var layout = {
    baseColor: state.colors[overlayState.partId] || "#00aea7",
    placements: overlayState.placements,
  };
  var body = {
    garment_id: overlayState.garment.id || "male-jacket",
    name: (overlayState.garment.name || "Print") + " · " + (state.fit || ""),
    layout: layout,
  };
  var req = overlayState.jobId
    ? window.HoodooApi.fetchJson("/dyesub/jobs/" + overlayState.jobId, { method: "PUT", body: JSON.stringify({ name: body.name, layout: layout }) })
    : window.HoodooApi.fetchJson("/dyesub/jobs", { method: "POST", body: JSON.stringify(body) });
  return req
    .then(function (job) {
      overlayState.jobId = job.id;
      var chain = Promise.resolve();
      overlayState.arts.forEach(function (a) {
        if (!a.local || !a.dataUrl) return;
        chain = chain.then(function () {
          var blob = dataUrlToBlob(a.dataUrl);
          if (!blob) return;
          var fd = new FormData();
          fd.append("file", blob, a.filename || "art.png");
          return fetch("/api/dyesub/jobs/" + job.id + "/art", {
            method: "POST",
            headers: dyesubAuthHeaders(),
            credentials: "same-origin",
            body: fd,
          }).then(function (r) {
            return r.json().then(function (meta) {
              if (!r.ok) throw new Error((meta && meta.detail) || "Upload failed");
              overlayState.placements.forEach(function (p) {
                if (p.artId === a.id) p.artId = meta.id;
              });
              a.id = meta.id;
              a.local = false;
            });
          });
        });
      });
      return chain.then(function () {
        return window.HoodooApi.fetchJson("/dyesub/jobs/" + job.id, {
          method: "PUT",
          body: JSON.stringify({ layout: { baseColor: layout.baseColor, placements: overlayState.placements } }),
        });
      });
    })
    .then(function () {
      overlayStatus("Saved to your account.");
    })
    .catch(function (e) {
      overlayStatus(e.message || "Could not save.");
      throw e;
    });
}

function downloadOverlayPack() {
  saveOverlayJob()
    .then(function () {
      overlayStatus("Building print pack…");
      return fetch("/api/dyesub/jobs/" + overlayState.jobId + "/pack", {
        headers: dyesubAuthHeaders(),
        credentials: "same-origin",
      });
    })
    .then(function (r) {
      if (!r.ok) throw new Error("Pack failed — dye-sub API is not on this server yet.");
      return r.blob();
    })
    .then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hoodoo-dyesub.zip";
      a.click();
      overlayStatus("Downloaded. PRINT PNGs are 300 DPI for the F6200.");
    })
    .catch(function (e) {
      overlayStatus(e.message || "Could not build pack.");
    });
}

function bindOverlay() {
  var close = document.getElementById("dyesub-overlay-close");
  if (close) close.addEventListener("click", hideOverlay);
  var save = document.getElementById("dyesub-overlay-save");
  if (save) save.addEventListener("click", function () { saveOverlayJob(); });
  var pack = document.getElementById("dyesub-overlay-pack");
  if (pack) pack.addEventListener("click", downloadOverlayPack);
}

function bindPalette() {
  buildSwatches();
  var file = document.getElementById("part-art-file");
  if (file && !file.dataset.bound) {
    file.dataset.bound = "1";
    file.addEventListener("change", function () {
      var files = file.files ? Array.prototype.slice.call(file.files) : [];
      file.value = "";
      if (!files.length) return;
      files.forEach(function (f, i) {
        var reader = new FileReader();
        reader.onload = function () {
          var url = String(reader.result || "");
          if (i === files.length - 1) setPartArt(state.part, url, f.name);
          else queuePatternArt(state.part, url, f.name);
        };
        reader.readAsDataURL(f);
      });
    });
  }
  var clearBtn = document.getElementById("part-art-clear");
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", function () {
      clearPartArt(state.part);
      if (overlayState.garment) {
        var ids = piecesForPart(overlayState.garment, state.part).map(function (x) { return x.id; });
        overlayState.placements = overlayState.placements.filter(function (p) {
          return ids.indexOf(p.pieceId) === -1;
        });
      }
    });
  }
  var scale = document.getElementById("part-art-scale");
  if (scale && !scale.dataset.bound) {
    scale.dataset.bound = "1";
    scale.addEventListener("input", function () {
      var art = state.art[state.part];
      if (!art) return;
      art.repeat = Number(scale.value) || 1;
      applyColors();
    });
  }
  function bindOffset(el, key) {
    if (!el || el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("input", function () {
      var art = state.art[state.part];
      if (!art) return;
      art[key] = Number(el.value) || 0;
      applyColors();
    });
  }
  bindOffset(document.getElementById("part-art-x"), "offsetX");
  bindOffset(document.getElementById("part-art-y"), "offsetY");
  var placeBtn = document.getElementById("btn-place-pattern");
  if (placeBtn && !placeBtn.dataset.bound) {
    placeBtn.dataset.bound = "1";
    placeBtn.addEventListener("click", function () {
      openPatternPlacer(state.part, null, null, null, false);
    });
  }
  var embInput = document.getElementById("embroidery-text");
  if (embInput && !embInput.dataset.bound) {
    embInput.dataset.bound = "1";
    embInput.addEventListener("input", function () {
      state.embroideryText = String(embInput.value || "");
    });
  }
}

function swatchButtonHtml(c, locked) {
  var hex = c.hex;
  var name = c.name || hex;
  var light = hexLuminance(hex) > 0.82 ? " is-light" : "";
  var lock = locked ? " is-locked" : "";
  var on = sameHex(hex, state.colors[state.part]) ? " is-on" : "";
  return (
    '<div class="suit-swatch-cell">' +
      '<button type="button" class="suit-swatch' + light + lock + on + '" data-c="' + hex + '" data-name="' + name + '" style="background:' + hex + '" title="' + name + '" aria-label="' + name + '"></button>' +
      '<span class="suit-swatch-name">' + name + "</span>" +
    "</div>"
  );
}

function buildSwatches() {
  var wrap = document.getElementById("swatches");
  if (!wrap) return;
  var pal = paletteForPart(state.part);
  var colors = (pal && pal.colors) || [];
  var locked = !!(pal && pal.locked);
  wrap.classList.toggle("is-locked-set", locked);
  wrap.setAttribute("aria-label", materialLabel(state.part) + " stock colors");
  wrap.innerHTML = colors.map(function (c) { return swatchButtonHtml(c, locked); }).join("");
  wrap.querySelectorAll(".suit-swatch").forEach(function (b) {
    b.addEventListener("click", function () {
      setPartColor(b.dataset.c, b.dataset.name);
    });
  });
  var picker = document.getElementById("part-color-picker");
  if (picker) {
    picker.hidden = true;
    picker.disabled = true;
  }
}

function proceduralSuit(scene) {
  var g = new THREE.Group();
  g.name = "procedural";
  function mat(hex) {
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.62,
      metalness: 0.04,
    });
  }
  var frontId = isJumpsuitProduct() ? "frontTorso" : "front";
  var backId = isJumpsuitProduct() ? "backTorso" : "back";
  var front = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.52, 8, 20), mat(state.colors[frontId] || "#FFFFFF"));
  front.name = frontId;
  front.position.set(0, 1.18, 0.04);
  front.scale.set(1.05, 1, 0.62);
  var back = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 8, 20), mat(state.colors[backId] || "#9fa4a5"));
  back.name = backId;
  back.position.set(0, 1.18, -0.08);
  back.scale.set(1.0, 0.96, 0.55);
  var waist = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.14, 16), mat(state.colors.waistband));
  waist.name = "waistband";
  waist.position.y = 0.88;
  var zipper = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.02), mat(state.colors.zipper));
  zipper.name = "zipper";
  zipper.position.set(0, 1.2, 0.22);
  var collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 18), mat(state.colors.collar));
  collar.name = "collar";
  collar.position.y = 1.55;
  collar.rotation.x = Math.PI / 2;
  function limb(name, w, l, x, y, zRot) {
    var m = new THREE.Mesh(new THREE.CapsuleGeometry(w, l, 6, 14), mat(state.colors[name] || "#111"));
    m.name = name;
    m.position.set(x, y, 0);
    m.rotation.z = zRot || 0;
    return m;
  }
  var la = limb("sleeves", 0.09, 0.58, -0.46, 1.18, 0.22);
  var ra = limb("sleeves", 0.09, 0.58, 0.46, 1.18, -0.22);
  var legId = isJumpsuitProduct() ? "frontLegs" : "legs";
  var ll = limb(legId, 0.125, 0.72, -0.15, 0.42, 0);
  var rl = limb(legId, 0.125, 0.72, 0.15, 0.42, 0);
  var llb = limb("backLegs", 0.12, 0.7, -0.15, 0.42, 0);
  llb.position.z = -0.08;
  var rlb = limb("backLegs", 0.12, 0.7, 0.15, 0.42, 0);
  rlb.position.z = -0.08;
  var seat = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), mat(state.colors.cordura));
  seat.name = "cordura";
  seat.position.set(0, 0.78, -0.02);
  seat.scale.set(1.15, 0.55, 0.9);
  var trim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 16), mat(state.colors.trim));
  trim.name = "trim";
  trim.position.y = 0.78;
  trim.rotation.x = Math.PI / 2;
  var bl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat(state.colors.booties));
  bl.name = "booties";
  bl.scale.set(1.15, 0.55, 1.4);
  bl.position.set(-0.15, 0.06, 0.08);
  var br = bl.clone();
  br.position.x = 0.15;
  var stitchMat = mat(state.colors.stitch || "#0a0b0d");
  function stitchRing(y, r, tube) {
    var s = new THREE.Mesh(new THREE.TorusGeometry(r, tube || 0.006, 6, 28), stitchMat);
    s.name = "stitch";
    s.position.y = y;
    s.rotation.x = Math.PI / 2;
    return s;
  }
  if (isJumpsuitProduct()) g.add(front, back, zipper, collar, la, ra, ll, rl, llb, rlb);
  else g.add(front, back, waist, zipper, collar, la, ra, ll, rl, seat, trim, bl, br);
  g.add(stitchRing(1.52, 0.16, 0.005), stitchRing(0.96, 0.275, 0.005), stitchRing(1.18, 0.34, 0.004));
  scene.add(g);
  return g;
}

function ensure3d() {
  if (ctx) {
    var w = ctx.canvas.parentElement.clientWidth;
    var h = ctx.canvas.parentElement.clientHeight || 480;
    ctx.camera.aspect = w / h;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(w, h);
    return ctx;
  }
  var canvas = document.getElementById("suit-canvas");
  var w = canvas.parentElement.clientWidth || 800;
  var h = canvas.parentElement.clientHeight || 480;
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd5d8dc);
  var camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
  camera.position.set(1.6, 1.4, 2.4);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  var key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(3, 5, 4);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0x36b4e5, 0.35);
  fill.position.set(-3, 2, -2);
  scene.add(fill);
  var root = new THREE.Group();
  scene.add(root);
  var controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.9, 0);
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();
  function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();
  window.addEventListener("resize", function () {
    var ww = canvas.parentElement.clientWidth;
    var hh = canvas.parentElement.clientHeight || 480;
    camera.aspect = ww / hh;
    camera.updateProjectionMatrix();
    renderer.setSize(ww, hh);
  });
  canvas.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0) return;
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObject(root, true);
    for (var i = 0; i < hits.length; i++) {
      var obj = hits[i].object;
      while (obj && !obj.isMesh) obj = obj.parent;
      if (!obj) continue;
      var pid = obj.userData.partId;
      if (Array.isArray(obj.material) && hits[i].face && obj.userData.partIds) {
        pid = obj.userData.partIds[hits[i].face.materialIndex] || pid;
      }
      if (pid) {
        selectPart(pid);
        if (state.rail) setRail("");
        break;
      }
    }
  });
  ctx = { renderer: renderer, scene: scene, camera: camera, root: root, canvas: canvas, controls: controls };
  return ctx;
}

function eachMaterial(mesh, fn) {
  var m = mesh.material;
  if (!m) return;
  if (Array.isArray(m)) m.forEach(fn);
  else fn(m);
}

function collectNames(obj) {
  var names = [];
  if (obj.name) names.push(obj.name);
  eachMaterial(obj, function (m) {
    if (m && m.name) names.push(m.name);
  });
  return names;
}

function isHardware(obj) {
  var blob = collectNames(obj).join(" ").toLowerCase();
  return HARDWARE_RE.test(blob);
}

function partFromNames(names) {
  var blob = (names || []).join(" ").toLowerCase();
  if (!blob || HARDWARE_RE.test(blob)) return null;
  var map = activeMeshMap();
  var ranked = [];
  currentParts().forEach(function (p) {
    var keys = (map[p.id] || []).concat([p.id]);
    keys.forEach(function (k) {
      var key = String(k || "").toLowerCase();
      if (key) ranked.push({ id: p.id, key: key });
    });
  });
  ranked.sort(function (a, b) { return b.key.length - a.key.length; });
  for (var i = 0; i < ranked.length; i++) {
    if (blob.indexOf(ranked[i].key) !== -1) return ranked[i].id;
  }
  return null;
}

function partForObject(obj) {
  if (!obj || !obj.isMesh) return null;
  return partFromNames(collectNames(obj));
}

function partForMaterial(mesh, mat) {
  var names = [];
  if (mesh && mesh.name) names.push(mesh.name);
  if (mat && mat.name) names.push(mat.name);
  return partFromNames(names);
}

function uvBoundsOf(mesh) {
  var geo = mesh.geometry;
  if (!geo || !geo.attributes || !geo.attributes.uv) return null;
  var uv = geo.attributes.uv;
  var minU = Infinity;
  var maxU = -Infinity;
  var minV = Infinity;
  var maxV = -Infinity;
  for (var i = 0; i < uv.count; i++) {
    var u = uv.getX(i);
    var v = uv.getY(i);
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (!isFinite(minU)) return null;
  return { minU: minU, maxU: maxU, minV: minV, maxV: maxV };
}

function cloneOneMaterial(mat) {
  var c = mat.clone();
  c.name = mat.name;
  c.userData = Object.assign({}, mat.userData || {});
  c.userData.baseMap = mat.map || null;
  if (mat.map) c.map = mat.map;
  if (c.emissive) {
    c.emissive.setHex(0x000000);
    c.emissiveIntensity = 0;
  }
  return c;
}

function uniquifyMeshMaterials(obj) {
  var groups = obj.geometry && obj.geometry.groups;
  // UPC: 8 primitives share 5 FABRIC slots (indices [0,1,2,3,4,2,2,2]).
  // Clone per group. Prims 1,3,5,7 are folded CUFF (body black), not trim.
  if (isUpcProduct() && groups && groups.length > 1) {
    var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    obj.material = groups.map(function (gr) {
      var src = mats[Math.min(gr.materialIndex || 0, mats.length - 1)] || mats[0];
      return cloneOneMaterial(src);
    });
    groups.forEach(function (gr, i) { gr.materialIndex = i; });
    return;
  }
  if (groups && groups.length > 1 && !Array.isArray(obj.material)) {
    obj.material = groups.map(function () {
      return cloneOneMaterial(obj.material);
    });
    return;
  }
  if (Array.isArray(obj.material)) {
    obj.material = obj.material.map(function (m) {
      return cloneOneMaterial(m);
    });
    return;
  }
  obj.material = cloneOneMaterial(obj.material);
}

function primitiveCentroid(mesh, materialIndex) {
  var geo = mesh.geometry;
  if (!geo || !geo.attributes || !geo.attributes.position) return null;
  mesh.updateWorldMatrix(true, false);
  var pos = geo.attributes.position;
  var index = geo.index;
  var v = new THREE.Vector3();
  var acc = new THREE.Vector3();
  var n = 0;
  function addVert(i) {
    v.fromBufferAttribute(pos, i);
    v.applyMatrix4(mesh.matrixWorld);
    acc.add(v);
    n += 1;
  }
  var groups = geo.groups || [];
  if (groups.length && materialIndex != null) {
    groups.forEach(function (gr) {
      if (gr.materialIndex !== materialIndex) return;
      var start = gr.start;
      var end = start + gr.count;
      var i;
      if (index) {
        for (i = start; i < end; i++) addVert(index.getX(i));
      } else {
        for (i = start; i < end; i++) addVert(i);
      }
    });
  }
  if (!n) {
    var step = pos.count > 4000 ? Math.ceil(pos.count / 2000) : 1;
    for (var i = 0; i < pos.count; i += step) addVert(i);
  }
  if (!n) return null;
  acc.multiplyScalar(1 / n);
  return acc;
}

function garmentYInfo(root) {
  var box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return { minY: 0, maxY: 2.2, midY: 1.1 };
  return { minY: box.min.y, maxY: box.max.y, midY: (box.min.y + box.max.y) * 0.5 };
}

function garmentMidY(root) {
  return garmentYInfo(root).midY;
}

function isAvatarMesh(obj) {
  var blob = collectNames(obj).join(" ").toLowerCase();
  if (/mara:|material_hair|material_(left|right)shoe|eyelash|tooth_|avatar/.test(blob)) return true;
  var n = String(obj.name || "").toLowerCase();
  return /^(hair|body|shoes_|eye_|eyelash|tooth)/.test(n);
}

function needsJacketGeoSplit(mat, assigned) {
  if (!isJacketProduct() || !mat) return false;
  var name = String(mat.name || "").toLowerCase();
  if (/talsan/.test(name)) return true;
  if (/^body$/.test(name) || (/^body_\d+$/.test(name) && !/8589|8592/.test(name))) return true;
  if (/spandex/.test(name) && !/8601|8598/.test(name)) return true;
  if (!assigned && (/talsan|spandex|body/.test(name))) return true;
  return false;
}

function needsJumpsuitGeoSplit(mat, assigned) {
  if (!isJumpsuitProduct() || !mat) return false;
  var name = String(mat.name || "").toLowerCase();
  if (/talsan/.test(name)) return true;
  if (/fabric\s*1/.test(name) && !/tape/.test(name)) return true;
  if (/spandex/.test(name)) return true;
  if (!assigned && (/talsan|spandex|^body|fabric/.test(name))) return true;
  return false;
}

var UPC_TRIM_NAME_RE = /tape|binding|piping/i;
var UPC_EMB_NAME_RE = /embroider|\blogo\b|monogram|lettering/i;

function upcNameBlob(obj, mat) {
  var names = [];
  if (obj && obj.name) names.push(obj.name);
  if (mat && mat.name) names.push(mat.name);
  else if (obj) names = names.concat(collectNames(obj));
  return names.join(" ").toLowerCase();
}

function assignUpcPart(id, obj, mat) {
  if (!isUpcProduct()) return id;
  var blob = upcNameBlob(obj, mat);
  if (id === "embroidery" || UPC_EMB_NAME_RE.test(blob)) return "embroidery";
  // Trim only if the name is tape / binding / piping. All current Cloth_mesh
  // prims — shells 0,2,4,6 and folded cuff 1,3,5,7 — are Body (black).
  if (UPC_TRIM_NAME_RE.test(blob)) return "trim";
  return "body";
}

function partFromCentroid(mesh, materialIndex, mat, yInfo) {
  var c = primitiveCentroid(mesh, materialIndex);
  if (!c) return null;
  var name = String((mat && mat.name) || "").toLowerCase();
  var midY = (yInfo && typeof yInfo === "object") ? yInfo.midY : (yInfo || 1.1);
  var minY = (yInfo && typeof yInfo === "object" && yInfo.minY != null) ? yInfo.minY : 0;
  var maxY = (yInfo && typeof yInfo === "object" && yInfo.maxY != null) ? yInfo.maxY : midY * 2;
  var span = Math.max(maxY - minY, 0.01);
  var collarY = minY + span * 0.78;
  var hipY = minY + span * 0.5;
  var front = c.z >= 0;
  if (isJumpsuitProduct()) {
    if (/spandex/.test(name)) {
      if (c.y >= collarY) return "collar";
      return c.y >= hipY
        ? (front ? "frontTorso" : "backTorso")
        : (front ? "frontLegs" : "backLegs");
    }
    if (/talsan/.test(name) || /^body/.test(name) || /fabric/.test(name)) {
      return c.y >= hipY
        ? (front ? "frontTorso" : "backTorso")
        : (front ? "frontLegs" : "backLegs");
    }
    return null;
  }
  if (/talsan/.test(name) || /^body/.test(name)) {
    return front ? "front" : "back";
  }
  if (/spandex/.test(name)) {
    return c.y >= midY ? "collar" : "waistband";
  }
  return null;
}

function partFromJerseyCentroid(mesh, materialIndex, yInfo) {
  if (!isBluntCollarJersey()) return null;
  var c = primitiveCentroid(mesh, materialIndex);
  if (!c) return null;
  var minY = (yInfo && yInfo.minY != null) ? yInfo.minY : 0;
  var maxY = (yInfo && yInfo.maxY != null) ? yInfo.maxY : 2.2;
  var span = Math.max(maxY - minY, 0.01);
  var collarY = minY + span * 0.82;
  if (Math.abs(c.x) > 0.22) return "sleeves";
  if (c.y >= collarY) return "collar";
  return c.z >= 0 ? "front" : "back";
}

function assignMeshParts(obj, yInfo) {
  if (isJumpsuitProduct() && isAvatarMesh(obj)) {
    obj.userData.partId = null;
    obj.userData.partIds = null;
    return;
  }
  if (Array.isArray(obj.material)) {
    obj.userData.partIds = obj.material.map(function (m, i) {
      var id = partForMaterial(obj, m);
      if (isBluntCollarJersey()) id = partFromJerseyCentroid(obj, i, yInfo) || id;
      if (needsJumpsuitGeoSplit(m, id)) id = partFromCentroid(obj, i, m, yInfo) || id;
      if (needsJacketGeoSplit(m, id)) id = partFromCentroid(obj, i, m, yInfo) || id;
      id = assignUpcPart(id, obj, m);
      if (m) m.userData.partId = id;
      return id;
    });
    obj.userData.partId = obj.userData.partIds.find(Boolean) || null;
    return;
  }
  var id = partForObject(obj);
  if (isBluntCollarJersey()) {
    id = partFromJerseyCentroid(obj, null, yInfo) || id;
  }
  if (needsJumpsuitGeoSplit(obj.material, id)) {
    id = partFromCentroid(obj, null, obj.material, yInfo) || id;
  }
  if (needsJacketGeoSplit(obj.material, id)) {
    id = partFromCentroid(obj, null, obj.material, yInfo) || id;
  }
  id = assignUpcPart(id, obj, obj.material);
  obj.userData.partId = id;
  if (obj.material) obj.material.userData.partId = id;
}

function prepareGarment(root) {
  var yInfo = garmentYInfo(root);
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    uniquifyMeshMaterials(obj);
    assignMeshParts(obj, yInfo);
    obj.userData.uvBounds = uvBoundsOf(obj);
    obj.castShadow = false;
  });
}

function artPanelTexture(art, hex) {
  var size = 1024;
  var c = art._panel;
  if (!c) {
    c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    art._panel = c;
  }
  var ctx = c.getContext("2d");
  ctx.fillStyle = hex || "#00aea7";
  ctx.fillRect(0, 0, size, size);
  var img = art.texture && art.texture.image;
  if (img && img.width) {
    var aspect = img.width / Math.max(img.height, 1);
    var cover = Math.min(0.9, Math.max(0.08, 0.38 * (art.repeat || 1)));
    var w = size * cover;
    var h = w / aspect;
    if (h > size * 0.9) {
      h = size * 0.9;
      w = h * aspect;
    }
    var x = (size - w) / 2 + (art.offsetX || 0) * size;
    var y = (size - h) / 2 - (art.offsetY || 0) * size;
    ctx.drawImage(img, x, y, w, h);
  }
  if (!art.panelTex) {
    art.panelTex = new THREE.CanvasTexture(c);
    art.panelTex.colorSpace = THREE.SRGBColorSpace;
    art.panelTex.flipY = false;
    art.panelTex.wrapS = THREE.ClampToEdgeWrapping;
    art.panelTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  art.panelTex.needsUpdate = true;
  return art.panelTex;
}

function fitTextureToUv(tex, bounds, repeatMul, offX, offY) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  var rep = repeatMul || 1;
  if (bounds) {
    var spanU = Math.max(Math.abs(bounds.maxU - bounds.minU), 1e-4);
    var spanV = Math.max(Math.abs(bounds.maxV - bounds.minV), 1e-4);
    tex.repeat.set(rep / spanU, rep / spanV);
    tex.offset.set(-bounds.minU * tex.repeat.x + (offX || 0), -bounds.minV * tex.repeat.y + (offY || 0));
  } else {
    tex.repeat.set(rep, rep);
    tex.offset.set(offX || 0, offY || 0);
  }
  tex.needsUpdate = true;
}

function shouldSolidRecolor(partId) {
  if (!partId || partId === "stitch") return false;
  var p = currentProduct();
  return !!(p && p.solidRecolor);
}

function tintMaterial(mesh, m, partId) {
  if (!m) return;
  if (isUpcProduct()) {
    var blob = upcNameBlob(mesh, m);
    if (partId === "embroidery" || UPC_EMB_NAME_RE.test(blob)) partId = "embroidery";
    else if (UPC_TRIM_NAME_RE.test(blob)) partId = "trim";
    else partId = "body";
  }
  if (!partId) return;
  var hex = partId === "body" ? "#000000" : state.colors[partId];
  var art = state.art[partId];
  if (hex && m.color) m.color.set(hex);
  var upcBody = isUpcProduct() && partId === "body";
  if (art && art.texture && !upcBody) {
    var panel = artPanelTexture(art, hex);
    var t = panel.clone();
    t.needsUpdate = true;
    fitTextureToUv(t, mesh.userData.uvBounds, 1, 0, 0);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    m.map = t;
  } else if (upcBody || shouldSolidRecolor(partId)) {
    // Drop the purple CLO Taslan jpeg so cuff + shell are solid black.
    m.map = null;
    if (m.alphaMap) m.alphaMap = null;
    m.transparent = false;
    m.opacity = 1;
    if (m.alphaTest) m.alphaTest = 0;
  } else if (m.userData && m.userData.baseMap) {
    m.map = m.userData.baseMap;
  } else {
    m.map = null;
  }
  if (m.emissive) {
    var overlay = partId === "stitch" && (m.transparent || m.opacity < 1 || m.alphaMap);
    if (overlay && hex) {
      m.emissive.set(hex);
      m.emissiveIntensity = 0.35;
    } else if (partId === state.part) {
      m.emissive.setHex(0x36b4e5);
      m.emissiveIntensity = 0.22;
    } else {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    }
  }
  m.needsUpdate = true;
}

function applyColors() {
  if (!ctx) return;
  ctx.root.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    if (Array.isArray(obj.material)) {
      obj.material.forEach(function (m, i) {
        if (isHardware(obj) && HARDWARE_RE.test(String((m && m.name) || "").toLowerCase())) return;
        var partId = (obj.userData.partIds && obj.userData.partIds[i]) || (m && m.userData && m.userData.partId);
        tintMaterial(obj, m, partId);
      });
      return;
    }
    if (isHardware(obj)) return;
    var partId = obj.userData.partId || (obj.material.userData && obj.material.userData.partId);
    tintMaterial(obj, obj.material, partId);
  });
}

function setPartArt(partId, dataUrl, filename) {
  if (!partId || !dataUrl) return;
  texLoader.load(dataUrl, function (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    var prev = state.art[partId];
    var img = tex.image;
    state.art[partId] = {
      dataUrl: dataUrl,
      filename: filename || (prev && prev.filename) || "art.png",
      texture: tex,
      repeat: (prev && prev.repeat) || 1,
      offsetX: prev && typeof prev.offsetX === "number" ? prev.offsetX : 0,
      offsetY: prev && typeof prev.offsetY === "number" ? prev.offsetY : 0,
      aspect: img && img.height ? img.width / img.height : 1,
    };
    applyColors();
    syncPalette();
    openPatternPlacer(partId, dataUrl, filename, state.art[partId].aspect, true);
  });
}

function clearPartArt(partId) {
  delete state.art[partId];
  applyColors();
  syncPalette();
}

function isDuckOrMissing(url) {
  if (!url) return true;
  var path = String(url).split("?")[0].toLowerCase();
  if (path === "/3d/model.glb" || path.indexOf("/3d/model.glb") !== -1) return true;
  return false;
}

function clearRoot() {
  while (ctx.root.children.length) ctx.root.remove(ctx.root.children[0]);
}

function proceduralUpc(scene) {
  var g = new THREE.Group();
  g.name = "procedural-upc";
  function mat(hex) {
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.62,
      metalness: 0.04,
    });
  }
  function mitt(x) {
    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 8, 16), mat(state.colors.body || "#000000"));
    body.name = "body";
    body.position.set(x, 0.95, 0);
    body.rotation.z = x < 0 ? 0.18 : -0.18;
    var cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.145, 0.1, 16), mat(state.colors.body || "#000000"));
    cuff.name = "body";
    cuff.position.set(x + (x < 0 ? -0.07 : 0.07), 0.78, 0);
    g.add(body, cuff);
  }
  mitt(-0.28);
  mitt(0.28);
  scene.add(g);
  return g;
}

function showLogoLoader(msg) {
  var el = document.getElementById("suit-logo-loader");
  var p = document.getElementById("suit-logo-loader-msg");
  if (p) p.textContent = msg || "Loading garment…";
  if (el) el.hidden = false;
}

function hideLogoLoader() {
  var el = document.getElementById("suit-logo-loader");
  if (el) el.hidden = true;
}

function showStandIn(note, msg) {
  clearRoot();
  if (note) note.textContent = "";
  showLogoLoader(msg);
}

function frameRoot() {
  if (!ctx || !ctx.controls) return;
  var box = new THREE.Box3().setFromObject(ctx.root);
  if (box.isEmpty()) return;
  var size = box.getSize(new THREE.Vector3());
  var center = box.getCenter(new THREE.Vector3());
  ctx.controls.target.copy(center);
  var maxDim = Math.max(size.x, size.y, size.z, 0.2);
  var dist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov * 0.5)));
  dist *= 1.55;
  ctx.camera.position.set(center.x + dist * 0.55, center.y + dist * 0.08, center.z + dist * 0.9);
  ctx.camera.near = Math.max(maxDim / 200, 0.01);
  ctx.camera.far = maxDim * 40;
  ctx.camera.updateProjectionMatrix();
  ctx.controls.update();
}

function loadStyle() {
  applyProductColorway();
  var note = document.getElementById("clo-note");
  var style = currentProduct();
  var urls = currentGlbCandidates().filter(function (u) { return !isDuckOrMissing(u); });
  ensure3d();
  var label = (style ? style.name : "Garment") + " · " + (currentFit() ? currentFit().name : "");
  if (!urls.length) {
    showStandIn(note, "This 3D file isn’t ready yet.");
    return;
  }
  showLogoLoader("Loading garment…");
  if (note) note.textContent = "";
  clearRoot();
  var loader = new GLTFLoader();
  var attempt = 0;
  var loadGen = (loadStyle._gen = (loadStyle._gen || 0) + 1);
  function failAll() {
    if (loadGen !== loadStyle._gen) return;
    if (style) style.awaitingGlb = true;
    highlightProducts();
    showStandIn(note, "Couldn’t load the 3D file.");
  }
  function onLoaded(gltf, thisUrl) {
    if (loadGen !== loadStyle._gen) return;
    clearRoot();
    ctx.root.add(gltf.scene);
    prepareGarment(ctx.root);
    applyColors();
    frameRoot();
    hideLogoLoader();
    var mapped = [];
    ctx.root.traverse(function (obj) {
      if (!obj.isMesh) return;
      if (obj.userData.partIds) {
        obj.userData.partIds.forEach(function (pid, i) {
          var mn = obj.material[i] && obj.material[i].name;
          mapped.push((obj.name || "mesh") + "[" + i + "] " + mn + "→" + pid);
        });
      } else if (obj.userData.partId) {
        var one = obj.material && obj.material.name;
        mapped.push((obj.name || "mesh") + " " + one + "→" + obj.userData.partId);
      }
    });
    console.info("Hoodoo CLO part map", mapped, thisUrl);
    if (style) style.awaitingGlb = false;
    highlightProducts();
    if (isUpcProduct() && !garmentHasPart("trim")) {
      note.textContent = "CLO3D · " + label + " · body + cuff black. Trim not in this export yet — add in CLO and re-export UPC.glb.";
    } else {
      note.textContent = "CLO3D · " + label + " · click a panel, then a color";
    }
    syncPalette();
  }
  function tryUrl() {
    if (loadGen !== loadStyle._gen) return;
    if (attempt >= urls.length) {
      failAll();
      return;
    }
    var thisUrl = urls[attempt++];
    loader.load(
      encodeURI(thisUrl),
      function (gltf) { onLoaded(gltf, thisUrl); },
      undefined,
      function () { tryUrl(); }
    );
  }
  tryUrl();
}

function jobPayload() {
  var sizing = {};
  ["height", "weight", "chest", "waist", "torso", "leg", "inseam", "arm"].forEach(function (k) {
    var el = document.getElementById("sz-" + k);
    if (el) sizing[k] = el.value;
  });
  sizing.units = document.getElementById("sz-units").value;
  sizing.fit = state.fit;
  sizing.gender = state.fit;
  var prod = currentProduct();
  var key = (prod ? prod.id : "garment") + "-" + state.fit;
  var art = {};
  Object.keys(state.art).forEach(function (pid) {
    if (state.art[pid] && state.art[pid].dataUrl) art[pid] = state.art[pid].dataUrl;
  });
  var parts = {};
  var partDetails = {};
  var embroideryText = String(state.embroideryText || "").trim();
  currentParts().forEach(function (p) {
    var hex = p.id === "body" ? "#000000" : (state.colors[p.id] || "#000000");
    var name = nameForPartColor(p.id, hex);
    var material = materialKeyForPart(p.id);
    parts[p.id] = hex;
    partDetails[p.id] = { hex: hex, color: hex, name: name, material: material };
    if (p.id === "embroidery") {
      partDetails[p.id].embroideryText = embroideryText;
    }
  });
  return {
    jobId: "hoodoo-" + key + "-" + Date.now(),
    pattern: key,
    product: prod ? prod.id : "",
    productName: prod ? prod.name : "",
    fit: state.fit,
    parts: parts,
    partDetails: partDetails,
    embroideryText: embroideryText,
    art: art,
    sizing: sizing,
    suitType: state.suitType || "standard",
    handles: state.handles || "none",
    extras: {
      booties: !!(state.extras && state.extras.booties),
      cordura: !!(state.extras && state.extras.cordura),
      embroidery: !!(state.extras && state.extras.embroidery),
    },
    notes: "Hoodoo configurator",
  };
}

function downloadPack() {
  var st = document.getElementById("pack-status");
  st.textContent = "Building print & cut pack…";
  fetch("/api/production/pack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jobPayload()),
  })
    .then(function (r) {
      if (!r.ok) throw new Error("Pack failed");
      return r.blob();
    })
    .then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hoodoo-print-cut.zip";
      a.click();
      st.textContent = "Downloaded. COLOR + ART + CUT files are in the zip.";
    })
    .catch(function () {
      st.textContent = "Could not build pack. Try again or email the shop.";
    });
}

function emailBuild() {
  var j = jobPayload();
  var body = [
    "Hoodoo build: " + (j.productName || j.pattern) + " · " + j.fit,
    "Garment: " + (j.productName || j.product),
    "Fit: " + j.fit,
    "Suit type: " + (j.suitType || "standard"),
    "Handles: " + (j.handles || "none"),
    "Options: booties " + ((j.extras && j.extras.booties) ? "yes" : "no") + ", cordura " + ((j.extras && j.extras.cordura) ? "yes" : "no"),
    "Embroidery text: " + (j.embroideryText || "(none)"),
    "Colors: " + JSON.stringify(j.partDetails || j.parts, null, 2),
    "Art parts: " + (Object.keys(j.art || {}).join(", ") || "none"),
    "Sizing: " + JSON.stringify(j.sizing, null, 2),
  ].join("\n");
  window.location.href =
    "mailto:shannnon@hoodooak.com?subject=" +
    encodeURIComponent("Hoodoo build — " + (j.productName || j.pattern) + " " + j.fit) +
    "&body=" +
    encodeURIComponent(body);
}

document.getElementById("suit-steps").addEventListener("click", function (e) {
  var b = e.target.closest("button");
  if (b) go(Number(b.dataset.step));
});
document.getElementById("to-sizing").addEventListener("click", function () { go(3); });
document.getElementById("btn-pack").addEventListener("click", downloadPack);
document.getElementById("btn-suit-email").addEventListener("click", emailBuild);
buildSizeFit();
["sz-height", "sz-weight", "sz-chest", "sz-waist", "sz-torso", "sz-leg", "sz-inseam", "sz-arm"].forEach(function (id) {
  var el = document.getElementById(id);
  if (!el) return;
  var key = id.replace("sz-", "");
  el.addEventListener("focus", function () {
    document.getElementById("measure-title").textContent = key.charAt(0).toUpperCase() + key.slice(1);
    document.getElementById("measure-copy").textContent = MEASURES[key] || "";
    if (window.hoodooSizeMeasure) window.hoodooSizeMeasure(key);
  });
});

buildParts();
bindPalette();
bindRail();
bindOverlay();
window.addEventListener("hoodoo-color", function (e) {
  if (!e.detail) return;
  if (e.detail.part && currentParts().some(function (p) { return p.id === e.detail.part; })) {
    state.part = e.detail.part;
  }
  setPartColor(e.detail.color, e.detail.name);
});

function applyMaterialsData(data) {
  if (!data || typeof data !== "object") return;
  materials = Object.assign({}, FALLBACK_MATERIALS, data);
  if (data.taslan) materials.taslan = data.taslan;
  if (data.spandex) materials.spandex = data.spandex;
  if (data.stitch) materials.stitch = data.stitch;
  if (data.body) materials.body = data.body;
  if (data.embroidery) materials.embroidery = data.embroidery;
  if (data.parts) materials.parts = Object.assign({}, FALLBACK_MATERIALS.parts, data.parts);
  currentParts().forEach(function (p) { snapPartToStock(p.id); });
  buildParts();
  syncPalette();
  applyColors();
}

fetch(MATERIALS_URL)
  .then(function (r) { return r.json(); })
  .then(applyMaterialsData)
  .catch(function () {
    applyMaterialsData(FALLBACK_MATERIALS);
  });

function applyDeepLink() {
  var params = new URLSearchParams(window.location.search);
  var pid = (params.get("product") || params.get("garment") || "").trim();
  var fit = (params.get("fit") || "").trim();
  var found = pid && products().some(function (p) { return p.id === pid; });
  if (found) state.product = pid;
  syncProductFit();
  if (fit && productFits().some(function (f) { return f.id === fit; })) {
    setFit(fit);
  }
  highlightProducts();
  if (found || params.get("step") === "2") go(2);
}

fetch("/3d/clo/manifest.json?v=" + CACHE_V, { cache: "no-store" })
  .then(function (r) { return r.json(); })
  .then(function (m) {
    manifest = m;
    state.meshMap = Object.assign({}, state.meshMap, m.meshMap || {});
    if (m.materialsUrl && !materials.taslan) {
      fetch(m.materialsUrl + (m.materialsUrl.indexOf("?") === -1 ? "?v=" + CACHE_V : ""))
        .then(function (r) { return r.json(); })
        .then(applyMaterialsData)
        .catch(function () {});
    }
    buildPatternCards();
    applyDeepLink();
  })
  .catch(function () {
    buildPatternCards();
    applyDeepLink();
  });
