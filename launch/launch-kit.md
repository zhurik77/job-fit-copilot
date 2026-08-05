# Материалы запуска

Тексты и последовательность для четырёх каналов. Сначала — препятствие,
которое надо решить до англоязычных площадок.

---

## ⚠️ Блокер для англоязычного запуска

**Интерфейс расширения полностью русскоязычный.** Панель, настройки, вердикты
(«ОТКЛИКАТЬСЯ» / «ПРОПУСТИТЬ»), все четыре системных промпта и, соответственно,
весь вывод модели — на русском.

Запуск на Product Hunt / Hacker News / Reddit приведёт англоязычную аудиторию
к продукту, которым она не сможет пользоваться. Это не «плохая конверсия», это
провальный запуск: на PH такое собирает комментарии вида «looks cool, but it's
all in Russian», и второй раз запуститься с тем же продуктом уже нельзя.

Варианты, в порядке моей рекомендации:

1. **Запускать русские каналы сейчас, английские — после локализации.**
   Habr + Telegram + Chrome Web Store не требуют ни строчки перевода, а ЦА
   продукта (hh.ru) именно там. Английские каналы ждут.

2. **Локализовать и запустить всё вместе.** Работы примерно на день-полтора:
   `chrome.i18n` + `_locales/{ru,en}`, вынос ~200 строк UI, английские версии
   четырёх системных промптов (это не перевод — промпты придётся переписать и
   протестировать заново, иначе качество разбора просядет).

3. **Запускать всё сразу как есть.** Не рекомендую по причинам выше.

Английские тексты ниже написаны и ждут локализации — при варианте 1 они просто
не используются на первой волне.

---

## Порядок запуска

Каналы не запускают одновременно: Chrome Web Store модерируется до двух недель
и в этот срок вы не управляете. Поэтому магазин — фон, а не событие.

| Когда | Что | Почему так |
|---|---|---|
| День 0 | Отправить в Chrome Web Store, включить GitHub Pages | Модерация идёт фоном, пока вы готовите остальное |
| День 0 | Причесать GitHub: топики, описание, ссылка на лендинг | Все каналы ведут сюда — репозиторий должен быть готов раньше трафика |
| День 1–3 | Написать статью на Хабр | Главный источник целевого трафика: аудитория Хабра и аудитория hh.ru — одни и те же люди |
| День статьи | Пост в Telegram одновременно с публикацией | Первые часы решают, попадёт ли статья в топ |
| После одобрения магазином | Обновить все ссылки на «установить в один клик» | До одобрения ссылка ведёт на ручную установку — это фильтрует часть людей, и это нормально |
| После локализации | Product Hunt → HN → Reddit | См. блокер выше |

---

## Хабр — основной канал

Не пишите «представляю моё расширение». На Хабре заходит разбор проблемы, из
которого расширение следует как вывод.

**Заголовок** (выбрать один):

- Я устал откликаться вслепую и написал расширение, которое отговаривает меня от откликов
- Двенадцать часов на тридцать откликов: как я автоматизировал решение «не откликаться»
- ATS-фильтры отсеивают вас по формальным признакам. Я собрал расширение, которое считает их заранее

**Хаб:** Открытые данные, Карьера в IT-индустрии, Разработка расширений

**Структура, которая работает:**

1. **Проблема в цифрах, не в эмоциях.** Сколько реально стоит один вдумчивый
   отклик. Почему отклик в один клик бесполезен. Арифметика на тридцати
   вакансиях. Здесь читатель узнаёт себя — без этого дальше не читают.

2. **Почему существующие инструменты не помогают.** Они все оптимизируют
   «отправить больше». Никто не оптимизирует «не отправлять».

3. **Идея ведомости.** Не «ИИ оценивает совпадение», а конкретный механизм:
   база 50, дельты со ссылкой на факт, итог = сумма. Покажите реальный разбор
   с вердиктом ПРОПУСТИТЬ — именно отрицательный пример убеждает, что
   инструмент не льстит.

