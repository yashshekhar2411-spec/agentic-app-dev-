"""Tools the AI can use on its own, plus the two control tools: request_handoff and end_call.

The business tools use sample data. Replace the functions in BUSINESS_TOOLS with calls to your CRM / order system.
"""

from typing import Any, Awaitable, Callable

REQUEST_HANDOFF = "request_handoff"
END_CALL = "end_call"


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
    }


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    _tool(
        "lookup_customer",
        "Find the caller's customer account by phone number. Use the caller number from the call details unless they give another one.",
        {"phone": {"type": "string", "description": "Phone number in E.164 format, e.g. +919876543210"}},
        ["phone"],
    ),
    _tool(
        "check_order",
        "Get the status and expected delivery date of an order.",
        {"order_id": {"type": "string", "description": "Order ID, e.g. ORD-1001"}},
        ["order_id"],
    ),
    _tool(
        "book_appointment",
        "Book a service appointment. Confirm the date, time and purpose with the caller before calling this.",
        {
            "customer_name": {"type": "string"},
            "date": {"type": "string", "description": "YYYY-MM-DD"},
            "time": {"type": "string", "description": "24h HH:MM"},
            "purpose": {"type": "string"},
        },
        ["customer_name", "date", "time", "purpose"],
    ),
    _tool(
        REQUEST_HANDOFF,
        "Transfer the call to a human colleague. Use when the caller asks for a person, the request is outside what your tools can do, a tool failed, you cannot resolve it, or the caller is upset.",
        {
            "reason": {"type": "string", "description": "Short reason for the human, e.g. 'Caller wants a refund for ORD-1002'"},
            "urgency": {"type": "string", "enum": ["low", "normal", "high"]},
            "message_to_caller": {"type": "string", "description": "What to say to the caller while transferring"},
        },
        ["reason", "urgency", "message_to_caller"],
    ),
    _tool(
        END_CALL,
        "End the call after the caller's request is fully resolved and they confirm they need nothing else.",
        {"farewell": {"type": "string", "description": "Short goodbye to say before hanging up"}},
        ["farewell"],
    ),
]


# ---- sample data ----

_CUSTOMERS = {
    "+919876543210": {"customer_id": "CUST-1", "name": "Priya Sharma", "plan": "Premium", "open_orders": ["ORD-1001"]},
    "+910000000000": {"customer_id": "CUST-2", "name": "Test Caller", "plan": "Basic", "open_orders": ["ORD-1002"]},
}
_ORDERS = {
    "ORD-1001": {"status": "out_for_delivery", "expected_delivery": "today by 7 PM", "items": ["Wireless earbuds"]},
    "ORD-1002": {"status": "delayed", "expected_delivery": "in 3 to 5 days", "items": ["Smart watch"], "note": "Courier delay"},
}


async def lookup_customer(phone: str) -> dict[str, Any]:
    customer = _CUSTOMERS.get(phone)
    return customer or {"found": False, "message": "No account for this number"}


async def check_order(order_id: str) -> dict[str, Any]:
    order = _ORDERS.get(order_id.upper().replace(" ", ""))
    return order or {"found": False, "message": f"No order with ID {order_id}"}


async def book_appointment(customer_name: str, date: str, time: str, purpose: str) -> dict[str, Any]:
    return {"booked": True, "confirmation": "APT-7781", "date": date, "time": time, "purpose": purpose}


BUSINESS_TOOLS: dict[str, Callable[..., Awaitable[dict[str, Any]]]] = {
    "lookup_customer": lookup_customer,
    "check_order": check_order,
    "book_appointment": book_appointment,
}
