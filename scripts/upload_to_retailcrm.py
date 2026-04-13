"""
Шаг 2: Загрузка mock_orders.json в RetailCRM через API v5

Использование:
  pip install requests python-dotenv
  cp ../.env.example ../.env  # заполни переменные
  python upload_to_retailcrm.py
"""

import json
import time
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

RETAILCRM_URL = os.getenv("RETAILCRM_URL")   # https://yourstore.retailcrm.ru
RETAILCRM_KEY = os.getenv("RETAILCRM_API_KEY")

if not RETAILCRM_URL or not RETAILCRM_KEY:
    print("Ошибка: заполни RETAILCRM_URL и RETAILCRM_API_KEY в .env")
    sys.exit(1)

ORDERS_FILE = Path(__file__).parent.parent / "mock_orders.json"


def build_order_payload(order: dict) -> dict:
    """Конвертирует заказ из mock формата в формат RetailCRM API v5."""
    total = sum(
        item["initialPrice"] * item.get("quantity", 1)
        for item in order.get("items", [])
    )

    payload = {
        "firstName": order.get("firstName", ""),
        "lastName": order.get("lastName", ""),
        "phone": order.get("phone", ""),
        "email": order.get("email", ""),
        "summ": total,
        "items": [
            {
                "productName": item["productName"],
                "quantity": item.get("quantity", 1),
                "initialPrice": item["initialPrice"],
            }
            for item in order.get("items", [])
        ],
    }

    # Адрес доставки
    delivery = order.get("delivery", {})
    address = delivery.get("address", {})
    if address:
        payload["delivery"] = {
            "address": {
                "city": address.get("city", ""),
                "text": address.get("text", ""),
            }
        }

    # Кастомные поля (utm_source)
    custom = order.get("customFields", {})
    if custom.get("utm_source"):
        payload["customFields"] = {"utm_source": custom["utm_source"]}

    return payload


def create_order(payload: dict) -> dict:
    """Создаёт заказ в RetailCRM и возвращает ответ."""
    url = f"{RETAILCRM_URL}/api/v5/orders/create"
    resp = requests.post(
        url,
        data={"apiKey": RETAILCRM_KEY, "order": json.dumps(payload, ensure_ascii=False)},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    print(f"Читаю заказы из {ORDERS_FILE}...")
    with open(ORDERS_FILE, encoding="utf-8") as f:
        orders = json.load(f)

    print(f"Найдено {len(orders)} заказов. Загружаю в RetailCRM...\n")

    success = 0
    errors = 0

    for i, order in enumerate(orders, 1):
        name = f"{order.get('firstName', '')} {order.get('lastName', '')}"
        try:
            payload = build_order_payload(order)
            result = create_order(payload)

            if result.get("success"):
                order_id = result.get("id", "?")
                total = payload.get("summ", 0)
                print(f"[{i:02d}/{len(orders)}] ✓ {name} — {total:,.0f} ₸ (ID: {order_id})")
                success += 1
            else:
                print(f"[{i:02d}/{len(orders)}] ✗ {name} — {result.get('errorMsg', 'Неизвестная ошибка')}")
                errors += 1

        except requests.HTTPError as e:
            print(f"[{i:02d}/{len(orders)}] ✗ {name} — HTTP {e.response.status_code}: {e.response.text[:100]}")
            errors += 1
        except Exception as e:
            print(f"[{i:02d}/{len(orders)}] ✗ {name} — {e}")
            errors += 1

        # RetailCRM rate limit: ~5 req/sec для демо аккаунтов
        time.sleep(0.3)

    print(f"\n{'='*40}")
    print(f"Загружено: {success} | Ошибок: {errors}")


if __name__ == "__main__":
    main()
