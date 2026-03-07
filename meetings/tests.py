import json

from django.test import TestCase
from django.urls import reverse


class MeetingApiTests(TestCase):
    def test_dashboard_endpoint_returns_summary(self):
        response = self.client.get(reverse("dashboard"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("summary", payload)
        self.assertIn("workflows", payload)
        self.assertIn("auth", payload)
        self.assertFalse(payload["auth"]["authenticated"])

    def test_signup_creates_session_and_allows_profile_access(self):
        response = self.client.post(
            reverse("auth-signup"),
            data=json.dumps(
                {
                    "username": "neha",
                    "password": "strongpass123",
                    "name": "Neha Shah",
                    "email": "neha@example.com",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertTrue(payload["authenticated"])
        self.assertEqual(payload["user"]["username"], "neha")

        profile = self.client.get(reverse("auth-profile"))
        self.assertEqual(profile.status_code, 200)
        self.assertTrue(profile.json()["authenticated"])

    def test_create_meeting_assigns_authenticated_owner(self):
        self.client.post(
            reverse("auth-signup"),
            data=json.dumps({"username": "maya", "password": "strongpass123", "name": "Maya Chen"}),
            content_type="application/json",
        )

        response = self.client.post(
            reverse("meetings"),
            data=json.dumps(
                {
                    "title": "Founder All Hands",
                    "category": "Town hall",
                    "description": "Monthly company update for distributed teams.",
                    "capacity": 80,
                    "tags": "Town hall, Leadership",
                    "agenda": "Intro, Numbers, Q&A",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["owner"], "maya")
        self.assertEqual(payload["host"], "Maya Chen")
        self.assertEqual(payload["capacity"], 80)
        self.assertEqual(payload["tags"], ["Town hall", "Leadership"])

    def test_join_meeting_returns_room_context(self):
        response = self.client.post(
            reverse("meeting-join", args=["product-sprint-sync"]),
            data=json.dumps({"name": "Guest Viewer"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["participant"], "Guest Viewer")
        self.assertIn("roomCode", payload)
        self.assertEqual(payload["meeting"]["slug"], "product-sprint-sync")

    def test_signaling_join_and_event_flow(self):
        join_a = self.client.post(
            reverse("meeting-signal-join", args=["product-sprint-sync"]),
            data=json.dumps({"name": "Caller A"}),
            content_type="application/json",
        )
        join_b = self.client.post(
            reverse("meeting-signal-join", args=["product-sprint-sync"]),
            data=json.dumps({"name": "Caller B"}),
            content_type="application/json",
        )

        self.assertEqual(join_a.status_code, 200)
        self.assertEqual(join_b.status_code, 200)
        participant_a = join_a.json()["participantId"]
        participant_b = join_b.json()["participantId"]

        save_signal = self.client.post(
            reverse("meeting-signal-events", args=["product-sprint-sync"]),
            data=json.dumps(
                {
                    "participantId": participant_a,
                    "type": "offer",
                    "to": participant_b,
                    "payload": {"type": "offer", "sdp": "fake-sdp"},
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(save_signal.status_code, 200)

        poll = self.client.get(
            reverse("meeting-signal-events", args=["product-sprint-sync"]),
            {"participant_id": participant_b},
        )
        self.assertEqual(poll.status_code, 200)
        payload = poll.json()
        self.assertEqual(len(payload["signals"]), 1)
        self.assertEqual(payload["signals"][0]["type"], "offer")

    def test_room_chat_message_is_returned_in_room_poll(self):
        join = self.client.post(
            reverse("meeting-signal-join", args=["product-sprint-sync"]),
            data=json.dumps({"name": "Caller A"}),
            content_type="application/json",
        )
        participant_id = join.json()["participantId"]

        chat = self.client.post(
            reverse("meeting-chat", args=["product-sprint-sync"]),
            data=json.dumps({"participantId": participant_id, "message": "Hello room"}),
            content_type="application/json",
        )
        self.assertEqual(chat.status_code, 201)

        poll = self.client.get(
            reverse("meeting-signal-events", args=["product-sprint-sync"]),
            {"participant_id": participant_id},
        )
        self.assertEqual(poll.status_code, 200)
        payload = poll.json()
        self.assertEqual(payload["messages"][-1]["message"], "Hello room")
        self.assertGreaterEqual(len(payload["activity"]), 1)

    def test_my_meetings_requires_auth(self):
        response = self.client.get(reverse("my-meetings"))
        self.assertEqual(response.status_code, 401)

    def test_meeting_detail_404_for_missing_slug(self):
        response = self.client.get(reverse("meeting-detail", args=["missing-room"]))

        self.assertEqual(response.status_code, 404)
