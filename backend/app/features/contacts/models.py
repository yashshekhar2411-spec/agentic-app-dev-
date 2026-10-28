from datetime import datetime

from pydantic import Field

from app.utils.api_model import E164, ApiModel, now


class Contact(ApiModel):
    number: str = Field(pattern=E164)
    name: str = ""
    company: str = ""
    notes: str = ""
    favorite: bool = False
    blocked: bool = False  # do-not-call: the AI never calls this number, by hand or on a schedule
    updated_at: datetime = Field(default_factory=now)


class ContactUpdate(ApiModel):
    """Only the fields sent are changed."""

    name: str | None = Field(default=None, max_length=80)
    company: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    favorite: bool | None = None
    blocked: bool | None = None
