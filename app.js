"use strict";

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
}
const LABEL = { halal: "Halal", douteux: "Douteux", haram: "Haram", inconnu: "À vérifier" };
const ORDRE = { haram: 0, douteux: 1, inconnu: 2, halal: 3 };

/* ---------- Données ---------- */
let DB = [];
const byCode = new Map();
let matchers = [];   // { entry, re }

function parseCode(c) {
  const m = /^e\s*-?(\d{3,4})([a-z]{0,2})/i.exec(c || "");
  return m ? "E" + m[1] + m[2].toLowerCase() : null;
}
const isE = e => /^E\d/.test(e.code);

function sortKey(e) {
  const m = /^E(\d+)([a-z]*)/.exec(e.code);
  return m ? [0, +m[1], m[2]] : [1, 0, norm(e.nom)];
}
function cmp(a, b) {
  const x = sortKey(a), y = sortKey(b);
  return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
}

async function loadData() {
  const r = await fetch("data/additifs.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("data");
  const d = await r.json();
  DB = d.additifs.slice().sort(cmp);
  for (const e of DB) {
    byCode.set(e.code, e);
    const terms = new Set();
    (e.alias || []).forEach(a => terms.add(norm(a)));
    const base = norm(e.nom.split("(")[0].trim());
    if (base.length >= 5 && !(!isE(e) && (e.alias || []).length)) terms.add(base);
    if (!isE(e) && !(e.alias || []).length) terms.add(norm(e.nom));
    const list = [...terms].filter(t => t.length >= 3);
    if (list.length) matchers.push({ entry: e, re: new RegExp("(^|[^a-z0-9])(" + list.map(esc).join("|") + ")(?![a-z0-9])", "g") });
  }
}

/* ---------- Liste et recherche ---------- */
let filtre = "tous";
function haystack(e) { return norm([e.code, e.nom, ...(e.alias || [])].join(" ")); }
function renderList() {
  const q = norm($("#q").value).trim();
  let items = DB.filter(e => filtre === "tous" || e.statut === filtre);
  if (q) {
    const codeQ = /^e?\s*(\d{2,4}[a-z]?)$/.exec(q);
    items = codeQ
      ? items.filter(e => e.code.toLowerCase().startsWith("e" + codeQ[1]))
      : items.filter(e => haystack(e).includes(q));
  }
  const ul = $("#list");
  ul.replaceChildren(...items.map(e => rowFor(e)));
  $("#count").textContent = items.length ? items.length + (items.length > 1 ? " fiches" : " fiche") : "";
  $("#empty").hidden = items.length > 0;
}
function rowFor(e, withInfo = true) {
  const sub = e.origine ? e.origine.charAt(0).toUpperCase() + e.origine.slice(1) : "";
  return h("li", {}, h("button", { type: "button", class: "row", onclick: () => openSheet(e), "aria-label": `${e.code} ${e.nom}, ${LABEL[e.statut]}. Voir les avis` },
    h("span", { class: "code" }, isE(e) ? e.code : "•"),
    h("span", { class: "name" }, e.nom, sub ? h("small", {}, sub) : null),
    h("span", { class: "pill " + e.statut }, LABEL[e.statut]),
    withInfo ? h("span", { class: "info", "aria-hidden": "true" }, "i") : null));
}

/* ---------- Fiche détail (bouton i) ---------- */
const sheet = $("#sheet");
function openSheet(e) {
  const kicker = { halal: "Halal d'après les sources", douteux: "Douteux : les avis divergent", haram: "Haram d'après les sources" }[e.statut];
  const list = (arr, none) => arr && arr.length ? h("ul", {}, arr.map(t => h("li", {}, t))) : h("p", { class: "none" }, none);
  const srcs = (e.sources || []).filter(s => /^https?:\/\//.test(s.url));
  sheet.querySelector("#sheetBody").replaceChildren(
    h("div", { class: "sheet-head " + e.statut },
      h("div", { class: "kicker" }, kicker),
      h("h2", { id: "sheetTitle" }, isE(e) ? `${e.code} · ${e.nom}` : e.nom),
      h("p", {}, e.resume)),
    h("div", { class: "sheet-body" },
      e.origine ? [h("h3", {}, "Origine"), h("p", {}, e.origine.charAt(0).toUpperCase() + e.origine.slice(1))] : null,
      h("h3", {}, "Pourquoi c'est permis"),
      list(e.pour, "Aucun avis favorable trouvé dans nos sources."),
      h("h3", {}, "Pourquoi c'est interdit"),
      list(e.contre, "Aucun avis contraire trouvé dans nos sources."),
      e.fiabilite === "limitée" ? h("p", { class: "warn" }, "Peu de sources parlent précisément de cet ingrédient. Confirme auprès d'un savant en cas de doute.") : null,
      srcs.length ? [h("h3", {}, "Sources"), h("ul", { class: "sources" }, srcs.map(s => h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.titre || s.url))))] : null,
      h("p", { class: "disc" }, "Information à titre indicatif. Elle ne remplace pas l'avis d'un savant.")),
    h("button", { type: "button", class: "close", onclick: () => sheet.close() }, "Fermer"));
  sheet.showModal();
  sheet.scrollTop = 0;
}
sheet.addEventListener("click", ev => { if (ev.target === sheet) sheet.close(); });

