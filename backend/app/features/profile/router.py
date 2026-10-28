from fastapi import APIRouter, Depends, HTTPException

from app.features.auth.rbac import SUPER_ADMIN, is_listed_super_admin, require, super_admins_listed
from app.features.auth.security import Principal, current_principal
from app.storage.store import StoreConflict, store
from app.features.profile.models import Human, RegisterHumanRequest, UpdateHumanStatusRequest

router = APIRouter(prefix="/humans", tags=["humans"])


async def own_human(human_id: str, principal: Principal) -> Human:
    """The profile, if the caller may act as it. Firebase users can only act as their own profile."""
    human = await store.get_human(human_id)
    if human is None:
        raise HTTPException(404, "Human not found")
    if principal.uid and human.uid != principal.uid:
        raise HTTPException(403, "That profile belongs to another account")
    return human


@router.post("/register", response_model=Human)
async def register_human(body: RegisterHumanRequest, principal: Principal = Depends(current_principal)) -> Human:
    # One profile per Firebase account (or per phone number without Firebase); re-registering updates it
    taken = await store.human_by_phone(body.phone)
    if principal.uid:
        if taken and taken.uid not in (None, principal.uid):
            raise HTTPException(409, "This phone number is already used by another agent")
        human = await store.human_by_uid(principal.uid) or taken
    else:
        human = taken
    human = human or Human(name=body.name, phone=body.phone)
    human.name, human.phone = body.name, body.phone
    human.push_token = body.push_token or human.push_token
    if principal.uid:
        human.uid, human.email = principal.uid, principal.email
        # SUPER_ADMIN_EMAILS are super admins whatever happens. Without that list, the first person to sign up
        # runs the place. Anyone else with a pending invite gets the invited role.
        new = await store.human_by_uid(principal.uid) is None
        first = not super_admins_listed() and not any(h.role == SUPER_ADMIN for h in await store.list_humans())
        if new:
            from app.features.team.router import apply_invite  # the team router imports this module's models

            await apply_invite(human)  # marks the invite used even when a rule below decides the role
        if is_listed_super_admin(principal.email) or first:
            human.role = SUPER_ADMIN
    try:
        return await store.save_human(human)
    except StoreConflict as exc:  # another agent registered the same number at the same moment
        raise HTTPException(409, "This phone number is already used by another agent") from exc


@router.get("/me", response_model=Human)
async def my_profile(principal: Principal = Depends(current_principal)) -> Human:
    human = await store.human_by_uid(principal.uid) if principal.uid else None
    if human is None:
        raise HTTPException(404, "No agent profile yet")
    return human


@router.patch("/{human_id}/status", response_model=Human)
async def update_human_status(
    human_id: str, body: UpdateHumanStatusRequest, principal: Principal = Depends(current_principal)
) -> Human:
    human = await own_human(human_id, principal)
    human.status = body.status
    await store.update_human(human, "status")
    return human


@router.get("", response_model=list[Human], dependencies=[Depends(require("team.view"))])
async def list_humans() -> list[Human]:
    return await store.list_humans()
