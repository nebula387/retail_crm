# GBC Analytics Dashboard

Аналитический дашборд для мониторинга заказов интернет-магазина в реальном времени.  
Данные синхронизируются из RetailCRM, хранятся в Supabase и визуализируются через Next.js на Vercel.  
Крупные заказы (>50 000 ₸) автоматически отправляются в Telegram.

**[→ Открыть дашборд](https://retailcrm-sepia.vercel.app)** · **[→ GitHub](https://github.com/nebula387/retail_crm)**

---

## Стек технологий

| Слой | Инструмент |
|------|-----------|
| Frontend | Next.js, Chart.js |
| Backend / API | Next.js API Routes (Node.js) |
| База данных | Supabase (PostgreSQL) |
| CRM | RetailCRM API v5 |
| Деплой | Vercel |
| Планировщик | cron-job.org |
| Уведомления | Telegram Bot API |
| Скрипты | Python 3 |

---

## Архитектура

```
cron-job.org (каждые 15 минут)
  └─→ GET /api/run-sync
        ├─→ RetailCRM API  — забирает актуальные заказы
        ├─→ Supabase       — upsert по retailcrm_id
        └─→ Telegram       — уведомление о новых заказах > 50 000 ₸
                              (дедупликация через таблицу notified_orders)

Браузер
  └─→ Next.js дашборд
        └─→ /api/orders → Supabase SELECT → графики и метрики
```

---

## Возможности дашборда

- **4 KPI-метрики:** всего заказов, выручка, средний чек, крупные заказы
- **Графики (Chart.js):**
  - Заказы по дням (Bar chart)
  - Распределение по статусам (Pie chart)
  - Выручка по городам (Bar chart)
  - UTM-источники (Pie chart)
- **Таблица крупных заказов** (>50 000 ₸) с деталями
- **Кнопка ручной синхронизации** (с защитой через `SYNC_SECRET`)

---

## Структура проекта

```
retail_crm/
├── mock_orders.json              # 50 тестовых заказов для наполнения CRM
├── vercel.json                   # конфигурация деплоя
├── .env.example                  # шаблон переменных окружения
├── pages/
│   ├── index.js                  # дашборд — графики и метрики
│   └── api/
│       ├── orders.js             # GET  — агрегация данных из Supabase
│       ├── run-sync.js           # GET  — синхронизация CRM → Supabase + Telegram
│       └── sync.js               # POST — ручная синхронизация с авторизацией
├── scripts/
│   ├── upload_to_retailcrm.py    # загрузка тестовых заказов в RetailCRM
│   ├── sync_to_supabase.py       # синхронизация CRM → Supabase (Python-версия)
│   └── telegram_notifier.py      # Telegram polling (Python-версия)
└── supabase/
    └── schema.sql                # DDL: таблицы orders + notified_orders
```

---

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `RETAILCRM_URL` | URL аккаунта (`https://your.retailcrm.ru`) |
| `RETAILCRM_API_KEY` | API ключ: Настройки → Интеграции → API |
| `SUPABASE_URL` | URL проекта из Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | anon public ключ (для дашборда) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role ключ (для записи) |
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `TELEGRAM_CHAT_ID` | Telegram user ID получателя |
| `SYNC_SECRET` | секрет для защиты `/api/sync` |

---

## Запуск локально

```bash
git clone https://github.com/nebula387/retail_crm.git
cd retail_crm
npm install
cp .env.example .env.local   # заполните своими ключами
npm run dev                  # http://localhost:3000
```

---

## Решённые технические задачи

### Polling вместо вебхуков
RetailCRM в демо-режиме не поддерживает вебхуки — это подтверждено поддержкой.  
Реализован надёжный polling через cron-job.org каждые 15 минут с `upsert` по `retailcrm_id`.

### Дедупликация Telegram-уведомлений
При каждом запуске sync все крупные заказы попадают в выборку повторно.  
Решение: таблица `notified_orders` хранит уже отправленные `retailcrm_id`, новые уведомления отправляются только для записей, которых там нет.

```sql
INSERT INTO notified_orders (retailcrm_id, total, notified_at)
SELECT retailcrm_id::text, total, NOW()
FROM orders WHERE total > 50000
ON CONFLICT (retailcrm_id) DO NOTHING;
```

### Ограничения Vercel Hobby по cron
Vercel Hobby поддерживает максимум 2 cron-задачи с минимальным интервалом раз в сутки.  
Обойдено через внешний планировщик cron-job.org, который вызывает `/api/run-sync` каждые 15 минут.

### Совместимость с Vercel Node 24
Node.js модуль `https` давал 404 на Vercel Node 24.  
Заменён на нативный `fetch` — проблема устранена без дополнительных зависимостей.
