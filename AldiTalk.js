// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: signal;

// ============================================================
//  ALDI TALK Datenvolumen-Widget für Scriptable (iOS)
//  Empfohlene Widget-Größe: MEDIUM (nur dort ist der Button tappbar)
//
//  Vor dem ersten Widget-Einsatz:
//  1. Skript in Scriptable anlegen und GENAU so benennen wie SCRIPT_NAME.
//  2. Skript einmal IN DER APP starten -> Login-Daten eingeben.
//
//  Lehnt ALDI TALK die Zugangsdaten ab (z. B. Passwort geändert),
//  probiert das Widget NICHT weiter (sonst sperrt ALDI TALK das Konto),
//  sondern bittet darum, das Skript einmal in der App zu öffnen –
//  dort können die Zugangsdaten neu eingegeben werden.
// ============================================================

const SCRIPT_NAME = "AldiTalk";        // muss dem Skriptnamen entsprechen!
const CACHE_MAX_AGE_MIN = 30;           // so oft wird wirklich neu eingeloggt
const WARN_BELOW_GB = 1.0;              // ab hier färbt sich der Ring rot

// --- Endpunkte (Stand: Kundenportal 2026) ---------------------
const PORTAL = "https://www.alditalk-kundenportal.de";
const AUTH = "https://login.alditalk-kundenbetreuung.de";
const AUTH_API = AUTH + "/signin/json/authenticate";
const OVERVIEW = PORTAL + "/portal/auth/uebersicht/";
const BOOKING = PORTAL + "/portal/auth/buchungsuebersicht/";
const BFF207 = "/scs/bff/scs-207-customer-master-data-bff/customer-master-data";
const BFF209 = "/scs/bff/scs-209-selfcare-dashboard-bff/selfcare-dashboard";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UNIT_TO_GB = { bytes: 1024 ** 3, kilobytes: 1024 ** 2, megabytes: 1024, gigabytes: 1 };

const K_USER = "alditalk_user";
const K_PASS = "alditalk_pass";
const LOGIN_SPERRE = "alditalk-loginfehler.json"; // Merker: Zugangsdaten wurden abgelehnt

// --- Farben ---------------------------------------------------
const C = {
  bgTop: new Color("#0c1c3a"),
  bgBottom: new Color("#12325f"),
  cyan: new Color("#00a0e2"),
  orange: new Color("#f59c00"),
  red: new Color("#ff4d4f"),
  track: new Color("#ffffff", 0.14),
  text: new Color("#ffffff"),
  dim: new Color("#ffffff", 0.6),
};

// ============================================================
//  Einstieg
// ============================================================
const param = (args.queryParameters && args.queryParameters.param) || "";

if (param === "book") {
  // Nachbuchen: Buchungsübersicht im Safari-Sheet öffnen (teilt die
  // Session mit Safari, dort bist du i.d.R. schon eingeloggt).
  Safari.openInApp(BOOKING, false);
  Script.complete();
} else if (param === "menu") {
  // Kleines Widget hat nur EIN Tap-Ziel -> kurzes Menü
  const m = new Alert();
  m.title = "ALDI TALK";
  m.addAction("＋ 1 GB nachbuchen");
  m.addAction("Nur aktualisieren");
  m.addAction("Zugangsdaten ändern");
  m.addCancelAction("Abbrechen");
  const choice = await m.presentSheet();
  if (choice === 0) Safari.openInApp(BOOKING, false);
  else if (choice === 1 || choice === 2) {
    if (choice === 2) vergissZugangsdaten();
    forceRefresh();
    const creds = await getCredentials();
    const data = await getData(creds);
    await buildWidget(data, "small").presentSmall();
  }
  Script.complete();
} else {
  const family = config.widgetFamily || "small";
  // In der App geöffnet, nachdem ALDI TALK die Zugangsdaten abgelehnt hat:
  // gleich neu fragen.
  if (!config.runsInWidget && loginSperreAktiv()) {
    const a = new Alert();
    a.title = "ALDI TALK";
    a.message = "ALDI TALK hat die gespeicherten Zugangsdaten abgelehnt:\n\n" + loginSperreText() +
      "\n\nHast du dein Passwort geändert? Dann bitte neu eingeben.";
    a.addAction("Zugangsdaten neu eingeben");
    a.addAction("Nochmal mit den alten versuchen");
    a.addCancelAction("Abbrechen");
    const wahl = await a.presentAlert();
    if (wahl === 0) vergissZugangsdaten();
    if (wahl !== -1) { hebeLoginSperreAuf(); forceRefresh(); }
  }
  const creds = await getCredentials();
  const data = await getData(creds);
  const widget = buildWidget(data, family);
  widget.url =
    "scriptable:///run?scriptName=" + encodeURIComponent(SCRIPT_NAME) +
    (family === "small" ? "&param=menu" : "");
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else if (family === "medium") {
    await widget.presentMedium();
  } else {
    await widget.presentSmall();
  }
  Script.complete();
}

