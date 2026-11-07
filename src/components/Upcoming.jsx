// Platzhalter für Bereiche, die in den nächsten Ausbaustufen folgen
const TEXT = {
  lehrer: {
    title: 'Lehrer',
    step: 2,
    body: 'Hier kannst du Fragen stellen, etwa „Wie greife ich den Wechsel von C nach F flüssiger?“ oder „Welches Schlagmuster passt zu diesem Lied?“. Der Lehrer kennt dein Profil, deine Lieder und deine Übungsergebnisse.'
  },
  hoeren: {
    title: 'Hören',
    step: 3,
    body: 'Die App hört über das Mikrofon zu: Klingt der Akkord sauber oder schnarrt eine Saite? Hältst du beim Schlagen das Tempo? Die Messwerte kann der Lehrer anschließend kommentieren.'
  },
  videos: {
    title: 'Videos',
    step: 4,
    body: 'Lernvideos suchen, direkt hier abspielen (auch langsamer und in Schleife) und dauerhaft mit Liedern oder Themen verknüpfen.'
  },
  theorie: {
    title: 'Theorie',
    step: 4,
    body: 'Nur was du für die Liedbegleitung brauchst: Tonarten und Capo, Akkordfamilien, Stufen I–IV–V, Rhythmus und Taktarten, Transponieren für die eigene Stimme.'
  }
};

export default function Upcoming({ area }) {
  const t = TEXT[area];
  return (
    <section className="upcoming">
      <h1>{t.title}</h1>
      <p>{t.body}</p>
      <p className="upcoming__step">Folgt in Ausbaustufe {t.step}.</p>
    </section>
  );
}
