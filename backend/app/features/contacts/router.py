import re

from fastapi import APIRouter, Depends, HTTPException

from app.features.auth.rbac import Caller, check_perm, require
from app.features.contacts.models import Contact, ContactUpdate
from app.features.contacts.store import contacts
from app.services.realtime.bus import bus
from app.utils.api_model import E164, now

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _number(number: str) -> str:
    number = number.strip().replace(" ", "")
    if not re.match(E164, number):
        raise HTTPException(422, "Use the full number with its country code, e.g. +919876543210")
    return number


@router.get("", response_model=list[Contact], dependencies=[Depends(require("contacts.view"))])
async def list_contacts() -> list[Contact]:
    return contacts.all()


@router.put("/{number}", response_model=Contact)
async def save_contact(number: str, body: ContactUpdate, caller: Caller = Depends(require("contacts.view"))) -> Contact:
    """Create or change the contact for `number` (URL-encode the +, as %2B)."""
    changes = body.model_dump(exclude_none=True)
    if "blocked" in changes:
        check_perm(caller, "contacts.block")
    if changes.keys() - {"blocked"}:
        check_perm(caller, "contacts.edit")
    number = _number(number)
    contact = contacts.get(number) or Contact(number=number)
    for name, value in changes.items():
        setattr(contact, name, value.strip() if isinstance(value, str) else value)
    contact.updated_at = now()
    contacts.put(contact)
    await bus.publish("contact.updated", {"contact": contact.to_wire()})
    return contact


@router.delete("/{number}", dependencies=[Depends(require("contacts.delete"))])
async def delete_contact(number: str) -> dict:
    number = _number(number)
    if not contacts.delete(number):
        raise HTTPException(404, "No contact with that number")
    await bus.publish("contact.deleted", {"number": number})
    return {"deleted": number}