/* ---------- Analyse d'une liste d'ingrédients ---------- */
function analyse(text, additivesTags) {
  const found = new Map();      // code -> entry
  const unknown = new Set();    // codes E hors base
  const t = norm(text);

  const addCode = raw => {
    const c = parseCode(raw);
    if (!c) return;
    const e = byCode.get(c);
    if (e) found.set(e.code, e);
    else unknown.add(c);
  };
  (additivesTags || []).forEach(tag => addCode(tag.replace(/^[a-z]{2}:/, "")));
  for (const m of t.matchAll(/(?:^|[^a-z0-9])(e\s?-?\d{3,4}[a-z]{0,2})(?![a-z0-9])/g)) addCode(m[1]);

  const hits = [];
  for (const { entry, re } of matchers) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const start = m.index + m[1].length;
      if (t.slice(Math.max(0, start - 5), start) === "sans ") continue;   // « sans alcool »
      hits.push({ entry, start, end: start + m[2].length });
    }
  }
  // « vinaigre de vin » ne doit pas aussi compter comme « vin » : on garde le terme le plus long
  for (const h of hits) {
    const covered = hits.some(o => o.entry !== h.entry && o.start <= h.start && o.end >= h.end && (o.end - o.start) > (h.end - h.start));
    if (!covered) found.set(h.entry.code, h.entry);
  }
  for (const c of [...unknown]) if (found.has(c)) unknown.delete(c);
  // un code absent mais dont le parent (ex. E150) est connu n'est plus « inconnu »
  for (const c of [...unknown]) {
    const parent = /^(E\d+)[a-z]+$/.exec(c);
    if (parent && found.has(parent[1])) unknown.delete(c);
  }
  return { items: [...found.values()].sort((a, b) => ORDRE[a.statut] - ORDRE[b.statut] || cmp(a, b)), unknown: [...unknown].sort() };
}

function verdictOf(items, unknown, hasText) {
  if (items.some(i => i.statut === "haram")) return "haram";
  if (items.some(i => i.statut === "douteux")) return "douteux";
  if (!hasText || unknown.length) return "inconnu";
  return "halal";
}
function verdictText(v, items, unknown, hasText) {
  const n = k => items.filter(i => i.statut === k).length;
  if (!hasText) return "La liste d'ingrédients de ce produit n'est pas disponible. Colle-la ci-dessous pour l'analyser.";
  if (v === "haram") return `${n("haram")} ingrédient${n("haram") > 1 ? "s" : ""} haram trouvé${n("haram") > 1 ? "s" : ""}.`;
  if (v === "douteux") return `${n("douteux")} ingrédient${n("douteux") > 1 ? "s" : ""} à vérifier : les avis divergent.`;
  if (v === "inconnu") return `${unknown.length} additif${unknown.length > 1 ? "s" : ""} pas encore dans notre base : ${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? "…" : ""}.`;
  return "Aucun ingrédient douteux trouvé dans la liste.";
}
const VIANDE = /\b(viande|poulet|boeuf|dinde|agneau|veau|canard|volaille|jambon|saucisse|merguez|kebab|lardons?|charcuterie|chicken|beef|turkey|lamb|poultry|meat|ham|sausage)\b/;

