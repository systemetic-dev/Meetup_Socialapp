import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const emptyForm = {
  title: "",
  host: "",
  category: "",
  description: "",
  agenda: "",
  tags: "",
  startTime: "",
  duration: 30,
  capacity: 20,
  recording: true,
  lobbyEnabled: true,
};

const emptyAuth = {
  username: "",
  password: "",
  name: "",
  email: "",
};

const accentClass = {
  sunrise: "card-sunrise",
  lagoon: "card-lagoon",
  ember: "card-ember",
};

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function App() {
  const [highlights, setHighlights] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [myMeetings, setMyMeetings] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [authForm, setAuthForm] = useState(emptyAuth);
  const [authMode, setAuthMode] = useState("signup");
  const [status, setStatus] = useState("idle");
  const [authStatus, setAuthStatus] = useState("idle");
  const [joinStatus, setJoinStatus] = useState("");
  const [isInCall, setIsInCall] = useState(false);
  const [callState, setCallState] = useState({
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
  });
  const [mediaError, setMediaError] = useState("");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const participantIdRef = useRef("");
  const peerParticipantIdRef = useRef("");
  const pollIntervalRef = useRef(null);
  const currentMeetingSlugRef = useRef("");

  useEffect(() => {
    loadApp().catch(() => {
      setStatus("error");
    });
  }, []);

  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, []);

  async function loadApp(preferredSlug = selectedMeeting?.slug) {
    const [highlightsResponse, dashboardResponse, meetingsResponse, profileResponse] = await Promise.all([
      fetch(`${API_BASE}/highlights/`),
      fetch(`${API_BASE}/dashboard/`),
      fetch(`${API_BASE}/meetings/`),
      fetch(`${API_BASE}/auth/profile/`),
    ]);

    const highlightsPayload = await highlightsResponse.json();
    const dashboardPayload = await dashboardResponse.json();
    const meetingsPayload = await meetingsResponse.json();
    const profilePayload = await profileResponse.json();

    setHighlights(highlightsPayload);
    setDashboard(dashboardPayload);
    setMeetings(meetingsPayload.meetings);
    setSelectedMeeting(
      meetingsPayload.meetings.find((meeting) => meeting.slug === preferredSlug) ||
        meetingsPayload.meetings[0] ||
        null
    );
    setCurrentUser(profilePayload.user);

    if (profilePayload.authenticated) {
      await loadMyMeetings();
    } else {
      setMyMeetings([]);
    }
  }

  async function loadMyMeetings() {
    const response = await fetch(`${API_BASE}/my-meetings/`);
    if (!response.ok) {
      setMyMeetings([]);
      return;
    }

    const payload = await response.json();
    setMyMeetings(payload.owned);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAuth(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthStatus("saving");

    try {
      const endpoint = authMode === "signup" ? "auth/signup/" : "auth/login/";
      const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(authForm),
      });
      const payload = await response.json();

      if (!response.ok) {
        setAuthStatus(payload.error || "error");
        return;
      }

      setCurrentUser(payload.user);
      setAuthForm(emptyAuth);
      setAuthStatus("ready");
      await loadApp(selectedMeeting?.slug);
    } catch (error) {
      setAuthStatus("error");
    }
  }

  async function handleLogout() {
    await fetch(`${API_BASE}/auth/logout/`, { method: "POST" });
    setCurrentUser(null);
    setMyMeetings([]);
    setAuthStatus("idle");
    await loadApp(selectedMeeting?.slug);
  }

  async function handleCreateMeeting(event) {
    event.preventDefault();
    setStatus("saving");

    try {
      const payload = {
        ...form,
        host: form.host || currentUser?.name || "",
      };
      const response = await fetch(`${API_BASE}/meetings/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const created = await response.json();

      setStatus("saved");
      setForm({
        ...emptyForm,
        host: currentUser?.name || "",
      });
      await loadApp(created.slug);
    } catch (error) {
      setStatus("error");
    }
  }

  async function handleJoin(meeting) {
    setJoinStatus(`Joining ${meeting.title}...`);
    try {
      const attendeeName = currentUser?.name || authForm.name || "Guest attendee";
      const response = await fetch(`${API_BASE}/meetings/${meeting.slug}/join/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: attendeeName,
        }),
      });
      const payload = await response.json();
      setJoinStatus(`${payload.message} | room ${payload.roomCode}`);
      const mediaStarted = await startLocalStudio();
      if (!mediaStarted) {
        setIsInCall(false);
        return;
      }

      const signalJoinResponse = await fetch(`${API_BASE}/meetings/${meeting.slug}/signal/join/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: attendeeName }),
      });
      const signalJoin = await signalJoinResponse.json();

      participantIdRef.current = signalJoin.participantId;
      currentMeetingSlugRef.current = meeting.slug;
      setParticipants(signalJoin.participants || []);
      await loadApp(payload.meeting.slug);
      await startPollingSignals(meeting.slug);
      setIsInCall(true);

      const firstPeer = (signalJoin.peers || [])[0];
      if (firstPeer?.id) {
        await beginNegotiation(firstPeer.id);
      }
    } catch (error) {
      setJoinStatus("Unable to join the room right now.");
    }
  }

  function stopTracks(stream) {
    if (!stream) {
      return;
    }
    stream.getTracks().forEach((track) => track.stop());
  }

  function clearPolling() {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function stopAllStreams() {
    stopTracks(cameraStreamRef.current);
    stopTracks(screenStreamRef.current);
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  async function sendSignal(type, payload = {}, target = null) {
    if (!participantIdRef.current || !currentMeetingSlugRef.current) {
      return;
    }

    await fetch(`${API_BASE}/meetings/${currentMeetingSlugRef.current}/signal/events/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        participantId: participantIdRef.current,
        type,
        to: target,
        payload,
      }),
    });
  }

  function destroyPeerConnection() {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    peerParticipantIdRef.current = "";
    setRemoteConnected(false);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
  }

  function attachLocalTracks(connection) {
    const stream = cameraStreamRef.current;
    if (!stream) {
      return;
    }

    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });
  }

  function createPeerConnection(targetId = "") {
    destroyPeerConnection();
    const connection = new RTCPeerConnection(rtcConfig);
    attachLocalTracks(connection);

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal(
          "candidate",
          event.candidate.toJSON(),
          peerParticipantIdRef.current || targetId || null
        );
      }
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      setRemoteConnected(true);
    };

    connection.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(connection.connectionState)) {
        setRemoteConnected(false);
      }
    };

    peerConnectionRef.current = connection;
    if (targetId) {
      peerParticipantIdRef.current = targetId;
    }
    return connection;
  }

  async function processSignal(signal) {
    const from = signal.from;
    if (!from) {
      return;
    }

    if (signal.type === "offer") {
      const connection = createPeerConnection(from);
      await connection.setRemoteDescription(new RTCSessionDescription(signal.payload));
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal("answer", answer.toJSON(), from);
      return;
    }

    if (signal.type === "answer" && peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(signal.payload)
      );
      return;
    }

    if (signal.type === "candidate" && peerConnectionRef.current) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.payload));
      } catch (error) {
        setMediaError("Network candidate exchange failed.");
      }
      return;
    }

    if (signal.type === "leave") {
      destroyPeerConnection();
      setJoinStatus("The other participant left the room.");
    }
  }

  async function startPollingSignals(slug) {
    clearPolling();
    pollIntervalRef.current = window.setInterval(async () => {
      if (!participantIdRef.current) {
        return;
      }

      const response = await fetch(
        `${API_BASE}/meetings/${slug}/signal/events/?participant_id=${participantIdRef.current}`
      );
      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      setParticipants(payload.participants || []);
      setChatMessages(payload.messages || []);
      setActivityFeed(payload.activity || []);
      for (const signal of payload.signals || []) {
        await processSignal(signal);
      }
    }, 1500);
  }

  async function beginNegotiation(targetId) {
    const connection = createPeerConnection(targetId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await sendSignal("offer", offer.toJSON(), targetId);
  }

  async function handleSendChat(event) {
    event.preventDefault();
    if (!chatInput.trim() || !participantIdRef.current || !currentMeetingSlugRef.current) {
      return;
    }

    const response = await fetch(`${API_BASE}/meetings/${currentMeetingSlugRef.current}/chat/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        participantId: participantIdRef.current,
        message: chatInput,
      }),
    });

    if (!response.ok) {
      setMediaError("Unable to send chat message.");
      return;
    }

    const payload = await response.json();
    setChatMessages((current) => [...current, payload].slice(-25));
    setChatInput("");
  }

  async function startLocalStudio() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("Camera access is not supported in this browser.");
      return false;
    }

    try {
      setMediaError("");
      stopAllStreams();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      cameraStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setCallState({
        audioEnabled: true,
        videoEnabled: true,
        screenSharing: false,
      });
      return true;
    } catch (error) {
      setMediaError("Allow camera and microphone permissions to start the video room.");
      return false;
    }
  }

  function toggleAudio() {
    const stream = cameraStreamRef.current;
    if (!stream) {
      return;
    }
    const nextAudio = !callState.audioEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextAudio;
    });
    setCallState((current) => ({ ...current, audioEnabled: nextAudio }));
  }

  function toggleVideo() {
    const stream = cameraStreamRef.current;
    if (!stream) {
      return;
    }
    const nextVideo = !callState.videoEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = nextVideo;
    });
    setCallState((current) => ({ ...current, videoEnabled: nextVideo }));
  }

  async function toggleScreenShare() {
    if (callState.screenSharing) {
      stopTracks(screenStreamRef.current);
      screenStreamRef.current = null;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
      setCallState((current) => ({ ...current, screenSharing: false }));
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError("Screen sharing is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
          }
          screenStreamRef.current = null;
          setCallState((current) => ({ ...current, screenSharing: false }));
        };
      }
      setCallState((current) => ({ ...current, screenSharing: true }));
    } catch (error) {
      setMediaError("Screen sharing was cancelled.");
    }
  }

  function leaveCall() {
    if (currentMeetingSlugRef.current && participantIdRef.current) {
      void sendSignal("leave", {}, peerParticipantIdRef.current || null);
      void fetch(`${API_BASE}/meetings/${currentMeetingSlugRef.current}/signal/events/`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          participantId: participantIdRef.current,
        }),
      });
    }

    clearPolling();
    destroyPeerConnection();
    stopAllStreams();
    participantIdRef.current = "";
    currentMeetingSlugRef.current = "";
    setParticipants([]);
    setChatMessages([]);
    setActivityFeed([]);
    setChatInput("");
    setRemoteConnected(false);
    setIsInCall(false);
    setCallState({
      audioEnabled: true,
      videoEnabled: true,
      screenSharing: false,
    });
    setJoinStatus("You left the video room.");
  }

  const summary = dashboard?.summary || highlights?.stats || [];
  const userTitle = currentUser ? `${currentUser.name} | ${currentUser.hostTitle}` : "Guest workspace";

  return (
    <div className="page-shell">
      <header className="hero">
        <nav className="topbar">
          <div className="brand-lockup">
            <div className="brand-badge">M</div>
            <div>
              <p className="eyebrow">Zoom-style SaaS</p>
              <h1>Meetup</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="pill">Storage: {highlights?.storage || "loading"}</div>
            <a className="button-secondary compact" href="#schedule">
              Schedule room
            </a>
          </div>
        </nav>

        <div className="hero-grid">
          <section>
            <p className="eyebrow">{highlights?.hero.eyebrow || "Loading"}</p>
            <h2>{highlights?.hero.title || "Building better rooms for remote work."}</h2>
            <p className="hero-copy">
              {highlights?.hero.description ||
                "Meetup helps teams launch clean video spaces for standups, webinars, and customer demos."}
            </p>
            <div className="hero-actions">
              <a className="button-primary" href="#rooms">
                Explore rooms
              </a>
              <a className="button-secondary" href="#workspace">
                Open workspace
              </a>
            </div>
          </section>

          <aside className="featured-panel">
            <div className="featured-topline">
              <p className="panel-label">Live control desk</p>
              <span className="mini-badge">{userTitle}</span>
            </div>
            <h3>{highlights?.featuredMeeting?.title || "Product Sprint Sync"}</h3>
            <p>{highlights?.featuredMeeting?.description || "Fast host controls, AI notes, and invite links."}</p>
            <div className="featured-meta">
              <span>{highlights?.featuredMeeting?.host || "Meetup Host"}</span>
              <span>{highlights?.featuredMeeting?.duration || 45} min</span>
            </div>
            <div className="status-panel">
              <strong>{joinStatus || "Join any room to generate a room code and attendee event."}</strong>
            </div>
          </aside>
        </div>
      </header>

      <main>
        <section className="feature-grid">
          {highlights?.featureCards?.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <p className="eyebrow">Feature</p>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="stats-row">
          {summary.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </section>

        <section className="plans-grid">
          {highlights?.plans?.map((plan) => (
            <article className="plan-card" key={plan.name}>
              <p className="eyebrow">{plan.name}</p>
              <h3>{plan.price}</h3>
              <p>{plan.description}</p>
            </article>
          ))}
        </section>

        <section className="workflow-grid">
          {dashboard?.workflows?.map((workflow) => (
            <article className="workflow-card" key={workflow.title}>
              <p className="eyebrow">Workflow</p>
              <h3>{workflow.title}</h3>
              <p>{workflow.description}</p>
            </article>
          ))}
        </section>

        <section className="workspace-grid" id="workspace">
          <article className="workspace-panel auth-panel">
            <div className="section-copy">
              <p className="eyebrow">Account</p>
              <h3>{currentUser ? "Workspace identity" : "Create your host workspace"}</h3>
              <p>
                Sign in to own meetings, keep a host profile, and manage your room inventory from one place.
              </p>
            </div>

            {currentUser ? (
              <div className="identity-card">
                <strong>{currentUser.name}</strong>
                <span>@{currentUser.username}</span>
                <span>{currentUser.email || "No email added"}</span>
                <span>{currentUser.meetingsOwned} owned rooms</span>
                <button className="button-secondary" type="button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={handleAuthSubmit}>
                <div className="segmented-control">
                  <button
                    className={authMode === "signup" ? "segment-active" : ""}
                    type="button"
                    onClick={() => setAuthMode("signup")}
                  >
                    Sign up
                  </button>
                  <button
                    className={authMode === "login" ? "segment-active" : ""}
                    type="button"
                    onClick={() => setAuthMode("login")}
                  >
                    Log in
                  </button>
                </div>
                {authMode === "signup" ? (
                  <>
                    <label>
                      Name
                      <input
                        value={authForm.name}
                        onChange={(event) => updateAuth("name", event.target.value)}
                        placeholder="Neha Shah"
                      />
                    </label>
                    <label>
                      Email
                      <input
                        type="email"
                        value={authForm.email}
                        onChange={(event) => updateAuth("email", event.target.value)}
                        placeholder="neha@meetup.app"
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  Username
                  <input
                    required
                    value={authForm.username}
                    onChange={(event) => updateAuth("username", event.target.value)}
                    placeholder="nehashah"
                  />
                </label>
                <label>
                  Password
                  <input
                    required
                    type="password"
                    value={authForm.password}
                    onChange={(event) => updateAuth("password", event.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                </label>
                <button className="button-primary" type="submit">
                  {authMode === "signup" ? "Create workspace" : "Log in"}
                </button>
                <div className="status-line">Auth: {authStatus}</div>
              </form>
            )}
          </article>

          <article className="workspace-panel">
            <div className="section-copy">
              <p className="eyebrow">Your rooms</p>
              <h3>Owned meeting inventory</h3>
              <p>Rooms you create while signed in appear here immediately and are available through the API.</p>
            </div>
            <div className="mini-list">
              {(myMeetings.length ? myMeetings : meetings.slice(0, 3)).map((meeting) => (
                <button
                  className="mini-room"
                  key={meeting.slug}
                  type="button"
                  onClick={() => setSelectedMeeting(meeting)}
                >
                  <strong>{meeting.title}</strong>
                  <span>{meeting.status}</span>
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="studio-grid" id="video-room">
          <article className="studio-panel">
            <div className="section-copy">
              <p className="eyebrow">Video room</p>
              <h3>{isInCall ? "Live meeting studio" : "Join a room to start video"}</h3>
              <p>
                This MVP uses your browser camera, microphone, and optional screen share for a real
                local meeting preview. Join any room below to start the session controls.
              </p>
            </div>

            <div className={`video-stage ${isInCall ? "video-stage-live" : ""}`}>
              <video ref={localVideoRef} autoPlay muted playsInline className="video-tile video-primary" />
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`video-tile video-remote ${remoteConnected ? "video-remote-live" : ""}`}
              />
              {callState.screenSharing ? (
                <video
                  ref={screenVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="video-tile video-screen video-screen-wide"
                />
              ) : (
                <div className="video-placeholder">
                  <strong>{selectedMeeting?.title || "No room selected"}</strong>
                  <span>
                    {isInCall
                      ? "Waiting for another participant to join this room."
                      : "Join a room, then open it in a second tab to test live video."}
                  </span>
                </div>
              )}
            </div>

            <div className="studio-controls">
              <button className="button-secondary compact" type="button" onClick={toggleAudio} disabled={!isInCall}>
                {callState.audioEnabled ? "Mute mic" : "Unmute mic"}
              </button>
              <button className="button-secondary compact" type="button" onClick={toggleVideo} disabled={!isInCall}>
                {callState.videoEnabled ? "Hide camera" : "Show camera"}
              </button>
              <button className="button-secondary compact" type="button" onClick={toggleScreenShare} disabled={!isInCall}>
                {callState.screenSharing ? "Stop share" : "Share screen"}
              </button>
              <button className="button-primary compact" type="button" onClick={leaveCall} disabled={!isInCall}>
                Leave room
              </button>
            </div>

            <div className="studio-status">
              <span>{isInCall ? `Connected to ${selectedMeeting?.title || "room"}` : "Standby"}</span>
              <span>
                {remoteConnected ? "Peer connected" : "Waiting for peer"} | {participants.length} participant(s)
              </span>
            </div>
            {mediaError ? <div className="media-error">{mediaError}</div> : null}
          </article>

          <article className="studio-panel studio-sidecar">
            <div className="section-copy">
              <p className="eyebrow">Session feed</p>
              <h3>Room metadata and presenter cues</h3>
            </div>
            <div className="cue-list">
              <div className="cue-item">
                <span>Room code</span>
                <strong>{selectedMeeting?.roomCode || "Not joined"}</strong>
              </div>
              <div className="cue-item">
                <span>Host</span>
                <strong>{selectedMeeting?.host || "Unknown"}</strong>
              </div>
              <div className="cue-item">
                <span>Recording</span>
                <strong>{selectedMeeting?.recording ? "Enabled" : "Disabled"}</strong>
              </div>
              <div className="cue-item">
                <span>Audience</span>
                <strong>{selectedMeeting ? `${selectedMeeting.attendees}/${selectedMeeting.capacity}` : "0/0"}</strong>
              </div>
            </div>
            <div className="participant-list">
              {(participants.length
                ? participants
                : [{ id: "placeholder", name: "Waiting for participants" }]
              ).map((participant) => (
                <div className="participant-pill" key={participant.id}>
                  {participant.name}
                </div>
              ))}
            </div>
            <div className="chat-panel">
              <div className="chat-feed">
                {(chatMessages.length
                  ? chatMessages
                  : [{ id: "empty", name: "Meetup", message: "Chat messages will appear here after you join." }]
                ).map((entry) => (
                  <div className="chat-message" key={entry.id}>
                    <strong>{entry.name}</strong>
                    <span>{entry.message}</span>
                  </div>
                ))}
              </div>
              <form className="chat-form" onSubmit={handleSendChat}>
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Send a room message"
                  disabled={!isInCall}
                />
                <button className="button-primary compact" type="submit" disabled={!isInCall}>
                  Send
                </button>
              </form>
            </div>
            <div className="activity-panel">
              <p className="eyebrow">Activity</p>
              {(activityFeed.length
                ? activityFeed
                : [{ id: "idle", message: "Join a room to start live activity tracking." }]
              ).map((entry) => (
                <div className="activity-item" key={entry.id}>
                  {entry.message}
                </div>
              ))}
            </div>
            <div className="audience-strip">
              {(selectedMeeting?.tags || ["Speaker", "Agenda", "Q&A"]).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </article>
        </section>

        <section className="section-heading" id="rooms">
          <div>
            <p className="eyebrow">Meeting inventory</p>
            <h3>Rooms built for demos, syncs, town halls, and live sessions.</h3>
          </div>
        </section>

        <section className="rooms-layout">
          <div className="meeting-grid">
            {meetings.map((meeting) => (
              <article
                className={`meeting-card ${accentClass[meeting.accent] || ""} ${selectedMeeting?.slug === meeting.slug ? "selected-card" : ""}`}
                key={meeting.slug}
              >
                <div className="meeting-topline">
                  <span>{meeting.category}</span>
                  <span>{meeting.attendees}/{meeting.capacity} seats</span>
                </div>
                <h4>{meeting.title}</h4>
                <p>{meeting.description}</p>
                <div className="meeting-tags">
                  {(meeting.tags || []).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="meeting-footer">
                  <button className="button-secondary compact" type="button" onClick={() => setSelectedMeeting(meeting)}>
                    Details
                  </button>
                  <button className="button-primary compact" type="button" onClick={() => handleJoin(meeting)}>
                    {meeting.cta}
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="detail-panel">
            {selectedMeeting ? (
              <>
                <div className="section-copy">
                  <p className="eyebrow">Room detail</p>
                  <h3>{selectedMeeting.title}</h3>
                  <p>{selectedMeeting.description}</p>
                </div>
                <div className="detail-list">
                  <div><span>Host</span><strong>{selectedMeeting.host}</strong></div>
                  <div><span>Status</span><strong>{selectedMeeting.status}</strong></div>
                  <div><span>Room code</span><strong>{selectedMeeting.roomCode}</strong></div>
                  <div><span>Recording</span><strong>{selectedMeeting.recording ? "Enabled" : "Off"}</strong></div>
                  <div><span>Lobby</span><strong>{selectedMeeting.lobbyEnabled ? "Enabled" : "Open access"}</strong></div>
                  <div><span>Starts</span><strong>{selectedMeeting.startTime}</strong></div>
                </div>
                <div className="agenda-block">
                  <p className="eyebrow">Agenda</p>
                  {(selectedMeeting.agenda || []).map((item) => (
                    <div className="agenda-item" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
                <button className="button-primary" type="button" onClick={() => handleJoin(selectedMeeting)}>
                  Join selected room
                </button>
              </>
            ) : (
              <p>Select a room to inspect its details.</p>
            )}
          </aside>
        </section>

        <section className="compose-grid" id="schedule">
          <div className="compose-copy">
            <p className="eyebrow">Scheduler</p>
            <h3>Launch a fully-configured room from the SaaS dashboard.</h3>
            <p>
              Create town halls, client demos, or internal rooms with room codes, agenda items, tags,
              recording, and lobby rules. If you are signed in, the room is attached to your host profile.
            </p>
            <div className={`status status-${status}`}>Status: {status}</div>
          </div>

          <form className="compose-form" onSubmit={handleCreateMeeting}>
            <label>
              Session title
              <input
                required
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="Founder All Hands"
              />
            </label>
            <label>
              Host
              <input
                value={form.host}
                onChange={(event) => updateForm("host", event.target.value)}
                placeholder={currentUser?.name || "Priya Nair"}
              />
            </label>
            <label>
              Category
              <input
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                placeholder="Town hall"
              />
            </label>
            <label>
              Starts at
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(event) => updateForm("startTime", event.target.value)}
              />
            </label>
            <label>
              Duration (minutes)
              <input
                type="number"
                min="15"
                value={form.duration}
                onChange={(event) => updateForm("duration", event.target.value)}
              />
            </label>
            <label>
              Capacity
              <input
                type="number"
                min="2"
                value={form.capacity}
                onChange={(event) => updateForm("capacity", event.target.value)}
              />
            </label>
            <label className="full-span">
              Description
              <textarea
                rows="3"
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                placeholder="Quarterly roadmap walkthrough with invited guests."
              />
            </label>
            <label className="full-span">
              Agenda items
              <input
                value={form.agenda}
                onChange={(event) => updateForm("agenda", event.target.value)}
                placeholder="Intro, Product demo, Q&A"
              />
            </label>
            <label className="full-span">
              Tags
              <input
                value={form.tags}
                onChange={(event) => updateForm("tags", event.target.value)}
                placeholder="Town hall, Recording, Investors"
              />
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={form.recording}
                onChange={(event) => updateForm("recording", event.target.checked)}
              />
              Recording enabled
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={form.lobbyEnabled}
                onChange={(event) => updateForm("lobbyEnabled", event.target.checked)}
              />
              Waiting room enabled
            </label>
            <button className="button-primary full-span" type="submit">
              Save meeting
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
