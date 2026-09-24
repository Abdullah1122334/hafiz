// Settings dialog: account & sync, security, appearance, backups, app install.
import { t, lang, setLang } from '../i18n.js';
import { icon } from '../icons.js';
import { prefs, applyTheme } from '../prefs.js';
import { esc, openModal, toast, confirmDialog, passwordDialog, downloadFile, pickFile } from '../util.js';
import { buildEncryptedBackup, buildPlainExport, prepareImport } from '../importexport.js';
import { openSyncSetup } from './syncsetup.js';
import { strengthHtml } from './strength.js';
import { strength } from '../password.js';

const VERSION = '1.0.0';

function seg(name, options, value) {
  return `<div class="seg small" data-pref="${name}">${options.map(([v, label]) => `<button type="button" data-value="${v}" aria-selected="${String(v) === String(value)}">${esc(label)}</button>`).join('')}</div>`;
}

function select(name, options, value) {
  return `<select class="select" data-pref="${name}">${options.map(([v, label]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
}

function rowHtml(ic, title, desc, control) {
  return `<div class="set-row"><span class="set-icon">${icon(ic)}</span><div class="set-text"><strong>${esc(title)}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}</div><div class="set-control">${control}</div></div>`;
}

export async function openSettings(vault) {
  const cloud = vault.isCloud;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const localLeft = cloud ? await vault.localItemCount().catch(() => 0) : 0;
  const remembered = await vault.isRemembered();
  const email = cloud ? vault.backend.user?.email : '';

  const body = `<div class="settings">
    <section class="set-section">
      <h3>${esc(t('set.account'))}</h3>
      ${cloud
        ? rowHtml('cloud-check', email, t('set.syncOn'), `<button class="btn btn-ghost btn-sm" data-act="signout">${icon('logout')}${esc(t('signOut'))}</button>`)
        : rowHtml('device', t('set.localOnly'), t('set.localOnlyHint'), `<button class="btn btn-primary btn-sm" data-act="sync-setup">${icon('cloud')}${esc(t('set.enableSync'))}</button>`)}
      ${localLeft ? rowHtml('inbox', t('set.localLeft', { n: localLeft }), t('set.localLeftHint'), `<button class="btn btn-primary btn-sm" data-act="migrate">${esc(t('set.importNow'))}</button>`) : ''}
      ${cloud && localStorage.getItem('hafiz.firebase') ? rowHtml('settings', t('set.syncConfig'), t('set.syncConfigHint'), `<button class="btn btn-ghost btn-sm" data-act="sync-setup">${esc(t('edit'))}</button>`) : ''}
    </section>

    <section class="set-section">
      <h3>${esc(t('set.security'))}</h3>
      ${rowHtml('lock', t('set.autoLock'), remembered ? t('set.autoLockRemembered') : t('set.autoLockHint'), select('autoLock', [[1, t('min', { n: 1 })], [5, t('min', { n: 5 })], [15, t('min', { n: 15 })], [30, t('min', { n: 30 })], [60, t('hour')], [0, t('never')]], prefs.autoLock))}
      ${rowHtml('clipboard', t('set.clipClear'), t('set.clipClearHint'), select('clipClear', [[15, t('sec', { n: 15 })], [30, t('sec', { n: 30 })], [60, t('sec', { n: 60 })], [0, t('never')]], prefs.clipClear))}
      ${rowHtml('key', t('set.changePassword'), t('set.changePasswordHint'), `<button class="btn btn-ghost btn-sm" data-act="change-pw">${esc(t('change'))}</button>`)}
      ${remembered ? rowHtml('device', t('set.remembered'), t('set.rememberedHint'), `<button class="btn btn-ghost btn-sm" data-act="forget">${esc(t('set.forget'))}</button>`) : ''}
    </section>

    <section class="set-section">
      <h3>${esc(t('set.appearance'))}</h3>
      ${rowHtml('sun', t('set.theme'), '', seg('theme', [['system', t('theme.system')], ['light', t('theme.light')], ['dark', t('theme.dark')]], prefs.theme))}
      ${rowHtml('languages', t('set.language'), '', seg('lang', [['ar', 'العربية'], ['en', 'English']], lang()))}
      ${rowHtml('globe', t('set.previews'), t('set.previewsHint'), `<label class="switch"><input type="checkbox" data-pref="previews" ${prefs.previews ? 'checked' : ''}><span></span></label>`)}
    </section>

    <section class="set-section">
      <h3>${esc(t('set.data'))}</h3>
      ${rowHtml('download', t('set.backup'), t('set.backupHint'), `<button class="btn btn-ghost btn-sm" data-act="backup">${esc(t('export'))}</button>`)}
      ${rowHtml('upload', t('set.import'), t('set.importHint'), `<button class="btn btn-ghost btn-sm" data-act="import">${esc(t('import'))}</button>`)}
      ${rowHtml('note', t('set.plainExport'), t('set.plainExportHint'), `<button class="btn btn-ghost btn-sm" data-act="plain">${esc(t('export'))}</button>`)}
      ${rowHtml('trash', t('emptyTrash'), t('trashNote'), `<button class="btn btn-ghost btn-sm danger-text" data-act="empty-trash">${esc(t('emptyTrash'))}</button>`)}
    </section>

    <section class="set-section">
      <h3>${esc(t('set.app'))}</h3>
      ${standalone
        ? rowHtml('install', t('set.installed'), t('set.installedHint'), '')
        : rowHtml('install', t('set.install'), window.__installPrompt ? t('set.installHint') : t('set.installManual'), window.__installPrompt ? `<button class="btn btn-primary btn-sm" data-act="install">${esc(t('install'))}</button>` : '')}
      <div class="shortcuts only-desktop">
        <strong>${esc(t('set.shortcuts'))}</strong>
        <dl>
          <dt><kbd>Ctrl</kbd>+<kbd>K</kbd> / <kbd>/</kbd></dt><dd>${esc(t('search'))}</dd>
          <dt><kbd>N</kbd></dt><dd>${esc(t('newNote'))}</dd>
          <dt><kbd>L</kbd></dt><dd>${esc(t('newLink'))}</dd>
          <dt><kbd>P</kbd></dt><dd>${esc(t('newPassword'))}</dd>
          <dt><kbd>C</kbd></dt><dd>${esc(t('capture.smart'))}</dd>
          <dt><kbd>Ctrl</kbd>+<kbd>S</kbd></dt><dd>${esc(t('save'))}</dd>
        </dl>
      </div>
      <p class="muted small about">${esc(t('appName'))} v${VERSION} · ${esc(t('set.about'))}</p>
    </section>
  </div>`;

  const m = openModal({ title: t('settings'), body, wide: true, className: 'settings-modal', focus: false });
  const root = m.body;

  root.addEventListener('click', async (e) => {
    const segBtn = e.target.closest('[data-pref] [data-value]');
    if (segBtn) {
      const name = segBtn.closest('[data-pref]').dataset.pref;
      const value = segBtn.dataset.value;
      segBtn.parentElement.querySelectorAll('[data-value]').forEach((b) => b.setAttribute('aria-selected', b === segBtn));
      if (name === 'theme') {
        prefs.theme = value;
        applyTheme();
      } else if (name === 'lang') {
        setLang(value);
        m.close();
        location.reload();
      }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'signout':
        if (await confirmDialog({ title: t('signOut'), message: t('confirmSignOut'), confirm: t('signOut') })) {
          m.close();
          vault.signOut();
        }
        break;
      case 'sync-setup':
        openSyncSetup();
        break;
      case 'migrate': {
        const pw = await passwordDialog({ title: t('set.importNow'), message: t('set.migratePrompt'), confirm: t('import') });
        if (!pw) return;
        try {
          const n = await vault.migrateLocal(pw);
          toast(t('migrated', { n }), { kind: 'success' });
          m.close();
        } catch {
          toast(t('err.wrongPassword'), { kind: 'error' });
        }
        break;
      }
      case 'change-pw':
        changePasswordDialog(vault);
        break;
      case 'forget':
        await vault.forgetDevice();
        toast(t('set.forgotten'), { kind: 'success' });
        m.close();
        break;
      case 'backup': {
        const pw = await passwordDialog({ title: t('set.backup'), message: t('set.backupPrompt'), confirm: t('export') });
        if (!pw) return;
        toast(t('working'));
        const file = await buildEncryptedBackup(vault, pw);
        downloadFile(file.name, file.content);
        toast(t('set.backupDone'), { kind: 'success' });
        break;
      }
      case 'plain': {
        if (!(await confirmDialog({ title: t('set.plainExport'), message: t('set.plainWarning'), confirm: t('export'), danger: true }))) return;
        const file = buildPlainExport(vault);
        downloadFile(file.name, file.content);
        break;
      }
      case 'import':
        runImport(vault);
        break;
      case 'empty-trash':
        if (await confirmDialog({ title: t('emptyTrash'), message: t('confirmEmptyTrash'), confirm: t('emptyTrash'), danger: true })) {
          await vault.emptyTrash();
          toast(t('trashEmptied'), { kind: 'success' });
        }
        break;
      case 'install':
        window.__installPrompt?.prompt();
        window.__installPrompt = null;
        m.close();
        break;
    }
  });

  root.addEventListener('change', (e) => {
    const name = e.target.dataset.pref;
    if (!name) return;
    if (name === 'previews') prefs.previews = e.target.checked;
    else prefs[name] = Number(e.target.value);
    toast(t('saved'), { kind: 'success', duration: 1200 });
    vault.emit('change');
  });
}

async function runImport(vault) {
  const [file] = await pickFile('.json,.csv,application/json,text/csv');
  if (!file) return;
  try {
    const job = await prepareImport(vault, file);
    let pw;
    if (job.needsPassword) {
      pw = await passwordDialog({ title: t('import'), message: t('set.importBackupPrompt'), confirm: t('import') });
      if (!pw) return;
    } else if (!(await confirmDialog({ title: t('import'), message: t('set.importConfirm', { n: job.count }), confirm: t('import') }))) return;
    toast(t('working'));
    const n = await job.run(pw);
    toast(t('imported', { n }), { kind: 'success' });
  } catch (err) {
    console.error(err);
    const msg = err?.name === 'OperationError' ? t('err.wrongPassword') : err?.message === 'csv-no-password-column' ? t('err.csv') : t('err.importFormat');
    toast(msg, { kind: 'error', duration: 5000 });
  }
}

function changePasswordDialog(vault) {
  const m = openModal({
    title: t('set.changePassword'),
    body: `<form class="stack" autocomplete="off">
      <p class="dialog-text">${esc(t('set.changePasswordInfo'))}</p>
      <div class="field"><label class="label">${esc(t('currentPassword'))}</label><input class="input" type="password" name="old" autocomplete="current-password" required></div>
      <div class="field"><label class="label">${esc(t('newMasterPassword'))}</label><input class="input" type="password" name="new" autocomplete="new-password" required minlength="8"><div class="pw-strength"></div></div>
      <div class="field"><label class="label">${esc(t('confirmPassword'))}</label><input class="input" type="password" name="confirm" autocomplete="new-password" required></div>
      <p class="form-error" hidden></p>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-close>${esc(t('cancel'))}</button><button class="btn btn-primary">${esc(t('change'))}</button></div>
    </form>`,
  });
  const form = m.body.querySelector('form');
  const err = form.querySelector('.form-error');
  form.querySelector('[data-close]').onclick = () => m.close();
  form.new.addEventListener('input', () => { form.querySelector('.pw-strength').innerHTML = strengthHtml(form.new.value); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const show = (msg) => { err.textContent = msg; err.hidden = false; };
    if (form.new.value !== form.confirm.value) return show(t('err.mismatch'));
    if (form.new.value.length < 8) return show(t('err.tooShort'));
    if (strength(form.new.value).score < 2) return show(t('err.tooWeak'));
    const btn = form.querySelector('.btn-primary');
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      await vault.changePassword(form.old.value, form.new.value);
      toast(t('passwordChanged'), { kind: 'success' });
      m.close();
    } catch (ex) {
      show(t('err.' + (ex.code || 'unknown')));
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  });
}