function forceRefresh() {
  const fm = FileManager.local();
  const p = fm.joinPath(fm.documentsDirectory(), "alditalk-cache.json");
  if (fm.fileExists(p)) fm.remove(p);
}

// ============================================================
//  Zugangsdaten (Keychain)
// ============================================================
async function getCredentials() {
  if (Keychain.contains(K_USER) && Keychain.contains(K_PASS)) {
    return { user: Keychain.get(K_USER), pass: Keychain.get(K_PASS) };
  }
  if (config.runsInWidget) return null;

  const a = new Alert();
  a.title = "ALDI TALK Login";
  a.message = "Zugangsdaten des Kundenportals. Sie werden nur im iOS-Schlüsselbund gespeichert.";
  a.addTextField("Rufnummer / Benutzername");
  a.addSecureTextField("Passwort");
  a.addAction("Speichern");
  a.addCancelAction("Abbrechen");
  const idx = await a.presentAlert();
  if (idx === -1) return null;

  const user = a.textFieldValue(0).trim();
  const pass = a.textFieldValue(1);
  if (!user || !pass) return null;
  Keychain.set(K_USER, user);
  Keychain.set(K_PASS, pass);
  hebeLoginSperreAuf();
  return { user, pass };
}

function vergissZugangsdaten() {
  if (Keychain.contains(K_USER)) Keychain.remove(K_USER);
  if (Keychain.contains(K_PASS)) Keychain.remove(K_PASS);
}

// --- Merker "Zugangsdaten abgelehnt" --------------------------
function sperrPfad() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), LOGIN_SPERRE);
}
function loginSperreAktiv() {
  return FileManager.local().fileExists(sperrPfad());
}
function loginSperreText() {
  try { return JSON.parse(FileManager.local().readString(sperrPfad())).text || ""; } catch (e) { return ""; }
}
function setzeLoginSperre(text) {
  FileManager.local().writeString(sperrPfad(), JSON.stringify({ text, ts: Date.now() }));
}
function hebeLoginSperreAuf() {
  const fm = FileManager.local();
  if (fm.fileExists(sperrPfad())) fm.remove(sperrPfad());
}

// ============================================================
//  Daten holen (mit Cache)
// ============================================================
async function getData(creds) {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), "alditalk-cache.json");

  let cache = null;
  if (fm.fileExists(path)) {
    try { cache = JSON.parse(fm.readString(path)); } catch (e) { cache = null; }
  }

  const fresh = cache && (Date.now() - cache.ts) < CACHE_MAX_AGE_MIN * 60 * 1000;
  if (fresh) return { ...cache, stale: false };

  // Zugangsdaten wurden abgelehnt: nicht weiter probieren (Kontosperre!).
  if (loginSperreAktiv()) {
    const hinweis = "Zugangsdaten abgelehnt – Skript einmal in der App öffnen";
    if (cache) return { ...cache, stale: true, hinweis };
    return { error: hinweis };
  }

  if (!creds) {
    if (cache) return { ...cache, stale: true };
    return { error: "Kein Login – Skript einmal in der App öffnen" };
  }

  try {
    const live = await fetchLive(creds);
    live.ts = Date.now();
    fm.writeString(path, JSON.stringify(live));
    return { ...live, stale: false };
  } catch (e) {
    console.error(e);
    if (e.zugangsdaten) setzeLoginSperre(e.message);
    if (cache) return { ...cache, stale: true, hinweis: e.zugangsdaten ? "Zugangsdaten abgelehnt – Skript in der App öffnen" : "" };
    return { error: String(e.message || e).slice(0, 110) };
  }
}

