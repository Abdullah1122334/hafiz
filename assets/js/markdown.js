// A small, safe Markdown renderer for notes: everything is escaped first, then a limited
// set of formatting is applied. Checklists ("- [ ] task") become tickable boxes.
import { esc } from './util.js';

function inline(text) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu, '$1<span class="md-tag">#$2</span>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  return s;
}

export function renderMarkdown(src, { interactive = false } = {}) {
  const lines = String(src || '').split('\n');
  const out = [];
  let list = null;
  let inCode = false;
  let code = [];
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  lines.forEach((line, i) => {
    if (/^```/.test(line.trim())) {
      if (inCode) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    let m;
    if ((m = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/))) {
      if (list !== 'ul class="md-checks"') {
        closeList();
        list = 'ul class="md-checks"';
        out.push('<ul class="md-checks">');
      }
      const done = m[1] !== ' ';
      out.push(`<li class="${done ? 'done' : ''}"><input type="checkbox" data-line="${i}" ${done ? 'checked' : ''} ${interactive ? '' : 'tabindex="-1"'} aria-label="${esc(m[2])}"><span>${inline(m[2])}</span></li>`);
      return;
    }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      if (list !== 'ul') {
        closeList();
        list = 'ul';
        out.push('<ul>');
      }
      out.push(`<li>${inline(m[1])}</li>`);
      return;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (list !== 'ol') {
        closeList();
        list = 'ol';
        out.push('<ol>');
      }
      out.push(`<li>${inline(m[1])}</li>`);
      return;
    }
    closeList();
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`);
    else if ((m = line.match(/^>\s?(.*)$/))) out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    else if (/^\s*(-{3,}|_{3,})\s*$/.test(line)) out.push('<hr>');
    else if (!line.trim()) out.push('<div class="md-gap"></div>');
    else out.push(`<p>${inline(line)}</p>`);
  });
  if (inCode) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  closeList();
  return out.join('');
}

// Flips "- [ ]" <-> "- [x]" on the given source line.
export function toggleCheck(src, lineNo) {
  const lines = String(src).split('\n');
  lines[lineNo] = lines[lineNo].replace(/\[([ xX])\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

export function checklistProgress(src) {
  const all = String(src || '').match(/^\s*[-*]\s+\[[ xX]\]/gm) || [];
  const done = all.filter((l) => /\[[xX]\]/.test(l)).length;
  return all.length ? { done, total: all.length } : null;
}