4. **Инженерная часть — то, ради чего Хабр читают.** Здесь ваш самый сильный
   материал, и его надо не пересказывать, а показывать кодом:
   - Как заставить reasoning-модель отдавать чистый JSON, и почему
     `max_tokens` пришлось поднять с 1000 до 2500 (reasoning-токены едят тот же
     бюджет — модель успевала «подумать», но не дописывала ответ).
   - Фолбэк-парсер, вытаскивающий первый `{...}` из болтовни модели.
   - Ретраи с разными планами под `RATE_LIMIT` и `PARSE_ERROR`.
   - Смысловой мэтчинг `matched_as`: почему точное совпадение ключевых слов
     даёт ложные пробелы.
   - `honesty_check`: как запретить модели дорисовывать опыт.
   - Один слой абстракции над тремя провайдерами с разными схемами авторизации.

5. **Раздел «что было сломано».** Это контринтуитивно, но на Хабре честный
   разбор собственных багов собирает больше доверия, чем список фич. У вас
   есть готовый материал в CHANGELOG 0.4.5: экспорт отчётов не работал совсем,
   импорт резюме молча терял данные, кольца показывали неверные проценты — и
   всё это проходило `node --check`. Вывод статьи: единственная автоматическая
   проверка, которая ничего не проверяет, опаснее её отсутствия.

6. **Приватность как архитектура, а не обещание.** `grep -rn "fetch("` даёт
   одну строку. Покажите вывод.

7. **Ограничения честно.** Селекторы hh.ru ломаются при редизайне вёрстки.
   Интерфейс русскоязычный. Нет автоотклика — и не будет, объясните почему.

8. **Ссылки:** лендинг, GitHub, релиз.

**Чего не делать:** не ставьте донат-ссылку в начало статьи и не пишите
«буду благодарен за звёздочку» — на Хабре это заметно снижает доверие.
Ссылка на GitHub в конце достаточна.

---

## Telegram

Публиковать одновременно со статьёй.

```
Написал расширение, которое отговаривает меня откликаться на вакансии.

Не «помогает откликнуться быстрее» — наоборот. Оно считает, сколько
вечеров уйдёт впустую, и обычно советует закрыть вкладку.

Механика простая: база 50 баллов, дальше каждый фактор двигает её
в плюс или минус, и каждый обязан ссылаться на конкретный факт —
годы, инструмент, строчку из вакансии. Никаких «хороший кандидат».

Отдельно сделал так, чтобы оно не дорисовывало опыт: у каждой
предложенной правки резюме есть проверка на честность, и если факта
в резюме нет — правка не предлагается, а разрыв называется разрывом.

Бэкенда нет вообще. Ключ и резюме лежат в браузере, запрос идёт
напрямую в API. Во всём расширении ровно один сетевой вызов.

Открытый код, MIT. Работает на бесплатном ключе NVIDIA NIM.

Написал подробный разбор на Хабре: [ссылка]
Код: github.com/zhurik77/jobfitcopilot
```

---

## Product Hunt *(после локализации)*

**Name:** Job Fit Copilot

**Tagline** (макс. 60):

```
The AI that talks you out of applying
```

**Description** (макс. 260):

```
Every job tool helps you apply to more roles. This one tells you which
ones to skip. It scores a posting against real facts in your resume,
shows every plus and minus, and won't invent experience you don't have.
No backend — your key, your data.
```

**First comment** — на PH это половина успеха:

```
Hi Product Hunt 👋

I built this because I was losing entire evenings to applications that
never had a chance.

A one-click apply is free, and that's exactly why it's worthless — those
get filtered first. A real application costs 20–30 minutes: reading the
posting properly, matching it to your experience, rewriting your resume
for the keywords, writing a letter that isn't boilerplate. Across thirty
postings that's twelve hours, and half of it goes to roles where a
formal filter rejects you for something you simply don't have.

So I built the opposite of what every other tool does. It starts every
posting at 50 and moves that number for each factor — and every line has
to cite something concrete: a year, a tool, a line from the posting.
"Strong candidate" is banned at the prompt level.

The part I care most about: it won't inflate your resume. Every suggested
edit carries an honesty check — the model has to confirm the wording rests
on facts already in your resume. If it can't, the edit isn't offered and
the gap is named as a gap. A tool that embellishes your resume is just
setting you up to fail the first technical interview.

There's no backend. No accounts, no database, no analytics. Your API key
and resume live in chrome.storage.local. The whole extension makes exactly
one network call, and you can verify that yourself — it's MIT licensed.

Happy to answer anything about the prompt engineering, especially getting
reasoning models to reliably return clean JSON. That fought me the longest.
```

