// Довідник контрагентів: хто вже траплявся, під якою назвою і кодом.
// Модель щоразу читає назву по-своєму («ф/п Бригара», «ФОП Бригар О.І.»), а в обліку контрагент має бути один.
// Тому відомого контрагента підставляємо з довідника, а не з того, що прочитано. Довідник лише доповнюється.
// Поки немає бекенду, довідник живе у браузері; відомі контрагенти з проведених документів теж враховуються.
import type { Doc } from '../data';

const KEY = 'saldo-cp';
export type Supplier = { name: string; edrpou?: string; aliases: string[] };

function load(): Supplier[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Supplier[]; } catch { return []; } }
function save(v: Supplier[]) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* приватний режим */ } }

// \b у JS не працює з кирилицею, тому межі слова — пробіл або початок/кінець рядка
const FORMS = /(^|\s)(тов|фоп|ф\/п|п\/п|фо-п|пп|прат|пат|ат|тзов|кп|дп|ооо|чп|спд|фл-п)\.?(?=\s|$)/g;
/** Назва без організаційної форми, лапок, крапок і регістру. */
export const cpNorm = (s: string) => s.toLowerCase().replace(/[ёэы]/g, c => ({ 'ё': 'е', 'э': 'е', 'ы': 'и' } as Record<string, string>)[c])
  .replace(/["'«»„“”`’]/g, ' ').replace(/\s+/g, ' ').trim().replace(FORMS, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

/** Ключ контрагента для правил і прив’язок номенклатури: код, а без коду — нормалізована назва. */
export const partyKey = (edrpou?: string, name?: string) => edrpou || (name ? 'cp:' + cpNorm(name) : undefined);

/** Однакове основне слово (прізвище чи назва) з точністю до закінчення: «бригар» ~ «бригара». */
export function sameSurname(a: string, b: string): boolean {
  const x = cpNorm(a).split(' ')[0] || '', y = cpNorm(b).split(' ')[0] || '';
  if (x === y && x) return true;
  if (x.length < 4 || y.length < 4) return false;
  let p = 0; while (p < x.length && p < y.length && x[p] === y[p]) p++;
  return p >= 4 && x.length - p <= 2 && y.length - p <= 2;
}

/** Чи це той самий контрагент: те саме прізвище чи назва і ті самі ініціали, якщо вони є в обох (рос. «И» = укр. «І»). */
export function sameParty(a: string, b: string): boolean {
  const x = cpNorm(a), y = cpNorm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (!sameSurname(a, b)) return false;
  const ini = (s: string) => s.split(' ').slice(1).join('').replace(/и/g, 'і').replace(/[^a-zа-яіїєґ]/g, '').slice(0, 2);
  const xi = ini(x), yi = ini(y);
  return !xi || !yi || xi === yi || xi.startsWith(yi) || yi.startsWith(xi);
}

/** Що ще відомо про документ, щоб упізнати контрагента, коли ініціали прочитано інакше («В.И.» і «Б.І.»). */
export type PartyHint = { items?: string[]; total?: number | null; number?: string | null };

/** Відомий контрагент за кодом або за назвою: спершу довідник, потім проведені документи. */
export function findParty(name: string | null, edrpou: string | undefined, docs: Doc[] = [], hint: PartyHint = {}): Supplier | undefined {
  const list = load();
  const fromDocs: Supplier[] = docs.filter(d => d.st === 'ok' && d.cp).map(d => ({ name: d.cp, edrpou: d.edrpou, aliases: [] }));
  const all = [...list, ...fromDocs];
  if (edrpou) { const byCode = all.find(s => s.edrpou === edrpou); if (byCode) return byCode; }
  if (!name) return undefined;
  const exact = all.find(s => sameParty(s.name, name) || s.aliases.some(a => sameParty(a, name)));
  if (exact) return exact;
  // те саме прізвище, але інші ініціали: рукописні ініціали часто читаються по-різному. Беремо запис довідника,
  // лише якщо в цього контрагента вже був документ з тим самим товаром, тією самою сумою або тим самим номером
  const norm = (t: string) => t.toLowerCase().replace(/[^a-zа-яіїєґ0-9]/g, '');
  const items = new Set((hint.items || []).map(norm).filter(Boolean));
  const confirmed = (s: Supplier) => docs.some(d => (d.cp === s.name || s.aliases.includes(d.cp)) && (
    (hint.total != null && Math.abs(d.sum - hint.total) < 0.01) || (!!hint.number && d.no === hint.number) ||
    (d.items || []).some(it => items.has(norm(it.name)))));
  return all.find(s => sameSurname(s.name, name) && confirmed(s));
}

/** Запам’ятати контрагента після підтвердження документа; прочитаний варіант назви стає синонімом. */
export function rememberParty(name: string, edrpou?: string, readAs?: string) {
  const list = load();
  let s = (edrpou && list.find(x => x.edrpou === edrpou)) || list.find(x => sameParty(x.name, name));
  if (!s) { s = { name, edrpou, aliases: [] }; list.push(s); }
  s.name = name; if (edrpou) s.edrpou = edrpou;
  if (readAs && readAs !== name && !s.aliases.includes(readAs)) s.aliases.push(readAs);
  save(list);
}
