import json
import os
import random
import string
import uuid
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any

try:
    from pymongo import MongoClient
except ImportError:  # pragma: no cover - optional dependency during scaffold stage
    MongoClient = None


SEED_HIGHLIGHTS = {
    "brand": "Meetup",
    "hero": {
        "eyebrow": "Video SaaS for remote teams",
        "title": "Host polished meetings without the enterprise bloat.",
        "description": (
            "Meetup combines scheduling, rooms, recordings, and host analytics in "
            "one lightweight platform for startups, coaches, and distributed teams."
        ),
    },
    "stats": [
        {"label": "Active teams", "value": "2.4k+"},
        {"label": "Average uptime", "value": "99.98%"},
        {"label": "Monthly meeting hours", "value": "180k"},
    ],
    "plans": [
        {"name": "Starter", "price": "$0", "description": "Quick standups for small teams."},
        {"name": "Scale", "price": "$24", "description": "Branding, recordings, and analytics."},
        {"name": "Studio", "price": "$79", "description": "Webinars, backstage rooms, API access."},
    ],
    "featureCards": [
        {
            "title": "Instant branded rooms",
            "description": "Spin up meeting spaces with your logo, waiting room, and custom CTA in seconds.",
        },
        {
            "title": "Host analytics",
            "description": "Track attendance, avg watch time, recording health, and drop-off across every session.",
        },
        {
            "title": "Async follow-up",
            "description": "Generate recap notes, clip reels, and action items right after each call closes.",
        },
    ],
}


def _utc_now() -> datetime:
    return datetime.utcnow().replace(microsecond=0)


def _room_code() -> str:
    blocks = ["".join(random.choices(string.digits, k=3)) for _ in range(3)]
    return "-".join(blocks)


def _normalize_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if value is None:
        return default
    return bool(value)


def _normalize_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(tag).strip() for tag in value if str(tag).strip()]
    if isinstance(value, str):
        return [tag.strip() for tag in value.split(",") if tag.strip()]
    return []


def _seed_meetings() -> list[dict[str, Any]]:
    now = _utc_now()
    return [
        {
            "slug": "product-sprint-sync",
            "title": "Product Sprint Sync",
            "host": "Aarav Patel",
            "owner": "aarav",
            "category": "Team room",
            "description": "Daily product sync with sprint board mirroring and AI notes.",
            "agenda": [
                "Review blockers from yesterday",
                "Check sprint burndown",
                "Assign launch dependencies",
            ],
            "startTime": (now + timedelta(hours=2)).isoformat() + "Z",
            "duration": 45,
            "attendees": 12,
            "capacity": 20,
            "recording": True,
            "lobbyEnabled": True,
            "status": "Live in 2h",
            "tags": ["AI notes", "Sprint", "Daily"],
            "roomCode": _room_code(),
            "joinLink": "/join/product-sprint-sync",
            "cta": "Join room",
            "accent": "sunrise",
        },
        {
            "slug": "customer-demo-live",
            "title": "Customer Demo Live",
            "host": "Maya Chen",
            "owner": "maya",
            "category": "Sales demo",
            "description": "Branded demo room with lobby chat, slides, and follow-up exports.",
            "agenda": [
                "Tailored product walkthrough",
                "Security questionnaire review",
                "Procurement next steps",
            ],
            "startTime": (now + timedelta(days=1, hours=1)).isoformat() + "Z",
            "duration": 30,
            "attendees": 43,
            "capacity": 75,
            "recording": True,
            "lobbyEnabled": True,
            "status": "Tomorrow",
            "tags": ["Sales", "Deck sync", "CRM export"],
            "roomCode": _room_code(),
            "joinLink": "/join/customer-demo-live",
            "cta": "View agenda",
            "accent": "lagoon",
        },
        {
            "slug": "creator-office-hours",
            "title": "Creator Office Hours",
            "host": "Rohan Mehta",
            "owner": "rohan",
            "category": "Community",
            "description": "Recurring community session with stage controls and clip highlights.",
            "agenda": [
                "Open Q&A",
                "Product roadmap request intake",
                "Clip review for socials",
            ],
            "startTime": (now + timedelta(days=2, hours=4)).isoformat() + "Z",
            "duration": 60,
            "attendees": 87,
            "capacity": 120,
            "recording": False,
            "lobbyEnabled": False,
            "status": "This week",
            "tags": ["Community", "AMA", "Clips"],
            "roomCode": _room_code(),
            "joinLink": "/join/creator-office-hours",
            "cta": "Reserve seat",
            "accent": "ember",
        },
    ]


