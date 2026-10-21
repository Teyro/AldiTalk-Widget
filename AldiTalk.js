// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: signal;

// ============================================================
//  ALDI TALK Widget 2.0 für Scriptable (iOS)
//
//  Größen: klein, mittel, groß – und Sperrbildschirm (rund, rechteckig, Textzeile).
//  Zeigt Datenvolumen (alle Pakete zusammen), Guthaben, Laufzeit, Tagesbudget,
//  Verbrauch der letzten 14 Tage und eine Prognose, ob das Volumen reicht.
//  Warnt per Mitteilung, wenn das Volumen knapp oder das Guthaben vor der
//  Verlängerung zu niedrig ist.
//  Roaming: Einmal am Tag prüft das Widget, in welchem Land du bist. Im Ausland
//  zeigt es das Roaming-Volumen (falls ALDI TALK eins ausweist), sonst das
//  normale Volumen mit Hinweis. In den Einstellungen auch fest an/aus.
//
//  Einrichten:
//  1. Skript in Scriptable anlegen und GENAU so benennen wie SCRIPT_NAME.
//  2. Skript einmal IN DER APP starten -> Zugangsdaten eingeben.
//  3. Widget auf den Home- oder Sperrbildschirm legen, Skript "AldiTalk" wählen.
//
//  Widget-Parameter (optional, beim Bearbeiten des Widgets):
//    "2"       -> zweiter Vertrag des Kontos (bei mehreren Rufnummern)
//    "hell"    -> Design für dieses Widget (aldi, dunkel, hell, auto)
//    "2, hell" -> beides
//    "roaming" / "inland" -> dieses Widget zeigt immer Roaming- bzw. Inlandsvolumen
//
//  Lehnt ALDI TALK die Zugangsdaten ab, probiert das Widget NICHT weiter
//  (sonst sperrt ALDI TALK das Konto) – einmal das Skript in der App öffnen.
// ============================================================

const SCRIPT_NAME = "AldiTalk";
const VERSION = "2.4";

// --- Endpunkte (Stand: Kundenportal 2026) ---------------------
const PORTAL = "https://www.alditalk-kundenportal.de";
const AUTH = "https://login.alditalk-kundenbetreuung.de";
const AUTH_API = AUTH + "/signin/json/authenticate?realm=%2Falditalk&authIndexType=service&authIndexValue=Login";
const OVERVIEW = PORTAL + "/portal/auth/uebersicht/";
const BOOKING = PORTAL + "/portal/auth/buchungsuebersicht/";
const BFF207 = PORTAL + "/scs/bff/scs-207-customer-master-data-bff/customer-master-data";
const BFF209 = PORTAL + "/scs/bff/scs-209-selfcare-dashboard-bff/selfcare-dashboard";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UNIT_TO_GB = {
  bytes: 1024 ** 3, byte: 1024 ** 3, b: 1024 ** 3,
  kilobytes: 1024 ** 2, kilobyte: 1024 ** 2, kb: 1024 ** 2,
  megabytes: 1024, megabyte: 1024, mb: 1024,
  gigabytes: 1, gigabyte: 1, gb: 1,
};
const ZEIT_LIMIT_S = 20;              // einzelne Anfrage – Widgets haben insgesamt nur ~30 s
const VERLAUF_TAGE = 60;

const K_USER = "alditalk_user";
const K_PASS = "alditalk_pass";

// ============================================================
//  Einstellungen (in der App unter "Einstellungen" änderbar)
// ============================================================
const STANDARD = {
  design: "aldi",            // aldi | dunkel | hell | auto
  warnGB: 1.0,               // Volumen-Warnung (Ring rot + Mitteilung)
  warnGuthaben: 5.0,         // Guthaben-Warnung kurz vor der Verlängerung (€)
  mitteilungen: true,
  cacheMin: 30,              // so oft wird wirklich neu eingeloggt
  vertrag: 0,                // welcher Vertrag (bei mehreren Rufnummern)
  roaming: "auto",           // auto (Standort täglich prüfen) | an | aus
};

const fm = FileManager.local();
const ORDNER = fm.documentsDirectory();
const pfad = (name) => fm.joinPath(ORDNER, name);

function liesJSON(name, ersatz) {
  try {
    const p = pfad(name);
    if (fm.fileExists(p)) return JSON.parse(fm.readString(p));
  } catch (e) { /* kaputte Datei – Ersatz nehmen */ }
  return ersatz;
}
function schreibJSON(name, wert) { fm.writeString(pfad(name), JSON.stringify(wert)); }
function loesche(name) { const p = pfad(name); if (fm.fileExists(p)) fm.remove(p); }

const einstellungen = Object.assign({}, STANDARD, liesJSON("alditalk-einstellungen.json", {}));
function speichereEinstellungen() { schreibJSON("alditalk-einstellungen.json", einstellungen); }

// Widget-Parameter: "2" (Vertrag), "hell" (Design) oder "2, hell".
const widgetParam = String(args.widgetParameter || "").toLowerCase().split(/[,; ]+/).filter(Boolean);
let vertragIndex = einstellungen.vertrag;
let designWahl = einstellungen.design;
let roamingWahl = einstellungen.roaming;
for (const teil of widgetParam) {
  if (/^\d+$/.test(teil)) vertragIndex = Math.max(0, parseInt(teil, 10) - 1);
  else if (["aldi", "dunkel", "hell", "auto"].includes(teil)) designWahl = teil;
  else if (teil === "roaming") roamingWahl = "an";
  else if (teil === "inland") roamingWahl = "aus";
}

// ============================================================
//  Design
// ============================================================
// Farben geprüft (Kontrast ≥ 3:1 zur Fläche, Farbsehschwäche): Balken-/Ringfarbe
// #2a9ee0 auf Navy, #2a78d6 auf Weiß. Statusfarben (Warnung/kritisch) stehen nie
// allein, sondern immer mit Symbol und Text ("⚠︎ wird knapp").
const DESIGNS = {
  aldi: {
    dunkel: true,
    oben: "#0b1a36", unten: "#15396b", glanz: "#2a9ee0",
    text: "#ffffff", text2: "#ffffffa6", text3: "#ffffff70",
    karte: "#ffffff14", spur: "#ffffff24", akzent: "#2a9ee0", akzentHell: "#7fd0ff",
    knopf: "#f59c00", knopfText: "#1a1a1a", grau: "#ffffff52",
  },
  dunkel: {
    dunkel: true,
    oben: "#121316", unten: "#1f2228", glanz: "#3987e5",
    text: "#ffffff", text2: "#c3c2b7", text3: "#898781",
    karte: "#ffffff10", spur: "#ffffff1f", akzent: "#3987e5", akzentHell: "#86b6ef",
    knopf: "#f59c00", knopfText: "#1a1a1a", grau: "#ffffff45",
  },
  hell: {
    dunkel: false,
    oben: "#ffffff", unten: "#e9f0fa", glanz: "#2a78d6",
    text: "#0b1b33", text2: "#52514e", text3: "#898781",
    karte: "#0c1c3a0d", spur: "#0c1c3a1a", akzent: "#2a78d6", akzentHell: "#6da7ec",
    knopf: "#f59c00", knopfText: "#1a1a1a", grau: "#0c1c3a33",
  },
};
const STATUS = { warnung: "#fab219", kritisch: "#d03b3b", kritischDunkel: "#ff6b6b", gut: "#0ca30c" };

function design() {
  let name = designWahl;
  if (name === "auto") {
    let dunkel = true;
    try { dunkel = Device.isUsingDarkAppearance(); } catch (e) { /* Standard: dunkel */ }
    name = dunkel ? "aldi" : "hell";
  }
  return DESIGNS[name] || DESIGNS.aldi;
}

/** Farbe aus "#rrggbb" oder "#rrggbbaa". */
function farbe(hex) {
  const h = hex.replace("#", "");
  if (h.length === 8) return new Color("#" + h.slice(0, 6), parseInt(h.slice(6), 16) / 255);
  return new Color("#" + h);
}

// ============================================================
//  Zugangsdaten (Keychain) und Login-Sperre
// ============================================================
async function getCredentials({ fragen = !(config.runsInWidget || config.runsInAccessoryWidget) } = {}) {
  if (Keychain.contains(K_USER) && Keychain.contains(K_PASS)) {
    return { user: Keychain.get(K_USER), pass: Keychain.get(K_PASS) };
  }
  if (!fragen) return null;

  const a = new Alert();
  a.title = "ALDI TALK Login";
  a.message = "Zugangsdaten des Kundenportals (Rufnummer bzw. Benutzername und Passwort). Sie werden nur im iOS-Schlüsselbund gespeichert.";
  a.addTextField("Rufnummer / Benutzername");
  a.addSecureTextField("Passwort");
  a.addAction("Speichern");
  a.addCancelAction("Abbrechen");
  if ((await a.presentAlert()) === -1) return null;
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

const SPERRE = "alditalk-loginfehler.json";
const loginSperreAktiv = () => fm.fileExists(pfad(SPERRE));
const loginSperreText = () => liesJSON(SPERRE, {}).text || "";
const setzeLoginSperre = (text) => schreibJSON(SPERRE, { text, ts: Date.now() });
const hebeLoginSperreAuf = () => loesche(SPERRE);

// ============================================================
//  Standort (einmal am Tag) und Roaming
// ============================================================
const STANDORT = "alditalk-standort.json";
const HEIMATLAND = "DE";
// EU + EWR (dort gilt EU-Roaming) inkl. Überseegebiete, die eigene Ländercodes haben.
const EU_LAENDER = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "GR", "HU", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "AX", "GP", "MQ", "GF", "RE", "YT", "MF"];

let standort = liesJSON(STANDORT, null);

/** Land per Standort bestimmen – höchstens einmal am Tag (nach Fehlschlag frühestens nach 1 Stunde neu). */
async function pruefeStandort({ erzwingen = false } = {}) {
  const heute = tagSchluessel(Date.now());
  if (!erzwingen && standort && standort.tag === heute) return standort;
  if (!erzwingen && standort && standort.fehlTs && Date.now() - standort.fehlTs < 3600 * 1000) return standort;
  try {
    Location.setAccuracyToKilometer(); // fürs Land reicht das – schneller und spart Akku
    const pos = await mitZeitlimit(Location.current(), 8000);
    const orte = await mitZeitlimit(Location.reverseGeocode(pos.latitude, pos.longitude, "de"), 6000);
    const ort = (orte && orte[0]) || {};
    const land = String(ort.isoCountryCode || "").toUpperCase();
    if (!land) throw new Error("Land nicht erkannt");
    standort = { tag: heute, land, name: ort.country || land, ts: Date.now() };
  } catch (e) {
    console.error("Standort: " + (e.message || e));
    // Letztes bekanntes Land behalten.
    standort = Object.assign({}, standort || {}, { fehlTs: Date.now(), fehler: String(e.message || e).slice(0, 100) });
  }
  schreibJSON(STANDORT, standort);
  return standort;
}

function mitZeitlimit(versprechen, ms) {
  return new Promise((ok, fehler) => {
    const t = Timer.schedule(ms, false, () => fehler(new Error("Zeitüberschreitung")));
    versprechen.then((w) => { t.invalidate(); ok(w); }, (e) => { t.invalidate(); fehler(e); });
  });
}

