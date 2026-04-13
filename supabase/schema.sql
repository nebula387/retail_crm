-- Создать таблицу заказов в Supabase
-- Выполни этот SQL в Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  retailcrm_id INTEGER UNIQUE NOT NULL,
  customer_name TEXT,
  phone TEXT,
  email TEXT,
  status TEXT,
  total NUMERIC(12, 2),
  city TEXT,
  utm_source TEXT,
  items JSONB,
  retailcrm_created_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрых запросов
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_city ON orders(city);
CREATE INDEX IF NOT EXISTS idx_orders_total ON orders(total);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(retailcrm_created_at);

-- RLS: разрешить read для анонимных (для дашборда без авторизации)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON orders
  FOR SELECT USING (true);

CREATE POLICY "Allow service role all" ON orders
  USING (auth.role() = 'service_role');
