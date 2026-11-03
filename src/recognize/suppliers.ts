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

/** Чи це той самий контрагент: однакове основне слово (прізвище чи назва) з точністю до закінчення і ті самі ініціали, якщо вони є в обох. */
export function sameParty(a: string, b: string): boolean {
  const x = cpNorm(a), y = cpNorm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [xw, ...xr] = x.split(' '), [yw, ...yr] = y.split(' ');
  if (xw.length < 4 || yw.length < 4) return false;
  let p = 0; while (p < xw.length && p < yw.length && xw[p] === yw[p]) p++;
  // «бригар» ~ «бригара», «бригару»: розходження лише в закінченні до 2 літер
  if (p < 4 || xw.length - p > 2 || yw.length - p > 2) return false;
  const ini = (r: string[]) => r.join('').replace(/[^a-zа-яіїєґ]/g, '').slice(0, 2);
  const xi = ini(xr), yi = ini(yr);
  return !xi || !yi || xi === yi || xi.startsWith(yi) || yi.startsWith(xi);
}

/** Відомий контрагент за кодом або за назвою: спершу довідник, потім проведені документи. */
export function findParty(name: string | null, edrpou: string | undefined, docs: Doc[] = []): Supplier | undefined {
  const list = load();
  const fromDocs: Supplier[] = docs.filter(d => d.st === 'ok' && d.cp).map(d => ({ name: d.cp, edrpou: d.edrpou, aliases: [] }));
  const all = [...list, ...fromDocs];
  if (edrpou) { const byCode = all.find(s => s.edrpou === edrpou); if (byCode) return byCode; }
  if (!name) return undefined;
  return all.find(s => sameParty(s.name, name) || s.aliases.some(a => sameParty(a, name)));
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
