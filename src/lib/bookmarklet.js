// Lesezeichen-Skript „→ Gitarrenlehrer“
// Läuft auf der gerade geöffneten Seite (z. B. Ultimate Guitar), liest das Liedblatt
// und öffnet die App mit dem Text im Adress-Anhang (#import=...).
// Der Text verlässt dabei nie deinen Browser.

// Wichtig: keine //-Kommentare im Skript selbst, es wird in eine einzige Zeile gepackt.
const SOURCE = `
(function () {
  var APP = '__APP__';
  var txt = String(window.getSelection ? window.getSelection() : '').trim();
  var title = '', artist = '', how = txt ? 'markierung' : '';

  function dig(o, path) {
    try { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); } catch (e) { return null; }
  }
  function fromData(d) {
    var page = dig(d, 'store.page.data') || dig(d, 'page.data');
    if (!page) return false;
    var c = dig(page, 'tab_view.wiki_tab.content');
    if (!c) return false;
    txt = c;
    title = dig(page, 'tab.song_name') || '';
    artist = dig(page, 'tab.artist_name') || '';
    how = 'seite';
    return true;
  }

  if (!txt) {
    var store = document.querySelector('.js-store, [data-content*="wiki_tab"]');
    if (store) { try { fromData(JSON.parse(store.getAttribute('data-content'))); } catch (e) {} }
  }
  if (!txt && window.UGAPP) { try { fromData(window.UGAPP); } catch (e) {} }
  if (!txt) {
    var pres = [].slice.call(document.querySelectorAll('pre, code'));
    pres.sort(function (a, b) { return b.innerText.length - a.innerText.length; });
    if (pres[0] && pres[0].innerText.length > 80) { txt = pres[0].innerText; how = 'seite'; }
  }
  if (!txt) {
    alert('Gitarrenlehrer: Kein Liedblatt gefunden.\\n\\nBitte den Liedtext mit der Maus markieren (von der ersten Akkordzeile bis zum Ende) und das Lesezeichen dann noch einmal anklicken.');
    return;
  }

  var dt = document.title || '';
  var m = /^(.*?)\\s+(?:official\\s+)?(?:chords|tabs?|ukulele chords|bass tabs?)?\\s*(?:\\(ver \\d+\\)\\s*)?by\\s+(.*?)\\s*@/i.exec(dt);
  if (m) {
    if (!title) title = m[1].replace(/\\s+(chords|tabs?)$/i, '');
    if (!artist) artist = m[2];
  }
  if (!title) { var h = document.querySelector('h1'); if (h) title = h.innerText.replace(/\\s+(chords|tabs?|akkorde)\\b.*$/i, ''); }

  var data = { title: title.trim(), artist: artist.trim(), raw: txt, source: location.href, how: how };
  var url = APP + '#import=' + encodeURIComponent(JSON.stringify(data));
  var w = window.open(url, '_blank');
  if (!w) location.href = url;
})();
`;

/** Erzeugt den Lesezeichen-Link für die aktuelle App-Adresse */
export function buildBookmarklet(appUrl) {
  const code = SOURCE.replace('__APP__', appUrl.replace(/'/g, "\\'"))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  return 'javascript:' + encodeURIComponent(code);
}

/** Adresse der laufenden App ohne Anhang */
export function currentAppUrl() {
  return location.origin + location.pathname;
}

/** Liest Importdaten aus dem Adress-Anhang; gibt null zurück, wenn keine da sind */
export function readImportHash(hash = location.hash) {
  if (!hash.startsWith('#import=')) return null;
  try {
    const data = JSON.parse(decodeURIComponent(hash.slice('#import='.length)));
    if (!data || typeof data.raw !== 'string' || !data.raw.trim()) return null;
    return {
      title: String(data.title || '').slice(0, 200),
      artist: String(data.artist || '').slice(0, 200),
      raw: data.raw.slice(0, 200000),
      source: String(data.source || '').slice(0, 500),
      how: data.how === 'markierung' ? 'markierung' : 'seite'
    };
  } catch {
    return null;
  }
}

export function clearImportHash() {
  history.replaceState(null, '', location.pathname + location.search);
}
