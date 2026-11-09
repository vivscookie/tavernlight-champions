// Estado do cadastro (wizard de 4 etapas), compartilhado entre as telas.
// Hoje fica no localStorage; quando houver backend, basta trocar read()/write() por chamadas de API.
import site from '../data/site.json';

const KEY = 'tavernlight:registration:v1';
const STEPS = site.steps; // [{ n, label, title, href }]

let memory = null; // fallback se o localStorage estiver indisponível (modo privado, bloqueado, cheio)

const empty = () => ({ version: 1, identity: null, squad: null, games: null, stake: null, completed: [], updatedAt: null });

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) return { ...empty(), ...parsed };
    }
  } catch {
    /* dado corrompido ou storage bloqueado: cai no fallback */
  }
  return memory ?? empty();
}

function write(state) {
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export const getRegistration = () => read();

/** Salva os dados de uma etapa ('identity' | 'squad' | 'games' | 'stake'), sem concluí-la (rascunho). */
export function saveStep(key, data) {
  const state = read();
  state[key] = data;
  state.updatedAt = Date.now();
  return write(state);
}

/** Marca a etapa n como concluída (o usuário avançou). */
export function completeStep(n) {
  const state = read();
  if (!state.completed.includes(n)) state.completed.push(n);
  state.updatedAt = Date.now();
  return write(state);
}

export function clearRegistration() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}

const stepUrl = (n) => STEPS.find((s) => s.n === n)?.href;

export const goToStep = (n) => {
  const url = stepUrl(n);
  if (url) window.location.href = url;
};

/** Primeira etapa que ainda não foi concluída (a última, se todas as anteriores estão feitas). */
export function firstIncompleteStep(state = read()) {
  for (const s of STEPS.slice(0, -1)) if (!state.completed.includes(s.n)) return s.n;
  return STEPS[STEPS.length - 1].n;
}

/**
 * Impede pular etapas por URL. Retorna true se a página pode carregar;
 * senão redireciona para a primeira etapa pendente. Use ?preview=1 para ignorar (design/QA).
 */
export function guardStep(n) {
  if (new URLSearchParams(window.location.search).has('preview')) return true;
  const first = firstIncompleteStep();
  if (n > first) {
    window.location.replace(stepUrl(first));
    return false;
  }
  return true;
}
