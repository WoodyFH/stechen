# Stechen

Progressive Web App zum Mitzählen von Ansagen und Punkten beim Kartenspiel **Stechen**.
Das Handy liegt flach in der Mitte, bis zu vier Leute sitzen drumherum. Komplett lokal:
kein Backend, keine Datenbank, alles im `localStorage`. Läuft offline und ist auf iPhone,
Android und Windows installierbar. Oberfläche auf Deutsch.

Technik: Vanilla HTML, CSS und JS (ES-Module), kein Framework, **kein Build-Schritt**.

## Dateien

```
index.html            Einstieg, iOS-Meta-Tags
styles.css            dunkles Theme, Layouts, Animationen
manifest.webmanifest  Web-App-Manifest (standalone, Hochformat, relative Pfade)
sw.js                 Service Worker (offline, cache-first, versionierter Cache)
version.js            einzige Stelle für die Versionsnummer
icons/                192, 512, maskable 512, apple-touch-icon 180, SVG
js/logic.js           Spiellogik, reine Funktionen ohne DOM und Speicher
js/store.js           localStorage (laden/speichern, Plausibilitätsprüfung)
js/board.js           Spielfeld: Quadranten und Liste
js/overlays.js        Menü, Punktetabelle, Einstellungen, Rückfragen
js/screens.js         Startbildschirm, Endwertung
js/dom.js             DOM-Helfer, Icons, Haptik, animierte Zahlen
js/app.js             Steuerung, Wake Lock, Service-Worker-Registrierung
tests/                Node-Tests der Spiellogik
tools/                Test- und Hilfsskripte (Server, Playwright, Icons)
```

## Lokal ausprobieren

```powershell
npm install            # nur für Tests und Playwright nötig, die App selbst braucht nichts
npm test               # Node-Tests der Spiellogik
npm run serve          # http://localhost:4173/stechen/
```

`npm run serve` liefert das Projekt unter `/stechen/` aus, genau wie GitHub Pages, damit
die relativen Pfade realistisch getestet werden.

Weitere Prüfungen (benötigen Playwright, einmalig `npx playwright install chromium`):

```powershell
npm run screenshots    # Layout in 390x844 und 360x640, Bilder in screenshots/
npm run e2e            # kompletter Spieldurchlauf per Klicks
npm run check-pwa      # Manifest, Offline-Start, Update-Verhalten des Service Workers
npm run icons          # Icons neu erzeugen
```

## Deployen auf GitHub Pages

Alle Dateien liegen im Hauptverzeichnis, Pages liefert direkt vom `main`-Branch aus.

**Mit der GitHub-CLI (`gh`)**

```powershell
git init -b main
git add .
git commit -m "Stechen"
gh repo create stechen --public --source . --push
gh api -X POST repos/{owner}/stechen/pages -f "source[branch]=main" -f "source[path]=/"
```

**Ohne `gh`**

1. Auf github.com ein neues **öffentliches** Repository `stechen` anlegen (ohne README).
2. Im Projektordner:

   ```powershell
   git init -b main
   git add .
   git commit -m "Stechen"
   git remote add origin https://github.com/NUTZERNAME/stechen.git
   git push -u origin main
   ```

3. Im Repository **Settings → Pages**: *Source* = **Deploy from a branch**, *Branch* = `main`,
   Ordner `/ (root)`, speichern.
4. Nach ein bis zwei Minuten läuft die App unter `https://NUTZERNAME.github.io/stechen/`.

Die App funktioniert nur unter genau dieser Adresse, weil alle Pfade relativ sind
(`start_url` und `scope` im Manifest, Registrierung des Service Workers, alle Assets).

## Deployen auf Vercel

1. Repository bei GitHub anlegen und pushen (wie oben, Schritte 1 und 2).
2. Auf vercel.com **Add New → Project**, das Repository wählen.
3. *Framework Preset*: **Other**, *Build Command* und *Output Directory* leer lassen.
4. Deploy. Die App läuft dann direkt unter der Vercel-Adresse (auch dort funktionieren die relativen Pfade).

## Updates ausliefern

