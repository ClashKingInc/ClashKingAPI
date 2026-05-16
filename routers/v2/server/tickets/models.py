from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class TicketButton(BaseModel):
    custom_id: str
    label: str
    style: int
    emoji: Optional[Dict[str, Any]] = None
    type: int = 2


class TicketButtonSettings(BaseModel):
    questions: List[str] = []
    mod_role: List[str] = []
    no_ping_mod_role: List[str] = []
    private_thread: bool = False
    th_min: int = 0
    num_apply: int = 25
    naming: str = ""
    account_apply: bool = False
    player_info: bool = False
    apply_clans: List[str] = []
    roles_to_add: List[str] = []
    roles_to_remove: List[str] = []
    townhall_requirements: Dict[str, Dict[str, int]] = {}
    new_message: Optional[str] = None


class ApproveMessage(BaseModel):
    name: str
    message: str


class TicketPanel(BaseModel):
    name: str
    server_id: int
    embed_name: Optional[str] = None
    components: List[TicketButton] = []
    button_settings: Dict[str, TicketButtonSettings] = {}
    open_category: Optional[str] = None
    sleep_category: Optional[str] = None
    closed_category: Optional[str] = None
    status_change_log: Optional[str] = None
    ticket_button_click_log: Optional[str] = None
    ticket_close_log: Optional[str] = None
    approve_messages: List[ApproveMessage] = []


class TicketPanelsResponse(BaseModel):
    items: List[TicketPanel]
    total: int
    available_embeds: List[str] = []
    townhall_requirement_fields: List[str] = ["BK", "AQ", "GW", "RC", "WARST"]


class OpenTicket(BaseModel):
    channel: str
    channel_exists: bool = True
    user: str
    discord_username: Optional[str] = None
    discord_display_name: Optional[str] = None
    discord_avatar_url: Optional[str] = None
    thread: Optional[str] = None
    server: str
    status: str
    number: int
    apply_account: Optional[str] = None
    panel: str
    set_clan: Optional[str] = None


class UpdateOpenTicketStatusRequest(BaseModel):
    status: str


class UpdateOpenTicketClanRequest(BaseModel):
    set_clan: Optional[str] = None


class OpenTicketsResponse(BaseModel):
    items: List[OpenTicket]
    total: int


class MessageResponse(BaseModel):
    message: str


class UpdateTicketPanelRequest(BaseModel):
    open_category: Optional[str] = None
    sleep_category: Optional[str] = None
    closed_category: Optional[str] = None
    status_change_log: Optional[str] = None
    ticket_button_click_log: Optional[str] = None
    ticket_close_log: Optional[str] = None
    embed_name: Optional[str] = None


class UpdateButtonSettingsRequest(BaseModel):
    questions: List[str] = []
    mod_role: List[str] = []
    no_ping_mod_role: List[str] = []
    private_thread: bool = False
    th_min: int = 0
    num_apply: int = 25
    naming: str = ""
    account_apply: bool = False
    player_info: bool = False
    apply_clans: List[str] = []
    roles_to_add: List[str] = []
    roles_to_remove: List[str] = []
    townhall_requirements: Dict[str, Dict[str, int]] = {}
    new_message: Optional[str] = None


class UpdateApproveMessagesRequest(BaseModel):
    messages: List[ApproveMessage] = []


class ServerEmbed(BaseModel):
    name: str
    data: Optional[Dict[str, Any]] = None


class ServerEmbedsResponse(BaseModel):
    items: List[ServerEmbed]
    total: int


class UpsertEmbedRequest(BaseModel):
    name: str
    data: Dict[str, Any]


class CreatePanelRequest(BaseModel):
    name: str


class CreateButtonRequest(BaseModel):
    label: str
    style: int = 2  # 1=Primary(Blue), 2=Secondary(Grey), 3=Success(Green), 4=Danger(Red)
    emoji: Optional[Dict[str, Any]] = None


class UpdateButtonAppearanceRequest(BaseModel):
    label: str
    style: int
    emoji: Optional[Dict[str, Any]] = None
