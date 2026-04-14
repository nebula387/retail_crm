# GBC Analytics Dashboard

Мини-дашборд заказов: RetailCRM → Supabase → Vercel + Telegram-уведомления.

- **Дашборд:** https://retailcrm-sepia.vercel.app
- **Репо:** https://github.com/nebula387/retail_crm

---

## Что было сделано

### Шаг 1: Аккаунты
Созданы все необходимые аккаунты: RetailCRM (демо), Supabase (free tier), Vercel (Hobby), Telegram Bot через @BotFather.

### Шаг 2: Загрузка заказов
Скрипт `scripts/upload_to_retailcrm.py` загрузил 50 заказов из `mock_orders.json` в RetailCRM через `/api/v5/orders/create`.

### Шаг 3: RetailCRM → Supabase
Написан `/api/run-sync` — endpoint который:
- Забирает заказы из RetailCRM API (`/api/v5/orders`)
- Делает `upsert` в таблицу `orders` в Supabase по полю `retailcrm_id`
- Запускается автоматически через cron-job.org каждые 15 минут

### Шаг 4: Дашборд
`pages/index.js` — Next.js дашборд с Chart.js:
- 4 метрики: всего заказов, выручка, средний чек, крупные заказы
- Bar chart: заказы по дням
- Pie chart: статусы заказов
- Bar chart: выручка по городам
- Pie chart: UTM-источники
- Таблица крупных заказов (>50 000 ₸)

Данные читаются из Supabase через `/api/orders`.

### Шаг 5: Telegram-уведомления
`/api/run-sync` при каждом запуске:
1. Находит заказы >50 000 ₸
2. Сверяет с таблицей `notified_orders`
3. Отправляет Telegram только для новых заказов — дубликаты исключены
4. Записывает отправленные в `notified_orders`

---

## Как это работает сейчас

```
Каждые 15 минут (cron-job.org)
  → GET /api/run-sync
    → RetailCRM API /api/v5/orders
    → Supabase upsert (таблица orders)  ← дашборд обновляется
    → SELECT notified_orders
    → Telegram если заказ > 50 000 ₸ и ещё не уведомляли
    → INSERT в notified_orders

Дашборд (Vercel)
  → /api/orders → Supabase SELECT
  → графики и метрики в браузере

Ручная синхронизация
  → кнопка на дашборде → /api/sync (с SYNC_SECRET)
```

---

## Трудности и решения

### 1. Дашборд не обновлялся при новых заказах
**Причина:** `webhook.js` отправлял только Telegram, но не писал в Supabase.  
**Решение:** добавили `upsert` в Supabase в `webhook.js`.

### 2. `/api/cron` и `/api/notify` давали 404
**Причина 1:** cron schedule `* * * * *` — Vercel Hobby поддерживает только раз в день. Деплой падал молча, GitHub integration отдавала старую версию.  
**Решение:** изменили расписание, диагностику проводили через build log.

**Причина 2:** файлы `cron.js` и `notify.js` не попадали в Next.js build — не появлялись как `λ` роуты.  
**Решение:** переименовали в `run-sync.js` и `db-notify.js`.

**Причина 3:** использовался Node.js модуль `https` — на Vercel Node 24 давал 404.  
**Решение:** заменили на нативный `fetch`.

### 3. "Wrong apiKey value" при синхронизации
**Причина:** в Vercel Environment Variables случайно вставили всю строку `RETAILCRM_API_KEY=...` вместо только значения ключа.  
**Диагностика:** добавили `/api/debug-env` — `RETAILCRM_API_KEY_first4: "RETA"` сразу выдало проблему.  
**Решение:** исправили значение переменной.

### 4. Vercel не применял новые env vars
**Причина:** изменение переменных не триггерит новый деплой автоматически. GitHub integration тоже перестала работать после серии неудачных деплоев.  
**Решение:** установили Vercel CLI, деплоим командой `vercel --prod`.

### 5. RetailCRM не поддерживает вебхуки в демо-аккаунте
**Обнаружено:** поддержка RetailCRM подтвердила — в демо вебхуков нет.  
**Решение:** вся цепочка работает через polling через cron-job.org.

### 6. Дублирующиеся Telegram-уведомления
**Причина 1:** Supabase webhook на `/api/db-notify` триггерился при каждом upsert — 30 крупных заказов отправлялись каждый раз.  
**Решение:** удалили Supabase webhook, уведомления обрабатывает только `run-sync`.

**Причина 2:** таблица `notified_orders` была пустая — все 30 заказов считались новыми.  
**Решение:** заполнили `notified_orders` существующими крупными заказами через SQL:
```sql
INSERT INTO notified_orders (retailcrm_id, total, notified_at)
SELECT retailcrm_id::text, total, NOW()
FROM orders WHERE total > 50000
ON CONFLICT (retailcrm_id) DO NOTHING;
```

### 7. Vercel Hobby лимит на cron
**Причина:** Vercel Hobby — максимум 2 cron задачи, каждая раз в день. Уведомления приходили с задержкой до 24 часов.  
**Решение:** подключили бесплатный [cron-job.org](https://cron-job.org) — вызывает `/api/run-sync` каждые 15 минут.

---

## Промпты которые давались Claude Code

- *"при создании нового заказа в retailcrm не обновляется дашборд в vercel и не приходит сообщение в telegram"* — первичная диагностика
- *"все ключи добавлены в vercel, по прежнему не обновляется"* — анализ логов Vercel
- *"1: 404 / 2: API method not found"* — поиск причины по build output
- *"как сделать ручной redeploy from local pc"* — установка Vercel CLI
- *"в retailcrm можно подключить телеграм, можно ли его там настроить"* — исследование альтернатив
- *"сейчас по расписанию в телеграм приходят все заказы больше 50000, а должны только новые"* — отладка дедупликации

---

## Структура проекта

```
retail_crm/
├── mock_orders.json              # 50 тестовых заказов
├── vercel.json                   # cron расписание (Vercel)
├── .env.example                  # шаблон переменных окружения
├── package.json
├── next.config.js
├── pages/
│   ├── index.js                  # дашборд (графики + таблица)
│   └── api/
│       ├── orders.js             # GET  — агрегация данных из Supabase
│       ├── run-sync.js           # GET  — синхронизация RetailCRM → Supabase + Telegram
│       ├── sync.js               # POST — ручная синхронизация с авторизацией
│       ├── db-notify.js          # POST — Supabase webhook handler (не используется)
│       └── webhook.js            # POST — RetailCRM webhook handler (не используется)
├── scripts/
│   ├── upload_to_retailcrm.py    # загрузка mock_orders.json → RetailCRM
│   ├── sync_to_supabase.py       # синхронизация RetailCRM → Supabase (Python)
│   └── telegram_notifier.py      # polling Telegram (Python, альтернатива)
└── supabase/
    └── schema.sql                # SQL: таблицы orders + notified_orders
```

---

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `RETAILCRM_URL` | URL аккаунта, например `https://your.retailcrm.ru` |
| `RETAILCRM_API_KEY` | API ключ из RetailCRM → Настройки → Интеграции → API |
| `SUPABASE_URL` | URL проекта из Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | anon public ключ (для дашборда) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role ключ (для записи) |
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `TELEGRAM_CHAT_ID` | ваш Telegram user ID |
| `SYNC_SECRET` | произвольный секрет для защиты `/api/sync` |
