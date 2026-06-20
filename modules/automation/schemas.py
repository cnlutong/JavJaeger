from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


TriggerType = Literal["auto", "scheduled", "interval"]
NodeType = Literal["trigger", "search", "magnet", "download"]
RunStatus = Literal["running", "success", "partial", "failed"]


class AutomationTrigger(BaseModel):
    type: TriggerType = "auto"
    scheduled_time: str | None = None
    interval_minutes: int | None = None

    @field_validator("scheduled_time")
    def validate_scheduled_time(cls, value):
        if value is None or value == "":
            return None
        parts = value.split(":")
        if len(parts) != 2:
            raise ValueError("scheduled_time_must_be_hh_mm")
        hour, minute = int(parts[0]), int(parts[1])
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise ValueError("scheduled_time_must_be_hh_mm")
        return f"{hour:02d}:{minute:02d}"

    @field_validator("interval_minutes")
    def validate_interval_minutes(cls, value):
        if value is None:
            return None
        if value < 1:
            raise ValueError("interval_minutes_must_be_positive")
        return value


class AutomationNode(BaseModel):
    id: str
    type: NodeType
    position: dict[str, float] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)


class AutomationEdge(BaseModel):
    id: str
    source: str
    target: str


class AutomationRunItem(BaseModel):
    movie_id: str
    title: str | None = None
    status: str
    magnet_link: str | None = None
    message: str | None = None


class AutomationRun(BaseModel):
    id: str
    task_id: str
    status: RunStatus
    started_at: str
    finished_at: str | None = None
    found_count: int = 0
    magnet_count: int = 0
    dispatched_count: int = 0
    skipped_count: int = 0
    error: str | None = None
    items: list[AutomationRunItem] = Field(default_factory=list)


class AutomationTaskBase(BaseModel):
    name: str
    enabled: bool = False
    trigger: AutomationTrigger = Field(default_factory=AutomationTrigger)
    nodes: list[AutomationNode] = Field(default_factory=list)
    edges: list[AutomationEdge] = Field(default_factory=list)


class AutomationTaskCreate(AutomationTaskBase):
    pass


class AutomationTaskUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    trigger: AutomationTrigger | None = None
    nodes: list[AutomationNode] | None = None
    edges: list[AutomationEdge] | None = None


class AutomationTask(AutomationTaskBase):
    id: str
    created_at: str
    updated_at: str
    last_run_at: str | None = None
    next_run_at: str | None = None
    last_status: RunStatus | None = None
    runs: list[AutomationRun] = Field(default_factory=list)


class AutomationTaskList(BaseModel):
    tasks: list[AutomationTask]
