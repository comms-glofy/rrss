/* Glofy · Calendario RRSS
   Una sola lógica para las dos páginas:
   - index.html  (data-mode="view")  → vista de gerencia, solo lectura.
   - editor.html (data-mode="edit")  → edición de Comms, guarda en GitHub con un token personal.
   La fuente de verdad es data/posts.json en el repo comms-glofy/rrss. */

const REPO = { owner: "comms-glofy", repo: "rrss", branch: "main", path: "data/posts.json" };
const API_FILE = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${REPO.path}`;
const API_REPO = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;
const TOKEN_KEY = "rrss-gh-token";
const MODE = document.body.dataset.mode === "edit" ? "edit" : "view";

const STATUSES = [
  { k: "borrador", l: "Borrador", c: "--st-borrador" },
  { k: "revision", l: "En revisión", c: "--st-revision" },
  { k: "cambios", l: "Cambios pedidos", c: "--st-cambios" },
  { k: "aprobado", l: "Aprobado", c: "--st-aprobado" },
  { k: "publicado", l: "Publicado", c: "--st-publicado" }];
const ST = Object.fromEntries(STATUSES.map(s => [s.k, s]));
const ORDER = ["revision", "cambios", "aprobado", "borrador", "publicado"];
const GROUP_SUB = { revision: "Esperan la revisión de gerencia", cambios: "Comms está ajustando", aprobado: "Listos para publicar", borrador: "En preparación", publicado: "Ya salieron" };
const FORMATS = ["Slider", "Reel", "Animación", "Carrusel", "Estático", "Historia", "Video"];
const LIMITS = { ig: 2200, li: 3000 };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parse = s => { if (!s) return null; const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); };
const fmtDay = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" });
const fmtStamp = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const safeUrl = u => /^https:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
const b64e = s => { const b = new TextEncoder().encode(s); let bin = ""; for (const x of b) bin += String.fromCharCode(x); return btoa(bin); };
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0)));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } };

/* ---------- Drive ---------- */
function driveId(u) {
  u = String(u || "");
  if (!/google\.com/.test(u)) return null;
  const m = u.match(/\/file\/d\/([\w-]{10,})/) || u.match(/\/document\/d\/([\w-]{10,})/) || u.match(/\/presentation\/d\/([\w-]{10,})/) || u.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
}
const isFolder = u => /\/folders\//.test(String(u || ""));
const thumbUrl = u => { const id = driveId(u); if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`; const s = safeUrl(u); return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(s) ? s : ""; };
const embedUrl = u => { const id = driveId(u); return id ? `https://drive.google.com/file/d/${id}/preview` : ""; };
const mediaList = p => (p.media || []).map(safeUrl).filter(Boolean);

/* ---------- Estado ---------- */
const S = {
  posts: [], updatedAt: null, sha: null, loaded: false, err: null, token: lsGet(TOKEN_KEY), login: null,
  status: "all", ch: "all", openId: null, editing: false, isNew: false, draft: null, tab: "ig", mi: 0, confirmDel: false, busy: false
};
const isEdit = () => MODE === "edit";

function toast(html) { const t = $("#toast"); t.innerHTML = html; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2800); }

