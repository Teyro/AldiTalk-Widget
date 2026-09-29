# ALDI TALK Widget für Scriptable (iOS)

Zeigt das verbleibende Datenvolumen, das Guthaben und die Restlaufzeit deines
ALDI-TALK-Tarifs als Widget auf dem iPhone-Homescreen – mit Knopf zum
Nachbuchen.

## Einrichten

1. Die App [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) installieren.
2. In Scriptable ein neues Skript anlegen, **genau `AldiTalk` nennen** und den
   Inhalt von [`AldiTalk.js`](AldiTalk.js) hineinkopieren.
3. Das Skript **einmal in der App starten** und die Zugangsdaten des
   ALDI-TALK-Kundenportals eingeben (Rufnummer + Passwort). Sie werden nur im
   iOS-Schlüsselbund gespeichert, nirgendwo sonst.
4. Auf dem Homescreen ein Scriptable-Widget hinzufügen (am besten **mittel**,
   nur dort ist der Nachbuch-Knopf direkt tippbar) und als Skript `AldiTalk`
   auswählen.

## Wenn „Zugangsdaten abgelehnt“ erscheint

ALDI TALK hat die gespeicherten Zugangsdaten nicht akzeptiert – meist, weil das
Passwort inzwischen geändert wurde (ALDI TALK verlangt mindestens 12 Zeichen).
Das Widget probiert dann bewusst **nicht** weiter (sonst sperrt ALDI TALK das
Konto nach mehreren Fehlversuchen vorübergehend). Einfach das Skript einmal in
der App öffnen und „Zugangsdaten neu eingeben“ wählen. Beim kleinen Widget geht
das auch über das Menü → „Zugangsdaten ändern“.

## Hinweis

Inoffiziell, kein Produkt von ALDI TALK. Das Widget meldet sich wie ein Browser
am Kundenportal an; ändert ALDI TALK die Anmeldung, muss das Skript eventuell
angepasst werden.
