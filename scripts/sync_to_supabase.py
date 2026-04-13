"""
Шаг 3: Синхронизация заказов RetailCRM → Supabase

Использование:
  pip install requests supabase python-dotenv
  python sync_to_supabase.py

Можно запускать повторно — upsert по retailcrm_id (дубликаты не создаются).
"""

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(Path(__file__).parent.parent / ".env")

RETAILCRM_URL = os.getenv("RETAILCRM_URL")
RETAILCRM_KEY = os.getenv("RETAILCRM_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

for name, val in [
    ("RETAILCRM_URL", RETAILCRM_URL),
    ("RETAILCRM_API_KEY", RETAILCRM_KEY),
    ("SUPABASE_URL", SUPABASE_URL),
    ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY),
]:
    if not val:
        print(f"Ошибка: переменная {name} не задана в .env")
        sys.exit(1)


def fetch_orders_from_retailcrm(page: int = 1, limit: int = 100) -> dict:
    """Получает страницу заказов из RetailCRM API v5."""
    resp = requests.get(
        f"{RETAILCRM_URL}/api/v5/orders",
        params={
            "apiKey": RETAILCRM_KEY,
            "page": page,
            "limit": limit,
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_all_orders() -> list:
    """Загружает все заказы постранично."""
    all_orders = []
    page = 1

    while True:
        print(f"  Страница {page}...", end=" ", flush=True)
        data = fetch_orders_from_retailcrm(page=page)

        if not data.get("success"):
            print(f"Ошибка RetailCRM: {data.get('errorMsg')}")
            break

        orders = data.get("orders", [])
        all_orders.extend(orders)
        print(f"{len(orders)} заказов")

        pagination = data.get("pagination", {})
        total_pages = pagination.get("totalPageCount", 1)
        if page >= total_pages:
            break

        page += 1
        time.sleep(0.3)

    return all_orders


def map_order_to_row(order: dict) -> dict:
    """Конвертирует заказ RetailCRM в строку таблицы Supabase."""
    # Имя клиента
    customer = order.get("customer", {})
    first = order.get("firstName") or customer.get("firstName", "")
    last = order.get("lastName") or customer.get("lastName", "")
    name = f"{first} {last}".strip() or "Неизвестно"

    # Телефон
    phones = customer.get("phones", [])
    phone = phones[0].get("number", "") if phones else order.get("phone", "")

    # Сумма
    total = float(order.get("summ") or 0)

    # Город
    delivery = order.get("delivery", {})
    address = delivery.get("address", {}) if isinstance(delivery, dict) else {}
    city = address.get("city", "") if isinstance(address, dict) else ""

    # UTM source
    custom = order.get("customFields", {}) or {}
    utm_source = custom.get("utm_source", "")

    # Дата создания
    created_at_str = order.get("createdAt") or order.get("statusUpdatedAt")
    created_at = None
    if created_at_str:
        try:
            created_at = datetime.fromisoformat(
                created_at_str.replace("Z", "+00:00")
            ).isoformat()
        except ValueError:
            pass

    return {
        "retailcrm_id": int(order["id"]),
        "customer_name": name,
        "phone": phone,
        "email": order.get("email") or customer.get("email", ""),
        "status": order.get("status", ""),
        "total": total,
        "city": city,
        "utm_source": utm_source,
        "items": order.get("items", []),
        "retailcrm_created_at": created_at,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


def upsert_to_supabase(client: Client, rows: list) -> None:
    """Вставляет/обновляет строки в Supabase батчами по 50."""
    batch_size = 50
    inserted = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = client.table("orders").upsert(
            batch, on_conflict="retailcrm_id"
        ).execute()
        inserted += len(batch)
        print(f"  Upsert {inserted}/{len(rows)}...")

    return inserted


def main():
    print("Подключаюсь к Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print("Загружаю заказы из RetailCRM...")
    orders = fetch_all_orders()
    print(f"\nВсего заказов из RetailCRM: {len(orders)}\n")

    if not orders:
        print("Нет заказов для синхронизации.")
        return

    print("Конвертирую и загружаю в Supabase...")
    rows = [map_order_to_row(o) for o in orders]
    upsert_to_supabase(supabase, rows)

    print(f"\n✓ Синхронизировано {len(rows)} заказов в Supabase")


if __name__ == "__main__":
    main()