/* ---------- GitHub ---------- */
function ghHeaders() { const h = { Accept: "application/vnd.github+json" }; if (S.token) h.Authorization = "Bearer " + S.token; return h; }
async function fetchFile() {
  const r = await fetch(`${API_FILE}?ref=${REPO.branch}&_=${Date.now()}`, { headers: ghHeaders(), cache: "no-store" });
  if (r.status === 404) return { data: { posts: [] }, sha: null };
  if (!r.ok) { const e = new Error("gh " + r.status); e.status = r.status; throw e; }
  const j = await r.json();
  return { data: JSON.parse(b64d(j.content)), sha: j.sha };
}
async function load() {
  try {
    let res;
    try { res = await fetchFile(); }
    catch (e) {
      if (isEdit()) throw e;
      // Vista de gerencia: si la API no responde (p. ej. límite por hora), uso la copia publicada en Pages.
      const r = await fetch("data/posts.json?_=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw e;
      res = { data: await r.json(), sha: null };
    }
    S.posts = Array.isArray(res.data.posts) ? res.data.posts : [];
    S.updatedAt = res.data.updatedAt || null;
    S.sha = res.sha; S.loaded = true; S.err = null;
  } catch (e) {
    S.err = e.status === 401 ? { t: "El token de GitHub no es válido", d: "Desconectate y volvé a conectar con un token nuevo." }
      : { t: "No se pudieron traer los posteos", d: "Revisá tu conexión y tocá Actualizar." };
  }
  render();
  if (S.openId && !S.editing) renderDrawer();
  if (S.loaded && !S._hashDone) { S._hashDone = true; const h = location.hash.slice(1); if (h && S.posts.some(p => p.id === h)) openPost(h); }
}
/* Lee la última versión, aplica el cambio y la guarda. Reintenta una vez si alguien guardó al mismo tiempo. */
async function mutate(fn, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await fetchFile();
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const next = fn(posts.map(p => ({ ...p })));
    const body = { version: 1, updatedAt: new Date().toISOString(), updatedBy: S.login || "", posts: next };
    const r = await fetch(API_FILE, {
      method: "PUT", headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: b64e(JSON.stringify(body, null, 2) + "\n"), branch: REPO.branch, ...(sha ? { sha } : {}) })
    });
    if (r.ok) { const j = await r.json(); S.sha = j.content.sha; S.posts = next; S.updatedAt = body.updatedAt; return; }
    if ((r.status === 409 || r.status === 422) && attempt === 0) continue;
    const e = new Error("gh " + r.status); e.status = r.status; throw e;
  }
}
function saveErr(e) {
  if (e.status === 401) return "El token venció o no es válido. Desconectate y conectá uno nuevo.";
  if (e.status === 403 || e.status === 404) return "El token no tiene permiso de escritura en comms-glofy/rrss.";
  return "No se pudo guardar en GitHub. Probá de nuevo.";
}