// ============================================================
//  Portal-Login + Abfrage
// ============================================================
async function fetchLive(creds) {
  // 1) Session anstoßen
  await req(OVERVIEW).loadString();

  // 2–4) Anmelden. ALDI TALK schickt bei einem Fehler KEINE Fehlermeldung,
  // sondern das Anmeldeformular erneut – mit einem Hinweistext darin (falsche
  // Zugangsdaten/Sperre) oder ohne (Rechenaufgabe nicht akzeptiert, dann
  // einfach noch einmal mit einer neuen Aufgabe).
  const authUrl = AUTH_API + "?realm=%2Falditalk&authIndexType=service&authIndexValue=Login";
  let step2 = null;
  for (let versuch = 1; versuch <= 2; versuch++) {
    const r1 = req(authUrl, authHeaders());
    r1.method = "POST";
    r1.body = "{}";
    const step1 = await r1.loadJSON();
    if (!step1.authId || !step1.callbacks) throw new Error("Login-Antwort unerwartet");

    const pow = extractPow(step1.callbacks);
    const nonce = pow.work ? solvePow(pow.work, pow.difficulty) : "0";
    const callbacks = fillCallbacks(step1.callbacks, nonce, creds);

    const r2 = req(authUrl, authHeaders());
    r2.method = "POST";
    r2.body = JSON.stringify({ authId: step1.authId, callbacks });
    step2 = await r2.loadJSON();
    if (step2.successUrl) break;

    const hinweis = serverHinweis(step2.callbacks);
    if (hinweis) {
      const fehler = new Error(hinweis);
      fehler.zugangsdaten = true;
      throw fehler;
    }
    if (step2.message) throw new Error(step2.message);
  }
  if (!step2 || !step2.successUrl) throw new Error("Login abgelehnt (ohne Begründung)");

  // 5) OIDC-Redirect-Kette abschließen
  const succ = step2.successUrl.startsWith("http") ? step2.successUrl : AUTH + step2.successUrl;
  await req(succ).loadString();
  await req(OVERVIEW).loadString();

  // 6) Vertrag ermitteln
  const nav = await req(PORTAL + BFF207 + "/v1/navigation-list", jsonHeaders()).loadJSON();
  const details = nav.userDetails || {};
  const subs = details.subscriptions || [];
  if (!subs.length) throw new Error("Kein Vertrag gefunden");
  const contractId = subs[0].contractId;

  // 7) Tarif & Pakete
  const offers = await req(
    PORTAL + BFF209 + "/v1/offers?contractId=" + encodeURIComponent(contractId) + "&productType=",
    jsonHeaders()
  ).loadJSON();

  const packs = [];
  let offerName = "";
  for (const offer of offers.subscribedOffers || []) {
    if (!offerName && offer.offerName) offerName = offer.offerName;
    for (const p of offer.pack || []) {
      if (p.type !== "data") continue;
      const allocated = parseFloat(p.allocated);
      const used = parseFloat(p.used);
      if (isNaN(allocated) || isNaN(used)) continue;
      const div = UNIT_TO_GB[(p.unit || "kilobytes").toLowerCase()] || UNIT_TO_GB.kilobytes;
      packs.push({
        total: allocated / div,
        left: (allocated - used) / div,
        expires: p.nextExpirationDate || "",
        ref: p.balanceAttributeReference || "",
      });
    }
  }
  if (!packs.length) throw new Error("Kein Datenpaket gefunden");

  const main = packs[0];
  return {
    name: details.firstName || "",
    offer: offerName,
    balance: parseFloat(offers.totalBalance),
    left: main.left,
    total: main.total,
    expires: main.expires,
  };
}

/**
 * Hinweistext, den ALDI TALK bei abgelehnter Anmeldung ins Formular setzt
 * (z. B. "custom.alditalk.common.error$custom.alditalk.accountLock.accountLockMsg"),
 * in verständliches Deutsch übersetzt. Leer, wenn es keinen gibt.
 */
