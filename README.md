# Gitarrenlehrer – Version 0.7

Browser-App (PWA) für Westerngitarre, klassische Gitarre und E-Gitarre. Läuft unter Ubuntu/Brave und lässt sich auf Android als App installieren. Alle Daten bleiben im jeweiligen Browser.

## Lokal starten

```bash
npm install
npm test        # Selbsttests für Akkord-Erkennung, Transponieren, Capo
npm run dev     # http://localhost:5173 (mit --host auch im WLAN erreichbar)
```

## Veröffentlichen auf GitHub Pages

1. Neues Repository anlegen und den Ordner hochladen (`git init`, `git add .`, `git commit`, `git push`).
2. Im Repository: Settings → Pages → Source: „GitHub Actions“.
3. Jeder Push auf `main` baut und veröffentlicht automatisch (`.github/workflows/deploy.yml`).
4. Auf dem Android-Smartphone die Seite in Chrome oder Brave öffnen und „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen.

## Lieder anlegen

Zwei Formate werden erkannt, auch gemischt:

- **Akkorde über dem Text** (wie bei Ultimate Guitar): Akkordzeile und Textzeile direkt untereinander.
- **ChordPro**: `[G]Die Gedanken sind [D7]frei`, optional `{title: …}`, `{artist: …}`, `{capo: 2}`, `{tempo: 96}`.

Abschnitte: `[Strophe 1]`, `[Refrain]`, `[Chorus]`, `Bridge:`.

## Bedienung im Liedblatt

| Funktion | Bedienung |
|---|---|
| Tonart an Stimme anpassen | „Tonart −/+“ (Halbtonschritte) |
| Capo | „Capo −/+“, die Akkorde zeigen dann die zu greifenden Formen |
| Capo-Vorschlag | „Vorschlag“: gleiche Tonart mit den leichtesten Griffen |
| Griffbild | Akkord im Text antippen |
| Autoscroll | „Scrollen starten“ oder Leertaste, Tempo per Regler |
| Schriftgröße | A− / A+ oder Tasten − / + |
| Deutsche Notation (H) | Profil → Darstellung |

## Lieder von Ultimate Guitar übernehmen

Profil → „Lieder von Ultimate Guitar übernehmen“: den gelben Knopf „→ Gitarrenlehrer“ in die Lesezeichenleiste ziehen (Strg+Umschalt+B blendet sie ein). Danach auf einer Liedseite auf das Lesezeichen klicken. Findet es nichts, den Liedtext markieren und erneut klicken. Die App öffnet sich mit ausgefülltem Editor.

Das Lesezeichen enthält die Adresse der App. Für die localhost-Version und die GitHub-Version braucht es je ein eigenes Lesezeichen.

**Capo:** Steht im Liedblatt „Capo: 2nd fret“, sind die Akkorde dort Griffe für Capo 2. Die App übernimmt das als „Capo laut Liedblatt“ und zeigt die klingende Tonart korrekt an. Mit dem Capo-Regler im Liedblatt kannst du davon abweichen, die Griffe werden dann umgerechnet.

**Tabs** (`e|---0---`) erscheinen als Block in Festbreitenschrift und werden nicht transponiert.

## Sicherung

Profil → „Sicherung herunterladen“ erzeugt eine JSON-Datei. Auf dem anderen Gerät „Sicherung einspielen“. Bitte regelmäßig sichern: Wird der Browserspeicher gelöscht (z. B. durch Brave-Datenschutzeinstellungen), sind die Lieder sonst weg.

## Aufbau

```
src/lib/chords.js     Akkorde erkennen, transponieren, Capo-Vorschläge
src/lib/parser.js     Liedtext → Zeilen mit Akkord-Segmenten
src/lib/shapes.js     Griffbilder (offene Akkorde + Barré-Generator)
src/lib/storage.js    Speicherung, Export/Import, Profil
src/components/       Liste, Liedblatt, Editor, Griffbild, Profil
```

## Lehrer-Chat (Stufe 2)

Der Chat läuft über einen eigenen Cloudflare Worker (Ordner `worker/`). Er hält den Anthropic-API-Key geheim und reicht die Antworten live an die App weiter.

Einrichtung siehe Anleitung im Chat; Kurzfassung:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
openssl rand -hex 24        # Zugangsschlüssel erzeugen
npx wrangler secret put APP_TOKEN
npx wrangler deploy
```

Danach in der App: Profil → Lehrer-Verbindung → Worker-Adresse und Zugangsschlüssel → „Verbindung testen“.

Modell, Antwortlänge, erlaubte App-Adressen und Tageslimit stehen in `worker/wrangler.toml`. Diese Datei gehört dir: Updates bringen nur `wrangler.template.toml` mit. Veröffentlichen mit `npm run deploy` (im Ordner `worker`).

Hilfsbefehle im Ordner `worker`:

| Befehl | Wirkung |
|---|---|
| `npm run deploy` | Worker veröffentlichen (legt `wrangler.toml` an, falls sie fehlt) |
| `npm run adresse -- https://name.github.io` | Weitere App-Adresse freigeben |
| `npm run abgleich-einrichten` | Speicher für den Abgleich zwischen Geräten anlegen und eintragen |
| `npm run limit-einrichten` | Tageslimit für Lehrer-Fragen anlegen und eintragen |

