// Item editor: one dialog for notes, links and passwords. Changes are saved when it closes.
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, el, openModal, copyText, relTime, fullDate, toast, confirmDialog, compressImage, pickFile } from '../util.js';
import { autoTags, hostOf, siteInfo, titleFromUrl, normalizeUrl, isSafeUrl, youtubeId } from '../smart.js';
import { renderMarkdown, toggleCheck } from '../markdown.js';
import { totpCode, parseTotp } from '../password.js';
import { prefs } from '../prefs.js';
import { openMenu } from './menu.js';
import { generatorHtml, bindGenerator } from './generator.js';
import { strengthHtml } from './strength.js';
import { COLORS, siteIcon, enrichLink } from './app.js';

const TYPES = ['note', 'link', 'password'];
const COMPARE = ['type', 'title', 'content', 'url', 'username', 'password', 'totp', 'tags', 'images', 'pinned', 'favorite', 'color'];

function snapshot(item) {
  return JSON.stringify(COMPARE.map((k) => (k === 'images' ? (item.images || []).map((i) => i.id) : item[k])));
}

function cleanTag(s) {
  return s.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase().slice(0, 40);
}

export function openEditor(vault, item, { isNew = false, focus } = {}) {
  const draft = structuredClone(item);
  draft.tags = [...(draft.tags || [])];
  draft.images = [...(draft.images || [])];
  const original = snapshot(item);
  const newBlobs = [];
  let preview = false;
  let finished = false;
  let totpTimer;

  const root = el(`<div class="editor" tabindex="-1">
    <header class="editor-head">
      <div class="seg" role="tablist" aria-label="${esc(t('type.label'))}">
        ${TYPES.map((ty) => `<button type="button" role="tab" data-type="${ty}">${icon(ty)}<span>${esc(t('type.' + ty))}</span></button>`).join('')}
      </div>
      <div class="spacer"></div>
      <button type="button" class="icon-btn" data-act="pin" title="${esc(t('pin'))}" aria-label="${esc(t('pin'))}">${icon('pin')}</button>
      <button type="button" class="icon-btn fav" data-act="favorite" title="${esc(t('favorite'))}" aria-label="${esc(t('favorite'))}">${icon('star')}</button>
      <button type="button" class="icon-btn" data-act="color" title="${esc(t('color'))}" aria-label="${esc(t('color'))}">${icon('palette')}</button>
      <button type="button" class="icon-btn" data-act="more" title="${esc(t('more'))}" aria-label="${esc(t('more'))}">${icon('more')}</button>
      <button type="button" class="icon-btn" data-act="close" title="${esc(t('close'))}" aria-label="${esc(t('close'))}">${icon('x')}</button>
    </header>
    <div class="editor-scroll">
      ${item.trashedAt ? `<div class="banner warn">${icon('trash')}<span>${esc(t('inTrash'))}</span><button type="button" class="btn btn-ghost btn-sm" data-act="restore">${icon('restore')}${esc(t('restore'))}</button></div>` : ''}
      <input class="title-input" data-field="title" maxlength="200" autocomplete="off">
      <div class="editor-fields"></div>
      <div class="field">
        <label class="label">${icon('hash')}${esc(t('tags'))}</label>
        <div class="tag-input">
          <div class="tag-chips"></div>
          <input type="text" class="tag-entry" placeholder="${esc(t('addTag'))}" autocomplete="off" enterkeyhint="done">
        </div>
        <div class="tag-suggest"></div>
      </div>
    </div>
    <footer class="editor-foot">
      <span class="editor-meta">${isNew ? esc(t('newItem')) : `${esc(t('edited'))} ${esc(relTime(item.updatedAt))}`}</span>
      <div class="spacer"></div>
      <button type="button" class="btn btn-primary" data-act="save">${icon('check')}${esc(t('save'))}</button>
    </footer>
  </div>`);
  if (!isNew) root.querySelector('.editor-meta').title = `${t('created')}: ${fullDate(item.createdAt)}\n${t('edited')}: ${fullDate(item.updatedAt)}`;

  const modal = openModal({ body: root, className: 'editor-modal', wide: true, focus: false, onClose: () => finish() });
  const fields = root.querySelector('.editor-fields');
  const titleInput = root.querySelector('.title-input');
  titleInput.value = draft.title;

  // ---- rendering -----------------------------------------------------------------------------

  function renderHead() {
    root.dataset.type = draft.type;
    root.className = `editor ${draft.color ? 'c-' + draft.color : ''}`;
    root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-selected', b.dataset.type === draft.type));
    root.querySelector('[data-act="pin"]').classList.toggle('on', draft.pinned);
    root.querySelector('[data-act="pin"]').setAttribute('aria-pressed', draft.pinned);
    root.querySelector('[data-act="favorite"]').classList.toggle('on', draft.favorite);
    root.querySelector('[data-act="favorite"]').setAttribute('aria-pressed', draft.favorite);
    titleInput.placeholder = t('ph.title.' + draft.type);
    updateTitleHint();
  }

  function updateTitleHint() {
    if (draft.type === 'link' && draft.url) titleInput.placeholder = titleFromUrl(draft.url) || t('ph.title.link');
    else if (draft.type === 'password' && draft.url) titleInput.placeholder = siteInfo(draft.url).name || t('ph.title.password');
    else titleInput.placeholder = t('ph.title.' + draft.type);
  }

  const copyBtn = (what) => `<button type="button" class="icon-btn" data-copy="${what}" title="${esc(t('copy'))}" aria-label="${esc(t('copy'))}">${icon('copy')}</button>`;
  const openBtn = () => `<a class="icon-btn" data-open-link target="_blank" rel="noopener noreferrer" title="${esc(t('openLink'))}" aria-label="${esc(t('openLink'))}">${icon('external')}</a>`;

  function renderFields() {
    clearInterval(totpTimer);
    if (draft.type === 'note') {
      fields.innerHTML = `
        <div class="note-tools">
          <div class="seg small">
            <button type="button" data-mode="write" aria-selected="${!preview}">${esc(t('write'))}</button>
            <button type="button" data-mode="preview" aria-selected="${preview}">${esc(t('preview'))}</button>
          </div>
          <div class="spacer"></div>
          <button type="button" class="btn btn-ghost btn-sm" data-act="checklist">${icon('checklist')}<span>${esc(t('checklist'))}</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="add-image">${icon('image')}<span>${esc(t('addImage'))}</span></button>
        </div>
        <textarea class="textarea note-area" data-field="content" placeholder="${esc(t('ph.note'))}" ${preview ? 'hidden' : ''}></textarea>
        <div class="md note-preview" ${preview ? '' : 'hidden'}></div>
        <div class="image-grid"></div>`;
      fields.querySelector('.note-area').value = draft.content;
      renderPreview();
      renderImages();
    } else if (draft.type === 'link') {
      fields.innerHTML = `
        <div class="field">
          <label class="label">${icon('link')}${esc(t('link'))}</label>
          <div class="input-group">
            <input class="input" data-field="url" type="url" inputmode="url" placeholder="https://" autocomplete="off" dir="ltr">
            ${copyBtn('url')}${openBtn()}
          </div>
        </div>
        <div class="link-preview"></div>
        <div class="field">
          <label class="label">${icon('note')}${esc(t('notes'))}</label>
          <textarea class="textarea" data-field="content" placeholder="${esc(t('ph.linkNotes'))}"></textarea>
        </div>`;
      fields.querySelector('[data-field="url"]').value = draft.url;
      fields.querySelector('[data-field="content"]').value = draft.content;
      renderLinkPreview();
    } else {
      fields.innerHTML = `
        <div class="field">
          <label class="label">${icon('user')}${esc(t('username'))}</label>
          <div class="input-group">
            <input class="input" data-field="username" autocomplete="off" autocapitalize="off" spellcheck="false" dir="ltr" placeholder="${esc(t('ph.username'))}">
            ${copyBtn('username')}
          </div>
        </div>
        <div class="field">
          <label class="label">${icon('key')}${esc(t('password'))}</label>
          <div class="input-group">
            <input class="input mono" data-field="password" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" dir="ltr">
            <button type="button" class="icon-btn" data-act="reveal" title="${esc(t('reveal'))}" aria-label="${esc(t('reveal'))}">${icon('eye')}</button>
            <button type="button" class="icon-btn" data-act="generate" title="${esc(t('generate'))}" aria-label="${esc(t('generate'))}">${icon('wand')}</button>
            ${copyBtn('password')}
          </div>
          <div class="pw-strength"></div>
          <div class="gen-slot" hidden></div>
        </div>
        <div class="field">
          <label class="label">${icon('globe')}${esc(t('website'))}</label>
          <div class="input-group">
            <input class="input" data-field="url" type="url" inputmode="url" placeholder="https://" autocomplete="off" dir="ltr">
            ${openBtn()}
          </div>
        </div>
        <div class="field">
          <label class="label">${icon('shield')}${esc(t('totp'))}</label>
          <div class="input-group">
            <input class="input mono" data-field="totp" placeholder="${esc(t('ph.totp'))}" autocomplete="off" spellcheck="false" dir="ltr">
          </div>
          <div class="totp-live"></div>
        </div>
        <div class="field">
          <label class="label">${icon('note')}${esc(t('notes'))}</label>
          <textarea class="textarea" data-field="content" placeholder="${esc(t('ph.passwordNotes'))}"></textarea>
        </div>
        ${draft.history?.length ? `<details class="history">
          <summary>${icon('history')}${esc(t('history', { n: draft.history.length }))}</summary>
          <ul>${draft.history.map((h, i) => `<li><span class="mono dots" data-hist="${i}">••••••••</span><span class="muted">${esc(fullDate(h.date))}</span><button type="button" class="icon-btn sm" data-hist-reveal="${i}">${icon('eye')}</button><button type="button" class="icon-btn sm" data-hist-copy="${i}">${icon('copy')}</button></li>`).join('')}</ul>
        </details>` : ''}`;
      for (const f of ['username', 'password', 'url', 'totp', 'content']) fields.querySelector(`[data-field="${f}"]`).value = draft[f] || '';
      renderStrength();
      renderTotp();
      totpTimer = setInterval(renderTotp, 1000);
    }
    updateOpenLinks();
    fields.querySelectorAll('textarea').forEach(autoGrow);
  }

  function renderPreview() {
    const pv = fields.querySelector('.note-preview');
    if (!pv) return;
    pv.innerHTML = draft.content.trim() ? renderMarkdown(draft.content, { interactive: true }) : `<p class="muted">${esc(t('nothingToPreview'))}</p>`;
  }

  function renderImages() {
    const grid = fields.querySelector('.image-grid');
    if (!grid) return;
    grid.innerHTML = draft.images.map((img, i) => `<figure class="thumb" data-img="${i}">
      <img src="${img.thumb}" alt="">
      <button type="button" class="thumb-remove" data-remove-img="${i}" title="${esc(t('removeImage'))}" aria-label="${esc(t('removeImage'))}">${icon('x')}</button>
    </figure>`).join('');
    grid.hidden = !draft.images.length;
  }

  function renderLinkPreview() {
    const box = fields.querySelector('.link-preview');
    if (!box) return;
    const url = normalizeUrl(draft.url);
    if (!url || !hostOf(url)) {
      box.innerHTML = '';
      box.hidden = true;
      return;
    }
    const yt = prefs.previews && youtubeId(url);
    box.hidden = false;
    box.innerHTML = `${yt ? `<img class="yt-thumb" src="https://i.ytimg.com/vi/${encodeURIComponent(yt)}/mqdefault.jpg" alt="" referrerpolicy="no-referrer">` : ''}
      <div class="lp-row">${siteIcon(url, siteInfo(url).name)}<div><strong>${esc(draft.title || titleFromUrl(url))}</strong><div class="muted small" dir="ltr">${esc(hostOf(url))}</div></div></div>`;
  }

  function renderStrength() {
    const box = fields.querySelector('.pw-strength');
    if (box) box.innerHTML = strengthHtml(draft.password);
  }

  async function renderTotp() {
    const box = fields.querySelector('.totp-live');
    if (!box) return;
    if (!draft.totp.trim()) {
      box.innerHTML = '';
      return;
    }
    const parsed = parseTotp(draft.totp);
    if (!parsed) {
      box.innerHTML = `<span class="field-error">${icon('alert')}${esc(t('totpInvalid'))}</span>`;
      return;
    }
    const r = await totpCode(parsed);
    box.innerHTML = `<div class="totp-display ${r.remaining <= 5 ? 'expiring' : ''}" data-code="${r.code}">
      <span class="totp-ring" style="--p:${r.remaining / r.period}"></span>
      <span class="mono totp-big">${r.code.replace(/(\d{3})(?=\d)/, '$1 ')}</span>
      <span class="muted small">${esc(t('totpSeconds', { s: r.remaining }))}</span>
      <button type="button" class="icon-btn sm" data-copy="totp-code" title="${esc(t('copyCode'))}">${icon('copy')}</button>
    </div>`;
  }

  function updateOpenLinks() {
    for (const a of fields.querySelectorAll('[data-open-link]')) {
      const ok = isSafeUrl(draft.url) && !!draft.url.trim();
      a.classList.toggle('disabled', !ok);
      if (ok) a.href = normalizeUrl(draft.url);
      else a.removeAttribute('href');
    }
  }

  function renderTags() {
    root.querySelector('.tag-chips').innerHTML = draft.tags.map((tg, i) => `<span class="chip">#${esc(tg)}<button type="button" data-untag="${i}" aria-label="${esc(t('remove'))}">${icon('x')}</button></span>`).join('');
    renderTagSuggest();
  }

  function renderTagSuggest() {
    const q = cleanTag(root.querySelector('.tag-entry').value);
    const counts = new Map();
    for (const it of vault.list()) for (const tg of it.tags || []) counts.set(tg, (counts.get(tg) || 0) + 1);
    const list = [...counts.keys()]
      .filter((tg) => !draft.tags.includes(tg) && (!q || tg.includes(q)))
      .sort((a, b) => counts.get(b) - counts.get(a))
      .slice(0, 8);
    root.querySelector('.tag-suggest').innerHTML = list.map((tg) => `<button type="button" class="chip chip-ghost" data-addtag="${esc(tg)}">#${esc(tg)}</button>`).join('');
  }

  function addTag(raw) {
    for (const part of String(raw).split(',')) {
      const tg = cleanTag(part);
      if (tg && !draft.tags.includes(tg)) draft.tags.push(tg);
    }
    root.querySelector('.tag-entry').value = '';
    renderTags();
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight + 2, ta.classList.contains('note-area') ? 180 : 76) + 'px';
  }

  // ---- behaviour -----------------------------------------------------------------------------

  root.addEventListener('input', (e) => {
    const f = e.target.dataset.field;
    if (!f) return;
    draft[f] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    if (f === 'url') {
      updateTitleHint();
      updateOpenLinks();
      renderLinkPreview();
    }
    if (f === 'title') renderLinkPreview();
    if (f === 'password') renderStrength();
    if (f === 'totp') renderTotp();
  });

  root.querySelector('.tag-entry').addEventListener('keydown', (e) => {
    const input = e.target;
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      addTag(input.value);
    } else if (e.key === 'Backspace' && !input.value && draft.tags.length) {
      draft.tags.pop();
      renderTags();
    }
  });
  root.querySelector('.tag-entry').addEventListener('input', (e) => {
    if (e.target.value.includes(',')) addTag(e.target.value);
    else renderTagSuggest();
  });
  root.querySelector('.tag-entry').addEventListener('blur', (e) => {
    if (e.target.value.trim()) addTag(e.target.value);
  });

  fields.addEventListener('change', (e) => {
    if (e.target.matches('.note-preview input[data-line]')) {
      draft.content = toggleCheck(draft.content, Number(e.target.dataset.line));
      fields.querySelector('.note-area').value = draft.content;
      renderPreview();
    }
  });

  fields.addEventListener('paste', (e) => {
    if (draft.type !== 'note') return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      addImages(files);
    }
  });
  root.addEventListener('dragover', (e) => {
    if (draft.type === 'note' && e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  root.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (draft.type === 'note' && files.length) {
      e.preventDefault();
      e.stopPropagation();
      addImages(files);
    }
  });

  async function addImages(files) {
    for (const file of files.slice(0, 10)) {
      try {
        const img = await compressImage(file);
        const id = await vault.saveBlob(img.data);
        newBlobs.push(id);
        draft.images.push({ id, thumb: img.thumb, w: img.w, h: img.h });
      } catch (err) {
        console.error(err);
        toast(t('err.image'), { kind: 'error' });
      }
    }
    renderImages();
  }

  async function showImage(index) {
    const img = draft.images[index];
    const box = el(`<div class="lightbox"><img src="${img.thumb}" alt=""><div class="lightbox-bar"><span class="muted small">${img.w}×${img.h}</span><div class="spacer"></div><a class="btn btn-ghost btn-sm" download="hafiz-image.jpg">${icon('download')}${esc(t('download'))}</a></div></div>`);
    const lb = openModal({ title: t('image'), body: box, wide: true, className: 'lightbox-modal' });
    const a = box.querySelector('a');
    a.href = img.thumb;
    try {
      const full = await vault.loadBlob(img.id);
      if (full && lb.layer.isConnected) {
        box.querySelector('img').src = full;
        a.href = full;
      }
    } catch {
      box.insertAdjacentHTML('beforeend', `<p class="muted small center">${esc(t('imageOffline'))}</p>`);
    }
  }

  root.addEventListener('click', async (e) => {
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn && typeBtn.dataset.type !== draft.type) {
      draft.type = typeBtn.dataset.type;
      renderHead();
      renderFields();
      return;
    }
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      preview = modeBtn.dataset.mode === 'preview';
      renderFields();
      return;
    }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const what = copy.dataset.copy;
      if (what === 'totp-code') return copyText(copy.closest('[data-code]').dataset.code, { label: t('code') });
      const value = what === 'url' ? normalizeUrl(draft.url) : draft[what];
      if (value) copyText(value, { secret: what === 'password', label: t(what === 'url' ? 'link' : what) });
      return;
    }
    const untag = e.target.closest('[data-untag]');
    if (untag) {
      draft.tags.splice(Number(untag.dataset.untag), 1);
      renderTags();
      return;
    }
    const addtag = e.target.closest('[data-addtag]');
    if (addtag) {
      addTag(addtag.dataset.addtag);
      return;
    }
    const rm = e.target.closest('[data-remove-img]');
    if (rm) {
      draft.images.splice(Number(rm.dataset.removeImg), 1);
      renderImages();
      return;
    }
    const thumb = e.target.closest('[data-img]');
    if (thumb) return showImage(Number(thumb.dataset.img));
    const hr = e.target.closest('[data-hist-reveal]');
    if (hr) {
      const span = fields.querySelector(`[data-hist="${hr.dataset.histReveal}"]`);
      const shown = span.classList.toggle('dots');
      span.textContent = shown ? '••••••••' : draft.history[hr.dataset.histReveal].password;
      return;
    }
    const hc = e.target.closest('[data-hist-copy]');
    if (hc) return copyText(draft.history[hc.dataset.histCopy].password, { secret: true, label: t('password') });

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'close':
        return modal.close();
      case 'save':
        return modal.close();
      case 'pin':
        draft.pinned = !draft.pinned;
        return renderHead();
      case 'favorite':
        draft.favorite = !draft.favorite;
        return renderHead();
      case 'color':
        return openMenu(e.target.closest('[data-act]'), [{ colors: COLORS, value: draft.color, onPick: (c) => { draft.color = c; renderHead(); } }]);
      case 'more':
        return moreMenu(e.target.closest('[data-act]'));
      case 'restore':
        draft.trashedAt = 0;
        e.target.closest('.banner').remove();
        return toast(t('restored'), { kind: 'success' });
      case 'checklist': {
        if (preview) {
          preview = false;
          renderFields();
        }
        const area = fields.querySelector('.note-area');
        const pos = area.selectionStart ?? area.value.length;
        const before = area.value.slice(0, pos);
        const insert = (before && !before.endsWith('\n') ? '\n' : '') + '- [ ] ';
        area.setRangeText(insert, pos, area.selectionEnd ?? pos, 'end');
        draft.content = area.value;
        area.focus();
        autoGrow(area);
        return;
      }
      case 'add-image': {
        const files = await pickFile('image/*', true);
        if (files.length) addImages(files);
        return;
      }
      case 'reveal': {
        const input = fields.querySelector('[data-field="password"]');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        e.target.closest('[data-act]').innerHTML = icon(show ? 'eye-off' : 'eye');
        return;
      }
      case 'generate': {
        const slot = fields.querySelector('.gen-slot');
        slot.hidden = !slot.hidden;
        if (!slot.hidden && !slot.childElementCount) {
          slot.innerHTML = generatorHtml({ useLabel: t('usePassword') });
          bindGenerator(slot, {
            onCopy: (v) => copyText(v, { secret: true, label: t('password') }),
            onUse: (v) => {
              const input = fields.querySelector('[data-field="password"]');
              input.value = v;
              input.type = 'text';
              draft.password = v;
              renderStrength();
              slot.hidden = true;
            },
          });
        }
        return;
      }
    }
  });

  function moreMenu(anchor) {
    const entries = [];
    if (draft.type === 'note' && draft.content) entries.push({ icon: 'copy', label: t('copyText'), onClick: () => copyText(draft.content) });
    if (snapshot(draft) !== original) {
      entries.push({ icon: 'restore', label: t('discardChanges'), onClick: () => discard() });
    }
    if (!isNew && !item.trashedAt) {
      entries.push({ divider: true });
      entries.push({ icon: 'trash', label: t('moveToTrash'), danger: true, onClick: () => {
        // Saved (with any edits) as part of closing, then offered for undo.
        draft.trashedAt = Date.now();
        draft.pinned = false;
        modal.close();
        toast(t('movedToTrash'), { action: t('undo'), onAction: () => vault.restore(item.id) });
      } });
    }
    if (item.trashedAt) {
      entries.push({ divider: true });
      entries.push({ icon: 'trash', label: t('deleteForever'), danger: true, onClick: async () => {
        if (await confirmDialog({ title: t('deleteForever'), message: t('confirmDestroy'), confirm: t('delete'), danger: true })) {
          finished = true;
          modal.close();
          vault.destroy(item.id);
        }
      } });
    }
    openMenu(anchor, entries);
  }

  function cleanupNewBlobs(keep = []) {
    for (const id of newBlobs) if (!keep.includes(id)) vault.deleteBlob(id);
  }

  function discard() {
    finished = true;
    cleanupNewBlobs();
    modal.close();
  }

  function isEmpty(d) {
    return !d.title.trim() && !d.content.trim() && !d.url.trim() && !d.username.trim() && !d.password && !d.totp.trim() && !d.images.length;
  }

  async function finish() {
    clearInterval(totpTimer);
    if (finished) return;
    finished = true;
    const pending = root.querySelector('.tag-entry').value;
    if (pending.trim()) addTag(pending);
    const keepIds = draft.images.map((i) => i.id);
    if (isNew && isEmpty(draft)) {
      cleanupNewBlobs();
      return;
    }
    cleanupNewBlobs(keepIds);
    if (!isNew && snapshot(draft) === original && draft.trashedAt === item.trashedAt) return;
    draft.title = draft.title.trim();
    draft.url = draft.url.trim() ? normalizeUrl(draft.url) : '';
    draft.username = draft.username.trim();
    draft.totp = draft.totp.trim();
    if (draft.type === 'link' && !draft.title) draft.title = titleFromUrl(draft.url);
    if (draft.type === 'password' && !draft.title) draft.title = siteInfo(draft.url).name || draft.username || '';
    draft.tags = autoTags(draft, t, { category: isNew });
    try {
      await vault.save(draft);
      if (draft.url !== item.url) enrichLink(vault, draft);
      if (isNew) toast(t('savedAs', { type: t('type.' + draft.type) }), { kind: 'success', duration: 1800 });
    } catch (err) {
      console.error(err);
      toast(t('err.write'), { kind: 'error' });
    }
  }

  root.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.key === 'Enter')) {
      e.preventDefault();
      modal.close();
    }
  });

  renderHead();
  renderFields();
  renderTags();
  requestAnimationFrame(() => {
    // Existing items open without focusing a field, so the phone keyboard doesn't pop up.
    let target = root;
    if (focus === 'title') target = titleInput;
    else if (isNew && draft.type === 'link') target = fields.querySelector('[data-field="url"]');
    else if (isNew && draft.type === 'note') target = fields.querySelector('.note-area');
    else if (isNew) target = titleInput;
    target.focus({ preventScroll: true });
  });
  return modal;
}
