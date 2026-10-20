# ALDI TALK Widget für Scriptable (iOS)

Zeigt dein ALDI-TALK-Datenvolumen, Guthaben und die Laufzeit auf dem iPhone – als Widget
auf dem Home- und Sperrbildschirm und als ausführliche Übersicht in der App.

## Was es kann

- **Alle Widget-Größen:** klein, mittel, groß – und auf dem Sperrbildschirm rund,
  rechteckig oder als Textzeile.
- **Alle Datenpakete zusammen:** Tarifvolumen plus nachgebuchte Pakete, einzeln aufgelistet.
- **Tagesbudget:** wie viel du pro Tag bis zum Laufzeitende verbrauchen kannst.
- **Verbrauch pro Tag** der letzten 14 Tage als Säulendiagramm (großes Widget und
  Übersicht) – das Widget merkt sich dafür die Stände seiner Abfragen.
- **Prognose:** reicht das Volumen bei deinem Verbrauch bis zum Laufzeitende?
- **Mitteilungen:** wenn das Volumen knapp wird, die Prognose kippt oder das Guthaben
  kurz vor der Verlängerung nicht reicht (jeweils nur einmal pro Laufzeit).
- **Übersicht in der App** mit großem Diagramm (antippen zeigt den Wert, auch als
  Tabelle), allen Paketen, Minuten/SMS und Knöpfen zum Nachbuchen und Aktualisieren.
- **Knöpfe im Widget:** Nachbuchen und Aktualisieren direkt im mittleren und großen Widget.
- **Designs:** ALDI-Blau, Dunkel, Hell oder Automatisch – pro Widget wählbar.
- **Mehrere Rufnummern** im selben Kundenkonto.
- **Roaming:** Einmal am Tag prüft das Widget per Standort, in welchem Land du bist. Im
  Ausland zeigt es mit Landesflagge (z. B. „🇪🇸 Roaming“) das Roaming-Volumen, sofern
  ALDI TALK ein eigenes ausweist – sonst das normale Volumen mit Hinweis, außerhalb der
  EU mit Kosten-Warnung. Beim Wechsel in ein anderes Land kommt einmal eine Mitteilung.
  In den Einstellungen umschaltbar: Automatisch, Immer Roaming oder Aus.

## Einrichten

1. Die App [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) installieren.
2. In Scriptable ein neues Skript anlegen, **genau `AldiTalk` nennen** und den
   Inhalt von [`AldiTalk.js`](AldiTalk.js) hineinkopieren.
3. Das Skript **einmal in der App starten** und die Zugangsdaten des
   ALDI-TALK-Kundenportals eingeben. Sie werden nur im iOS-Schlüsselbund gespeichert.
4. Ein Scriptable-Widget auf den Home- oder Sperrbildschirm legen und als Skript
   `AldiTalk` wählen.

**Widget-Parameter** (optional, beim Bearbeiten des Widgets):
`2` = zweite Rufnummer des Kontos · `hell` / `dunkel` / `aldi` / `auto` = Design für
dieses Widget · `roaming` / `inland` = dieses Widget zeigt immer Roaming- bzw.
Inlandsvolumen · `2, hell` = beides.

**Standort:** Für die automatische Roaming-Erkennung fragt iOS beim ersten Start nach
dem Standort. Dafür in *Einstellungen → Datenschutz → Ortungsdienste → Scriptable*
„Beim Verwenden der App oder Widgets“ wählen. Geprüft wird nur grob (auf ca. 3 km) und
höchstens einmal am Tag; gespeichert wird nur das Land.

## In der App

Startest du das Skript in Scriptable (oder tippst auf das kleine Widget), erscheint ein
Menü: Übersicht, Aktualisieren, Nachbuchen, Kundenportal, Widget-Vorschau,
**Einstellungen** (Design, Warnschwellen für Volumen und Guthaben, Mitteilungen,
Aktualisierungsintervall, Roaming, Standort jetzt prüfen, Rufnummer, Verlauf löschen,
alles zurücksetzen) und
Zugangsdaten ändern.

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
- Wie ALDI TALK Roaming-Pakete im Portal kennzeichnet, ist nicht offiziell dokumentiert.
  Das Widget erkennt sie an Feldern bzw. am Namen („EU-Roaming“, „Ausland“, „World“ …).
  Wird keins erkannt, gilt im EU-Ausland das normale Volumen.