## Hören (Stufe 3)

Reiter „Hören“, Mikrofon einschalten (nur auf `localhost` oder über https möglich):

| Modus | Ablauf |
|---|---|
| Saite für Saite | Akkord greifen, Saiten einzeln von tief nach hoch anschlagen. Ergebnis je Saite: sauber, falscher Ton, gedämpft, unsauber. Mit „Leersaiten“ als Stimmungs-Check |
| Ganzer Akkord | Akkord einmal anschlagen. Balken zeigen die gehörten Töne; petrol = gehört dazu, rot = gehört nicht dazu |
| Timing | Kopfhörer auf, 4 Klicks Einzählen, dann auf jede Zählzeit ein Abschlag. Ergebnis: früh/spät, Gleichmäßigkeit, schneller/langsamer werdend. Einmal über Lautsprecher „Kalibrieren“ |

„Lehrer kommentieren lassen“ schickt das Ergebnis an den Lehrer-Chat. Die letzten Messungen werden gespeichert.


## Videos und Theorie (Stufe 4)

**Videos:** YouTube-Link einfügen (funktioniert immer) oder Suchbegriff eingeben (braucht `YOUTUBE_API_KEY` im Worker). Im Player: Tempo 0,5×/0,75×/1×, −5 s, Schleife mit A und B, Stellen merken, Notizen, mit Liedern verknüpfen. Verknüpfte Videos erscheinen im Liedblatt.

**Theorie:** Tonart und Stufen des gewählten Lieds, Akkordfamilien, Capo-Tabelle, Schlagmuster zum Vorspielen, CAGED, Spielen und Singen. Überall „Lehrer dazu fragen“.

## Neu in 0.5

| Bereich | Neu |
|---|---|
| Liedblatt | „Mitspielen“: Einzählen, Metronom im Liedtempo, Scrollen passend zum Tempo. Im Editor: Taktart, Takte pro Zeile |
| Hören → Wechsel | Akkordwechsel-Trainer: 30 oder 60 Sekunden zwischen zwei Akkorden, Zählung sauberer Wechsel, Verlauf |
| Hören → Stimme | Stimmumfang messen; Singprobe pro Lied; Vorschlag für Tonart und Capo mit „Übernehmen“ |
| Hören → Aufnahme | Lied aufnehmen, anhören, herunterladen; Tempoverlauf über das Lied |
| Lehrer | Kennt deine Messungen und deinen Stimmumfang |
| Profil | Abgleich zwischen Geräten über den Worker |

## Neu in 0.6: Kamera

„Hören“ → „Kamera“: Live-Spiegel, Videoaufnahme mit Ton, Wiedergabe mit Zeitlupe (0,25× bis 1×), Bild für Bild, Schleife, Tempo aus der Tonspur. „Standbild“ bzw. „Standbild für Lehrer“ sammelt bis zu drei Bilder, die der Lehrer auswertet. Bilder werden nur mit dieser einen Frage gesendet, nicht bei Folgefragen. Videos bleiben auf dem Gerät (Download möglich). Der Worker muss dafür aktualisiert sein (`npm run deploy`).

## Neu in 0.7: Muster hören

- Theorie → „Schlag- und Zupfmuster“: alle Muster mit Gitarrenklang auf wählbarem Akkord, Zupfmuster mit Tab und Fingersatz (Arpeggio, Wechselbass, Travis, Walzer, 6/8).
- Liedblatt → „Begleitung ▶“: Das Lied wird mit seinen Akkorden und dem gewählten Muster im Liedtempo vorgespielt, mit Einzählen; der klingende Akkord ist markiert, das Liedblatt folgt automatisch. Taktart und „Takte pro Zeile“ im Editor bestimmen den Ablauf.
- Scrollen: unterste Stufe deutlich langsamer (1 Pixel/s), feinere Stufen.

## Auf dem Handy (GitHub Pages)

1. Repository auf GitHub anlegen (z. B. `gitarrenlehrer`), Projekt hochladen, Settings → Pages → Source „GitHub Actions“.
2. App-Adresse im Worker freigeben: `cd worker && npm run adresse -- https://DEINNAME.github.io && npm run deploy`
3. Auf dem Handy `https://DEINNAME.github.io/gitarrenlehrer/` öffnen → Menü → „App installieren“.
4. In der Handy-App Lehrer-Verbindung eintragen und Abgleich einschalten.

## Nächste Ideen

- Inhalte je Kategorie (Zupfmuster, Powerchords), Live-Stimmgerät, Auswendig-Modus.
