import squads from '../../data/squads.json';
import { getRegistration, saveStep, completeStep, goToStep, guardStep } from '../registration-state.js';

if (guardStep(2)) init();

function init() {
  const radios = Array.from(document.querySelectorAll('input[name="squad_path"]'));
  const select = document.getElementById('department-squad');
  const dropdown = document.getElementById('join-dropdown-wrapper');
  const recruitingEl = document.getElementById('squads-recruiting');
  const backBtn = document.querySelector('[data-nav="back"]');
  const draftBtn = document.querySelector('[data-action="save-draft"]');

  // ---------- Squads (squads.json): só os que ainda têm vaga ----------
  const slots = (s) => s.capacity - s.members;
  const recruiting = squads.squads.filter((s) => slots(s) > 0);

  for (const s of recruiting) {
    const n = slots(s);
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (Captained by ${s.captain} | ${s.members}/${s.capacity} Members) — ${n} Slot${n === 1 ? '' : 's'} Open`;
    select.append(opt);
  }
  if (recruiting.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No squads are recruiting right now';
    opt.disabled = true;
    opt.selected = true;
    select.append(opt);
  }
  recruitingEl.textContent = `${recruiting.length} Squad${recruiting.length === 1 ? '' : 's'} Recruiting`;
  if (recruiting.some((s) => s.id === squads.defaultId)) select.value = squads.defaultId;

  // ---------- Estado salvo ----------
  const saved = getRegistration().squad;
  if (saved) {
    const radio = radios.find((r) => r.value === saved.path);
    if (radio) radio.checked = true;
    if (saved.squadId && recruiting.some((s) => s.id === saved.squadId)) select.value = saved.squadId;
  }

  const path = () => radios.find((r) => r.checked)?.value ?? null;
  const snapshot = () => ({ path: path(), squadId: path() === 'join' ? select.value || null : null });

  // O visual dos cards (selecionado/não) é CSS puro (has-[:checked]); aqui só o dropdown
  function syncDropdown() {
    dropdown.classList.toggle('hidden', path() !== 'join');
  }
  radios.forEach((r) => r.addEventListener('change', syncDropdown));
  select.addEventListener('change', () => select.setCustomValidity(''));
  syncDropdown();

  // ---------- Navegação ----------
  backBtn?.addEventListener('click', () => {
    saveStep('squad', snapshot());
    goToStep(1);
  });

  draftBtn?.addEventListener('click', () => {
    const ok = saveStep('squad', snapshot());
    const original = draftBtn.textContent;
    draftBtn.textContent = ok ? 'Draft saved' : 'Could not save';
    setTimeout(() => {
      draftBtn.textContent = original;
    }, 2000);
  });

  document.getElementById('squad-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = snapshot();
    if (data.path === 'join' && !data.squadId) {
      select.setCustomValidity('Select a squad to join.');
      select.reportValidity();
      select.focus();
      return;
    }
    saveStep('squad', data);
    completeStep(2);
    goToStep(3);
  });
}
