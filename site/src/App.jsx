import { useState } from 'react';
import {
  ArrowRight, Check, X, Minus, ShieldCheck, Github, Download,
  Sparkles, GitCompareArrows, FileSearch, PenLine, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const asset = (file) => `${import.meta.env.BASE_URL}${file}`;
const REPO = 'https://github.com/zhurik77/jobfitcopilot';

/* Разбор реальной вакансии с hh.ru под профиль автора — те же цифры,
   что и на скриншоте панели. Ведомость и есть механика продукта, поэтому
   она стоит на первом экране, а не описывается словами. */
const LEDGER = [
  { text: 'n8n в обязательных требованиях и в навыках резюме', delta: 16 },
  { text: 'REST API и JSON — подтверждено интеграциями в UniversityID', delta: 12 },
  { text: 'Нейросети для сборки решений — год работы с LLM', delta: 10 },
  { text: 'Linux / VPS, SSH в обязательных — в резюме нет', delta: -12 },
  { text: 'Требуется править JavaScript, заявлен только Python', delta: -8 },
  { text: 'PostgreSQL в задачах, в резюме — SQL и MongoDB', delta: -5 },
];
const SCORE = 50 + LEDGER.reduce((s, r) => s + r.delta, 0);

const MODES = [
  {
    icon: Sparkles,
    title: 'Разбор по факторам',
    text: 'База 50 и дельта за каждый фактор. Каждая строка обязана ссылаться на факт: год, инструмент, строку вакансии. «Хороший кандидат» запрещён на уровне промпта.',
  },
  {
    icon: GitCompareArrows,
    title: 'Сравнение резюме',
    text: 'Одна вакансия против всех ваших версий резюме. Ранжирование по обязательным требованиям — они решают, пройдёте ли вы формальный фильтр.',
    star: true,
  },
  {
    icon: FileSearch,
    title: 'Глубокий ATS-аудит',
    text: 'Взвешенный скоринг по четырём критериям, построчная замена «участвовал» на «спроектировал» с измеримым результатом, топ-20 ролей.',
  },
  {
    icon: PenLine,
    title: 'Сопроводительные письма',
    text: 'Собираются из сильных сторон, найденных разбором. Список запрещённых клише зашит в промпт: «заинтересован в вашей вакансии» не появится.',
  },
];

const SHOTS = [
  {
    file: 'screenshot-fitcheck.jpg',
    title: 'Вердикт и ведомость',
    text: 'Индекс, цена отклика в минутах и каждый фактор со ссылкой на факт.',
  },
  {
    file: 'screenshot-compare.jpg',
    title: 'Какое резюме отправлять',
    text: 'AI-автоматизатор закрывает 75% обязательных, Business Analyst — 25%.',
  },
  {
    file: 'screenshot-ats-match.jpg',
    title: 'ATS-разбор под резюме',
    text: 'Обязательные отдельно от желательных, со смысловым покрытием.',
  },
  {
    file: 'screenshot-ats-audit.jpg',
    title: 'Аудит резюме',
    text: 'Четыре критерия, построчные переформулировки, чек-лист правок.',
  },
];

/* Сравнение с конкурентами. Отмечено только то, что проверяемо по их
   публичным описаниям возможностей. */
const RIVALS = ['Jobscan', 'Teal', 'ResumeWorded'];
const COMPARE = [
  { feature: 'ATS-скоринг резюме под вакансию', us: true, rivals: [true, true, true] },
  { feature: 'Разбор с указанием, почему НЕ стоит откликаться', us: true, rivals: [false, false, false] },
  { feature: 'Сравнение нескольких резюме под одну вакансию', us: true, rivals: [false, false, false] },
  { feature: 'Проверка правок на честность (не дорисовывает опыт)', us: true, rivals: [false, false, false] },
  { feature: 'Работает прямо на странице вакансии', us: true, rivals: [true, true, false] },
  { feature: 'Данные не уходят на сервер сервиса', us: true, rivals: [false, false, false] },
  { feature: 'Открытый код', us: true, rivals: [false, false, false] },
  { feature: 'Бесплатно без ограничений по количеству разборов', us: true, rivals: ['limit', 'limit', 'limit'] },
];

const MODELS = [
  { name: 'DeepSeek V4 Flash', provider: 'NVIDIA NIM', price: 'бесплатный тариф', free: true },
  { name: 'GLM-5.2', provider: 'NVIDIA NIM', price: 'бесплатный тариф', free: true },
  { name: 'GPT-4.1', provider: 'OpenAI', price: 'по тарифам OpenAI' },
  { name: 'Claude Sonnet 4.6', provider: 'Anthropic', price: 'по тарифам Anthropic' },
];

const STEPS = [
  { title: 'Скачайте релиз', text: 'Или клонируйте репозиторий, если привычнее.' },
  { title: 'chrome://extensions', text: 'Включите «Режим разработчика» → «Загрузить распакованное».' },
  { title: 'Вставьте API-ключ', text: 'Бесплатный ключ NVIDIA NIM берётся на build.nvidia.com за пару минут.' },
  { title: 'Откройте вакансию', text: 'hh.ru, LinkedIn или Upwork — панель подхватит текст сама.' },
];

function Eyebrow({ children }) {
  return (
    <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-fg-muted">
      {children}
    </p>
  );
}

function Section({ id, children, className }) {
  return (
    <section id={id} className={cn('border-t border-line py-20 sm:py-28', className)}>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

/* Кликабельный скриншот: по умолчанию подрезан, по клику раскрывается
   целиком. Раньше кадры были зажаты в узкую колонку с обрезкой — по ним
   было ничего не разобрать. */
function Shot({ file, title, text }) {
  const [open, setOpen] = useState(false);
  return (
    <figure className="group">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full overflow-hidden rounded-2xl border border-line bg-surface text-left transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span
          className={cn(
            'block overflow-hidden transition-[max-height] duration-500',
            open ? 'max-h-[240rem]' : 'max-h-[34rem]'
          )}
        >
          <img src={asset(file)} alt={title} loading="lazy" className="w-full" />
        </span>
      </button>
      <figcaption className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-fg">{title}</h3>
          <p className="mt-1 text-sm text-fg-muted">{text}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 shrink-0 font-mono text-[0.6875rem] uppercase tracking-widest text-accent hover:underline"
        >
          {open ? 'свернуть' : 'целиком'}
        </button>
      </figcaption>
    </figure>
  );
}

function Ledger() {
  const max = Math.max(...LEDGER.map((r) => Math.abs(r.delta)));
  return (
    <Card className="overflow-hidden bg-surface/80 backdrop-blur">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-fg-muted">
          Разбор совпадения
        </span>
        <Badge variant="accent">С оговорками</Badge>
      </div>

      <div className="px-5 py-4">
        <p className="mb-4 font-mono text-xs text-fg-muted">
          Специалист по автоматизации (n8n, AI) · hh.ru
        </p>

        <div className="flex items-baseline justify-between border-b border-line/60 pb-3">
          <span className="text-sm text-fg-muted">Базовый уровень</span>
          <span className="font-mono text-sm text-fg-muted">50</span>
        </div>

        {LEDGER.map((row) => {
          const pos = row.delta > 0;
          return (
            <div key={row.text} className="border-b border-line/60 py-3">
              <div className="mb-2 flex items-start justify-between gap-4">
                <span className="text-[0.8125rem] leading-snug text-fg">{row.text}</span>
                <span
                  className={cn(
                    'shrink-0 font-mono text-sm font-bold tabular-nums',
                    pos ? 'text-good' : 'text-bad'
                  )}
                >
                  {pos ? '+' : '−'}
                  {Math.abs(row.delta)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className={cn('h-full rounded-full', pos ? 'bg-good' : 'bg-bad')}
                  style={{ width: `${Math.max((Math.abs(row.delta) / max) * 100, 8)}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="flex items-center justify-between pt-4">
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-fg-muted">
            Индекс совместимости
          </span>
          <span className="font-mono text-3xl font-extrabold tabular-nums text-accent">{SCORE}</span>
        </div>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-fg-muted">
          Ядро вакансии закрыто, но три обязательных требования — нет, и это не вопрос
          формулировок. Вдумчивый отклик занял бы ~18 минут.
        </p>
      </div>
    </Card>
  );
}

function CompareCell({ value }) {
  if (value === true) return <Check className="mx-auto size-4 text-good" aria-label="да" />;
  if (value === 'limit') return <Minus className="mx-auto size-4 text-mid" aria-label="с ограничениями" />;
  return <X className="mx-auto size-4 text-fg-muted/40" aria-label="нет" />;
}

export default function App() {
  return (
    <div className="min-h-dvh">
      {/* ---------- шапка ---------- */}
      <header className="sticky top-0 z-50 border-b border-line/60 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <span className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-accent font-mono text-[0.625rem] font-extrabold text-ink-deep">
              JF
            </span>
            Job Fit Copilot
          </span>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="hidden rounded-full px-3 py-1.5 text-sm text-fg-muted hover:text-fg sm:block">
              Как работает
            </a>
            <a href="#compare" className="hidden rounded-full px-3 py-1.5 text-sm text-fg-muted hover:text-fg sm:block">
              Сравнение
            </a>
            <a href="#privacy" className="hidden rounded-full px-3 py-1.5 text-sm text-fg-muted hover:text-fg md:block">
              Приватность
            </a>
            <Button asChild href={REPO} size="sm" variant="outline" className="gap-1.5">
              <Github className="size-3.5" /> GitHub
            </Button>
          </nav>
        </div>
      </header>

      {/* ---------- герой ---------- */}
      <div className="relative overflow-hidden">
        <div className="glow-accent pointer-events-none absolute inset-0" />
        <div className="grid-lines pointer-events-none absolute inset-0" />

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
          <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <Badge variant="accent" className="mb-6">
                Chrome · Manifest V3 · без бэкенда
              </Badge>

              <h1 className="text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.98]">
                <span className="text-gradient">ИИ, который</span>
                <br />
                <span className="text-accent">отговаривает</span>
                <br />
                <span className="text-gradient">вас откликаться</span>
              </h1>

              <p className="mt-7 max-w-lg text-lg leading-relaxed text-fg-muted">
                Все остальные инструменты помогают разослать больше откликов. Этот считает,
                сколько вечеров уйдёт впустую, — и чаще всего советует закрыть вкладку.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild href={`${REPO}/releases/latest`} size="lg" className="gap-2">
                  <Download className="size-4" /> Скачать релиз
                </Button>
                <Button asChild href={REPO} size="lg" variant="outline" className="gap-2">
                  Исходники <ArrowRight className="size-4" />
                </Button>
              </div>

              <p className="mt-5 max-w-md text-sm text-fg-muted">
                Бесплатно, без регистрации. Работает на бесплатном ключе NVIDIA NIM — свой
                ключ, свои данные, без сервера посередине.
              </p>
            </div>

            <Ledger />
          </div>
        </div>

        {/* Главный кадр: панель рядом с настоящей вакансией. Во всю ширину —
            ради него сюда и приходят. */}
        <div className="relative mx-auto max-w-[88rem] px-5 pb-20 sm:px-8">
          <div className="overflow-hidden rounded-2xl border border-line shadow-[0_40px_120px_-40px_rgba(255,149,0,0.35)]">
            <img
              src={asset('shot-wide.jpg')}
              width={1440}
              height={900}
              alt="Панель Job Fit Copilot рядом с настоящей вакансией на hh.ru: требования вакансии слева, разбор с дельтами справа"
              className="w-full"
            />
          </div>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm text-fg-muted">
            Слева — настоящая вакансия с hh.ru, справа — разбор той же вакансии.
            Требования «n8n», «REST API и вебхуки», «Linux / VPS» превращаются
            в <span className="text-good">+16</span>, <span className="text-good">+12</span> и{' '}
            <span className="text-bad">−12</span>.
          </p>
        </div>
      </div>

      {/* ---------- зачем ---------- */}
      <Section id="why">
        <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <div>
            <Eyebrow>Зачем</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
              Отклик стоит не клика, а вечера
            </h2>
          </div>
          <div className="space-y-5 text-[1.0625rem] leading-relaxed text-fg-muted">
            <p>
              Откликнуться в один клик бесплатно — и поэтому бесполезно: такие отклики
              отсеиваются первыми. Отклик, у которого есть шанс, — это перечитать вакансию,
              сопоставить её со своим опытом, переписать резюме под ключевые слова и написать
              нешаблонное письмо.
            </p>
            <p className="text-fg">
              Двадцать пять минут. На тридцати вакансиях — двенадцать часов, и половина из них
              уходит на позиции, где вас отсеет фильтр по формальному требованию, которого у вас
              просто нет.
            </p>
            <p>
              Job Fit Copilot тратит двадцать секунд, чтобы сказать, какие из тридцати не стоят
              вашего вечера, — и почему именно, со ссылкой на конкретную строчку вакансии.
            </p>
          </div>
        </div>
      </Section>

      {/* ---------- режимы ---------- */}
      <Section id="how">
        <Eyebrow>Четыре режима</Eyebrow>
        <h2 className="mt-4 max-w-2xl text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
          Что он делает, пока вы читаете вакансию
        </h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {MODES.map(({ icon: Icon, title, text, star }) => (
            <Card
              key={title}
              className={cn(
                'p-6 transition-colors hover:border-accent/40',
                star && 'border-accent/40 bg-accent/[0.06]'
              )}
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-xl',
                    star ? 'bg-accent text-ink-deep' : 'bg-white/5 text-accent'
                  )}
                >
                  <Icon className="size-4.5" />
                </span>
                <h3 className="text-[1.0625rem] font-bold">{title}</h3>
                {star && <Badge variant="accent">только здесь</Badge>}
              </div>
              <p className="text-sm leading-relaxed text-fg-muted">{text}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ---------- скриншоты ---------- */}
      <Section id="screens">
        <Eyebrow>Интерфейс</Eyebrow>
        <h2 className="mt-4 max-w-2xl text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
          Панель целиком, без прикрас
        </h2>
        <p className="mt-4 max-w-2xl text-fg-muted">
          Нажмите на любой кадр, чтобы раскрыть его целиком.
        </p>

        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:gap-12">
          {SHOTS.map((s) => (
            <Shot key={s.file} {...s} />
          ))}
        </div>

        <p className="mt-10 text-sm italic text-fg-muted">
          Кадры сняты из настоящих файлов расширения командой <code className="font-mono not-italic text-fg">npm run shots</code>.
          Заранее задан только ответ модели — живой запрос требует вашего ключа и каждый раз
          возвращает другой текст.
        </p>
      </Section>

      {/* ---------- сравнение ---------- */}
      <Section id="compare">
        <Eyebrow>Сравнение</Eyebrow>
        <h2 className="mt-4 max-w-2xl text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
          Чего не делает больше никто
        </h2>

        <div className="mt-10 max-w-full overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-3 pr-4 text-left font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                  Возможность
                </th>
                <th className="w-32 px-2 py-3 text-center">
                  <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-accent">
                    Job Fit Copilot
                  </span>
                </th>
                {RIVALS.map((r) => (
                  <th
                    key={r}
                    className="w-28 px-2 py-3 text-center font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-muted"
                  >
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.feature} className="border-b border-line/60">
                  <td className="py-3.5 pr-4 text-fg">{row.feature}</td>
                  <td className="bg-accent/[0.06] px-2 py-3.5">
                    <CompareCell value={row.us} />
                  </td>
                  {row.rivals.map((v, i) => (
                    <td key={RIVALS[i]} className="px-2 py-3.5">
                      <CompareCell value={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-5 text-xs text-fg-muted">
          <Minus className="inline size-3 text-mid" /> — есть, но с лимитом на бесплатном тарифе.
          Отмечено только то, что проверяется по публичным описаниям возможностей сервисов
          на момент публикации.
        </p>
      </Section>

      {/* ---------- честность ---------- */}
      <Section id="honesty">
        <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <div>
            <Eyebrow>Принцип</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
              Он не дорисовывает вам опыт
            </h2>
            <p className="mt-5 text-fg-muted">
              Инструмент, который приукрашивает резюме, готовит вас к провалу на первом же
              техническом собеседовании.
            </p>
          </div>

          <div className="space-y-8">
            {[
              {
                h: 'Каждая правка проходит проверку на честность',
                p: <>У любой предложенной формулировки есть поле <code className="font-mono text-accent">honesty_check</code>: модель обязана подтвердить, что правка опирается только на факты из вашего резюме. Не может подтвердить — правка не предлагается вообще.</>,
              },
              {
                h: 'Разрыв называется разрывом',
                p: <>Если требования нет не на словах, а по сути, разбор говорит об этом прямо, вместо того чтобы предложить «переформулировать».</>,
              },
              {
                h: 'Модель настроена быть придирчивой',
                p: <>Дословно из системного промпта: «задача не подбодрить кандидата, а сэкономить его время, отсеяв нерелевантные вакансии».</>,
              },
            ].map((item, i) => (
              <div key={item.h} className="flex gap-5">
                <span className="mt-1 shrink-0 font-mono text-xs font-bold tabular-nums text-accent/60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-[1.0625rem] font-bold">{item.h}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------- приватность ---------- */}
      <Section id="privacy">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <Eyebrow>Приватность</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
              Резюме не уходит на наш сервер, потому что сервера нет
            </h2>
            <p className="mt-5 text-fg-muted">
              Ни бэкенда, ни базы, ни аккаунтов, ни аналитики. Ключи и резюме лежат
              в <code className="font-mono text-fg">chrome.storage.local</code> вашего браузера.
              Запрос идёт напрямую от вас к провайдеру, чей ключ вы вставили.
            </p>
            <p className="mt-4 text-fg-muted">
              Это проверяется за минуту, а не принимается на веру.
            </p>
          </div>

          <div>
            <Card className="overflow-hidden border-accent/25 bg-ink-deep">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <ShieldCheck className="size-3.5 text-good" />
                <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-fg-muted">
                  весь исходный код
                </span>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed">
<span className="text-fg-muted">$</span> <span className="text-fg">grep -rn "fetch(" --include=*.js .</span>{'\n'}
<span className="text-accent">background.js:104</span><span className="text-fg">: await fetch(provider.endpoint, …)</span>{'\n\n'}
<span className="text-fg-muted"># единственный. больше расширение никуда не ходит.</span>
              </pre>
            </Card>
            <p className="mt-5 text-sm leading-relaxed text-fg-muted">
              Расширение читает только ту страницу, которая уже открыта у вас во вкладке.
              Не листает вакансии в фоне, не обходит авторизацию и не отправляет отклики
              за вас — это осознанное ограничение, а не недоделка.
            </p>
          </div>
        </div>
      </Section>

      {/* ---------- модели ---------- */}
      <Section id="models">
        <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <div>
            <Eyebrow>Модели</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
              Свой ключ, любой из четырёх
            </h2>
            <p className="mt-5 text-fg-muted">
              Начать можно бесплатно: у NVIDIA NIM есть бесплатный тариф, которого хватает
              на ежедневный поиск.
            </p>
          </div>

          <div className="space-y-2">
            {MODELS.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-4"
              >
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="font-mono text-xs text-fg-muted">{m.provider}</div>
                </div>
                <span className={cn('shrink-0 text-sm', m.free ? 'font-semibold text-good' : 'text-fg-muted')}>
                  {m.price}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------- установка ---------- */}
      <Section id="install">
        <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
          <div>
            <Eyebrow>Установка</Eyebrow>
            <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight">
              Три минуты, без регистрации
            </h2>
            <p className="mt-5 text-sm text-fg-muted">
              Пока расширение ставится вручную как распакованное — так вы видите ровно тот
              код, который запускаете.
            </p>
            <Button asChild href={`${REPO}/releases/latest`} className="mt-7 gap-2">
              <Download className="size-4" /> Скачать релиз
            </Button>
          </div>

          <ol className="space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-5 rounded-xl px-4 py-4 transition-colors hover:bg-white/[0.03]">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-accent/30 font-mono text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-fg-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* ---------- финал ---------- */}
      <Section className="text-center">
        <h2 className="mx-auto max-w-2xl text-[clamp(1.75rem,4vw,3rem)] leading-tight">
          Перестаньте тратить вечера на вакансии, где вас отсеет фильтр
        </h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild href={`${REPO}/releases/latest`} size="lg" className="gap-2">
            <Download className="size-4" /> Скачать релиз
          </Button>
          <Button asChild href={REPO} size="lg" variant="outline" className="gap-2">
            <Github className="size-4" /> Открыть код <ChevronRight className="size-4" />
          </Button>
        </div>
      </Section>

      <footer className="border-t border-line py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 text-sm text-fg-muted sm:px-8">
          <span>MIT · работает целиком в вашем браузере</span>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <a className="hover:text-fg" href={REPO}>GitHub</a>
            <a className="hover:text-fg" href={`${REPO}/blob/master/PRIVACY.md`}>Приватность</a>
            <a className="hover:text-fg" href={`${REPO}/blob/master/CHANGELOG.md`}>Changelog</a>
            <a className="hover:text-fg" href="https://www.tbank.ru/cf/1cYvs7KjikV">Поддержать</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
