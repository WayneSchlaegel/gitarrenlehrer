// Kleine Markdown-Darstellung für Lehrer-Antworten (ohne innerHTML):
// Überschriften, Listen, Codeblöcke (Tabs, Griffe), **fett**, *kursiv*, `code`

function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = keyBase + '-' + i++;
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length} className="md-pre">{code.join('\n')}</pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push(<h4 key={blocks.length}>{inline(h[2], 'h' + i)}</h4>); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={blocks.length}>{items.map((t, j) => <li key={j}>{inline(t, 'l' + i + j)}</li>)}</Tag>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(<p key={blocks.length}>{para.map((p, j) => <span key={j}>{j > 0 && <br />}{inline(p, 'p' + i + j)}</span>)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