/* ---------- Résultat produit ---------- */
function showView(name) {
  $("#home").hidden = name !== "home";
  $("#result").hidden = name !== "result";
  window.scrollTo(0, 0);
}
function goResult() { if (!history.state || history.state.v !== "result") history.pushState({ v: "result" }, ""); showView("result"); }
function goHome() { showView("home"); }
window.addEventListener("popstate", () => { showView("home"); });
document.addEventListener("click", ev => {
  if (ev.target.closest("[data-back]")) { if (history.state && history.state.v === "result") history.back(); else goHome(); }
});

function renderAnalysis(container, text, tags, labels) {
  const hasText = norm(text).trim().length > 0;
  const { items, unknown } = analyse(text, tags);
  const v = verdictOf(items, unknown, hasText);
  const halalLabel = (labels || []).some(l => /(^|:)(halal|halal-certified|certified-halal)/.test(l) || /halal/.test(l));
  const nodes = [
    h("div", { class: "verdict " + v, role: "status" },
      h("div", { class: "big" }, LABEL[v]),
      h("p", {}, verdictText(v, items, unknown, hasText))),
  ];
  if (halalLabel) nodes.push(h("p", { class: "note" }, "L'emballage porte une mention halal. Vérifie l'organisme de certification."));
  else if (hasText && VIANDE.test(norm(text))) nodes.push(h("p", { class: "note" }, "Ce produit contient de la viande. Sans certification, on ne peut pas savoir si l'abattage est halal."));
  if (items.length) {
    nodes.push(h("h3", { class: "sec" }, "Ce qu'on a trouvé dedans"));
    nodes.push(h("ul", { class: "list" }, items.map(e => rowFor(e))));
  }
  if (unknown.length) {
    nodes.push(h("h3", { class: "sec" }, "Pas encore dans notre base"));
    nodes.push(h("ul", { class: "list" }, unknown.map(c => h("li", {}, h("div", { class: "row" },
      h("span", { class: "code" }, c), h("span", { class: "name" }, "Aucun avis trouvé pour l'instant"), h("span", { class: "pill inconnu" }, LABEL.inconnu))))));
  }
  if (hasText) nodes.push(h("details", { class: "raw" }, h("summary", {}, "Liste d'ingrédients analysée"), h("p", {}, text)));
  nodes.push(h("p", { class: "disc" }, "Analyse faite sur la liste d'ingrédients. Elle ne remplace ni une certification halal ni l'avis d'un savant."));
  container.replaceChildren(...nodes);
}

function pasteBox(onAnalyse) {
  const ta = h("textarea", { rows: 4, placeholder: "Colle ici la liste d'ingrédients", "aria-label": "Liste d'ingrédients", style: "width:100%;border-radius:14px;border:2px solid var(--line);padding:12px;background:var(--card);color:var(--ink);font:inherit" });
  return h("div", { class: "pastebox" }, ta,
    h("button", { type: "button", class: "close", style: "width:100%;margin:10px 0 0", onclick: () => onAnalyse(ta.value) }, "Analyser"));
}

async function lookup(barcode) {
  const body = $("#resultBody");
  goResult();
  body.replaceChildren(h("p", { class: "loading" }, "Recherche du produit…"));
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,ingredients_text,ingredients_text_fr,additives_tags,image_front_small_url,labels_tags`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.status !== 1 || !d.product) {
      body.replaceChildren(
        h("div", { class: "verdict inconnu" }, h("div", { class: "big" }, "Produit introuvable"),
          h("p", {}, `Le code ${barcode} n'est pas dans la base Open Food Facts. Tu peux coller sa liste d'ingrédients pour l'analyser.`)),
        h("div", { id: "manualResult" }), pasteBox(t => renderAnalysis($("#manualResult"), t, [], [])));
      return;
    }
    const p = d.product;
    const text = p.ingredients_text_fr || p.ingredients_text || "";
    const head = h("div", { class: "product" },
      p.image_front_small_url && /^https:\/\//.test(p.image_front_small_url) ? h("img", { src: p.image_front_small_url, alt: "", width: 72, height: 72 }) : null,
      h("div", {}, h("h2", {}, p.product_name || "Produit sans nom"), p.brands ? h("p", {}, p.brands) : null));
    const out = h("div", { id: "analysis" });
    body.replaceChildren(head, out);
    renderAnalysis(out, text, p.additives_tags, p.labels_tags);
    if (!text.trim()) out.append(pasteBox(t => renderAnalysis(out, t, p.additives_tags, p.labels_tags)));
  } catch (err) {
    body.replaceChildren(h("div", { class: "verdict inconnu" }, h("div", { class: "big" }, "Connexion impossible"),
      h("p", {}, "Impossible de joindre Open Food Facts. Vérifie ta connexion et réessaie.")),
      h("button", { type: "button", class: "close", style: "width:100%;margin:0", onclick: () => lookup(barcode) }, "Réessayer"));
  }
}

