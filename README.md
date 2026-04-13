# GBC Analytics Dashboard

## Структура проекта

```
gbc-analytics-dashboard/
├── mock_orders.json              # 50 тестовых заказов
├── .env.example                  # шаблон переменных окружения
├── package.json
├── next.config.js
├── pages/
│   ├── index.js                  # дашборд (графики + таблица)
│   └── api/
│       ├── orders.js             # GET  /api/orders — агрегация из Supabase
│       ├── sync.js               # POST /api/sync   — синхронизация RetailCRM → Supabase
│       └── webhook.js            # POST /api/webhook — Telegram-уведомления
├── scripts/
│   ├── requirements.txt
│   ├── upload_to_retailcrm.py    # загрузка mock_orders.json → RetailCRM
│   ├── sync_to_supabase.py       # синхронизация RetailCRM → Supabase
│   └── telegram_notifier.py      # polling: уведомления в Telegram (заказы > 50 000 ₸)
└── supabase/
    └── schema.sql                # SQL для создания таблицы orders
```
