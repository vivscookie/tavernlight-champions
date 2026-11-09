import departments from '../../data/departments.json';
import { getRegistration, saveStep, completeStep, goToStep } from '../registration-state.js';
import { checkGamertagAvailability, describeError } from '../api.js';
import { showToast } from '../ui/toast.js';
import { withPending } from '../ui/pending.js';

const AUTOSAVE_MS = 30000;
const DOT_CLASS = { secondary: 'bg-secondary', tertiary: 'bg-tertiary', outline: 'bg-outline' }; // classes completas p/ o Tailwind enxergar

const form = document.getElementById('onboarding-form');
const gamertag = document.getElementById('gamertag');
const department = document.getElementById('department');
const errorEl = document.getElementById('gamertag-error');
const statusEl = document.getElementById('autosave-status');
const draftBtn = document.getElementById('btn-save-draft');
const continueBtn = document.getElementById('btn-continue');
const bracketsEl = document.getElementById('department-brackets');
const idleStatus = statusEl.textContent;

// ---------- Dados (departments.json) ----------
function renderDepartments() {
  for (const o of departments.options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    opt.className = 'bg-surface-container-high text-on-surface';
    department.append(opt);
  }
  department.value = departments.defaultValue;

  for (const b of departments.brackets) {
    const chip = document.createElement('span');
    chip.className =
      'px-3 py-1.5 rounded-md bg-surface-container-high text-on-surface-variant font-body-sm text-body-sm flex items-center gap-1.5 shadow-sm';
    const dot = document.createElement('span');
    dot.className = `w-1.5 h-1.5 rounded-full ${DOT_CLASS[b.tone] ?? 'bg-outline'}`;
    chip.append(dot, ` ${b.label} (${b.enrolled} Staff Enrolled)`);
    bracketsEl.append(chip);
  }
}

// ---------- Rascunho (estado compartilhado do cadastro) ----------
const snapshot = () => ({ gamertag: gamertag.value.trim(), department: department.value });

function loadDraft() {
  const d = getRegistration().identity;
  if (!d) return;
  if (typeof d.gamertag === 'string') gamertag.value = d.gamertag;
  if ([...department.options].some((o) => o.value === d.department && !o.disabled)) department.value = d.department;
}

function flashStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => {
    statusEl.textContent = idleStatus;
  }, 2200);
}

// ---------- Validação ----------
function gamertagMessage() {
  const v = gamertag.value.trim();
  if (!v) return 'Enter your screen name.';
  if (v.length < 3 || v.length > 16) return 'Use between 3 and 16 characters.';
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return 'Only letters, numerals, underscores and dashes are allowed.';
  return '';
}

function validate() {
  gamertag.value = gamertag.value.trim();
  const msg = gamertagMessage();
  gamertag.setCustomValidity(msg);
  errorEl.textContent = msg;
  gamertag.setAttribute('aria-invalid', String(Boolean(msg)));
  if (msg) {
    gamertag.focus();
    return false;
  }
  if (!department.value) {
    department.setCustomValidity('Select your department.');
    department.reportValidity();
    department.focus();
    return false;
  }
  department.setCustomValidity('');
  return true;
}

gamertag.addEventListener('input', () => {
  gamertag.setCustomValidity('');
  if (errorEl.textContent) errorEl.textContent = gamertagMessage();
});
department.addEventListener('change', () => department.setCustomValidity(''));

// ---------- Botões ----------
draftBtn.addEventListener('click', () => {
  flashStatus(saveStep('identity', snapshot()) ? 'Draft saved.' : 'Could not save the draft in this browser.');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (continueBtn.disabled) return; // evita envio duplicado
  if (!validate()) return;

  // O nome precisa ser único: quem decide é o servidor (GET /gamertags/availability)
  const name = gamertag.value;
  const check = await withPending(continueBtn, { label: 'Checking screen name…' }, () => checkGamertagAvailability(name));
  if (!check.ok) {
    showToast({ tone: 'error', title: "Couldn't check the screen name", message: describeError(check.error) });
    return;
  }
  if (!check.value.available) {
    const msg = 'That screen name is already taken. Try another one.';
    gamertag.setCustomValidity(msg);
    errorEl.textContent = msg;
    gamertag.setAttribute('aria-invalid', 'true');
    gamertag.focus();
    return;
  }

  saveStep('identity', snapshot());
  completeStep(1);
  continueBtn.disabled = true;
  continueBtn.setAttribute('aria-busy', 'true');
  continueBtn.innerHTML =
    '<span>Proceeding to Squads...</span> <span class="material-symbols-outlined animate-spin motion-reduce:animate-none" style="font-size: 18px;" aria-hidden="true">progress_activity</span>';
  goToStep(2);
});

// ---------- Inicialização ----------
renderDepartments();
loadDraft();
setInterval(() => {
  if (document.hidden || !gamertag.value.trim()) return;
  if (saveStep('identity', snapshot())) flashStatus('Progress autosaved.');
}, AUTOSAVE_MS);