**Заранее заготовить ответы на:**
- «Why not just use ChatGPT?» — контекст извлекается со страницы, разбор
  структурирован и воспроизводим, история копится, резюме не надо вставлять
  каждый раз заново.
- «Isn't this just a prompt wrapper?» — да, и это честный ответ. Ценность в
  промптах, извлечении со страниц, ретраях и в том, что нет сервера.
- «Why should I trust it with my resume?» — не надо доверять, надо проверить:
  один `grep`.

---

## Hacker News *(после локализации)*

Формат `Show HN`. Заголовок без прилагательных.

```
Show HN: A Chrome extension that talks you out of job applications
```

Первый комментарий — технический, HN не интересует маркетинг:

```
Author here. The interesting problem wasn't the scoring, it was making
reasoning models reliably return parseable JSON.

Two things that fought me:

1. Reasoning tokens come out of the same max_tokens budget as the answer.
   With a 1000-token limit the model would finish thinking and get cut off
   mid-JSON. Looked like a parsing bug; was actually a budget bug.

2. Even with explicit "return only JSON" instructions, models prepend
   commentary often enough to matter. Fallback: extract the first {...}
   block and parse that. Combined with a retry that uses a different delay
   plan for rate limits vs parse errors, failures became rare enough to
   stop being the top complaint.

The architecture constraint I'd defend: no backend at all. Requests go
browser → provider API with the user's own key. It means I can't add
usage analytics or server-side caching, but it also means "we don't have
your resume" is checkable rather than promised — there's exactly one
fetch() in the codebase.

Happy to go deeper on any of it.
```

**HN предупредит:** будут спрашивать, чем это лучше `curl` + промпта, и
критиковать зависимость от DOM-селекторов hh.ru. Оба вопроса справедливы —
отвечайте прямо, не защищайтесь.

---

## Reddit *(после локализации)*

Сабреддиты: `r/jobsearchhacks`, `r/resumes`, `r/chrome_extensions`,
`r/SideProject`. **Не** `r/cscareerquestions` — там самопродвижение банят.

Reddit жёстче всего реагирует на рекламу, поэтому пост должен быть от первого
лица и с признанием ограничений:

```
I built a Chrome extension that tells me NOT to apply to jobs

I kept burning evenings on applications that never had a chance, so I
built the opposite of every other job tool: it scores a posting against
my actual resume and usually tells me to close the tab.

It starts at 50 and moves up or down per factor, and each line has to
point at something concrete — a year of experience, a tool, a specific
line in the posting. It also won't invent experience: if a requirement
isn't met in substance, it says so instead of suggesting I "rephrase."

Honest limitations: the UI assumes you have your own API key (free tier
works), it only handles hh.ru / LinkedIn / Upwork, and it breaks when
those sites change their markup. No backend, MIT licensed.

Not selling anything — happy to take criticism on the approach.
```

---

## GitHub

**Описание репозитория:**

```
Расширение для Chrome, которое честно говорит, стоит ли откликаться на вакансию. Разбор по фактам резюме, ATS-аудит, без бэкенда.
```

**Topics** (заполнить в настройках репозитория):

```
chrome-extension  manifest-v3  job-search  resume  ats  hh-ru  linkedin
llm  openai  anthropic  deepseek  privacy-first  no-backend  russian
```

**Настройки:**
- Включить GitHub Pages: Settings → Pages → Source: `master` / `/docs`.
  Лендинг поднимется на `zhurik77.github.io/jobfitcopilot`.
- Указать этот адрес в поле Website репозитория.
- Закрепить (pin) репозиторий в профиле.

**Задачи с меткой `good first issue`** — репозиторий с открытыми задачами
выглядит живым, а не заброшенным:

- Экстрактор для career.habr.com
- Экспорт отчёта в Markdown
- Горячая клавиша для запуска разбора
- Локализация интерфейса через `chrome.i18n`

---

## Чего не делать

- **Не покупать звёзды и апвоты.** На PH и HN это ловится и приводит к бану.
- **Не запускаться в пятницу и не в выходные.** Оптимум — вторник или среда,
  утро по времени целевой аудитории.
- **Не запускать PH и HN в один день.** Не хватит внимания отвечать в обоих
  местах, а отвечать в первые часы важнее самого поста.
- **Не начинать ни один текст со слов «В современном мире».**