class MeetupRepository:
    def __init__(self) -> None:
        self._seeded_meetings = _seed_meetings()
        self._client = self._build_client()
        self._collection = self._build_collection()
        self._room_sessions: dict[str, dict[str, Any]] = {}

    @property
    def storage_backend(self) -> str:
        return "mongodb" if self._collection is not None else "memory"

    def _build_client(self):
        mongo_uri = os.getenv("MONGODB_URI")
        if MongoClient is None or not mongo_uri:
            return None

        return MongoClient(mongo_uri, serverSelectionTimeoutMS=1500)

    def _build_collection(self):
        if self._client is None:
            return None

        database_name = os.getenv("MONGODB_NAME", "meetup")
        collection_name = os.getenv("MONGODB_COLLECTION", "meetings")
        try:
            self._client.admin.command("ping")
            return self._client[database_name][collection_name]
        except Exception:
            return None

    def parse_request_body(self, body: bytes) -> dict[str, Any]:
        if not body:
            return {}

        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def get_highlights(self) -> dict[str, Any]:
        payload = deepcopy(SEED_HIGHLIGHTS)
        payload["featuredMeeting"] = self.list_meetings()[0]
        payload["storage"] = self.storage_backend
        return payload

    def get_dashboard(self) -> dict[str, Any]:
        meetings = self.list_meetings()
        total_attendees = sum(meeting["attendees"] for meeting in meetings)
        total_capacity = sum(meeting.get("capacity", meeting["attendees"]) for meeting in meetings)
        recordings = sum(1 for meeting in meetings if meeting.get("recording"))
        utilization = 0 if total_capacity == 0 else round((total_attendees / total_capacity) * 100)

        return {
            "summary": [
                {"label": "Upcoming rooms", "value": str(len(meetings)).zfill(2)},
                {"label": "Seats reserved", "value": str(total_attendees)},
                {"label": "Recording enabled", "value": f"{recordings}/{len(meetings)}"},
                {"label": "Utilization", "value": f"{utilization}%"},
            ],
            "workflows": [
                {
                    "title": "Sales demos",
                    "description": "Preload decks, route leads to reps, and ship recordings straight to CRM.",
                },
                {
                    "title": "Community events",
                    "description": "Stage speakers, moderate Q&A, and publish clips for members after the stream.",
                },
                {
                    "title": "Internal standups",
                    "description": "Use recurring rooms, AI recaps, and searchable decision logs for fast alignment.",
                },
            ],
        }

    def list_meetings(self) -> list[dict[str, Any]]:
        if self._collection is None:
            return deepcopy(self._seeded_meetings)

        records = []
        for document in self._collection.find({}, {"_id": 0}).sort("startTime", 1):
            records.append(document)

        if not records:
            self._collection.insert_many(deepcopy(self._seeded_meetings))
            return deepcopy(self._seeded_meetings)

        return records

    def get_meeting(self, slug: str) -> dict[str, Any] | None:
        meetings = self.list_meetings()
        for meeting in meetings:
            if meeting["slug"] == slug:
                return meeting
        return None

    def list_meetings_for_owner(self, owner: str) -> list[dict[str, Any]]:
        return [meeting for meeting in self.list_meetings() if meeting.get("owner") == owner]

    def _persist_meeting(self, meeting: dict[str, Any]) -> dict[str, Any]:
        if self._collection is None:
            replaced = False
            for index, current in enumerate(self._seeded_meetings):
                if current["slug"] == meeting["slug"]:
                    self._seeded_meetings[index] = deepcopy(meeting)
                    replaced = True
                    break
            if not replaced:
                self._seeded_meetings.append(deepcopy(meeting))
            return deepcopy(meeting)

        self._collection.replace_one({"slug": meeting["slug"]}, meeting, upsert=True)
        return meeting

    def create_meeting(self, payload: dict[str, Any], owner: str | None = None) -> dict[str, Any]:
        title = str(payload.get("title", "New Meetup Session")).strip() or "New Meetup Session"
        slug = str(payload.get("slug") or title.lower().replace(" ", "-"))
        attendees = int(payload.get("attendees", 1))
        meeting = {
            "slug": slug,
            "title": title,
            "host": payload.get("host", "Meetup Host"),
            "owner": owner or payload.get("owner", "guest"),
            "category": payload.get("category", "Private room"),
            "description": payload.get(
                "description",
                "Custom meeting room created from the Meetup SaaS dashboard.",
            ),
            "agenda": _normalize_tags(payload.get("agenda")) or ["Welcome and intros", "Core discussion", "Action items"],
            "startTime": payload.get(
                "startTime",
                (_utc_now() + timedelta(days=3)).isoformat() + "Z",
            ),
            "duration": int(payload.get("duration", 30)),
            "attendees": attendees,
            "capacity": int(payload.get("capacity", max(attendees, 10))),
            "recording": _normalize_bool(payload.get("recording"), True),
            "lobbyEnabled": _normalize_bool(payload.get("lobbyEnabled"), True),
            "status": payload.get("status", "Scheduled"),
            "tags": _normalize_tags(payload.get("tags")) or ["Custom", "Hosted"],
            "roomCode": payload.get("roomCode", _room_code()),
            "joinLink": payload.get("joinLink", f"/join/{slug}"),
            "cta": payload.get("cta", "Open room"),
            "accent": payload.get("accent", "lagoon"),
        }
        return self._persist_meeting(meeting)

    def join_meeting(self, slug: str, attendee_name: str) -> dict[str, Any] | None:
        meeting = self.get_meeting(slug)
        if meeting is None:
            return None

        meeting["attendees"] = min(meeting["attendees"] + 1, meeting.get("capacity", meeting["attendees"] + 1))
        self._persist_meeting(meeting)
        return {
            "meeting": meeting,
            "participant": attendee_name,
            "message": f"{attendee_name} joined {meeting['title']}",
            "joinLink": meeting["joinLink"],
            "roomCode": meeting["roomCode"],
        }

    def join_signaling_room(self, slug: str, attendee_name: str) -> dict[str, Any] | None:
        meeting = self.get_meeting(slug)
        if meeting is None:
            return None

        room = self._room_sessions.setdefault(
            slug,
            {
                "participants": {},
                "signals": [],
                "messages": [],
                "activity": [],
            },
        )
        participant_id = uuid.uuid4().hex
        room["participants"][participant_id] = {
            "id": participant_id,
            "name": attendee_name,
        }
        room["activity"].append(
            {
                "id": uuid.uuid4().hex,
                "type": "join",
                "message": f"{attendee_name} joined the room",
            }
        )
        others = [
            participant for current_id, participant in room["participants"].items() if current_id != participant_id
        ]
        return {
            "participantId": participant_id,
            "participants": list(room["participants"].values()),
            "peers": others,
            "meeting": meeting,
        }

    def add_signal(self, slug: str, sender_id: str, signal_type: str, payload: dict[str, Any]) -> bool:
        room = self._room_sessions.get(slug)
        if room is None or sender_id not in room["participants"]:
            return False

        room["signals"].append(
            {
                "id": uuid.uuid4().hex,
                "from": sender_id,
                "to": payload.get("to"),
                "type": signal_type,
                "payload": payload.get("payload", {}),
            }
        )
        return True

    def consume_signals(self, slug: str, participant_id: str) -> dict[str, Any] | None:
        room = self._room_sessions.get(slug)
        if room is None or participant_id not in room["participants"]:
            return None

        pending = []
        remaining = []
        for signal in room["signals"]:
            target = signal.get("to")
            if target in (None, participant_id) and signal["from"] != participant_id:
                pending.append(signal)
            else:
                remaining.append(signal)
        room["signals"] = remaining
        return {
            "signals": pending,
            "participants": list(room["participants"].values()),
            "messages": room["messages"][-25:],
            "activity": room["activity"][-25:],
        }

    def leave_signaling_room(self, slug: str, participant_id: str) -> bool:
        room = self._room_sessions.get(slug)
        if room is None or participant_id not in room["participants"]:
            return False

        participant = room["participants"][participant_id]
        room["activity"].append(
            {
                "id": uuid.uuid4().hex,
                "type": "leave",
                "message": f"{participant['name']} left the room",
            }
        )
        del room["participants"][participant_id]
        room["signals"] = [
            signal
            for signal in room["signals"]
            if signal["from"] != participant_id and signal.get("to") != participant_id
        ]
        if not room["participants"]:
            del self._room_sessions[slug]
        return True

    def add_chat_message(self, slug: str, participant_id: str, message: str) -> dict[str, Any] | None:
        room = self._room_sessions.get(slug)
        if room is None or participant_id not in room["participants"]:
            return None

        participant = room["participants"][participant_id]
        entry = {
            "id": uuid.uuid4().hex,
            "participantId": participant_id,
            "name": participant["name"],
            "message": message.strip(),
        }
        if not entry["message"]:
            return None

        room["messages"].append(entry)
        room["activity"].append(
            {
                "id": uuid.uuid4().hex,
                "type": "chat",
                "message": f"{participant['name']} sent a chat message",
            }
        )
        return entry
