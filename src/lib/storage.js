// Speicherung im Browser (localStorage) mit Export/Import als JSON-Datei

const KEY = 'gitarrenlehrer.v1';

export const CATEGORIES = [
  { id: 'western', numeral: 'I', name: 'Westerngitarre' },
  { id: 'klassik', numeral: 'II', name: 'Klassische Gitarre' },
  { id: 'e', numeral: 'III', name: 'E-Gitarre' }
];

export const STATUS = [
  { id: 'neu', label: 'Neu' },
  { id: 'uebe', label: 'Übe ich' },
  { id: 'sitzt', label: 'Sitzt' }
];

const DEMO_SONGS = [
  {
    title: 'Die Gedanken sind frei',
    artist: 'Volkslied',
    category: 'western',
    tempo: 120,
    strum: '↓  ↓↑  ↓↑   (3/4: 1 2 3)',
    notes: 'Gemeinfrei. Gut zum Einstieg: drei Akkorde, ruhiger Dreivierteltakt.',
    raw: `{title: Die Gedanken sind frei}
{artist: Volkslied}

[Strophe 1]
[G]Die Gedanken sind [D7]frei, wer [G]kann sie er[D7]raten,
sie [G]fliegen vor[D7]bei wie [G]nächtliche [D7]Schatten.
[G]Kein Mensch kann sie [C]wissen, kein [D7]Jäger er[G]schießen
mit [C]Pulver und [G]Blei: Die Ge[D7]danken sind [G]frei!`
  },
  {
    title: 'Amazing Grace',
    artist: 'Traditional',
    category: 'western',
    tempo: 80,
    strum: '↓  ↓↑  ↓↑   (3/4)',
    notes: 'Gemeinfrei. Format „Akkorde über dem Text“ – so kommen die meisten Liedblätter aus dem Netz.',
    raw: `[Verse 1]
G              G7        C        G
Amazing grace, how sweet the sound
                      D
That saved a wretch like me
    G          G7       C       G
I once was lost, but now am found
        Em     D        G
Was blind, but now I see`
  }
];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function blankSong(category = 'western') {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: '',
    artist: '',
    category,
    raw: '',
    transpose: 0,
    capo: 0, // Capo, mit dem ich spiele
    sheetCapo: 0, // Capo, für den die Akkorde im Liedblatt notiert sind
    tempo: null,
    strum: '',
    notes: '',
    status: 'neu',
    created: now,
    updated: now,
    lastPracticed: null,
    practiceCount: 0,
    source: ''
  };
}

export const DEFAULT_PROFILE = {
  name: 'Wayne',
  level:
    'Spiele seit vielen Jahren autodidaktisch, nie Unterricht gehabt. Kann vieles ein bisschen (Akkorde, Barré, Schlagmuster, Picking), aber nichts davon richtig sauber.',
  goal: 'Lieder nach meinem Geschmack lernen, mich selbst begleiten und dazu singen.',
  guitars: {
    western: 'Yamaha Westerngitarre, Vollholz (hochwertig) · Yamaha Westerngitarre, laminiert (Mittelklasse)',
    klassik: 'LAG Occitania',
    e: 'Hagström im Les-Paul-Stil'
  },
  taste: ''
};

export const DEFAULT_SETTINGS = {
  notation: 'international', // oder 'deutsch' (H statt B)
  fontSize: 20,
  scrollSpeed: 18, // Pixel pro Sekunde
  apiUrl: '', // Adresse des Cloudflare Workers
  apiToken: '', // Zugangsschlüssel (APP_TOKEN)
  latencyMs: null, // gemessene Audio-Latenz für den Timing-Test
  micSensitivity: 3, // 1 = unempfindlich … 5 = sehr empfindlich
  micAgc: false, // automatische Verstärkung des Browsers
  syncOn: false // Abgleich zwischen Geräten über den Worker
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        songs: Array.isArray(s.songs) ? s.songs : [],
        profile: { ...DEFAULT_PROFILE, ...(s.profile || {}), guitars: { ...DEFAULT_PROFILE.guitars, ...(s.profile?.guitars || {}) } },
        settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
        chats: s.chats && typeof s.chats === 'object' ? s.chats : {},
        practice: Array.isArray(s.practice) ? s.practice : [],
        videos: Array.isArray(s.videos) ? s.videos : [],
        deleted: Array.isArray(s.deleted) ? s.deleted : []
      };
    }
  } catch (e) {
    console.warn('Gespeicherte Daten nicht lesbar', e);
  }
  return {
    // Beispiellieder: als solche markiert und unverändert (updated = created), damit ein neues Gerät sie beim ersten Abgleich nicht doppelt einbringt
    songs: DEMO_SONGS.map((d) => { const s = { ...blankSong(d.category), ...d, demo: true }; s.updated = s.created; return s; }),
    profile: DEFAULT_PROFILE,
    settings: DEFAULT_SETTINGS,
    chats: {},
    practice: [],
    videos: [],
    deleted: []
  };
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: new Date().toISOString() }));
    return true;
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
    return false;
  }
}

export function exportState(state) {
  // Zugangsschlüssel nicht in die Sicherungsdatei schreiben
  const { apiToken, ...settings } = state.settings; // eslint-disable-line no-unused-vars
  const blob = new Blob([JSON.stringify({ app: 'gitarrenlehrer', version: 2, ...state, settings }, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gitarrenlehrer-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importStateFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data.songs)) throw new Error('Datei enthält keine Lieder.');
  return {
    songs: data.songs,
    profile: { ...DEFAULT_PROFILE, ...(data.profile || {}) },
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    chats: data.chats && typeof data.chats === 'object' ? data.chats : {},
    practice: Array.isArray(data.practice) ? data.practice : [],
    videos: Array.isArray(data.videos) ? data.videos : [],
    deleted: Array.isArray(data.deleted) ? data.deleted : []
  };
}
