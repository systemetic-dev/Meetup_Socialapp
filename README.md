# Meetup

`Meetup` is a Zoom-style SaaS scaffold built with:

- Django 6 for the backend and REST endpoints
- MongoDB via `pymongo` for optional meeting persistence
- React + Vite for the frontend
- HTML, CSS, and JavaScript for the interface layer

## Project structure

- `meetup_backend/` Django project configuration
- `meetings/` API views and Mongo-backed repository
- `templates/index.html` lightweight Django landing page
- `frontend/` React application source

## Backend endpoints

- `GET /api/health/`
- `GET /api/highlights/`
- `GET /api/dashboard/`
- `GET /api/auth/profile/`
- `POST /api/auth/signup/`
- `POST /api/auth/login/`
- `POST /api/auth/logout/`
- `GET /api/my-meetings/`
- `GET /api/meetings/`
- `POST /api/meetings/`
- `GET /api/meetings/<slug>/`
- `POST /api/meetings/<slug>/join/`

## Run the backend

```powershell
cd Dproject1
python -m pip install django djangorestframework pymongo
python manage.py migrate
python manage.py runserver
```

Optional MongoDB environment variables:

```powershell
$env:MONGODB_URI="mongodb://localhost:27017"
$env:MONGODB_NAME="meetup"
```

If `MONGODB_URI` is not set, the backend uses seeded in-memory meeting data.
The app uses Django auth sessions for host accounts and `pymongo` for optional meeting persistence.

## Run the frontend

```powershell
cd Dproject1\frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to Django automatically. Set `VITE_API_BASE_URL` only if you want a different API host.

For a production build:

```powershell
npm run build
```

`npm run build` writes the compiled frontend to `static/meetup_ui/`. Django serves that build from `/` when the manifest exists; otherwise it falls back to `templates/index.html`.

## Current MVP features

- SaaS landing page and host workspace dashboard
- Sign up, log in, log out, and session-backed profile state
- Host-owned meeting creation with agenda, tags, capacity, recording, and waiting room options
- Meeting detail panel and simulated join flow with room code generation
- Django-served production build for the React frontend and deployment 
