"""Memory mode keeps team members and their roles in a file, so a restart doesn't lose who is super admin."""

from app.features.profile.models import Human
from app.storage.store import MemoryStore


async def test_team_members_survive_a_restart(tmp_path):
    path = tmp_path / "humans.json"
    first = MemoryStore(humans_file=path)
    boss = await first.save_human(Human(name="Boss", phone="+911111111111", uid="u1", role="super_admin"))
    boss.account_state = "suspended"
    await first.update_human(boss, "account_state")

    again = MemoryStore(humans_file=path)  # a new server process
    restored = await again.human_by_uid("u1")
    assert restored is not None and restored.role == "super_admin" and restored.account_state == "suspended"


async def test_without_a_file_nothing_is_written(tmp_path):
    store = MemoryStore()
    await store.save_human(Human(name="A", phone="+911111111111"))
    assert list(tmp_path.iterdir()) == []