function serverHinweis(callbacks) {
  for (const cb of callbacks || []) {
    if (cb.type !== "TextOutputCallback") continue;
    const out = (cb.output || []).find((o) => o.name === "message");
    const msg = out ? String(out.value || "") : "";
    if (!msg || msg.indexOf("function ") === 0 || msg.indexOf("var ") >= 0) continue; // Rechenaufgaben-Skript
    if (/accountLock|locked|gesperrt/i.test(msg)) {
      return "Rufnummer oder Passwort falsch (nach mehreren Fehlversuchen sperrt ALDI TALK das Konto vorübergehend)";
    }
    if (/password|passwort|credential|invalid/i.test(msg)) return "Rufnummer oder Passwort falsch";
    return "Login abgelehnt: " + msg.replace(/^custom\.alditalk\.[^$]*\$/, "").replace(/custom\.alditalk\./g, "");
  }
  return "";
}

function req(url, extra) {
  const r = new Request(url);
  r.headers = Object.assign({
    "User-Agent": UA,
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  }, extra || {});
  return r;
}

function authHeaders() {
  return {
    "Accept-API-Version": "protocol=1.0,resource=2.1",
    "Content-Type": "application/json",
    "X-Username": "anonymous",
    "X-Password": "anonymous",
    "X-NoSession": "true",
    "Origin": AUTH,
    "Referer": AUTH + "/signin/XUI/",
  };
}

function jsonHeaders() {
  return { "Accept": "application/json, text/plain, */*", "Referer": OVERVIEW };
}

// ============================================================
//  Proof of Work (SHA-1)
// ============================================================
function extractPow(callbacks) {
  for (const cb of callbacks) {
    if (cb.type !== "TextOutputCallback") continue;
    const out = (cb.output || []).find((o) => o.name === "message");
    const msg = out ? out.value || "" : "";
    const w = msg.match(/var work\s*=\s*"([^"]+)"/);
    if (w) {
      const d = msg.match(/var difficulty\s*=\s*(\d+)/);
      return { work: w[1], difficulty: d ? parseInt(d[1], 10) : 3 };
    }
  }
  return { work: null, difficulty: 3 };
}

function solvePow(work, difficulty) {
  const prefix = "0".repeat(difficulty);
  for (let n = 0; n < 5000000; n++) {
    if (sha1(work + n).startsWith(prefix)) return String(n);
  }
  throw new Error("Proof-of-Work nicht gelöst");
}

function fillCallbacks(callbacks, nonce, creds) {
  for (const cb of callbacks) {
    const inputs = cb.input || [];
    const outputs = cb.output || [];
    if (cb.type === "HiddenValueCallback") {
      const isPow = outputs.some((o) => o.name === "id" && o.value === "proofOfWorkNonce");
      if (isPow) { inputs.forEach((i) => (i.value = nonce)); continue; }
      const fb = outputs.find((o) => o.name === "value");
      if (fb) inputs.forEach((i) => (i.value = fb.value));
    } else if (cb.type === "NameCallback") {
      inputs.forEach((i) => (i.value = creds.user));
    } else if (cb.type === "PasswordCallback") {
      inputs.forEach((i) => (i.value = creds.pass));
    } else if (cb.type === "ConfirmationCallback") {
      // Knopf "Anmelden" über seinen Namen suchen statt fest Nummer 2 –
      // falls ALDI TALK die Reihenfolge der Knöpfe mal ändert.
      const opt = outputs.find((o) => o.name === "options");
      const liste = opt && Array.isArray(opt.value) ? opt.value : [];
      const idx = liste.findIndex((v) => /loginbtn$/.test(v));
      inputs.forEach((i) => (i.value = idx >= 0 ? idx : 2));
    }
  }
  return callbacks;
}

