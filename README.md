# ALDI TALK Widget für Scriptable (iOS)

*[English below](#english)*

Zeigt dein ALDI-TALK-Datenvolumen, Guthaben und die Laufzeit auf dem iPhone – als Widget
auf dem Home- und Sperrbildschirm und als ausführliche Übersicht in der App.
Auf Deutsch und Englisch.

## Was es kann

- **Alle Widget-Größen:** klein, mittel, groß – und auf dem Sperrbildschirm rund,
  rechteckig oder als Textzeile.
- **Alle Datenpakete zusammen:** Tarifvolumen plus nachgebuchte Pakete und
  Gratis-Volumen, einzeln aufgelistet.
- **Roaming:** Im EU-Ausland zeigt das Widget mit Landesflagge (z. B. „🇩🇰 Roaming“) das
  EU-Roaming-Volumen, also die Fair-Use-Grenze, die ALDI TALK im Portal ausweist. Tarif- und
  Gratis-Volumen gelten im Ausland nicht und werden nicht dazugezählt. Außerhalb der EU
  kommt eine Kosten-Warnung, beim Wechsel in ein anderes Land einmal eine Mitteilung.
- **Ländererkennung:** per GPS; geht das nicht, über die Zeitzone des iPhones (iOS stellt
  sie bei der Einreise automatisch um); sonst das zuletzt bekannte Land. Wechselt die
  Zeitzone, prüft das Widget sofort neu. Das Land lässt sich auch fest einstellen.
  Ein Länderverlauf zeigt, wann welches Land erkannt wurde.
- **Tagesbudget:** wie viel du pro Tag bis zum Laufzeitende verbrauchen kannst.
- **Verbrauch pro Tag** der letzten 14 Tage als Säulendiagramm (großes Widget und
  Übersicht) – das Widget merkt sich dafür die Stände seiner Abfragen.
- **Prognose:** reicht das Volumen bei deinem Verbrauch bis zum Laufzeitende?
- **Mitteilungen:** wenn das Volumen knapp wird, die Prognose kippt oder das Guthaben
  kurz vor der Verlängerung nicht reicht (jeweils nur einmal pro Laufzeit).
- **Übersicht in der App:** großer Ring mit Umschalter Roaming/Inland, Kennzahlen,
  Standort-Karte, Diagramm (antippen zeigt den Wert, auch als Tabelle), alle Pakete mit
  Füllbalken, Knöpfe zum Nachbuchen, Aktualisieren und fürs Kundenportal.
- **Designs:** ALDI-Blau, Dunkel, Hell oder Automatisch – pro Widget wählbar.
- **Sprache:** Deutsch oder Englisch – automatisch wie das iPhone oder fest eingestellt.
- **Mehrere Rufnummern** im selben Kundenkonto – mit dem Widget-Parameter `alle` auch
  untereinander in einem Widget (bis zu 4), mit eigenen Namen wie „Papa“.
- **Siri & Kurzbefehle:** „Hey Siri, ALDI TALK“ – Siri sagt Restvolumen, Verlängerung,
  Prognose und Guthaben (Anleitung im Menü unter „🎙 Siri & Kurzbefehle“).
- **Tipps per Mitteilung:** wenn kurz vor der Verlängerung noch viel Volumen übrig ist,
  wenn heute ungewöhnlich viel verbraucht wurde (z. B. ein Update übers Mobilnetz) und
  wenn sich der Tarif verlängert hat – mit dem Verbrauch des letzten Zeitraums.
- **Rückblick & Tarif-Check:** die Übersicht zeigt den Verbrauch der letzten Zeiträume und
  ab zwei vollständigen Zeiträumen, ob ein kleinerer oder größerer Tarif besser passt.
- **Erinnerung an die Verlängerung** in der Erinnerungen-App (1 oder 3 Tage vorher),
  jedes Mal automatisch neu eingetragen.
- **Tagesbudget-Ampel:** „Heute 0,40 / 0,55 GB“ in grün, gelb oder rot – und eine Mitteilung, wenn
  das Tagesbudget überschritten ist.
- **StandBy:** Widget-Parameter `standby` – eine riesige Zahl fürs quer liegende iPhone am Ladekabel.
- **Aufladungen** werden erkannt (Guthaben steigt) und in der Übersicht aufgelistet.
- **Wann du surfst:** Verbrauch nach Tageszeit (Nacht, Vormittag, Nachmittag, Abend) in der Übersicht.
- **Reise-Vorschau** (Land & Roaming): Land wählen und sehen, was dort gilt.
- **Home Assistant:** Restvolumen, Guthaben, Laufzeit und heutiger Verbrauch als Sensoren
  `sensor.aldi_talk_…` (Einstellungen → Home Assistant; nutzt auf Wunsch einen vorhandenen Zugang).
- **iPhone & iPad abgleichen** über iCloud (Einstellungen, Verlauf, Rückblick, Aufladungen).

## Einrichten

1. Die App [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) installieren.
2. In Scriptable ein neues Skript anlegen, **genau `AldiTalk` nennen** und den
   Inhalt von [`AldiTalk.js`](AldiTalk.js) hineinkopieren.
3. Das Skript **einmal in der App starten** und die Zugangsdaten des
   ALDI-TALK-Kundenportals eingeben. Sie werden nur im iOS-Schlüsselbund gespeichert.
4. Ein Scriptable-Widget auf den Home- oder Sperrbildschirm legen und als Skript
   `AldiTalk` wählen.

**Standort:** Für die Ländererkennung fragt iOS beim ersten Start nach dem Standort. In
*Einstellungen → Datenschutz → Ortungsdienste → Scriptable* „Beim Verwenden der App oder
Widgets“ wählen. Geprüft wird grob (auf ca. 1 km); gespeichert wird nur das Land.
Für die Erkennung über die Zeitzone: *Einstellungen → Allgemein → Datum & Uhrzeit →
Automatisch einstellen* eingeschaltet lassen.

**Widget-Parameter** (optional, beim Bearbeiten des Widgets, mit Komma kombinierbar):
`2` = zweite Rufnummer des Kontos · `hell` / `dunkel` / `aldi` / `auto` = Design ·
`roaming` / `inland` = immer Roaming- bzw. Inlandsvolumen · `de` / `en` = Sprache ·
`alle` = alle Rufnummern in einem Widget · `standby` = riesige Zahl (StandBy). Beispiel: `2, hell, en`.

**Siri:** In der Kurzbefehle-App einen Kurzbefehl mit der Aktion „Skript ausführen“
(Scriptable) anlegen, das Skript `AldiTalk` wählen und ihn z. B. „ALDI TALK“ nennen.

## In der App

Startest du das Skript in Scriptable (oder tippst auf das kleine Widget), erscheint ein
Menü: Übersicht, Aktualisieren, Nachbuchen, Kundenportal, **Land & Roaming**
(Roaming-Anzeige, Land festlegen, wie oft geprüft wird, jetzt prüfen, Länderverlauf),
Widget-Vorschau, **Einstellungen** (Sprache, Design, Warnschwellen, Mitteilungen,
Aktualisierungsintervall, Rufnummer, Verlauf löschen, Daten für Fehlersuche, alles
zurücksetzen) und Zugangsdaten ändern.

## Wenn „Zugangsdaten abgelehnt“ erscheint

ALDI TALK hat die gespeicherten Zugangsdaten nicht akzeptiert – meist, weil das
Passwort geändert wurde (ALDI TALK verlangt mindestens 12 Zeichen). Das Widget probiert
dann bewusst **nicht** weiter, sonst sperrt ALDI TALK das Konto vorübergehend. Einfach
das Skript einmal in der App öffnen und „Zugangsdaten neu eingeben“ wählen.

## Hinweise

- Inoffiziell, kein Produkt von ALDI TALK. Das Widget meldet sich wie ein Browser am
  Kundenportal an; ändert ALDI TALK die Anmeldung, muss das Skript angepasst werden.
- Der Tagesverbrauch ist eine Schätzung aus den Abfragen des Widgets (standardmäßig alle
  30 Minuten). Fragt das iPhone länger nicht ab, landet der Verbrauch beim nächsten Tag
  mit Abfrage.
- Roaming: ALDI TALK kennzeichnet jedes Datenpaket als „Inland“ oder „Roaming EU“. Fehlt
  diese Angabe, schätzt das Widget im EU-Ausland ⅔ des Tarifvolumens und sagt das dazu.
- Zeigt das Widget falsche Werte: *Einstellungen → 🧪 Daten für Fehlersuche kopieren*. Das
  kopiert die Paketdaten des Portals ohne Rufnummer, Namen und Guthaben.

---

<a id="english"></a>
## English

A Scriptable widget for iPhone that shows your ALDI TALK (Germany) data, balance and
renewal date – on the home and lock screen, plus a detailed overview in the app.
German and English; the language follows the iPhone or can be set in *Settings → Language*.

**Features:** all widget sizes incl. lock screen · all data packs combined (plan, add-ons,
bonus volume) · **EU roaming:** abroad in the EU it shows the EU roaming allowance (the
fair-use limit reported by ALDI TALK) with the country's flag; outside the EU a cost
warning · **country detection** via GPS, falling back to the iPhone's time zone, or set
manually; a time-zone change triggers an immediate re-check; country history · daily
budget · usage per day (14 days) · forecast · notifications · overview with roaming/home
toggle · designs · several phone numbers (parameter `alle` shows them all in one widget) ·
**Siri & Shortcuts** (“Hey Siri, ALDI TALK” reads out data, renewal, forecast and balance) ·
tips (data left over before renewal, unusually high usage, plan renewed) · review of past
periods with a plan check · renewal reminder in the Reminders app.

**Setup:** install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188), create a
script named exactly `AldiTalk`, paste [`AldiTalk.js`](AldiTalk.js), run it once in the app
and enter your customer-portal login (stored only in the iOS keychain), then add a
Scriptable widget and pick `AldiTalk`. Allow location access for Scriptable
(“While Using the App or Widgets”).

**Widget parameter** (optional, comma-separated): `2` second number · `hell`/`dunkel`/`aldi`/`auto`
design · `roaming`/`inland` always roaming/home allowance · `de`/`en` language · `alle` all numbers.

If “Login rejected” appears, ALDI TALK refused the saved login (usually a changed
password). The widget deliberately stops trying so the account doesn't get locked – open
the script in the app and enter the login again.

Unofficial, not a product of ALDI TALK.

## Updates

Das Skript prüft einmal am Tag, ob es eine neue Version gibt (Kanal: github.com/Teyro/Scriptable-Updates),
und installiert sie automatisch – vorher wird die Datei auf Echtheit geprüft, die alte Fassung bleibt als
Sicherung. Im Skript-Menü unter „⬆️ Updates“: jetzt suchen, automatisch / nur melden / aus.
