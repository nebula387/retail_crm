"""
Telegram-уведомления через polling (без webhook).
Скрипт проверяет RetailCRM каждые 60 секунд и отправляет
уведомление в Telegram если появился заказ на сумму > 50 000 ₸.

Использование:
  python telegram_notifier.py

Оставь работать в фоне (или задеплой на сервер/Railway/Render).
"""

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

RETAILCRM_URL = os.getenv("RETAILCRM_URL")
RETAILCRM_KEY = os.getenv("RETAILCRM_API_KEY")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

THRESHOLD = 50_000
POLL_INTERVAL = 60  # секунд

for name, val in [
    ("RETAILCRM_URL", RETAILCRM_URL),
    ("RETAILCRM_API_KEY", RETAILCRM_KEY),
    ("TELEGRAM_BOT_TOKEN", BOT_TOKEN),
    ("TELEGRAM_CHAT_ID", CHAT_ID),
]:
    if not val:
        print(f"Ошибка: {name} не задан в .env")
        sys.exit(1)

# Файл для хранения уже обработанных ID заказов
SEEN_FILE = Path(__file__).parent / ".seen_orders.json"


def load_seen() -> set:
    if SEEN_FILE.exists():
        return set(json.loads(SEEN_FILE.read_text()))
    return set()


def save_seen(seen: set):
    SEEN_FILE.write_text(json.dumps(list(seen)))


def fetch_recent_orders() -> list:
    """Получает последние 50 заказов из RetailCRM."""
    resp = requests.get(
        f"{RETAILCRM_URL}/api/v5/orders",
        params={"apiKey": RETAILCRM_KEY, "limit": 50, "page": 1},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        print(f"RetailCRM ошибка: {data.get('errorMsg')}")
        return []
    return data.get("orders", [])


def send_telegram(order: dict):
    """Отправляет уведомление в Telegram."""
    total = float(order.get("summ") or 0)
    first = order.get("firstName", "")
    last = order.get("lastName", "")
    name = f"{first} {last}".strip() or "Клиент"
    order_id = order.get("id", "—")

    customer = order.get("customer", {}) or {}
    phones = customer.get("phones", [])
    phone = phones[0].get("number", "—") if phones else "—"

    delivery = order.get("delivery", {}) or {}
    address = delivery.get("address", {}) or {}
    city = address.get("city", "не указан")

    items = order.get("items", []) or []
    items_text = "\n".join(
        f"  • {i.get('productName', '?')} × {i.get('quantity', 1)} = "
        f"{int((i.get('initialPrice') or 0) * (i.get('quantity') or 1)):,} ₸".replace(",", " ")
        for i in items
    )

    message = (
        f"🔔 *Новый крупный заказ!*\n\n"
        f"💰 Сумма: *{int(total):,} ₸*\n".replace(",", " ") +
        f"👤 Клиент: {name}\n"
        f"📞 Телефон: {phone}\n"
        f"📍 Город: {city}\n"
        f"🆔 Заказ #{order_id}\n"
        + (f"\n📦 Товары:\n{items_text}" if items_text else "")
    )

    resp = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        json={"chat_id": CHAT_ID, "text": message, "parse_mode": "Markdown"},
        timeout=10,
    )
    result = resp.json()
    if result.get("ok"):
        print(f"  ✓ Telegram уведомление отправлено (заказ #{order_id})")
    else:
        print(f"  ✗ Telegram ошибка: {result.get('description')}")


def check_once(seen: set) -> set:
    orders = fetch_recent_orders()
    new_seen = set(seen)

    for order in orders:
        order_id = str(order.get("id"))
        total = float(order.get("summ") or 0)

        if order_id in seen:
            continue  # уже обработан

        new_seen.add(order_id)

        if total > THRESHOLD:
            print(f"  🔥 Крупный заказ #{order_id}: {int(total):,} ₸ — отправляю уведомление")
            send_telegram(order)
        else:
            print(f"  — Заказ #{order_id}: {int(total):,} ₸ (ниже порога)")

    return new_seen


def main():
    print(f"Telegram notifier запущен. Порог: {THRESHOLD:,} ₸. Интервал: {POLL_INTERVAL}с\n")

    seen = load_seen()
    print(f"Уже обработано заказов: {len(seen)}\n")

    # Первый запуск — просто запомним существующие заказы, не уведомляем
    if not seen:
        print("Первый запуск — запоминаю существующие заказы (уведомлять не буду)...")
        orders = fetch_recent_orders()
        seen = {str(o["id"]) for o in orders}
        save_seen(seen)
        print(f"Запомнено {len(seen)} заказов. Жду новых...\n")

    while True:
        try:
            print(f"[{time.strftime('%H:%M:%S')}] Проверяю заказы...")
            seen = check_once(seen)
            save_seen(seen)
        except requests.RequestException as e:
            print(f"  Сетевая ошибка: {e}")
        except Exception as e:
            print(f"  Ошибка: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
