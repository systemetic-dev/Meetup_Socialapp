import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import Http404, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from .repository import MeetupRepository


repository = MeetupRepository()


def index(request):
    manifest_path = Path(settings.FRONTEND_BUILD_DIR) / ".vite" / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        entry = manifest.get("index.html", {})
        return render(
            request,
            "spa.html",
            {
                "script_path": f"meetup_ui/{entry.get('file', '')}",
                "style_paths": [f"meetup_ui/{path}" for path in entry.get("css", [])],
            },
        )

    return render(request, "index.html")


def _auth_payload(request):
    if not request.user.is_authenticated:
        return {"authenticated": False, "user": None}

    return {
        "authenticated": True,
        "user": {
            "username": request.user.username,
            "name": request.user.get_full_name() or request.user.username,
            "email": request.user.email,
            "hostTitle": "Workspace host",
            "meetingsOwned": len(repository.list_meetings_for_owner(request.user.username)),
        },
    }


@require_GET
def health(request):
    return JsonResponse(
        {
            "status": "ok",
            "service": "meetup-api",
            "storage": repository.storage_backend,
        }
    )


@require_GET
def highlights(request):
    return JsonResponse(repository.get_highlights())


@require_GET
def dashboard(request):
    payload = repository.get_dashboard()
    payload["auth"] = _auth_payload(request)
    return JsonResponse(payload)


@require_GET
def auth_profile(request):
    return JsonResponse(_auth_payload(request))


@csrf_exempt
@require_http_methods(["POST"])
def auth_signup(request):
    payload = repository.parse_request_body(request.body)
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", "")).strip()
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip()

    if not username or not password:
        return JsonResponse({"error": "Username and password are required."}, status=400)

    if User.objects.filter(username=username).exists():
        return JsonResponse({"error": "Username already exists."}, status=400)

    first_name, _, last_name = name.partition(" ")
    user = User.objects.create_user(
        username=username,
        password=password,
        first_name=first_name,
        last_name=last_name,
        email=email,
    )
    login(request, user)
    return JsonResponse(_auth_payload(request), status=201)


@csrf_exempt
@require_http_methods(["POST"])
def auth_login(request):
    payload = repository.parse_request_body(request.body)
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", "")).strip()
    user = authenticate(request, username=username, password=password)

    if user is None:
        return JsonResponse({"error": "Invalid credentials."}, status=400)

    login(request, user)
    return JsonResponse(_auth_payload(request))


@csrf_exempt
@require_http_methods(["POST"])
def auth_logout(request):
    logout(request)
    return JsonResponse({"authenticated": False, "user": None})


@require_GET
def my_meetings(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required."}, status=401)

    return JsonResponse(
        {
            "owned": repository.list_meetings_for_owner(request.user.username),
            "profile": _auth_payload(request)["user"],
        }
    )


@csrf_exempt
@require_http_methods(["GET", "POST"])
def meetings(request):
    if request.method == "GET":
        return JsonResponse({"meetings": repository.list_meetings()})

    payload = repository.parse_request_body(request.body)
    owner = request.user.username if request.user.is_authenticated else None
    if request.user.is_authenticated and not payload.get("host"):
        payload["host"] = request.user.get_full_name() or request.user.username
    meeting = repository.create_meeting(payload, owner=owner)
    return JsonResponse(meeting, status=201)


@require_GET
def meeting_detail(request, slug):
    meeting = repository.get_meeting(slug)
    if meeting is None:
        raise Http404("Meeting not found")
    return JsonResponse(meeting)


@csrf_exempt
@require_http_methods(["POST"])
def join_meeting(request, slug):
    payload = repository.parse_request_body(request.body)
    attendee_name = payload.get("name")
    if not attendee_name and request.user.is_authenticated:
        attendee_name = request.user.get_full_name() or request.user.username
    attendee_name = attendee_name or "Guest attendee"

    joined = repository.join_meeting(slug, attendee_name)
    if joined is None:
        raise Http404("Meeting not found")

    return JsonResponse(joined)


@csrf_exempt
@require_http_methods(["POST"])
def signaling_join(request, slug):
    payload = repository.parse_request_body(request.body)
    attendee_name = payload.get("name")
    if not attendee_name and request.user.is_authenticated:
        attendee_name = request.user.get_full_name() or request.user.username
    attendee_name = attendee_name or "Guest attendee"

    joined = repository.join_signaling_room(slug, attendee_name)
    if joined is None:
        raise Http404("Meeting not found")
    return JsonResponse(joined)


@csrf_exempt
@require_http_methods(["POST", "GET", "DELETE"])
def signaling_events(request, slug):
    if request.method == "GET":
        participant_id = request.GET.get("participant_id", "")
        payload = repository.consume_signals(slug, participant_id)
        if payload is None:
            return JsonResponse({"error": "Participant not found."}, status=404)
        return JsonResponse(payload)

    payload = repository.parse_request_body(request.body)
    participant_id = payload.get("participantId", "")

    if request.method == "DELETE":
        removed = repository.leave_signaling_room(slug, participant_id)
        if not removed:
            return JsonResponse({"error": "Participant not found."}, status=404)
        return JsonResponse({"ok": True})

    signal_type = payload.get("type", "")
    saved = repository.add_signal(slug, participant_id, signal_type, payload)
    if not saved:
        return JsonResponse({"error": "Signal room not found."}, status=404)
    return JsonResponse({"ok": True})


@csrf_exempt
@require_http_methods(["POST"])
def room_chat(request, slug):
    payload = repository.parse_request_body(request.body)
    participant_id = payload.get("participantId", "")
    message = payload.get("message", "")
    saved = repository.add_chat_message(slug, participant_id, message)
    if saved is None:
        return JsonResponse({"error": "Unable to post message."}, status=400)
    return JsonResponse(saved, status=201)