function sha1(str) {
  const b = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) b.push(c);
    else if (c < 0x800) b.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  const ml = b.length * 8;
  b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  for (let i = 7; i >= 0; i--) b.push(Math.floor(ml / Math.pow(2, i * 8)) & 0xff);

  const rotl = (n, s) => (n << s) | (n >>> (32 - s));
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Array(80);

  for (let i = 0; i < b.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = (b[i + 4 * j] << 24) | (b[i + 4 * j + 1] << 16) | (b[i + 4 * j + 2] << 8) | b[i + 4 * j + 3];
    }
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (j < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[j]) | 0;
      e = d; d = c; c = rotl(bb, 30); bb = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

// ============================================================
//  Widget-Aufbau
// ============================================================
function buildWidget(d, family) {
  const w = new ListWidget();
  const small = family === "small";
  w.setPadding(small ? 11 : 14, small ? 11 : 14, small ? 11 : 14, small ? 11 : 14);
  const g = new LinearGradient();
  g.colors = [C.bgTop, C.bgBottom];
  g.locations = [0, 1];
  w.backgroundGradient = g;

  if (d.error) {
    w.addSpacer();
    const t = w.addText("ALDI TALK");
    t.font = Font.semiboldSystemFont(13);
    t.textColor = C.dim;
    w.addSpacer(6);
    const e = w.addText(d.error);
    e.font = Font.systemFont(small ? 10 : 12);
    e.textColor = C.text;
    w.addSpacer();
    return w;
  }

  const pct = d.total > 0 ? Math.max(0, Math.min(1, d.left / d.total)) : 0;
  const ringColor = d.left <= WARN_BELOW_GB ? C.red : pct < 0.33 ? C.orange : C.cyan;

  if (small) return buildSmall(w, d, pct, ringColor);

  const row = w.addStack();
  row.centerAlignContent();

  // Ring links
  const img = row.addImage(ringImage(pct, fmtGB(d.left), "GB frei", ringColor));
  img.imageSize = new Size(104, 104);

  row.addSpacer(16);

  // Infos rechts
  const col = row.addStack();
  col.layoutVertically();

  const head = col.addStack();
  head.centerAlignContent();
  const dot = head.addText("●");
  dot.font = Font.systemFont(9);
  dot.textColor = ringColor;
  head.addSpacer(5);
  const title = head.addText("ALDI TALK");
  title.font = Font.semiboldSystemFont(12);
  title.textColor = C.text;

  col.addSpacer(7);

  addRow(col, "von", fmtGB(d.total) + " GB");
  addRow(col, "Guthaben", isNaN(d.balance) ? "–" : d.balance.toFixed(2).replace(".", ",") + " €");
  addRow(col, "gültig bis", fmtExpiry(d.expires));

  col.addSpacer(9);

  // Nachbuch-Button
  const btn = col.addStack();
  btn.setPadding(6, 11, 6, 11);
  btn.cornerRadius = 13;
  btn.backgroundColor = new Color("#f59c00");
  btn.centerAlignContent();
  btn.url = "scriptable:///run?scriptName=" + encodeURIComponent(SCRIPT_NAME) + "&param=book";
  const bt = btn.addText("＋ 1 GB nachbuchen");
  bt.font = Font.boldSystemFont(11);
  bt.textColor = new Color("#1a1a1a");

  w.addSpacer(4);
  const foot = w.addText(
    d.hinweis ? "⚠︎ " + d.hinweis : (d.stale ? "⚠︎ zuletzt " : "Stand ") + fmtTime(d.ts)
  );
  foot.font = Font.systemFont(9);
  foot.textColor = d.hinweis ? C.orange : C.dim;
  foot.centerAlignText();

  return w;
}