1. Änderungen machen.
2. In [version.js](version.js) die Nummer hochzählen (`globalThis.STECHEN_VERSION = 2;`).
3. Committen und pushen.

Der Service Worker legt aus der Nummer den Cache `stechen-v<Nummer>` an, lädt alle Dateien
frisch, löscht alte Caches und übernimmt sofort. Eine geöffnete App lädt sich dann einmal
neu. Der Spielstand bleibt dabei erhalten. Die aktuelle Version steht unten in den
Einstellungen. Wer die Nummer vergisst, bekommt auf den Handys die alte Version zu sehen.

## App installieren

**iPhone (Safari)**: Adresse in Safari öffnen, **Teilen** (Quadrat mit Pfeil) →
**Zum Home-Bildschirm** → **Hinzufügen**.

**Android (Chrome)**: Adresse öffnen, Menü (drei Punkte) → **App installieren**
(oder **Zum Startbildschirm hinzufügen**). In den Einstellungen der App gibt es dafür
auch einen Knopf, sobald Chrome die Installation anbietet.

**Windows (Edge oder Chrome)**: Adresse öffnen, in der Adressleiste auf das
Installieren-Symbol klicken (oder Menü → **Apps → Diese Website als App installieren**).

## Bedienung in Kürze

- **Start:** Spieleranzahl (2 bis 6) und Namen eintragen, Reihenfolge im Uhrzeigersinn.
  Dann den ersten Geber antippen oder **Zufällig** wählen (Lauflicht).
- **Ansage:** Die Spieler sind nacheinander dran, links vom Geber zuerst, der Geber zuletzt.
  Großes Plus, kleines Minus, Haken bestätigt. Ab Runde 5 (einstellbar) ist die Zahl, bei der
  die Summe der Kartenzahl entspricht, beim Geber gesperrt und rot markiert.
- **Ergebnis (Stiche):** sieht bewusst anders aus als die Ansage (gestrichelter Rahmen, Feld
  „Stiche“, die Ansage als feste Marke darunter). Alle Quadranten sind gleichzeitig aktiv und
  tragen ihre Stiche ein. Fehlt nur noch einer, wird sein Wert vorgeschlagen. Sind schon alle
  Stiche vergeben, zählen leere Felder als 0, man muss keine 0 eintippen. Ein Tipp auf „–“
  trägt ebenfalls direkt 0 ein.
- **Mittelpunkt:** zeigt die verbleibenden Stiche (grün bei 0, rot mit `+N` bei Überschuss).
  Antippen öffnet das Menü: Rückgängig, Punktetabelle, Einstellungen, Neues Spiel.
- **Weiter** (in der Mitte, immer sichtbar) geht nur, wenn die Summe der Stiche der Kartenzahl
  entspricht. Solange Stiche fehlen, steht dort „Stiche fehlen“, bei falscher Summe „2 zu viel“
  oder „1 fehlt“, mit dem Ausweg **Trotzdem speichern**.
- **Punkte** (alle Werte in den Einstellungen änderbar, die Gesamtpunkte werden immer live
  aus den gespeicherten Ansagen und Stichen berechnet und rechnen rückwirkend neu):
  Treffer 10 + 2 pro angesagtem Stich, gelungene 0 = 10 + 1 pro Karte der Runde,
  daneben −3 pro Stich Abweichung.
- **Neues Spiel** führt zurück zum Start: Spieleranzahl und Namen sind vorbelegt und wieder
  änderbar, dann Geber wählen. **Spiel löschen** (Einstellungen) verwirft das laufende Spiel
  ebenfalls. Beides mit Rückfrage.
- Spielerzahl und Ansageverbot-Startrunde gelten ab dem nächsten Spiel, Rundenzahl und
  Punktewerte sofort.

## Hinweise

- Vibration (`navigator.vibrate`) funktioniert auf Android, auf dem iPhone gibt es sie im Web nicht.
- Der Bildschirm bleibt per Wake Lock an, solange gespielt wird (iOS ab 16.4).
- `prefers-reduced-motion` wird beachtet: keine Pulse- und Zählanimationen.
- Die Daten liegen nur im Browser des jeweiligen Geräts. Wer die Website-Daten löscht, verliert den Spielstand.