/* ---------- Scanner ---------- */
const scanner = $("#scanner"), video = $("#video"), reader = $("#reader"), msg = $("#scanMsg");
let stream = null, raf = 0, html5 = null, scanning = false;

function stopScanner() {
  scanning = false;
  cancelAnimationFrame(raf);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.srcObject = null; video.hidden = true;
  if (html5) { const h5 = html5; html5 = null; h5.stop().catch(() => {}).finally(() => { try { h5.clear(); } catch (e) {} }); }
  reader.hidden = true;
  scanner.hidden = true;
  document.body.style.overflow = "";
}
function onCode(raw) {
  const code = String(raw || "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14 || !scanning) return;
  stopScanner();
  lookup(code);
}
function loadLib() {
  return new Promise((res, rej) => {
    if (window.Html5Qrcode) return res();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
    s.onload = res; s.onerror = () => rej(new Error("lib"));
    document.head.append(s);
  });
}
async function openScanner() {
  scanner.hidden = false; scanning = true;
  document.body.style.overflow = "hidden";
  msg.textContent = "Place le code-barres dans le cadre.";
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("nocam");
    let detector = null;
    if ("BarcodeDetector" in window) {
      try {
        const sup = await BarcodeDetector.getSupportedFormats();
        const formats = sup.filter(f => ["ean_13", "ean_8", "upc_a", "upc_e"].includes(f));
        if (formats.length) detector = new BarcodeDetector({ formats });
      } catch (e) { detector = null; }
    }
    if (detector) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream; video.hidden = false;
      await video.play();
      let last = 0;
      const tick = async ts => {
        if (!scanning) return;
        if (ts - last > 160) {
          last = ts;
          try { const c = await detector.detect(video); if (c.length) return onCode(c[0].rawValue); } catch (e) {}
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else {
      msg.textContent = "Chargement du lecteur…";
      await loadLib();
      reader.hidden = false;
      html5 = new Html5Qrcode("reader", { formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E], verbose: false });
      await html5.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 280, height: 150 } }, txt => onCode(txt), () => {});
      msg.textContent = "Place le code-barres dans le cadre.";
    }
  } catch (err) {
    msg.textContent = err && err.message === "lib"
      ? "Le lecteur n'a pas pu se charger. Tape le numéro du code-barres ci-dessous."
      : "Caméra indisponible. Autorise l'accès à la caméra, ou tape le numéro ci-dessous.";
  }
}

/* ---------- Démarrage ---------- */
$("#scanBtn").addEventListener("click", openScanner);
$("#scanClose").addEventListener("click", stopScanner);
$("#manualForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const v = $("#manual").value.replace(/\D/g, "");
  if (v.length < 8 || v.length > 14) { msg.textContent = "Le code-barres a entre 8 et 14 chiffres."; return; }
  scanning = true; onCode(v);
});
$("#searchForm").addEventListener("submit", ev => { ev.preventDefault(); $("#q").blur(); });
$("#q").addEventListener("input", renderList);
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach(x => { x.classList.toggle("on", x === c); x.setAttribute("aria-pressed", x === c); });
  filtre = c.dataset.f; renderList();
}));

loadData().then(renderList).catch(() => {
  $("#count").textContent = "Impossible de charger les données. Réessaie dans un instant.";
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
