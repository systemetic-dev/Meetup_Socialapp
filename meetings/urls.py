from django.urls import path

from . import views


urlpatterns = [
    path("", views.index, name="index"),
    path("api/health/", views.health, name="health"),
    path("api/highlights/", views.highlights, name="highlights"),
    path("api/dashboard/", views.dashboard, name="dashboard"),
    path("api/auth/profile/", views.auth_profile, name="auth-profile"),
    path("api/auth/signup/", views.auth_signup, name="auth-signup"),
    path("api/auth/login/", views.auth_login, name="auth-login"),
    path("api/auth/logout/", views.auth_logout, name="auth-logout"),
    path("api/my-meetings/", views.my_meetings, name="my-meetings"),
    path("api/meetings/", views.meetings, name="meetings"),
    path("api/meetings/<slug:slug>/", views.meeting_detail, name="meeting-detail"),
    path("api/meetings/<slug:slug>/join/", views.join_meeting, name="meeting-join"),
    path("api/meetings/<slug:slug>/signal/join/", views.signaling_join, name="meeting-signal-join"),
    path("api/meetings/<slug:slug>/signal/events/", views.signaling_events, name="meeting-signal-events"),
    path("api/meetings/<slug:slug>/chat/", views.room_chat, name="meeting-chat"),
]