// --- Layout für das kleine, quadratische Widget ---------------
function buildSmall(w, d, pct, ringColor) {
  // Kopfzeile: Status links, Guthaben rechts
  const head = w.addStack();
  head.centerAlignContent();
  const dot = head.addText("●");
  dot.font = Font.systemFont(8);
  dot.textColor = d.hinweis ? C.orange : d.stale ? C.dim : ringColor;
  head.addSpacer(4);
  const title = head.addText(d.hinweis ? "⚠︎ Login" : d.stale ? "⚠︎ " + fmtTime(d.ts) : "ALDI TALK");
  title.font = Font.semiboldSystemFont(10);
  title.textColor = d.hinweis ? C.orange : d.stale ? C.dim : C.text;
  head.addSpacer();
  const bal = head.addText(isNaN(d.balance) ? "" : d.balance.toFixed(2).replace(".", ",") + " €");
  bal.font = Font.mediumSystemFont(10);
  bal.textColor = C.dim;

  w.addSpacer(4);

  // Ring mittig
  const ringRow = w.addStack();
  ringRow.addSpacer();
  const img = ringRow.addImage(
    ringImage(pct, fmtGB(d.left), "von " + fmtGB(d.total) + " GB", ringColor)
  );
  img.imageSize = new Size(84, 84);
  ringRow.addSpacer();

  w.addSpacer(5);

  // Fußzeile: Button-Pille links, Restlaufzeit rechts
  const foot = w.addStack();
  foot.centerAlignContent();
  const btn = foot.addStack();
  btn.setPadding(5, 9, 5, 9);
  btn.cornerRadius = 11;
  btn.backgroundColor = C.orange;
  const bt = btn.addText("＋ 1 GB");
  bt.font = Font.boldSystemFont(10);
  bt.textColor = new Color("#1a1a1a");
  foot.addSpacer();
  const days = foot.addText(fmtDays(d.expires));
  days.font = Font.mediumSystemFont(10);
  days.textColor = C.dim;

  return w;
}

function addRow(stack, label, value) {
  const s = stack.addStack();
  s.centerAlignContent();
  const l = s.addText(label);
  l.font = Font.systemFont(10);
  l.textColor = C.dim;
  s.addSpacer(6);
  const v = s.addText(value);
  v.font = Font.mediumSystemFont(11);
  v.textColor = C.text;
  s.addSpacer(2);
}

function ringImage(pct, centerText, subText, color) {
  const size = 320;           // wird herunterskaliert -> sehr scharf
  const lw = 28;
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const r = (size - lw) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Hintergrund-Ring
  ctx.setStrokeColor(C.track);
  ctx.setLineWidth(lw);
  ctx.strokeEllipse(new Rect(lw / 2, lw / 2, size - lw, size - lw));

  // Fortschritt als Punktkette (DrawContext kennt keine Bögen)
  ctx.setFillColor(color);
  const end = 360 * pct;
  for (let a = 0; a <= end; a += 1.2) {
    const rad = (a - 90) * (Math.PI / 180);
    const x = cx + r * Math.cos(rad) - lw / 2;
    const y = cy + r * Math.sin(rad) - lw / 2;
    ctx.fillEllipse(new Rect(x, y, lw, lw));
  }

  // Text in der Mitte
  ctx.setTextAlignedCenter();
  const big = centerText.length > 4 ? 64 : 78;
  ctx.setFont(Font.boldSystemFont(big));
  ctx.setTextColor(new Color("#ffffff"));
  ctx.drawTextInRect(centerText, new Rect(0, cy - big + 8, size, big + 14));

  ctx.setFont(Font.mediumSystemFont(30));
  ctx.setTextColor(new Color("#ffffff", 0.65));
  ctx.drawTextInRect(subText, new Rect(0, cy + 18, size, 40));

  return ctx.getImage();
}

// ============================================================
//  Formatierung
// ============================================================
function fmtGB(v) {
  if (v === null || v === undefined || isNaN(v)) return "–";
  if (v >= 10) return v.toFixed(1).replace(".", ",");
  return v.toFixed(2).replace(".", ",");
}

function fmtExpiry(s) {
  if (!s) return "–";
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d.getTime())) return "–";
  const days = Math.ceil((d - new Date()) / 86400000);
  const df = new DateFormatter();
  df.dateFormat = "dd.MM.";
  return df.string(d) + (days >= 0 ? " (" + days + " T)" : "");
}

function fmtDays(s) {
  if (!s) return "";
  const d = new Date(String(s).replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const days = Math.ceil((d - new Date()) / 86400000);
  return days >= 0 ? "noch " + days + " T" : "abgelaufen";
}

function fmtTime(ts) {
  if (!ts) return "–";
  const df = new DateFormatter();
  df.useNoDateStyle();
  df.useShortTimeStyle();
  return df.string(new Date(ts));
}