/** Ob gerade Roaming gezeigt wird – aus Einstellung bzw. Widget-Parameter und Standort. */
function roamingLage() {
  const imAusland = !!(standort && standort.land && standort.land !== HEIMATLAND);
  if (roamingWahl === "aus") return { aktiv: false };
  if (roamingWahl === "an") {
    return { aktiv: true, manuell: true, land: imAusland ? standort.land : null,
      landName: imAusland ? standort.name : "", eu: imAusland ? EU_LAENDER.includes(standort.land) : true };
  }
  if (!imAusland) return { aktiv: false };
  return { aktiv: true, land: standort.land, landName: standort.name, eu: EU_LAENDER.includes(standort.land) };
}

/** Flaggen-Emoji aus dem Ländercode ("ES" -> 🇪🇸). */
function flagge(land) {
  if (!/^[A-Z]{2}$/.test(land || "")) return "🌍";
  return String.fromCodePoint(...[...land].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * Ist ein Datenpaket ein Roaming-Paket? Die Feldnamen sind geraten (kein Testkonto):
 * erst eindeutige Felder, dann jedes andere Textfeld mit "Roaming" (die ALDI-TALK-App
 * beschriftet das Paket "Roaming EU"), dann Name/Beschreibung von Paket und Angebot.
 * "inkl. EU-Roaming" im Tarifnamen zählt NICHT als Roaming-Paket.
 * Wichtig: Das EU-Roaming-Volumen ist ein Teil des normalen Volumens, kein zusätzliches –
 * es darf deshalb nie zum Inlandsvolumen dazugezählt werden.
 */
function istRoamingPaket(p, offer) {
  if (p.roaming === true || p.isRoaming === true || p.roamingPack === true) return true;
  const zone = String(p.zone || p.region || p.area || p.usageArea || "").toLowerCase();
  if (zone && /roaming|eu|ausland|international|world|abroad/.test(zone)) return true;
  const textFelder = ["name", "packName", "description"];
  for (const [k, v] of Object.entries(p)) {
    if (!textFelder.includes(k) && typeof v === "string" && /roaming/i.test(v)) return true;
  }
  const passt = (text) => !/inkl|inklusive|incl/i.test(text)
    && (/roaming|ausland|international|world|weltweit/i.test(text) || /(^|[^a-zäöü])eu([^a-zäöü]|$)/i.test(text));
  if (passt(textFelder.map((k) => p[k]).filter(Boolean).join(" "))) return true;
  // Eigenes Angebot "Roaming EU", dessen Paket nur "Datenvolumen" heißt.
  return !!offer && passt([offer.offerName, offer.name, offer.description].filter(Boolean).join(" "));
}

/** Antwort des Portals ohne persönliche Daten (Nummern, IDs, Namen, Guthaben) – zum Weitergeben bei Fehlern. */
function anonymisiere(wert, schluessel = "") {
  if (/msisdn|phone|rufnummer|contract|customer|kunde|iban|mail|adress|address|firstname|lastname|balance|guthaben|^id$|token/i.test(schluessel)) return "…";
  if (Array.isArray(wert)) return wert.map((w) => anonymisiere(w));
  if (wert && typeof wert === "object") {
    const neu = {};
    for (const [k, v] of Object.entries(wert)) neu[k] = anonymisiere(v, k);
    return neu;
  }
  if (typeof wert === "string") return wert.replace(/\d{7,}/g, "…");
  return wert;
}

/** Gilt ein Eintrag aus unlimitedUsage.includedDataVolume fürs Ausland? ("euOnly", "Roaming EU") */
function istRoamingGruppe(g) {
  const text = [g.countryGroup, g.countryGroupLabel, g.allowanceParameter].filter(Boolean).join(" ");
  if (/germany|inland|domestic/i.test(String(g.countryGroup || "") + " " + String(g.countryGroupLabel || ""))) return false;
  return /eu|roaming|fup|world|international|ausland/i.test(text);
}

/** Datenpakete zu einem Wert zusammenfassen (Ablauf: das des größten Pakets). */
function summiere(pakete) {
  if (!pakete.length) return null;
  const unbegrenzt = pakete.some((p) => p.unbegrenzt);
  const haupt = pakete.slice().sort((a, b) => b.total - a.total)[0];
  return {
    left: unbegrenzt ? Infinity : pakete.reduce((s, p) => s + p.left, 0),
    total: unbegrenzt ? Infinity : pakete.reduce((s, p) => s + p.total, 0),
    unbegrenzt,
    expires: haupt.expires,
  };
}

// ============================================================
//  Daten holen (mit Cache je Vertrag)
// ============================================================
const cacheName = () => `alditalk-cache-${vertragIndex}.json`;
const verlaufName = (ansicht) => `alditalk-verlauf-${vertragIndex}${ansicht === "roaming" ? "-roaming" : ""}.json`;

function forceRefresh() { loesche(cacheName()); }

async function holeDaten({ erzwingen = false } = {}) {
  const cache = liesJSON(cacheName(), null);
  const frisch = cache && cache.ts && (Date.now() - cache.ts) < einstellungen.cacheMin * 60 * 1000;
  if (frisch && !erzwingen) return ergaenze({ ...cache, stale: false });

  // Zugangsdaten wurden abgelehnt: NICHT weiter probieren (Kontosperre!).
  if (loginSperreAktiv() && (config.runsInWidget || config.runsInAccessoryWidget)) {
    const hinweis = "Zugangsdaten abgelehnt – Skript in der App öffnen";
    return cache ? ergaenze({ ...cache, stale: true, hinweis }) : { error: hinweis };
  }

  const creds = await getCredentials();
  if (!creds) {
    const hinweis = "Kein Login – Skript einmal in der App öffnen";
    return cache ? ergaenze({ ...cache, stale: true, hinweis }) : { error: hinweis };
  }

  try {
    const live = await fetchLive(creds);
    live.ts = Date.now();
    schreibJSON(cacheName(), live);
    hebeLoginSperreAuf();
    merkeVerlauf(live, "inland");
    if (live.roaming) merkeVerlauf(live.roaming, "roaming");
    return ergaenze({ ...live, stale: false });
  } catch (e) {
    console.error(e);
    if (e.zugangsdaten) setzeLoginSperre(e.message);
    const kurz = String(e.message || e).slice(0, 120);
    const hinweis = e.zugangsdaten ? "Zugangsdaten abgelehnt – Skript in der App öffnen" : kurz;
    return cache ? ergaenze({ ...cache, stale: true, hinweis }) : { error: kurz, zugangsdaten: !!e.zugangsdaten };
  }
}

/** Abgeleitete Werte: Roaming-Ansicht, Status, Resttage, Tagesbudget, Verbrauch, Prognose. */
function ergaenze(d) {
  if (d.error) return d;
  const lage = roamingLage();
  d.ansicht = "inland";
  d.roamingLage = lage;
  if (lage.aktiv) {
    d.inland = { left: d.left, total: d.total, unbegrenzt: d.unbegrenzt, expires: d.expires };
    if (d.roaming) {
      Object.assign(d, d.roaming);
      d.ansicht = "roaming";
    }
    d.roamingHinweis = d.roaming
      ? (lage.eu ? "" : "Außerhalb der EU – Datennutzung kann extra kosten")
      : (lage.eu ? "Im EU-Ausland gilt dein normales Volumen" : "Außerhalb der EU – Datennutzung kann extra kosten");
  }
  const tage = resttage(d.expires);
  d.resttage = tage;
  d.pct = d.unbegrenzt ? 1 : (d.total > 0 ? Math.max(0, Math.min(1, d.left / d.total)) : 0);
  d.status = d.unbegrenzt ? "gut"
    : (d.left <= 0 ? "leer" : d.left <= einstellungen.warnGB ? "kritisch" : d.pct < 0.33 ? "warnung" : "gut");
  d.tagesbudget = (!d.unbegrenzt && tage !== null && tage > 0) ? Math.max(0, d.left) / tage : null;
  const verlauf = liesJSON(verlaufName(d.ansicht), []);
  d.tageVerbrauch = tagesVerbrauch(verlauf, 14);
  d.prognose = d.unbegrenzt ? null : prognose(verlauf, d);
  return d;
}

// ============================================================
//  Portal: Login + Abfrage
// ============================================================
async function fetchLive(creds) {
  // Meist ist die Sitzung vom letzten Mal noch gültig – dann ganz ohne neuen Login
  // (schneller, und weniger Anmeldungen = weniger Risiko einer Kontosperre).
  let nav = await versucheJSON(BFF207 + "/v1/navigation-list");
  if (!nav || !nav.userDetails) {
    await anmelden(creds);
    nav = await versucheJSON(BFF207 + "/v1/navigation-list");
    if (!nav || !nav.userDetails) throw new Error("Kundenportal antwortet nicht wie erwartet (evtl. Wartungsarbeiten)");
  }

  const details = nav.userDetails || {};
  const subs = details.subscriptions || [];
  if (!subs.length) throw new Error("Kein Vertrag gefunden");
  const vertraege = subs.map((s, i) => ({
    label: s.msisdn || s.phoneNumber || s.rufnummer || s.alias || ("Vertrag " + (i + 1)),
    contractId: s.contractId,
  }));
  const index = Math.min(vertragIndex, subs.length - 1);
  const contractId = subs[index].contractId;

  const offers = await versucheJSON(BFF209 + "/v1/offers?contractId=" + encodeURIComponent(contractId) + "&productType=");
  if (!offers) throw new Error("Tarifdaten nicht abrufbar");
  try { schreibJSON(`alditalk-rohdaten-${vertragIndex}.json`, anonymisiere(offers)); } catch (e) { /* nur für die Fehlersuche */ }

  const pakete = [];
  const sonstige = [];
  let tarif = "";
  const gesehen = new Set();
  const datenPaket = (p, offer, roaming, gruppe) => {
    const allocated = parseFloat(p.allocated);
    const used = parseFloat(p.used);
    const div = UNIT_TO_GB[String(p.unit || "kilobytes").toLowerCase()] || UNIT_TO_GB.kilobytes;
    const total = allocated / div;
    pakete.push({
      name: p.name || p.packName || (roaming && gruppe && gruppe.countryGroupLabel) || (offer && offer.offerName) || (roaming ? "Roaming" : "Datenvolumen"),
      total,
      left: (allocated - used) / div,
      expires: p.nextExpirationDate || p.expirationDate || (offer && (offer.nextExpirationDate || offer.expirationDate)) || "",
      unbegrenzt: p.unlimited === true || allocated < 0 || total >= 10000,
      roaming,
    });
  };
  // Volumen-Einheit (Bytes … GB) statt Minuten/SMS?
  const istVolumen = (p) => /data|daten/.test(String(p.type || "").toLowerCase()) || !!UNIT_TO_GB[String(p.unit || "").toLowerCase()];
  // Pakete eines Angebots (Tarif oder Zusatzangebot wie "Gratis-Volumen 25 GB").
  // ALDI TALK nennt unter unlimitedUsage.includedDataVolume für jedes Datenpaket – in derselben
  // Reihenfolge –, wo es gilt: countryGroup "germanyOnly" (Inland) oder "euOnly" (Roaming EU =
  // EU-Fair-Use-Grenze, ein eigener Zähler). Danach richtet sich, was Roaming ist.
  const nimmAngebot = (offer) => {
    const gruppen = ((offer.unlimitedUsage || {}).includedDataVolume) || [];
    const datenPakete = (offer.pack || []).filter((p) => /data|daten/.test(String(p.type || "").toLowerCase()));
    const gruppenPassen = gruppen.length === datenPakete.length;
    for (const p of offer.pack || []) {
      gesehen.add(p);
      const typ = String(p.type || "").toLowerCase();
      const allocated = parseFloat(p.allocated);
      const used = parseFloat(p.used);
      if (isNaN(allocated) || isNaN(used)) continue;
      const gruppe = gruppenPassen ? gruppen[datenPakete.indexOf(p)] : null;
      const roaming = gruppe ? istRoamingGruppe(gruppe) : istRoamingPaket(p, offer);
      if (/data|daten/.test(typ) || (roaming && istVolumen(p))) {
        datenPaket(p, offer, roaming, gruppe);
      } else if (typ === "voice" || typ === "sms" || typ === "minutes") {
        sonstige.push({
          typ: typ === "sms" ? "SMS" : "Minuten",
          left: Math.max(0, allocated - used) / (String(p.unit || "").toLowerCase() === "seconds" ? 60 : 1),
          total: allocated / (String(p.unit || "").toLowerCase() === "seconds" ? 60 : 1),
          unbegrenzt: p.unlimited === true || allocated < 0 || allocated >= 100000,
        });
      }
    }
  };
  for (const offer of offers.subscribedOffers || []) {
    if (!tarif && offer.offerName) tarif = offer.offerName;
    nimmAngebot(offer);
    for (const zusatz of offer.addOnsDetails || []) {
      if (!/inactive|terminated|expired/i.test(String(zusatz.status || ""))) nimmAngebot(zusatz);
    }
  }
  // Das Roaming-Volumen ("Roaming EU" in der ALDI-TALK-App) steht evtl. nicht bei den
  // Paketen, sondern woanders in der Antwort – dort nach Roaming-Volumen suchen.
  const durchsuche = (wert, kontext, offer, tiefe) => {
    if (!wert || typeof wert !== "object" || tiefe > 8) return;
    if (Array.isArray(wert)) { wert.forEach((w) => durchsuche(w, kontext, offer, tiefe + 1)); return; }
    const hier = kontext + " " + [wert.offerName, wert.name, wert.title, wert.displayName].filter((x) => typeof x === "string").join(" ");
    if (!gesehen.has(wert) && !isNaN(parseFloat(wert.allocated)) && !isNaN(parseFloat(wert.used))
      && istVolumen(wert) && (istRoamingPaket(wert, offer) || /roaming/i.test(hier))) {
      gesehen.add(wert);
      datenPaket(wert, offer, true);
    }
    for (const [k, v] of Object.entries(wert)) durchsuche(v, hier + " " + k, wert.offerName ? wert : offer, tiefe + 1);
  };
  durchsuche(offers, "", null, 0);
  if (!pakete.length) throw new Error("Kein Datenpaket gefunden");

  // Alle Datenpakete zusammen (Tarif + nachgebuchte Pakete), Roaming-Pakete getrennt.
  // Sieht ALLES nach Roaming aus, war die Erkennung wohl falsch – dann zählt alles als Inland.
  let inlandPakete = pakete.filter((p) => !p.roaming);
  let roamingPakete = pakete.filter((p) => p.roaming);
  if (!inlandPakete.length) {
    pakete.forEach((p) => { p.roaming = false; });
    inlandPakete = pakete;
    roamingPakete = [];
  }
  return {
    name: details.firstName || "",
    tarif,
    guthaben: parseFloat(offers.totalBalance),
    ...summiere(inlandPakete),
    roaming: summiere(roamingPakete),
    pakete: pakete.map((p) => ({ ...p, left: p.unbegrenzt ? null : p.left, total: p.unbegrenzt ? null : p.total })),
    sonstige,
    vertraege,
    vertragIndex: index,
  };
}

/**
 * Anmeldung am ALDI-TALK-Login (ForgeRock). Bei einem Fehler schickt ALDI TALK KEINE
 * Fehlermeldung, sondern das Formular erneut – mit Hinweistext (falsche Zugangsdaten,
 * Sperre) oder ohne (Rechenaufgabe nicht angenommen, dann noch einmal).
 */
async function anmelden(creds) {
  await req(OVERVIEW).loadString(); // Sitzung anstoßen
  let ergebnis = null;
  for (let versuch = 1; versuch <= 2; versuch++) {
    const r1 = req(AUTH_API, authHeaders());
    r1.method = "POST";
    r1.body = "{}";
    const schritt1 = await ladeJSON(r1, "Login-Seite");
    if (schritt1.successUrl) { ergebnis = schritt1; break; } // Sitzung war noch gültig
    if (!schritt1.authId || !schritt1.callbacks) throw new Error("Login-Antwort unerwartet");

    const pow = extractPow(schritt1.callbacks);
    const nonce = pow.work ? solvePow(pow.work, pow.difficulty) : "0";
    const callbacks = fillCallbacks(schritt1.callbacks, nonce, creds);

    const r2 = req(AUTH_API, authHeaders());
    r2.method = "POST";
    r2.body = JSON.stringify({ authId: schritt1.authId, callbacks });
    ergebnis = await ladeJSON(r2, "Login");
    if (ergebnis.successUrl) break;

    const hinweis = serverHinweis(ergebnis.callbacks);
    if (hinweis) {
      const fehler = new Error(hinweis);
      fehler.zugangsdaten = true;
      throw fehler;
    }
    if (ergebnis.message) throw new Error(ergebnis.message);
  }
  if (!ergebnis || !ergebnis.successUrl) throw new Error("Login abgelehnt (ohne Begründung)");
  const ziel = ergebnis.successUrl.startsWith("http") ? ergebnis.successUrl : AUTH + ergebnis.successUrl;
  await req(ziel).loadString();     // OIDC-Weiterleitungen abschließen
  await req(OVERVIEW).loadString();
}

/** Hinweistext im zurückgeschickten Login-Formular, auf Deutsch. Leer, wenn es keinen gibt. */
function serverHinweis(callbacks) {
  for (const cb of callbacks || []) {
    if (cb.type !== "TextOutputCallback") continue;
    const out = (cb.output || []).find((o) => o.name === "message");
    const msg = out ? String(out.value || "") : "";
    if (!msg || msg.indexOf("function ") === 0 || msg.indexOf("var ") >= 0) continue; // Rechenaufgabe
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
  r.timeoutInterval = ZEIT_LIMIT_S;
  r.headers = Object.assign({
    "User-Agent": UA,
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  }, extra || {});
  return r;
}

/** JSON laden; bei HTML (Wartungsseite, Login-Umleitung) eine verständliche Meldung. */
async function ladeJSON(r, was) {
  const text = await r.loadString();
  try {
    return JSON.parse(text);
  } catch (e) {
    if (/wartung/i.test(text)) throw new Error("ALDI TALK: Wartungsarbeiten – später noch einmal");
    throw new Error(`${was}: unerwartete Antwort vom Server`);
  }
}

/** JSON einer Portal-Schnittstelle – null, wenn (noch) nicht angemeldet oder keine JSON-Antwort. */
async function versucheJSON(url) {
  try {
    const r = req(url, { "Accept": "application/json, text/plain, */*", "Referer": OVERVIEW });
    const text = await r.loadString();
    const status = r.response && r.response.statusCode;
    if (status && status >= 400) return null;
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
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

// --- Proof of Work (SHA-1) -----------------------------------
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
      // Knopf "Anmelden" über seinen Namen suchen statt fest Nummer 2.
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
    for (let j = 0; j < 16; j++) w[j] = (b[i + 4 * j] << 24) | (b[i + 4 * j + 1] << 16) | (b[i + 4 * j + 2] << 8) | b[i + 4 * j + 3];
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
//  Verlauf, Tagesverbrauch, Prognose
// ============================================================
function merkeVerlauf(d, ansicht) {
  if (d.unbegrenzt) return;
  const verlauf = liesJSON(verlaufName(ansicht), []);
  const letzter = verlauf[verlauf.length - 1];
  const jetzt = Date.now();
  // Nur speichern, wenn sich etwas geändert hat oder eine Stunde vergangen ist.
  if (letzter && Math.abs(letzter.left - d.left) < 0.0005 && jetzt - letzter.t < 3600 * 1000) return;
  verlauf.push({ t: jetzt, left: d.left, total: d.total });
  const grenze = jetzt - VERLAUF_TAGE * 86400000;
  schreibJSON(verlaufName(ansicht), verlauf.filter((e) => e.t >= grenze));
}

function tagSchluessel(t) {
  const d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/**
 * Verbrauch je Kalendertag (GB) der letzten `tage` Tage, geschätzt aus den Abfragen:
 * jede Abnahme des Restvolumens zählt zum Tag der Abfrage. Zunahmen (Nachbuchen,
 * neuer Monat) werden ignoriert. Tage ohne Abfrage bekommen 0 – der Verbrauch landet
 * dann beim nächsten Tag mit Abfrage.
 */
function tagesVerbrauch(verlauf, tage) {
  const proTag = {};
  for (let i = 1; i < verlauf.length; i++) {
    const diff = verlauf[i - 1].left - verlauf[i].left;
    if (diff > 0) {
      const k = tagSchluessel(verlauf[i].t);
      proTag[k] = (proTag[k] || 0) + diff;
    }
  }
  const ergebnis = [];
  const heute = new Date();
  heute.setHours(12, 0, 0, 0);
  for (let i = tage - 1; i >= 0; i--) {
    const t = heute.getTime() - i * 86400000;
    const k = tagSchluessel(t);
    ergebnis.push({ tag: k, t, gb: proTag[k] || 0, heute: i === 0 });
  }
  return ergebnis;
}

/** Durchschnittsverbrauch der letzten 7 Tage und wann das Volumen leer wäre. */
function prognose(verlauf, d) {
  const grenze = Date.now() - 7 * 86400000;
  const teil = verlauf.filter((e) => e.t >= grenze);
  if (teil.length < 2) return null;
  const spanneTage = (teil[teil.length - 1].t - teil[0].t) / 86400000;
  if (spanneTage < 0.5) return null; // zu wenig Daten für eine Aussage
  let summe = 0;
  for (let i = 1; i < teil.length; i++) summe += Math.max(0, teil[i - 1].left - teil[i].left);
  const proTag = summe / Math.max(1, spanneTage);
  if (proTag <= 0.0005) return { proTag: 0, reicht: true, leerAm: null };
  const tageBisLeer = Math.max(0, d.left) / proTag;
  const leerAm = Date.now() + tageBisLeer * 86400000;
  const ende = parseDatum(d.expires);
  return { proTag, leerAm, reicht: !ende || leerAm >= ende.getTime() };
}

// ============================================================
//  Mitteilungen
// ============================================================
async function pruefeWarnungen(d) {
  if (!einstellungen.mitteilungen || d.error || d.stale) return;
  const zustand = liesJSON("alditalk-mitteilungen.json", {});
  const zeitraum = (d.ansicht === "roaming" ? "roaming-" : "") + (d.expires || "ohne");
  const schicke = async (id, titel, text) => {
    try {
      const n = new Notification();
      n.identifier = "alditalk-" + id;
      n.threadIdentifier = "alditalk";
      n.title = titel;
      n.body = text;
      n.openURL = "scriptable:///run?scriptName=" + encodeURIComponent(SCRIPT_NAME) + "&param=dashboard";
      await n.schedule();
    } catch (e) { console.error(e); }
  };
  // Neues Land (laut Standort): einmal sagen, was dort gilt.
  const lage = d.roamingLage || {};
  const land = lage.land || (lage.aktiv ? null : HEIMATLAND);
  if (land && zustand.land && zustand.land !== land && land !== HEIMATLAND) {
    const volumen = d.unbegrenzt ? "Unbegrenztes Datenvolumen"
      : `${fmtGB(d.left)} GB ${d.ansicht === "roaming" ? "Roaming-Volumen" : "Datenvolumen"} frei`;
    await schicke("land", `ALDI TALK: ${flagge(land)} ${lage.landName || land}`,
      lage.eu ? `EU-Roaming: ${volumen}.` : `Außerhalb der EU – mobiles Surfen kann extra kosten. ${volumen}.`);
  }
  if (land) zustand.land = land;
  const art = d.ansicht === "roaming" ? "Roaming-Volumen" : "Datenvolumen";
  if (!d.unbegrenzt && d.left <= einstellungen.warnGB && zustand.volumen !== zeitraum) {
    zustand.volumen = zeitraum;
    await schicke("volumen", `ALDI TALK: ${art} fast aufgebraucht`,
      `Nur noch ${fmtGB(d.left)} GB frei` + (d.resttage !== null ? ` – noch ${d.resttage} Tage Laufzeit.` : "."));
  }
  // Verlängerung richtet sich nach dem Tarif, nicht nach einem Roaming-Paket.
  const vertragTage = d.inland ? resttage(d.inland.expires) : d.resttage;
  const vertragZeitraum = (d.inland ? d.inland.expires : d.expires) || "ohne";
  if (vertragTage !== null && vertragTage <= 3 && !isNaN(d.guthaben) && d.guthaben < einstellungen.warnGuthaben && zustand.guthaben !== vertragZeitraum) {
    zustand.guthaben = vertragZeitraum;
    await schicke("guthaben", "ALDI TALK: Guthaben aufladen",
      `Verlängerung in ${vertragTage} Tag${vertragTage === 1 ? "" : "en"}, Guthaben nur ${fmtEuro(d.guthaben)}.`);
  }
  if (d.prognose && !d.prognose.reicht && zustand.prognose !== zeitraum && d.status === "gut") {
    zustand.prognose = zeitraum;
    await schicke("prognose", "ALDI TALK: Volumen wird knapp",
      `Bei deinem Verbrauch (${fmtGB(d.prognose.proTag)} GB/Tag) ist es etwa am ${fmtDatum(d.prognose.leerAm)} leer.`);
  }
  schreibJSON("alditalk-mitteilungen.json", zustand);
}

// ============================================================
//  Widgets
// ============================================================
function baueWidget(d, familie) {
  if (familie === "accessoryCircular") return sperrRund(d);
  if (familie === "accessoryRectangular") return sperrRechteck(d);
  if (familie === "accessoryInline") return sperrZeile(d);

  const D = design();
  const w = new ListWidget();
  const groesse = { small: [158, 158], medium: [338, 158], large: [338, 354], extraLarge: [715, 354] }[familie] || [158, 158];
  w.backgroundImage = hintergrundBild(D, groesse[0], groesse[1]);
  w.refreshAfterDate = new Date(Date.now() + einstellungen.cacheMin * 60 * 1000);

  if (d.error) {
    fehlerAnsicht(w, d, D);
    w.url = skriptURL("menu");
    return w;
  }
  if (familie === "small") klein(w, d, D);
  else if (familie === "medium") mittel(w, d, D);
  else gross(w, d, D);
  return w;
}

/** SF-Symbol als Bild – mit Rückfall, falls es das Symbol auf dieser iOS-Version nicht gibt. */
function sfBild(name) {
  const s = SFSymbol.named(name) || SFSymbol.named("circle.fill");
  return s.image;
}

function skriptURL(p) {
  return "scriptable:///run?scriptName=" + encodeURIComponent(SCRIPT_NAME) + (p ? "&param=" + p : "");
}

function statusFarbe(d, D) {
  if (d.status === "leer" || d.status === "kritisch") return farbe(D.dunkel ? STATUS.kritischDunkel : STATUS.kritisch);
  if (d.status === "warnung") return farbe(STATUS.warnung);
  return farbe(D.akzent);
}

/** Titel im Ausland ("🇪🇸 Roaming"), sonst null. */
function auslandTitel(d) {
  const lage = d.roamingLage;
  if (!lage || !lage.aktiv) return null;
  return `${flagge(lage.land)} ${d.ansicht === "roaming" ? "Roaming" : lage.eu ? "EU-Ausland" : "Ausland"}`;
}

function statusText(d) {
  return { leer: "⚠︎ aufgebraucht", kritisch: "⚠︎ fast leer", warnung: "⚠︎ wird knapp" }[d.status] || "";
}

function fehlerAnsicht(w, d, D) {
  w.setPadding(14, 14, 14, 14);
  kopf(w, D, "ALDI TALK");
  w.addSpacer();
  const sym = w.addImage(sfBild(d.zugangsdaten ? "person.crop.circle.badge.exclamationmark" : "exclamationmark.triangle.fill"));
  sym.imageSize = new Size(26, 26);
  sym.tintColor = farbe(STATUS.warnung);
  w.addSpacer(6);
  const t = w.addText(d.error);
  t.font = Font.mediumSystemFont(12);
  t.textColor = farbe(D.text);
  t.minimumScaleFactor = 0.7;
  w.addSpacer();
  const h = w.addText("Tippen zum Öffnen");
  h.font = Font.systemFont(10);
  h.textColor = farbe(D.text3);
}

function kopf(stack, D, titel, rechts) {
  const z = stack.addStack();
  z.centerAlignContent();
  const logo = z.addStack();
  logo.backgroundColor = farbe(D.akzent);
  logo.cornerRadius = 4;
  logo.setPadding(2, 4, 2, 4);
  const lt = logo.addText("AT");
  lt.font = Font.heavyRoundedSystemFont(9);
  lt.textColor = Color.white();
  z.addSpacer(5);
  const t = z.addText(titel);
  t.font = Font.semiboldRoundedSystemFont(12);
  t.textColor = farbe(D.text);
  t.lineLimit = 1;
  z.addSpacer();
  if (rechts) {
    const r = z.addText(rechts);
    r.font = Font.mediumRoundedSystemFont(11);
    r.textColor = farbe(D.text2);
    r.lineLimit = 1;
  }
  return z;
}

function fussZeile(stack, d, D) {
  const f = stack.addStack();
  f.centerAlignContent();
  const roaming = !d.hinweis && d.roamingHinweis;
  const sym = f.addImage(sfBild(roaming ? "globe" : d.stale ? "exclamationmark.arrow.circlepath" : "checkmark.circle.fill"));
  sym.imageSize = new Size(9, 9);
  sym.tintColor = d.stale || roaming ? farbe(STATUS.warnung) : farbe(D.text3);
  f.addSpacer(3);
  const t = f.addText(d.hinweis || d.roamingHinweis || (d.stale ? "Stand " : "Aktualisiert ") + fmtRelativ(d.ts));
  t.font = Font.systemFont(9);
  t.textColor = d.hinweis || roaming ? farbe(STATUS.warnung) : farbe(D.text3);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return f;
}

// --- klein ----------------------------------------------------
function klein(w, d, D) {
  w.setPadding(12, 12, 10, 12);
  w.url = skriptURL("menu");
  kopf(w, D, auslandTitel(d) || "ALDI TALK", isNaN(d.guthaben) ? "" : fmtEuro(d.guthaben));
  w.addSpacer();
  const reihe = w.addStack();
  reihe.addSpacer();
  const ring = reihe.addImage(ringBild(d, D, 260, false));
  ring.imageSize = new Size(88, 88);
  reihe.addSpacer();
  w.addSpacer();
  const f = w.addStack();
  f.centerAlignContent();
  const links = f.addText(d.status !== "gut" ? statusText(d) : (d.resttage !== null ? `noch ${d.resttage} T` : ""));
  links.font = Font.semiboldRoundedSystemFont(11);
  links.textColor = d.status !== "gut" ? statusFarbe(d, D) : farbe(D.text2);
  f.addSpacer();
  if (d.tagesbudget !== null) {
    const r = f.addText(`${fmtGB(d.tagesbudget)} GB/Tag`);
    r.minimumScaleFactor = 0.7;
    r.font = Font.mediumRoundedSystemFont(11);
    r.textColor = farbe(D.text2);
  }
}

// --- mittel ---------------------------------------------------
function mittel(w, d, D) {
  w.setPadding(14, 14, 12, 14);
  w.url = skriptURL("dashboard");
  const reihe = w.addStack();
  reihe.centerAlignContent();
  const ring = reihe.addImage(ringBild(d, D, 300, true));
  ring.imageSize = new Size(108, 108);
  reihe.addSpacer(14);

  const rechts = reihe.addStack();
  rechts.layoutVertically();
  kopf(rechts, D, auslandTitel(d) || d.tarif || "ALDI TALK");
  rechts.addSpacer(6);
  zeile(rechts, D, "creditcard.fill", "Guthaben", isNaN(d.guthaben) ? "–" : fmtEuro(d.guthaben));
  zeile(rechts, D, "calendar", "gültig bis", fmtAblauf(d.expires));
  if (d.tagesbudget !== null) zeile(rechts, D, "speedometer", "pro Tag", fmtGB(d.tagesbudget) + " GB");
  else if (d.status !== "gut") zeile(rechts, D, "exclamationmark.triangle.fill", "Status", statusText(d).replace("⚠︎ ", ""), statusFarbe(d, D));
  rechts.addSpacer(6);

  const knoepfe = rechts.addStack();
  knoepfe.centerAlignContent();
  pille(knoepfe, D, "plus", "Nachbuchen", skriptURL("book"), true);
  knoepfe.addSpacer(6);
  pille(knoepfe, D, "arrow.clockwise", null, skriptURL("refresh"), false);

  w.addSpacer();
  fussZeile(w, d, D);
}

function zeile(stack, D, symbol, label, wert, wertFarbe) {
  const z = stack.addStack();
  z.centerAlignContent();
  const s = z.addImage(sfBild(symbol));
  s.imageSize = new Size(10, 10);
  s.tintColor = farbe(D.text3);
  z.addSpacer(5);
  const l = z.addText(label);
  l.font = Font.systemFont(11);
  l.textColor = farbe(D.text2);
  z.addSpacer(6);
  const v = z.addText(wert);
  v.font = Font.semiboldRoundedSystemFont(12);
  v.textColor = wertFarbe || farbe(D.text);
  v.lineLimit = 1;
  v.minimumScaleFactor = 0.7;
  stack.addSpacer(2);
}

function pille(stack, D, symbol, text, url, haupt) {
  const p = stack.addStack();
  p.centerAlignContent();
  p.cornerRadius = 12;
  p.setPadding(5, text ? 10 : 7, 5, text ? 10 : 7);
  p.backgroundColor = haupt ? farbe(D.knopf) : farbe(D.karte);
  p.url = url;
  const s = p.addImage(sfBild(symbol));
  s.imageSize = new Size(10, 10);
  s.tintColor = haupt ? farbe(D.knopfText) : farbe(D.text);
  if (text) {
    p.addSpacer(4);
    const t = p.addText(text);
    t.font = Font.boldRoundedSystemFont(11);
    t.textColor = haupt ? farbe(D.knopfText) : farbe(D.text);
  }
}

// --- groß -----------------------------------------------------
function gross(w, d, D) {
  w.setPadding(16, 16, 12, 16);
  w.url = skriptURL("dashboard");
  kopf(w, D, auslandTitel(d) || d.tarif || "ALDI TALK", d.name ? "Hallo " + d.name : "");
  w.addSpacer(10);

  const oben = w.addStack();
  oben.centerAlignContent();
  const ring = oben.addImage(ringBild(d, D, 330, true));
  ring.imageSize = new Size(124, 124);
  oben.addSpacer(14);
  const kacheln = oben.addStack();
  kacheln.layoutVertically();
  const r1 = kacheln.addStack();
  kachel(r1, D, "Guthaben", isNaN(d.guthaben) ? "–" : fmtEuro(d.guthaben));
  r1.addSpacer(8);
  kachel(r1, D, "Laufzeit", d.resttage === null ? "–" : `${d.resttage} Tage`, fmtAblauf(d.expires, false));
  kacheln.addSpacer(8);
  const r2 = kacheln.addStack();
  kachel(r2, D, "Tagesbudget", d.tagesbudget === null ? "–" : fmtGB(d.tagesbudget) + " GB");
  r2.addSpacer(8);
  if (d.prognose && d.prognose.proTag > 0) {
    kachel(r2, D, "Prognose", d.prognose.reicht ? "reicht ✓" : "⚠︎ " + fmtDatum(d.prognose.leerAm),
      `${fmtGB(d.prognose.proTag)} GB/Tag`, d.prognose.reicht ? null : farbe(STATUS.warnung));
  } else {
    kachel(r2, D, "Status", d.status === "gut" ? "alles gut" : statusText(d), null, d.status === "gut" ? null : statusFarbe(d, D));
  }

  w.addSpacer(12);
  const titel = w.addStack();
  const tt = titel.addText("Verbrauch pro Tag");
  tt.font = Font.semiboldSystemFont(11);
  tt.textColor = farbe(D.text2);
  titel.addSpacer();
  const max = Math.max(...d.tageVerbrauch.map((t) => t.gb));
  const ht = titel.addText(max > 0 ? `heute ${fmtGB(d.tageVerbrauch[d.tageVerbrauch.length - 1].gb)} GB` : "Verlauf sammelt sich noch");
  ht.font = Font.systemFont(10);
  ht.textColor = farbe(D.text3);
  w.addSpacer(4);
  const diagramm = w.addImage(balkenBild(d.tageVerbrauch, d.tagesbudget, D, 306, 62));
  diagramm.imageSize = new Size(306, 62);

  if (d.pakete && d.pakete.length > 1) {
    w.addSpacer(8);
    // Im Ausland die Roaming-Pakete zuerst.
    const liste = d.ansicht === "roaming" ? [...d.pakete.filter((p) => p.roaming), ...d.pakete.filter((p) => !p.roaming)] : d.pakete;
    for (const p of liste.slice(0, 2)) paketZeile(w, p, D);
  }

  w.addSpacer();
  const unten = w.addStack();
  unten.centerAlignContent();
  fussZeile(unten, d, D);
  unten.addSpacer();
  pille(unten, D, "plus", "Nachbuchen", skriptURL("book"), true);
  unten.addSpacer(6);
  pille(unten, D, "arrow.clockwise", null, skriptURL("refresh"), false);
}

function kachel(stack, D, label, wert, unter, wertFarbe) {
  const k = stack.addStack();
  k.layoutVertically();
  k.size = new Size(84, 46);
  k.cornerRadius = 10;
  k.backgroundColor = farbe(D.karte);
  k.setPadding(6, 8, 6, 8);
  const l = k.addText(label);
  l.font = Font.systemFont(9);
  l.textColor = farbe(D.text2);
  const v = k.addText(wert);
  v.font = Font.semiboldRoundedSystemFont(13);
  v.textColor = wertFarbe || farbe(D.text);
  v.lineLimit = 1;
  v.minimumScaleFactor = 0.6;
  if (unter) {
    const u = k.addText(unter);
    u.font = Font.systemFont(8);
    u.textColor = farbe(D.text3);
    u.lineLimit = 1;
  }
}

function paketZeile(stack, p, D) {
  const z = stack.addStack();
  z.centerAlignContent();
  const n = z.addText((p.roaming ? "🌍 " : "") + p.name);
  n.font = Font.systemFont(10);
  n.textColor = farbe(D.text2);
  n.lineLimit = 1;
  z.addSpacer();
  const v = z.addText(p.unbegrenzt ? "unbegrenzt" : `${fmtGB(p.left)} / ${fmtGB(p.total)} GB`);
  v.font = Font.mediumRoundedSystemFont(10);
  v.textColor = farbe(D.text);
  stack.addSpacer(2);
}

// --- Sperrbildschirm ------------------------------------------
function sperrRund(d) {
  const w = new ListWidget();
  w.addAccessoryWidgetBackground = true;
  w.url = skriptURL("dashboard");
  if (d.error) {
    const t = w.addText("!");
    t.font = Font.boldRoundedSystemFont(20);
    t.centerAlignText();
    return w;
  }
  const img = w.addImage(sperrRingBild(d));
  img.imageSize = new Size(58, 58);
  img.centerAlignImage();
  return w;
}

function sperrRechteck(d) {
  const w = new ListWidget();
  w.url = skriptURL("dashboard");
  if (d.error) {
    const t = w.addText("ALDI TALK: " + d.error);
    t.font = Font.systemFont(11);
    t.minimumScaleFactor = 0.7;
    return w;
  }
  const k = w.addText((auslandTitel(d) || "ALDI TALK") + (d.stale ? " ⚠︎" : ""));
  k.font = Font.semiboldRoundedSystemFont(11);
  const v = w.addText(d.unbegrenzt ? "∞ unbegrenzt" : `${fmtGB(d.left)} GB frei`);
  v.font = Font.boldRoundedSystemFont(17);
  v.minimumScaleFactor = 0.8;
  const img = w.addImage(sperrBalkenBild(d.pct));
  img.imageSize = new Size(140, 6);
  const u = w.addText([d.resttage !== null ? `${d.resttage} T` : null, isNaN(d.guthaben) ? null : fmtEuro(d.guthaben)].filter(Boolean).join(" · "));
  u.font = Font.systemFont(10);
  return w;
}

function sperrZeile(d) {
  const w = new ListWidget();
  w.url = skriptURL("dashboard");
  const t = w.addText(d.error ? "ALDI TALK ⚠︎" : `${d.ansicht === "roaming" ? flagge(d.roamingLage.land) : "📶"} ${d.unbegrenzt ? "∞" : fmtGB(d.left) + " GB"}${d.resttage !== null ? " · " + d.resttage + " T" : ""}`);
  t.font = Font.mediumSystemFont(12);
  return w;
}

// ============================================================
//  Zeichnungen
// ============================================================
/** Hintergrund: Verlauf mit weichen Lichtflecken. */
function hintergrundBild(D, breite, hoehe) {
  const s = 2;
  const ctx = new DrawContext();
  ctx.size = new Size(breite * s, hoehe * s);
  ctx.opaque = true;
  ctx.respectScreenScale = false;
  // Verlauf von oben nach unten in feinen Streifen.
  const oben = hexRGB(D.oben), unten = hexRGB(D.unten);
  const streifen = 48;
  for (let i = 0; i < streifen; i++) {
    const t = i / (streifen - 1);
    ctx.setFillColor(new Color(rgbHex(mischeRGB(oben, unten, t))));
    ctx.fillRect(new Rect(0, Math.floor(i * hoehe * s / streifen), breite * s, Math.ceil(hoehe * s / streifen) + 1));
  }
  // Zwei weiche Lichtflecken (übereinanderliegende, fast durchsichtige Kreise).
  // Viele sehr zarte Kreise übereinander ergeben einen weichen Verlauf ohne sichtbare Stufen.
  const flecken = [
    { x: breite * s * 0.92, y: -hoehe * s * 0.05, r: Math.max(breite, hoehe) * s * 0.75, gesamt: D.dunkel ? 0.22 : 0.10 },
    { x: -breite * s * 0.1, y: hoehe * s * 1.05, r: Math.max(breite, hoehe) * s * 0.55, gesamt: D.dunkel ? 0.14 : 0.07 },
  ];
  const stufen = 40;
  for (const f of flecken) {
    for (let k = stufen; k >= 1; k--) {
      const r = f.r * Math.pow(k / stufen, 0.8);
      ctx.setFillColor(new Color(D.glanz.slice(0, 7), f.gesamt / stufen));
      ctx.fillEllipse(new Rect(f.x - r, f.y - r, r * 2, r * 2));
    }
  }
  return ctx.getImage();
}

/**
 * Ring (Messinstrument): Füllung in der Statusfarbe mit leichtem Verlauf, Spur in einem
 * helleren Schritt, Markierungen bei 25/50/75 %, in der Mitte die freien GB.
 */
function ringBild(d, D, groesse, mitUntertitel) {
  const ctx = new DrawContext();
  ctx.size = new Size(groesse, groesse);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const lw = groesse * 0.085;
  const r = (groesse - lw) / 2 - groesse * 0.02;
  const c = groesse / 2;

  ctx.setStrokeColor(farbe(D.spur));
  ctx.setLineWidth(lw);
  ctx.strokeEllipse(new Rect(c - r, c - r, r * 2, r * 2));

  const fuell = statusFarbe(d, D);
  const basis = hexRGB(fuell.hex);
  const hell = mischeRGB(basis, [255, 255, 255], 0.35);
  const ende = 360 * d.pct;
  // Leuchten hinter der Füllung
  for (let a = 0; a <= ende; a += 3) {
    const rad = (a - 90) * Math.PI / 180;
    const g = lw * 1.7;
    ctx.setFillColor(new Color(fuell.hex, 0.06));
    ctx.fillEllipse(new Rect(c + r * Math.cos(rad) - g / 2, c + r * Math.sin(rad) - g / 2, g, g));
  }
  for (let a = 0; a <= ende; a += 0.8) {
    const rad = (a - 90) * Math.PI / 180;
    const t = ende > 0 ? a / ende : 0;
    ctx.setFillColor(new Color(rgbHex(mischeRGB(hell, basis, t))));
    ctx.fillEllipse(new Rect(c + r * Math.cos(rad) - lw / 2, c + r * Math.sin(rad) - lw / 2, lw, lw));
  }
  // Markierungen 25/50/75 %
  ctx.setFillColor(farbe(D.dunkel ? "#ffffff59" : "#0c1c3a40"));
  for (const p of [0.25, 0.5, 0.75]) {
    const rad = (p * 360 - 90) * Math.PI / 180;
    const m = lw * 0.22;
    ctx.fillEllipse(new Rect(c + (r - lw * 0.95) * Math.cos(rad) - m, c + (r - lw * 0.95) * Math.sin(rad) - m, m * 2, m * 2));
  }

  ctx.setTextAlignedCenter();
  const zahl = d.unbegrenzt ? "∞" : fmtGB(d.left);
  const gross = zahl.length > 4 ? groesse * 0.2 : groesse * 0.25;
  ctx.setFont(Font.boldRoundedSystemFont(gross));
  ctx.setTextColor(farbe(D.text));
  ctx.drawTextInRect(zahl, new Rect(0, c - gross * 0.78, groesse, gross * 1.25));
  ctx.setFont(Font.mediumRoundedSystemFont(groesse * 0.085));
  ctx.setTextColor(farbe(D.text2));
  const unter = d.unbegrenzt ? "unbegrenzt" : (mitUntertitel ? `GB von ${fmtGB(d.total)}` : "GB frei");
  ctx.drawTextInRect(unter, new Rect(0, c + gross * 0.42, groesse, groesse * 0.12));
  return ctx.getImage();
}

/**
 * Säulen "Verbrauch pro Tag" (eine Reihe → keine Legende): heute in der Akzentfarbe,
 * die Tage davor zurückgenommen (Hervorhebung). Säulen höchstens 24 px breit, oben
 * 4 px abgerundet, unten gerade; eine feine Linie markiert das Tagesbudget.
 */
function balkenBild(tage, budget, D, breite, hoehe) {
  const s = 3;
  const ctx = new DrawContext();
  ctx.size = new Size(breite * s, hoehe * s);
  ctx.opaque = false;
  ctx.respectScreenScale = false;
  const basisY = (hoehe - 12) * s;
  const max = Math.max(budget || 0, ...tage.map((t) => t.gb), 0.001);
  const fach = breite * s / tage.length;
  const saeule = Math.min(24 * s / 2, fach * 0.62);
  // Grundlinie (Haarlinie)
  ctx.setFillColor(farbe(D.spur));
  ctx.fillRect(new Rect(0, basisY, breite * s, 1 * s / 2));
  tage.forEach((t, i) => {
    const h = t.gb > 0 ? Math.max(2 * s, (t.gb / max) * (basisY - 4 * s)) : 0;
    const x = i * fach + (fach - saeule) / 2;
    if (h > 0) {
      // Oben abgerundet, unten gerade – als ein Pfad, damit sich halbdurchsichtige Flächen nicht überlagern.
      const r = Math.min(4 * s / 2, saeule / 2, h);
      const oben = basisY - h;
      const p = new Path();
      p.move(new Point(x, basisY));
      p.addLine(new Point(x, oben + r));
      p.addQuadCurve(new Point(x + r, oben), new Point(x, oben));
      p.addLine(new Point(x + saeule - r, oben));
      p.addQuadCurve(new Point(x + saeule, oben + r), new Point(x + saeule, oben));
      p.addLine(new Point(x + saeule, basisY));
      p.closeSubpath();
      ctx.addPath(p);
      ctx.setFillColor(t.heute ? farbe(D.akzent) : farbe(D.grau));
      ctx.fillPath();
    }
    // Wochentag unter jeder zweiten Säule und unter heute
    if (i % 2 === (tage.length - 1) % 2) {
      ctx.setFont(Font.mediumSystemFont(8 * s));
      ctx.setTextColor(t.heute ? farbe(D.text) : farbe(D.text3));
      ctx.setTextAlignedCenter();
      const tag = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(t.t).getDay()];
      ctx.drawTextInRect(t.heute ? "heute" : tag, new Rect(i * fach - fach, basisY + 2 * s, fach * 3, 10 * s));
    }
  });
  // Tagesbudget als Bezugslinie (durchgezogen, Haarlinie) mit Beschriftung
  if (budget && budget > 0) {
    const y = basisY - (budget / max) * (basisY - 4 * s);
    ctx.setFillColor(farbe(D.text2));
    ctx.fillRect(new Rect(0, y, breite * s, s / 2));
    ctx.setFont(Font.mediumSystemFont(8 * s));
    ctx.setTextColor(farbe(D.text2));
    ctx.setTextAlignedRight();
    ctx.drawTextInRect("Budget", new Rect(0, y - 11 * s, breite * s, 10 * s));
  }
  return ctx.getImage();
}

function sperrRingBild(d) {
  const g = 120;
  const ctx = new DrawContext();
  ctx.size = new Size(g, g);
  ctx.opaque = false;
  const lw = 11;
  const r = (g - lw) / 2;
  ctx.setStrokeColor(new Color("#ffffff", 0.3));
  ctx.setLineWidth(lw);
  ctx.strokeEllipse(new Rect(g / 2 - r, g / 2 - r, r * 2, r * 2));
  ctx.setFillColor(Color.white());
  for (let a = 0; a <= 360 * d.pct; a += 1.5) {
    const rad = (a - 90) * Math.PI / 180;
    ctx.fillEllipse(new Rect(g / 2 + r * Math.cos(rad) - lw / 2, g / 2 + r * Math.sin(rad) - lw / 2, lw, lw));
  }
  ctx.setTextAlignedCenter();
  ctx.setTextColor(Color.white());
  ctx.setFont(Font.boldRoundedSystemFont(30));
  ctx.drawTextInRect(d.unbegrenzt ? "∞" : fmtGB(d.left, true), new Rect(0, 30, g, 38));
  ctx.setFont(Font.mediumRoundedSystemFont(15));
  ctx.drawTextInRect("GB", new Rect(0, 68, g, 20));
  return ctx.getImage();
}

function sperrBalkenBild(pct) {
  const ctx = new DrawContext();
  ctx.size = new Size(280, 12);
  ctx.opaque = false;
  const spur = new Path();
  spur.addRoundedRect(new Rect(0, 0, 280, 12), 6, 6);
  ctx.addPath(spur);
  ctx.setFillColor(new Color("#ffffff", 0.3));
  ctx.fillPath();
  if (pct > 0) {
    const f = new Path();
    f.addRoundedRect(new Rect(0, 0, Math.max(12, 280 * pct), 12), 6, 6);
    ctx.addPath(f);
    ctx.setFillColor(Color.white());
    ctx.fillPath();
  }
  return ctx.getImage();
}

function hexRGB(hex) {
  const h = String(hex).replace("#", "").slice(0, 6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbHex(rgb) { return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); }
function mischeRGB(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

// ============================================================
//  Übersicht (in der App) – ausführliche Ansicht mit Diagramm
// ============================================================
async function zeigeDashboard(d) {
  const wv = new WebView();
  wv.shouldAllowRequest = (anfrage) => {
    const url = String(anfrage.url || "");
    if (url.startsWith("aldi://")) {
      const was = url.slice(7);
      if (was === "book") Safari.openInApp(BOOKING, false);
      if (was === "portal") Safari.openInApp(OVERVIEW, false);
      if (was === "refresh") {
        holeDaten({ erzwingen: true }).then((neu) => wv.loadHTML(dashboardHTML(neu)));
      }
      return false;
    }
    return true;
  };
  await wv.loadHTML(dashboardHTML(d));
  await wv.present(false);
}

/** Erklärung für die Übersicht, was im Ausland gerade gezeigt wird. */
function roamingText(d) {
  const lage = d.roamingLage;
  if (!lage || !lage.aktiv) return "";
  const wo = lage.manuell ? "Roaming fest eingeschaltet" : `Standort: ${lage.landName || lage.land}`;
  const inland = d.inland && d.ansicht === "roaming"
    ? ` · Inland: ${d.inland.unbegrenzt ? "unbegrenzt" : fmtGB(d.inland.left) + " GB frei"}` : "";
  return `${wo}${inland}${d.roamingHinweis ? " · " + d.roamingHinweis : d.ansicht === "roaming" ? " · Roaming-Volumen wird angezeigt" : ""}`;
}

function dashboardHTML(d) {
  const daten = JSON.stringify({
    ...d,
    left: d.unbegrenzt ? null : d.left,
    total: d.unbegrenzt ? null : d.total,
    statusText: statusText(d),
    resttageText: d.resttage === null ? "–" : `${d.resttage} Tage`,
    ablauf: fmtAblauf(d.expires, false),
    aktualisiert: d.ts ? fmtRelativ(d.ts) : "",
    warnGB: einstellungen.warnGB,
    version: VERSION,
    auslandTitel: auslandTitel(d),
    roamingText: roamingText(d),
  }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
.viz-root { color-scheme: light;
  --page: #f9f9f7; --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --muted: #898781;
  --grid: #e1e0d9; --baseline: #c3c2b7; --border: rgba(11,11,11,0.10);
  --series-1: #2a78d6; --track: #cde2fb; --deemph: #c3c2b7;
  --warning: #fab219; --critical: #d03b3b; --good: #0ca30c; --knopf: #f59c00; }
@media (prefers-color-scheme: dark) { .viz-root { color-scheme: dark;
  --page: #0d0d0d; --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --baseline: #383835; --border: rgba(255,255,255,0.10);
  --series-1: #3987e5; --track: #184f95; --deemph: #383835; } }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
.viz-root { background: var(--page); color: var(--text-primary); min-height: 100vh; padding: 20px 16px 40px; }
header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.logo { background: #2a9ee0; color: #fff; font-weight: 800; font-size: 13px; border-radius: 6px; padding: 3px 6px; }
h1 { font-size: 17px; margin: 0; } .sub { color: var(--text-secondary); font-size: 13px; }
.karte { background: var(--surface-1); border: 1px solid var(--border); border-radius: 16px; padding: 16px; margin-bottom: 12px; }
.held { font-size: 52px; font-weight: 650; line-height: 1; } .held small { font-size: 20px; color: var(--text-secondary); font-weight: 500; }
.meter { height: 10px; border-radius: 5px; background: var(--track); margin: 14px 0 8px; overflow: hidden; }
.meter > div { height: 100%; border-radius: 5px; background: var(--series-1); }
.status { font-size: 13px; color: var(--text-secondary); display: flex; gap: 6px; align-items: center; }
.status .punkt { width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.kpi { background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
.kpi .l { font-size: 12px; color: var(--text-secondary); } .kpi .w { font-size: 20px; font-weight: 600; margin-top: 2px; } .kpi .u { font-size: 11px; color: var(--muted); }
h2 { font-size: 14px; margin: 0 0 2px; } .hinweis { font-size: 12px; color: var(--muted); margin-bottom: 10px; }
svg text { font-family: system-ui, -apple-system, sans-serif; }
.tooltip { position: fixed; pointer-events: none; background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; font-size: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.18); display: none; }
.tooltip b { display: block; font-size: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
td, th { padding: 5px 4px; border-bottom: 1px solid var(--grid); text-align: left; } td:last-child, th:last-child { text-align: right; }
summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); margin-top: 8px; }
.pakete div { display: flex; justify-content: space-between; font-size: 14px; padding: 6px 0; border-bottom: 1px solid var(--grid); }
.knoepfe { display: flex; gap: 10px; margin-top: 4px; }
.knoepfe a { flex: 1; text-align: center; text-decoration: none; font-weight: 650; font-size: 15px; padding: 13px; border-radius: 14px; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); }
.knoepfe a.haupt { background: var(--knopf); color: #1a1a1a; border-color: transparent; }
.roaming { background: var(--surface-1); border: 1px solid var(--border); border-left: 4px solid var(--warning); border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.roaming b { display: block; font-size: 14px; margin-bottom: 2px; }
.fuss { text-align: center; font-size: 11px; color: var(--muted); margin-top: 14px; }
</style></head><body><div class="viz-root">
<header><span class="logo">AT</span><div><h1 id="tarif"></h1><div class="sub" id="nummer"></div></div></header>
<div class="roaming" id="roaming" hidden><b id="roamingTitel"></b><span id="roamingText"></span></div>
<div class="karte"><div class="held" id="held"></div><div class="meter"><div id="fuellung"></div></div><div class="status"><span class="punkt" id="punkt"></span><span id="statustext"></span></div></div>
<div class="kpis" id="kpis"></div>
<div class="karte"><h2>Verbrauch pro Tag</h2><div class="hinweis">Letzte 14 Tage, geschätzt aus den Abfragen des Widgets</div>
<svg id="diagramm" width="100%" height="170" role="img" aria-label="Verbrauch pro Tag der letzten 14 Tage"></svg>
<details><summary>Als Tabelle anzeigen</summary><table id="tabelle"><thead><tr><th>Tag</th><th>Verbrauch</th></tr></thead><tbody></tbody></table></details></div>
<div class="karte pakete" id="pakete"><h2>Pakete</h2></div>
<div class="knoepfe"><a class="haupt" href="aldi://book">＋ Nachbuchen</a><a href="aldi://refresh">↻ Aktualisieren</a><a href="aldi://portal">Portal</a></div>
<div class="fuss" id="fuss"></div>
<div class="tooltip" id="tooltip"></div>
</div>
<script>
const d = ${daten};
const de = (x, n) => x === null || x === undefined || isNaN(x) ? "–" : Number(x).toLocaleString("de-DE", { minimumFractionDigits: n, maximumFractionDigits: n });
const gb = (x) => de(x, x >= 10 ? 1 : 2);
const setze = (id, text) => { document.getElementById(id).textContent = text; };
setze("tarif", d.tarif || "ALDI TALK");
setze("nummer", (d.vertraege && d.vertraege[d.vertragIndex] ? d.vertraege[d.vertragIndex].label : "") + (d.name ? " · " + d.name : ""));
const held = document.getElementById("held");
held.textContent = d.unbegrenzt ? "∞ " : gb(d.left) + " ";
const klein = document.createElement("small"); klein.textContent = d.unbegrenzt ? "unbegrenzt" : "GB " + (d.ansicht === "roaming" ? "Roaming " : "") + "frei von " + gb(d.total) + " GB"; held.appendChild(klein);
if (d.auslandTitel) { document.getElementById("roaming").hidden = false; setze("roamingTitel", d.auslandTitel); setze("roamingText", d.roamingText); }
const fuell = document.getElementById("fuellung");
fuell.style.width = Math.round((d.pct || 0) * 100) + "%";
const statusVar = { leer: "--critical", kritisch: "--critical", warnung: "--warning", gut: "--series-1" }[d.status] || "--series-1";
fuell.style.background = "var(" + statusVar + ")";
document.getElementById("punkt").style.background = "var(" + (d.status === "gut" ? "--good" : statusVar) + ")";
setze("statustext", (d.status === "gut" ? "Alles im grünen Bereich" : d.statusText) + (d.stale ? " · ⚠︎ " + (d.hinweis || "nicht aktuell") : ""));
const kpis = [
  ["Guthaben", isNaN(d.guthaben) ? "–" : de(d.guthaben, 2) + " €", ""],
  ["Laufzeit", d.resttageText, d.ablauf],
  ["Tagesbudget", d.tagesbudget === null ? "–" : gb(d.tagesbudget) + " GB", "bis zum Laufzeitende"],
  ["Prognose", !d.prognose ? "–" : d.prognose.proTag <= 0 ? "kein Verbrauch" : d.prognose.reicht ? "reicht ✓" : "⚠︎ leer am " + new Date(d.prognose.leerAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
    !d.prognose ? "sammelt noch Daten" : "Ø " + gb(d.prognose.proTag) + " GB pro Tag"],
];
for (const [l, w, u] of kpis) {
  const k = document.createElement("div"); k.className = "kpi";
  for (const [cls, text] of [["l", l], ["w", w], ["u", u]]) { const e = document.createElement("div"); e.className = cls; e.textContent = text; k.appendChild(e); }
  document.getElementById("kpis").appendChild(k);
}
// Säulendiagramm: eine Reihe, Säulen ≤ 24 px, oben 4 px rund, unten gerade, Tagesbudget als Haarlinie.
const svg = document.getElementById("diagramm");
const W = Math.round(svg.getBoundingClientRect().width) || 340, H = 170, links = 34, unten = 22, oben = 10;
svg.setAttribute("viewBox", "0 0 " + W + " " + H);
const tage = d.tageVerbrauch || [];
const maxWert = Math.max(d.tagesbudget || 0, ...tage.map(t => t.gb), 0.01);
const schritt = (() => { const roh = maxWert / 3; const p = Math.pow(10, Math.floor(Math.log10(roh))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= roh); })();
const yMax = Math.ceil(maxWert / schritt) * schritt;
const y = v => oben + (H - unten - oben) * (1 - v / yMax);
const ns = "http://www.w3.org/2000/svg";
const el = (n, a) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const style = getComputedStyle(document.querySelector(".viz-root"));
const c = v => style.getPropertyValue(v).trim();
for (let v = 0; v <= yMax + 1e-9; v += schritt) {
  svg.appendChild(el("line", { x1: links, x2: W, y1: y(v), y2: y(v), stroke: v === 0 ? c("--baseline") : c("--grid"), "stroke-width": 1 }));
  const t = el("text", { x: links - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 10, fill: c("--muted") }); t.textContent = de(v, v < 1 && v > 0 ? 1 : 0); svg.appendChild(t);
}
const fach = (W - links) / Math.max(1, tage.length);
const breite = Math.min(24, fach - 4);
const tip = document.getElementById("tooltip");
tage.forEach((t, i) => {
  const x = links + i * fach + (fach - breite) / 2;
  const h = Math.max(0, y(0) - y(t.gb));
  if (h > 0) {
    const r = Math.min(4, h, breite / 2);
    const pfad = "M" + x + "," + y(0) + "V" + (y(0) - h + r) + "Q" + x + "," + (y(0) - h) + " " + (x + r) + "," + (y(0) - h) + "H" + (x + breite - r) + "Q" + (x + breite) + "," + (y(0) - h) + " " + (x + breite) + "," + (y(0) - h + r) + "V" + y(0) + "Z";
    svg.appendChild(el("path", { d: pfad, fill: c("--series-1"), opacity: t.heute ? 1 : 0.55 }));
  }
  const tag = new Date(t.t);
  if (i % 2 === (tage.length - 1) % 2) {
    const lab = el("text", { x: links + i * fach + fach / 2, y: H - 6, "text-anchor": "middle", "font-size": 10, fill: c("--muted") });
    lab.textContent = t.heute ? "heute" : ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][tag.getDay()];
    svg.appendChild(lab);
  }
  // Treffer-Fläche größer als die Säule (ganzes Fach), Tooltip bei Tippen/Zeigen
  const treffer = el("rect", { x: links + i * fach, y: oben, width: fach, height: H - unten - oben, fill: "transparent", tabindex: 0 });
  const zeige = (ev) => {
    tip.replaceChildren();
    const b = document.createElement("b"); b.textContent = gb(t.gb) + " GB";
    const s = document.createElement("span"); s.textContent = tag.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    tip.append(b, s); tip.style.display = "block";
    const box = treffer.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - 110, Math.max(6, box.left + box.width / 2 - 45)) + "px";
    tip.style.top = (box.top + 4) + "px";
  };
  treffer.addEventListener("pointerdown", zeige); treffer.addEventListener("pointermove", zeige); treffer.addEventListener("focus", zeige);
  treffer.addEventListener("pointerleave", () => tip.style.display = "none");
  svg.appendChild(treffer);
  const zeile = document.createElement("tr");
  const a = document.createElement("td"); a.textContent = tag.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const b = document.createElement("td"); b.textContent = gb(t.gb) + " GB";
  zeile.append(a, b); document.querySelector("#tabelle tbody").appendChild(zeile);
});
if (d.tagesbudget) {
  svg.appendChild(el("line", { x1: links, x2: W, y1: y(d.tagesbudget), y2: y(d.tagesbudget), stroke: c("--text-secondary"), "stroke-width": 1 }));
  const bl = el("text", { x: W - 2, y: y(d.tagesbudget) - 4, "text-anchor": "end", "font-size": 10, fill: c("--text-secondary"), stroke: c("--surface-1"), "stroke-width": 3, "paint-order": "stroke" });
  bl.textContent = "Tagesbudget " + gb(d.tagesbudget) + " GB"; svg.appendChild(bl);
}
document.addEventListener("pointerdown", (e) => { if (!(e.target instanceof SVGRectElement)) tip.style.display = "none"; });
const pakete = document.getElementById("pakete");
for (const p of d.pakete || []) {
  const z = document.createElement("div");
  const n = document.createElement("span"); n.textContent = (p.roaming ? "🌍 " : "") + p.name;
  const w = document.createElement("span"); w.textContent = p.unbegrenzt ? "unbegrenzt" : gb(p.left) + " / " + gb(p.total) + " GB";
  z.append(n, w); pakete.appendChild(z);
}
for (const s of d.sonstige || []) {
  const z = document.createElement("div");
  const n = document.createElement("span"); n.textContent = s.typ;
  const w = document.createElement("span"); w.textContent = s.unbegrenzt ? "Flat" : de(s.left, 0) + " von " + de(s.total, 0);
  z.append(n, w); pakete.appendChild(z);
}
setze("fuss", "Aktualisiert " + d.aktualisiert + " · ALDI TALK Widget " + d.version);
</script></body></html>`;
}

// ============================================================
//  Menüs (beim Start in der App oder Antippen des kleinen Widgets)
// ============================================================
async function hauptmenue() {
  // Zugangsdaten wurden abgelehnt: zuerst das klären.
  if (loginSperreAktiv()) {
    const a = new Alert();
    a.title = "ALDI TALK";
    a.message = "ALDI TALK hat die gespeicherten Zugangsdaten abgelehnt:\n\n" + loginSperreText() + "\n\nHast du dein Passwort geändert? Dann bitte neu eingeben.";
    a.addAction("Zugangsdaten neu eingeben");
    a.addAction("Nochmal mit den alten versuchen");
    a.addCancelAction("Abbrechen");
    const wahl = await a.presentAlert();
    if (wahl === -1) return;
    if (wahl === 0) vergissZugangsdaten();
    hebeLoginSperreAuf();
    forceRefresh();
  }

  const d = await holeDaten();
  const m = new Alert();
  m.title = "ALDI TALK";
  m.message = d.error ? "⚠︎ " + d.error
    : (auslandTitel(d) ? auslandTitel(d) + (d.roamingLage.landName ? ` (${d.roamingLage.landName})` : "") + ": " : "")
      + `${d.unbegrenzt ? "Unbegrenztes Datenvolumen" : fmtGB(d.left) + " von " + fmtGB(d.total) + " GB frei"}`
      + (isNaN(d.guthaben) ? "" : ` · Guthaben ${fmtEuro(d.guthaben)}`)
      + (d.resttage !== null && d.resttage !== undefined ? ` · noch ${d.resttage} Tage` : "")
      + (d.hinweis ? "\n⚠︎ " + d.hinweis : "");
  const aktionen = [
    ["📊 Übersicht", async () => zeigeDashboard(d.error ? await holeDaten({ erzwingen: true }) : d)],
    ["↻ Jetzt aktualisieren", async () => zeigeDashboard(await holeDaten({ erzwingen: true }))],
    ["＋ Datenvolumen nachbuchen", async () => Safari.openInApp(BOOKING, false)],
    ["🌐 Kundenportal öffnen", async () => Safari.openInApp(OVERVIEW, false)],
    ["🖼 Widget-Vorschau", async () => vorschauMenue(d)],
    ["⚙️ Einstellungen", async () => einstellungsMenue(d)],
    ["🔑 Zugangsdaten ändern", async () => {
      vergissZugangsdaten(); hebeLoginSperreAuf(); forceRefresh();
      await zeigeDashboard(await holeDaten({ erzwingen: true }));
    }],
  ];
  for (const [text] of aktionen) m.addAction(text);
  m.addCancelAction("Fertig");
  const wahl = await m.presentSheet();
  if (wahl >= 0) await aktionen[wahl][1]();
}

async function vorschauMenue(d) {
  const a = new Alert();
  a.title = "Widget-Vorschau";
  const groessen = [["Klein", "small"], ["Mittel", "medium"], ["Groß", "large"], ["Sperrbildschirm rund", "accessoryCircular"], ["Sperrbildschirm rechteckig", "accessoryRectangular"]];
  for (const [n] of groessen) a.addAction(n);
  a.addCancelAction("Zurück");
  const wahl = await a.presentSheet();
  if (wahl < 0) return;
  const familie = groessen[wahl][1];
  const w = baueWidget(d, familie);
  if (familie === "small") await w.presentSmall();
  else if (familie === "medium") await w.presentMedium();
  else if (familie === "large") await w.presentLarge();
  else if (familie === "accessoryCircular" && w.presentAccessoryCircular) await w.presentAccessoryCircular();
  else if (w.presentAccessoryRectangular) await w.presentAccessoryRectangular();
}

async function einstellungsMenue(d) {
  while (true) {
    const a = new Alert();
    a.title = "Einstellungen";
    a.message = `ALDI TALK Widget ${VERSION}` + (einstellungen.roaming === "auto" ? "\n" + standortText() : "");
    const designNamen = { aldi: "ALDI-Blau", dunkel: "Dunkel", hell: "Hell", auto: "Automatisch (hell/dunkel)" };
    const roamingNamen = { auto: "Automatisch (Standort täglich)", an: "Immer Roaming-Volumen", aus: "Aus (immer Inland)" };
    const punkte = [
      [`Design: ${designNamen[einstellungen.design]}`, "design"],
      [`Volumen-Warnung ab: ${fmtGB(einstellungen.warnGB)} GB`, "warnGB"],
      [`Guthaben-Warnung unter: ${fmtEuro(einstellungen.warnGuthaben)}`, "warnGuthaben"],
      [`Mitteilungen: ${einstellungen.mitteilungen ? "an" : "aus"}`, "mitteilungen"],
      [`Aktualisieren alle: ${einstellungen.cacheMin} Min`, "cacheMin"],
      [`Roaming: ${roamingNamen[einstellungen.roaming] || roamingNamen.auto}`, "roaming"],
    ];
    if (einstellungen.roaming === "auto") punkte.push(["📍 Standort jetzt prüfen", "standort"]);
    if (d && d.vertraege && d.vertraege.length > 1) punkte.push([`Vertrag: ${d.vertraege[Math.min(einstellungen.vertrag, d.vertraege.length - 1)].label}`, "vertrag"]);
    punkte.push(["Verbrauchsverlauf löschen", "verlauf"]);
    punkte.push(["🧪 Daten für Fehlersuche kopieren", "rohdaten"]);
    for (const [t] of punkte) a.addAction(t);
    a.addDestructiveAction("Alles zurücksetzen (inkl. Zugangsdaten)");
    a.addCancelAction("Fertig");
    const wahl = await a.presentSheet();
    if (wahl === -1) return;
    if (wahl === punkte.length) {
      if (await bestaetige("Alles zurücksetzen?", "Zugangsdaten, Einstellungen, Verlauf und zwischengespeicherte Daten werden gelöscht.")) {
        vergissZugangsdaten();
        for (const n of fm.listContents(ORDNER).filter((n) => n.startsWith("alditalk-"))) loesche(n);
        Object.assign(einstellungen, STANDARD);
        standort = null;
        return;
      }
      continue;
    }
    const was = punkte[wahl][1];
    if (was === "design") {
      const keys = Object.keys(designNamen);
      const w = await auswahl("Design", keys.map((k) => designNamen[k]));
      if (w >= 0) einstellungen.design = keys[w];
    } else if (was === "warnGB") {
      const v = await zahlEingabe("Volumen-Warnung", "Ab wie vielen GB Restvolumen warnen?", einstellungen.warnGB);
      if (v !== null) einstellungen.warnGB = Math.max(0, v);
    } else if (was === "warnGuthaben") {
      const v = await zahlEingabe("Guthaben-Warnung", "Warnen, wenn kurz vor der Verlängerung weniger Guthaben da ist als (€):", einstellungen.warnGuthaben);
      if (v !== null) einstellungen.warnGuthaben = Math.max(0, v);
    } else if (was === "mitteilungen") {
      einstellungen.mitteilungen = !einstellungen.mitteilungen;
    } else if (was === "cacheMin") {
      const optionen = [15, 30, 60, 120];
      const w = await auswahl("Aktualisieren alle …", optionen.map((o) => o + " Minuten"));
      if (w >= 0) einstellungen.cacheMin = optionen[w];
    } else if (was === "roaming") {
      const keys = Object.keys(roamingNamen);
      const w = await auswahl("Roaming-Volumen zeigen …", keys.map((k) => roamingNamen[k]));
      if (w >= 0) {
        einstellungen.roaming = keys[w];
        roamingWahl = keys[w];
        if (keys[w] === "auto") await pruefeStandort({ erzwingen: true });
      }
    } else if (was === "rohdaten") {
      const roh = liesJSON(`alditalk-rohdaten-${vertragIndex}.json`, null);
      const info = new Alert();
      info.title = "Fehlersuche";
      if (roh) {
        Pasteboard.copyString(JSON.stringify({ version: VERSION, pakete: (d && d.pakete) || [], standort, roaming: roamingWahl, portal: roh }, null, 1));
        info.message = "Die Paketdaten des Portals sind kopiert – ohne Rufnummer, Namen und Guthaben. Du kannst sie jetzt z. B. in eine Nachricht einfügen.";
      } else {
        info.message = "Noch keine Daten – bitte erst einmal aktualisieren.";
      }
      info.addAction("OK");
      await info.presentAlert();
    } else if (was === "standort") {
      await pruefeStandort({ erzwingen: true });
      const info = new Alert();
      info.title = "Standort";
      info.message = standortText();
      info.addAction("OK");
      await info.presentAlert();
    } else if (was === "vertrag") {
      const w = await auswahl("Vertrag", d.vertraege.map((v) => v.label));
      if (w >= 0) { einstellungen.vertrag = w; vertragIndex = w; }
    } else if (was === "verlauf") {
      if (await bestaetige("Verlauf löschen?", "Der Verbrauch der letzten Tage und die Prognose beginnen neu.")) loesche(verlaufName());
    }
    speichereEinstellungen();
  }
}

function standortText() {
  if (!standort || !standort.land) {
    return "Standort noch unbekannt" + (standort && standort.fehler ? ` (${standort.fehler}) – Ortungsdienste für Scriptable erlauben (\"Beim Verwenden der App oder Widgets\")` : "");
  }
  const wo = `${flagge(standort.land)} ${standort.name}`;
  const art = standort.land === HEIMATLAND ? "Inland" : EU_LAENDER.includes(standort.land) ? "EU-Roaming" : "Ausland außerhalb der EU";
  return `Standort: ${wo} (${art}), geprüft ${fmtRelativ(standort.ts)}` + (standort.fehler && standort.fehlTs > standort.ts ? " – letzte Prüfung fehlgeschlagen" : "");
}

async function auswahl(titel, optionen) {
  const a = new Alert();
  a.title = titel;
  for (const o of optionen) a.addAction(o);
  a.addCancelAction("Abbrechen");
  return a.presentSheet();
}

async function zahlEingabe(titel, text, wert) {
  const a = new Alert();
  a.title = titel;
  a.message = text;
  const f = a.addTextField("", String(wert).replace(".", ","));
  f.setDecimalPadKeyboard();
  a.addAction("Speichern");
  a.addCancelAction("Abbrechen");
  if ((await a.presentAlert()) === -1) return null;
  const v = parseFloat(a.textFieldValue(0).replace(",", "."));
  return isNaN(v) ? null : v;
}

async function bestaetige(titel, text) {
  const a = new Alert();
  a.title = titel;
  a.message = text;
  a.addDestructiveAction("Ja");
  a.addCancelAction("Nein");
  return (await a.presentAlert()) === 0;
}

// ============================================================
//  Formatierung
// ============================================================
function fmtGB(v, kurz) {
  if (v === null || v === undefined || isNaN(v)) return "–";
  if (v === Infinity) return "∞";
  const x = Math.max(0, v);
  if (kurz || x >= 10) return x.toFixed(x >= 100 ? 0 : 1).replace(".", ",");
  return x.toFixed(2).replace(".", ",");
}

function fmtEuro(v) {
  if (v === null || v === undefined || isNaN(v)) return "–";
  return v.toFixed(2).replace(".", ",") + " €";
}

/** Akzeptiert "2026-10-12", "2026-10-12 23:59:59", ISO mit Zeitzone und "12.10.2026". */
function parseDatum(s) {
  if (!s) return null;
  const text = String(s).trim();
  const deutsch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const d = deutsch
    ? new Date(parseInt(deutsch[3], 10), parseInt(deutsch[2], 10) - 1, parseInt(deutsch[1], 10), 23, 59, 59)
    : new Date(text.length === 10 ? text + "T23:59:59" : text.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

function resttage(s) {
  const d = parseDatum(s);
  if (!d) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
}

function fmtDatum(ts) {
  const d = new Date(ts);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + ".";
}

function fmtAblauf(s, mitTagen = true) {
  const d = parseDatum(s);
  if (!d) return "–";
  const tage = resttage(s);
  return fmtDatum(d.getTime()) + (mitTagen && tage !== null ? ` (${tage} T)` : "");
}

function fmtRelativ(ts) {
  if (!ts) return "–";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Std`;
  return "am " + fmtDatum(ts);
}

// ============================================================
//  Einstieg (am Ende der Datei: alle Funktionen und Konstanten sind dann bereit)
// ============================================================
const param = (args.queryParameters && args.queryParameters.param) || "";
// In der App jedes Mal frisch prüfen (höchstens alle 10 Minuten), im Widget einmal am Tag.
const inDerApp = !(config.runsInWidget || config.runsInAccessoryWidget);
if (roamingWahl === "auto" && param !== "book" && param !== "portal") {
  await pruefeStandort({ erzwingen: inDerApp && !(standort && standort.ts && Date.now() - standort.ts < 10 * 60 * 1000) });
}

if (param === "book") {
  // Nachbuchen in der Buchungsübersicht (Safari-Sitzung – dort meist schon angemeldet).
  Safari.openInApp(BOOKING, false);
} else if (param === "portal") {
  Safari.openInApp(OVERVIEW, false);
} else if (param === "refresh") {
  const daten = await holeDaten({ erzwingen: true });
  await zeigeDashboard(daten);
} else if (param === "dashboard") {
  await zeigeDashboard(await holeDaten());
} else if (param === "menu") {
  await hauptmenue();
} else if (config.runsInWidget || config.runsInAccessoryWidget) {
  const familie = config.widgetFamily || "small";
  const daten = await holeDaten();
  await pruefeWarnungen(daten);
  const widget = baueWidget(daten, familie);
  Script.setWidget(widget);
} else {
  await hauptmenue();
}
Script.complete();