/* ---------- Matriz 2026 (solo editor) ---------- */
function linkify(text) { return esc(text).replace(/((?:https?:\/\/)?(?:[\w-]+\.)*glofy\.co(?:\/[\w\-\/?=&#.]*)?)/gi, '<span class="lnk">$1</span>'); }
function matrixChecks(p) {
  const all = (p.copyEs || "") + "\n" + (p.copyEn || ""); const out = [];
  const emoji = /\p{Extended_Pictographic}/u.test(all);
  out.push({ ok: !emoji, t: emoji ? "Tiene emojis. La Matriz 2026 no los usa." : "Sin emojis." });
  const q = /¿\s*sab[ií]as\s+que|did you know/i.test(all);
  out.push({ ok: !q, t: q ? "Abre con formato “¿Sabías que…?”. Pasalo a una afirmación." : "Sin aperturas del tipo “¿Sabías que…?”." });
  const cta = /glofy\.co/i.test(all);
  out.push({ ok: cta, t: cta ? "El CTA dirige a glofy.co." : "No hay CTA a glofy.co (jobs, checker o web)." });
  const ch = p.channels || [];
  if (ch.includes("ig") && !p.copyEs || ch.includes("li") && !p.copyEn) out.push({ ok: false, t: "Falta el copy de uno de los canales marcados." });
  if (!mediaList(p).length) out.push({ ok: false, t: "No hay links a las piezas: gerencia no va a ver la vista previa." });
  return out;
}

/* ---------- Tablero ---------- */
const chOk = p => S.ch === "all" || (p.channels || []).includes(S.ch);
const sorted = () => [...S.posts].sort((a, b) => (a.date && b.date) ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : (b.updatedAt || "").localeCompare(a.updatedAt || ""));
function render() {
  document.querySelectorAll("[data-ch]").forEach(b => b.setAttribute("aria-pressed", b.dataset.ch === S.ch));
  $("#updated").textContent = S.updatedAt ? "Actualizado " + fmtStamp.format(new Date(S.updatedAt)) : "";
  const list = sorted().filter(chOk);
  const counts = Object.fromEntries(STATUSES.map(s => [s.k, list.filter(p => p.status === s.k).length]));
  $("#pipeline").innerHTML = STATUSES.map(s => `<button class="stage" style="--c:var(${s.c})" data-st="${s.k}" aria-pressed="${S.status === s.k}"><span class="l"><i></i>${s.l}</span><span class="n">${S.loaded ? counts[s.k] : "–"}</span></button>`).join("");
  $("#scopeNote").textContent = S.loaded ? `${list.length} ${list.length === 1 ? "posteo" : "posteos"}${S.ch !== "all" ? ` en ${S.ch === "ig" ? "Instagram" : "LinkedIn"}` : ""}${S.status !== "all" ? ` · filtrando por “${ST[S.status].l}”, tocá de nuevo para quitar el filtro` : ""}.` : "";
  const pend = counts.revision;
  $("#alert").innerHTML = S.loaded && pend && !isEdit() && S.status !== "revision"
    ? `<div class="alert"><span class="grow"><strong>${pend} ${pend === 1 ? "posteo espera" : "posteos esperan"} revisión.</strong></span><button class="btn lime sm" data-st="revision">Ver pendientes</button></div>` : "";
  const c = $("#content");
  if (S.err) { c.innerHTML = `<div class="state"><h3>${esc(S.err.t)}</h3><p>${esc(S.err.d)}</p><button class="btn" data-act="reload">Actualizar</button></div>`; return; }
  if (!S.loaded) { c.innerHTML = `<div class="state"><h3>Cargando posteos…</h3><p>Trayendo la última versión desde GitHub.</p></div>`; return; }
  if (!S.posts.length) { c.innerHTML = `<div class="state"><h3>Todavía no hay posteos cargados</h3><p>Cada posteo lleva formato, los copys de Instagram (ES) y LinkedIn (EN) y los links de Drive a las piezas.</p>${isEdit() ? '<button class="btn lime" data-act="new">+ Cargar el primero</button>' : ""}</div>`; return; }
  const shown = list.filter(p => S.status === "all" || p.status === S.status);
  if (!shown.length) { c.innerHTML = `<div class="state"><h3>Nada para mostrar con estos filtros</h3><p>Probá otro canal o quitá el filtro de estado.</p></div>`; return; }
  c.innerHTML = ORDER.map(k => {
    const ps = shown.filter(p => (ST[p.status] ? p.status : "borrador") === k); if (!ps.length) return "";
    const s = ST[k];
    return `<section class="group"><div class="group-h"><h3 style="--c:var(${s.c})"><i></i>${s.l}</h3><span>${ps.length} ${ps.length === 1 ? "posteo" : "posteos"} · ${GROUP_SUB[k]}</span></div><div class="cards">${ps.map(cardHTML).join("")}</div></section>`;
  }).join("");
}
function thumbHTML(u, cls = "") {
  const t = thumbUrl(u);
  if (t) return `<img class="${cls}" src="${esc(t)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'Sin acceso a la miniatura'}))">`;
  return `<div class="ph">${isFolder(u) ? "Carpeta de Drive" : "Link sin vista previa"}</div>`;
}
function cardHTML(p) {
  const st = ST[p.status] || ST.borrador; const ms = mediaList(p); const d = parse(p.date);
  const excerpt = (S.ch === "li" ? p.copyEn : p.copyEs) || p.copyEn || p.copyEs || "";
  return `<button class="card" data-open="${esc(p.id)}">
    <div class="thumb">${ms.length ? thumbHTML(ms[0]) : `<div class="ph"><span class="fmt-big">${esc(p.format || "Posteo")}</span>${safeUrl(p.driveUrl) ? "Pieza en Drive" : "Sin pieza cargada"}</div>`}
      <div class="badges"><span class="fmt">${esc(p.format || "—")}</span><span class="pill" style="--c:var(${st.c})">${st.l}</span></div>
      ${ms.length > 1 ? `<span class="count">${ms.length} piezas</span>` : ""}
    </div>
    <div class="card-b">
      <div class="when">${d ? `<span class="date-tag">Sale el ${fmtDay.format(d)}</span>` : ""}<span class="chans">${(p.channels || []).map(c => `<span class="chan">${c === "ig" ? "IG" : "IN"}</span>`).join("")}</span></div>
      <h4>${esc(p.title || "Sin título")}</h4>
      <p>${esc(excerpt)}</p>
    </div></button>`;
}

/* ---------- Panel del posteo ---------- */
const current = () => S.isNew ? S.draft : S.posts.find(p => p.id === S.openId);
function openPost(id) { S.openId = id; S.editing = false; S.isNew = false; S.mi = 0; S.confirmDel = false; S.tab = S.ch === "li" ? "li" : "ig"; history.replaceState(null, "", "#" + id); renderDrawer(); showDrawer(true); }
function openNew() {
  const id = newId(); S.openId = id; S.isNew = true; S.editing = true; S.confirmDel = false; S.mi = 0;
  S.draft = { id, title: "", date: "", format: "Reel", channels: ["ig", "li"], copyEs: "", copyEn: "", driveUrl: "", media: [], note: "", status: "borrador" };
  renderDrawer(); showDrawer(true); setTimeout(() => $("#f-title")?.focus(), 250);
}
function closeDrawer() { S.openId = null; S.editing = false; S.draft = null; S.isNew = false; showDrawer(false); history.replaceState(null, "", location.pathname + location.search); }
function showDrawer(on) { $("#drawer").classList.toggle("on", on); $("#scrim").classList.toggle("on", on); $("#drawer").setAttribute("aria-hidden", !on); document.body.style.overflow = on ? "hidden" : ""; }

function renderDrawer() {
  const dr = $("#drawer"); const p = S.editing ? S.draft : current();
  if (!p) { dr.innerHTML = S.openId && S.loaded ? `<div class="d-head"><div class="grow"><h2>Este posteo ya no existe</h2></div><button class="iconbtn" data-act="close" aria-label="Cerrar">✕</button></div>` : ""; return; }
  const st = ST[p.status] || ST.borrador; const d = parse(p.date);
  dr.innerHTML = `<div class="d-head"><div class="grow">
      <h2>${S.editing ? (S.isNew ? "Nuevo posteo" : "Editando posteo") : esc(p.title || "Sin título")}</h2>
      <div class="meta"><span class="fmt">${esc(p.format || "—")}</span><span class="pill" style="--c:var(${st.c})">${st.l}</span>${d ? `<span class="date-tag">Sale el ${fmtDay.format(d)}</span>` : ""}</div>
    </div>
    ${!S.editing && isEdit() ? `<button class="btn sm" data-act="edit">Editar</button>` : ""}
    <button class="iconbtn" data-act="close" aria-label="Cerrar">✕</button></div>
    <div class="d-body"><div class="d-col">${mediaPanel(p)}</div><div class="d-col">${S.editing ? formHTML(p) : copyPanel(p) + notePanel(p) + (isEdit() ? statusPanel(p) + checksPanel(p) : "")}</div></div>
    ${S.editing ? footHTML() : ""}`;
  if (S.editing) updCounters();
}
function mediaPanel(p) {
  const ms = mediaList(p); const i = Math.min(S.mi, Math.max(0, ms.length - 1)); const u = ms[i];
  let viewer;
  if (!u) viewer = `<div class="ph"><span class="fmt-big">${esc(p.format || "Posteo")}</span>${safeUrl(p.driveUrl) ? "La pieza está en Drive. Abrila con el botón de abajo." : "Todavía no hay pieza cargada."}</div>`;
  else if (embedUrl(u)) viewer = `<iframe src="${esc(embedUrl(u))}" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="Vista previa ${i + 1}"></iframe>`;
  else if (thumbUrl(u)) viewer = `<img src="${esc(thumbUrl(u))}" alt="Vista previa ${i + 1}" referrerpolicy="no-referrer">`;
  else viewer = `<div class="ph">${isFolder(u) ? "Este link es una carpeta. Abrila en Drive." : "Este link no tiene vista previa."}</div>`;
  const nav = ms.length > 1 ? `<button class="nav p" data-act="mprev" aria-label="Anterior">‹</button><button class="nav n" data-act="mnext" aria-label="Siguiente">›</button><span class="idx">${i + 1} / ${ms.length}</span>` : "";
  const strip = ms.length > 1 ? `<div class="strip">${ms.map((x, j) => `<button class="s" data-mi="${j}" aria-current="${j === i}">${thumbUrl(x) ? `<img src="${esc(thumbUrl(x))}" alt="" referrerpolicy="no-referrer" loading="lazy">` : (j + 1)}</button>`).join("")}</div>` : "";
  const folder = safeUrl(p.driveUrl);
  return `<div class="panel" style="padding:12px"><div class="viewer">${viewer}${nav}</div>${strip}
    <div class="media-actions">
      ${u ? `<a class="btn dark" href="${esc(u)}" target="_blank" rel="noopener">Abrir pieza en Drive ↗</a>` : ""}
      ${folder ? `<a class="btn" href="${esc(folder)}" target="_blank" rel="noopener">Carpeta del posteo ↗</a>` : ""}
    </div>
    ${u && embedUrl(u) ? `<p class="hint">Si la vista previa pide permiso, iniciá sesión con tu cuenta de Glofy en este navegador.</p>` : ""}</div>`;
}
function copyPanel(p) {
  const ch = p.channels || []; const t = S.tab; const text = t === "ig" ? p.copyEs : p.copyEn; const n = (text || "").length;
  return `<div class="panel"><div class="tabs" role="tablist">${[["ig", "Instagram", "ES"], ["li", "LinkedIn", "EN"]].map(([k, l, lang]) => `<button role="tab" aria-selected="${t === k}" data-tab="${k}">${l}<span class="lang">${lang}</span></button>`).join("")}</div>
    ${!ch.includes(t) ? `<p class="hint" style="margin:0 0 10px">Este posteo no está marcado para ${t === "ig" ? "Instagram" : "LinkedIn"}.</p>` : ""}
    ${text ? `<p class="copy">${linkify(text)}</p>` : `<p class="copy empty-copy">Sin copy para ${t === "ig" ? "Instagram" : "LinkedIn"}.</p>`}
    <div class="copy-foot"><span class="cnt mono ${n > LIMITS[t] ? "over" : ""}">${n.toLocaleString("es-AR")} / ${LIMITS[t].toLocaleString("es-AR")} caracteres</span><span class="grow"></span>${text ? `<button class="btn sm" data-act="copy">Copiar copy</button>` : ""}</div></div>`;
}
const notePanel = p => p.note ? `<div class="panel"><h3>Nota de Comms</h3><p class="note">${esc(p.note)}</p></div>` : "";
const statusPanel = p => `<div class="panel"><h3>Estado</h3><div class="row">${STATUSES.filter(s => s.k !== p.status).map(s => `<button class="btn sm" data-setst="${s.k}" ${S.busy ? "disabled" : ""}>Mover a ${s.l}</button>`).join("")}</div></div>`;
const checksPanel = p => `<div class="panel"><h3>Matriz de comunicación 2026</h3><div class="checks">${matrixChecks(p).map(c => `<div class="${c.ok ? "" : "warn"}"><i></i><span>${esc(c.t)}</span></div>`).join("")}</div></div>`;

function formHTML(p) {
  return `<div class="panel"><div class="form">
    <div class="field full"><label for="f-title">Nombre interno</label><input id="f-title" value="${esc(p.title)}" placeholder="Ej.: Reel costo por token"></div>
    <div class="field"><label for="f-format">Formato</label><select id="f-format">${FORMATS.map(f => `<option${f === p.format ? " selected" : ""}>${f}</option>`).join("")}</select></div>
    <div class="field"><label for="f-status">Estado</label><select id="f-status">${STATUSES.map(s => `<option value="${s.k}"${s.k === p.status ? " selected" : ""}>${s.l}</option>`).join("")}</select></div>
    <div class="field"><span class="lbl">Canales</span><div class="checkrow"><label><input type="checkbox" id="f-ig" ${(p.channels || []).includes("ig") ? "checked" : ""}> Instagram</label><label><input type="checkbox" id="f-li" ${(p.channels || []).includes("li") ? "checked" : ""}> LinkedIn</label></div></div>
    <div class="field"><label for="f-date">Fecha de salida (opcional)</label><input id="f-date" type="date" value="${esc(p.date)}"></div>
    <div class="field full"><label for="f-media">Links a las piezas en Drive</label><textarea id="f-media" class="short" placeholder="Un link por línea, en orden. Para sliders, una placa por línea.">${esc((p.media || []).join("\n"))}</textarea><span class="sub">Usá el link de cada archivo (Compartir → Copiar vínculo). La vista previa aparece a la izquierda.</span></div>
    <div class="field full"><label for="f-drive">Carpeta del posteo (opcional)</label><input id="f-drive" type="url" value="${esc(p.driveUrl)}" placeholder="https://drive.google.com/drive/folders/…"></div>
    <div class="field full"><label for="f-es">Copy Instagram · ES</label><textarea id="f-es">${esc(p.copyEs)}</textarea><span class="sub mono" id="c-es"></span></div>
    <div class="field full"><label for="f-en">Copy LinkedIn · EN</label><textarea id="f-en">${esc(p.copyEn)}</textarea><span class="sub mono" id="c-en"></span></div>
    <div class="field full"><label for="f-note">Nota para gerencia (opcional)</label><textarea id="f-note" class="short" placeholder="Contexto que ayude a revisar: objetivo, fuente del dato, qué cambió.">${esc(p.note)}</textarea></div>
  </div></div>`;
}
function footHTML() {
  return `<div class="d-foot">${!S.isNew ? (S.confirmDel ? `<span class="confirm">¿Eliminar este posteo? <button class="btn danger sm" data-act="delyes">Eliminar</button><button class="btn sm" data-act="delno">No</button></span>` : `<button class="btn danger sm" data-act="del">Eliminar</button>`) : ""}
    <span class="grow"></span><button class="btn ghost" data-act="cancel">Cancelar</button><button class="btn lime" data-act="save" ${S.busy ? "disabled" : ""}>${S.busy ? "Guardando…" : (S.isNew ? "Crear posteo" : "Guardar cambios")}</button></div>`;
}
function readForm() {
  const d = S.draft; if (!d || !$("#f-title")) return d;
  d.title = $("#f-title").value.trim(); d.format = $("#f-format").value; d.status = $("#f-status").value; d.date = $("#f-date").value;
  d.channels = [$("#f-ig").checked && "ig", $("#f-li").checked && "li"].filter(Boolean);
  d.media = $("#f-media").value.split(/\n+/).map(s => s.trim()).filter(Boolean);
  d.driveUrl = $("#f-drive").value.trim(); d.copyEs = $("#f-es").value; d.copyEn = $("#f-en").value; d.note = $("#f-note").value.trim();
  return d;
}
function updCounters() { [["es", "ig"], ["en", "li"]].forEach(([f, k]) => { const el = $("#c-" + f), ta = $("#f-" + f); if (el && ta) { const n = ta.value.length; el.textContent = `${n.toLocaleString("es-AR")} / ${LIMITS[k].toLocaleString("es-AR")} caracteres`; el.style.color = n > LIMITS[k] ? "var(--st-cambios)" : ""; } }); }
function refreshMediaPreview() { readForm(); const col = document.querySelector(".d-body .d-col"); if (col) col.innerHTML = mediaPanel(S.draft); }

/* ---------- Acciones de edición ---------- */
async function save() {
  const d = readForm(); if (!d) return;
  if (!d.title) { toast("Poné un <b>nombre interno</b> para identificar el posteo."); $("#f-title")?.focus(); return; }
  const bad = d.media.filter(u => !safeUrl(u)); if (bad.length) { toast("Cada link tiene que empezar con <b>https://</b>."); $("#f-media")?.focus(); return; }
  S.busy = true; document.querySelector(".d-foot").outerHTML = footHTML();
  const now = new Date().toISOString();
  const post = { id: d.id, title: d.title, format: d.format, status: d.status, channels: d.channels, date: d.date || "", media: d.media, driveUrl: d.driveUrl, copyEs: d.copyEs, copyEn: d.copyEn, note: d.note, updatedAt: now, createdAt: d.createdAt || now };
  const wasNew = S.isNew;
  try {
    await mutate(ps => wasNew ? [...ps, post] : ps.map(p => p.id === post.id ? post : p), `${wasNew ? "Nuevo" : "Edita"} posteo: ${post.title}`);
    toast(wasNew ? "Posteo <b>creado</b>" : "Cambios <b>guardados</b>");
    S.isNew = false; S.editing = false; S.draft = null;
  } catch (e) { toast(saveErr(e)); }
  S.busy = false; render(); renderDrawer();
}
async function setStatus(k) {
  const p = current(); if (!p) return; S.busy = true; renderDrawer();
  try { await mutate(ps => ps.map(x => x.id === p.id ? { ...x, status: k, updatedAt: new Date().toISOString() } : x), `Estado → ${ST[k].l}: ${p.title}`); toast(`Movido a <b>${ST[k].l}</b>`); }
  catch (e) { toast(saveErr(e)); }
  S.busy = false; render(); renderDrawer();
}
async function delPost() {
  const p = current(); if (!p) return; S.busy = true;
  try { await mutate(ps => ps.filter(x => x.id !== p.id), `Elimina posteo: ${p.title}`); toast("Posteo <b>eliminado</b>"); closeDrawer(); render(); }
  catch (e) { toast(saveErr(e)); }
  S.busy = false;
}

/* ---------- Conexión del editor ---------- */
function renderConnect(msg) {
  $("#content").innerHTML = `<div class="connect">
    <h2>Conectá tu cuenta de GitHub</h2>
    <p>El editor guarda los posteos en el repo <code>comms-glofy/rrss</code>. Necesitás un token personal una sola vez por navegador.</p>
    <ol>
      <li>Entrá a GitHub → Settings → Developer settings → <b>Fine-grained tokens</b> → Generate new token.</li>
      <li>Resource owner: <code>comms-glofy</code>. Repository access: solo <code>rrss</code>.</li>
      <li>Permissions → Repository → <b>Contents: Read and write</b>.</li>
      <li>Copiá el token y pegalo acá.</li>
    </ol>
    <div class="field"><label for="tok">Token</label><input id="tok" type="password" autocomplete="off" placeholder="github_pat_…"></div>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ""}
    <div class="row" style="margin-top:14px"><button class="btn lime" data-act="connect">Conectar</button><a class="btn ghost" href="./">Ver como gerencia</a></div>
    <p class="hint">El token queda guardado solo en este navegador.</p></div>`;
  $("#pipeline").innerHTML = ""; $("#scopeNote").textContent = ""; $("#alert").innerHTML = "";
}
async function connect() {
  const v = $("#tok").value.trim(); if (!v) { $("#tok").focus(); return; }
  try {
    const r = await fetch(API_REPO, { headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + v } });
    if (r.status === 401) return renderConnect("GitHub no reconoce ese token. Revisá que esté completo.");
    if (!r.ok) return renderConnect("El token no tiene acceso al repo comms-glofy/rrss.");
    const j = await r.json();
    if (j.permissions && !j.permissions.push) return renderConnect("El token puede leer pero no escribir. Activá Contents: Read and write.");
    S.token = v; lsSet(TOKEN_KEY, v); bootEdit();
  } catch (e) { renderConnect("No se pudo conectar con GitHub. Revisá tu conexión."); }
}
async function whoami() {
  try { const r = await fetch("https://api.github.com/user", { headers: ghHeaders() }); if (r.ok) { const j = await r.json(); S.login = j.login; } } catch (e) { }
  $("#role").innerHTML = `Editor <b>Comms</b>${S.login ? " · " + esc(S.login) : ""}`;
}
function bootEdit() {
  $("#newBtn").hidden = false; $("#logoutBtn").hidden = false;
  $("#role").innerHTML = "Editor <b>Comms</b>";
  whoami(); load();
}

/* ---------- Eventos ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button,[data-open]"); if (!t) return;
  if (t.dataset.open) { openPost(t.dataset.open); return; }
  if (t.dataset.st) { S.status = S.status === t.dataset.st ? "all" : t.dataset.st; render(); return; }
  if (t.dataset.ch) { S.ch = t.dataset.ch; render(); return; }
  if (t.dataset.tab) { S.tab = t.dataset.tab; renderDrawer(); return; }
  if (t.dataset.mi !== undefined) { if (S.editing) readForm(); S.mi = +t.dataset.mi; renderDrawer(); return; }
  if (t.dataset.setst) { setStatus(t.dataset.setst); return; }
  const a = t.dataset.act; if (!a) return;
  const p = S.editing ? S.draft : current();
  switch (a) {
    case "new": openNew(); break;
    case "close": closeDrawer(); break;
    case "reload": S.err = null; render(); load(); break;
    case "connect": connect(); break;
    case "edit": S.draft = JSON.parse(JSON.stringify(current())); S.draft.media = S.draft.media || []; S.editing = true; renderDrawer(); break;
    case "cancel": if (S.isNew) closeDrawer(); else { S.editing = false; S.draft = null; S.confirmDel = false; renderDrawer(); } break;
    case "save": save(); break;
    case "del": S.confirmDel = true; document.querySelector(".d-foot").outerHTML = footHTML(); break;
    case "delno": S.confirmDel = false; document.querySelector(".d-foot").outerHTML = footHTML(); break;
    case "delyes": delPost(); break;
    case "mprev": case "mnext": { if (S.editing) readForm(); const n = mediaList(p).length; S.mi = (S.mi + (a === "mnext" ? 1 : -1) + n) % n; renderDrawer(); break; }
    case "copy": {
      const txt = S.tab === "ig" ? p.copyEs : p.copyEn;
      navigator.clipboard.writeText(txt).then(() => toast("Copy <b>copiado</b>")).catch(() => { const el = document.querySelector(".copy"); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texto seleccionado. Copialo con Ctrl/Cmd + C."); });
      break;
    }
  }
});
let mediaT;
document.addEventListener("input", e => {
  if (e.target.id === "f-es" || e.target.id === "f-en") updCounters();
  if (e.target.id === "f-media") { clearTimeout(mediaT); mediaT = setTimeout(() => { S.mi = 0; refreshMediaPreview(); }, 500); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && S.openId && !S.editing) closeDrawer(); if (e.key === "Enter" && e.target.id === "tok") connect(); });
$("#scrim").addEventListener("click", () => { if (!S.editing) closeDrawer(); });
$("#refreshBtn").addEventListener("click", () => load());
$("#newBtn")?.addEventListener("click", openNew);
$("#logoutBtn")?.addEventListener("click", () => { lsSet(TOKEN_KEY, null); S.token = null; location.reload(); });
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h && h !== S.openId && S.posts.some(p => p.id === h)) openPost(h); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.loaded && !S.editing && !S.busy) load(); });

/* ---------- Inicio ---------- */
render();
(async () => {
  if (isEdit()) { if (!S.token) { $("#role").innerHTML = "Editor <b>Comms</b>"; renderConnect(); return; } bootEdit(); }
  else { $("#role").innerHTML = "Vista <b>Gerencia</b>"; await load(); }
})();
