# VAULT — Self-hosted File Storage

Black & white themed file hosting with real server-side storage.

## Setup

```bash
npm install
node server.js
```

Open http://localhost:3000

## Features
- Upload files (drag & drop or button) — real server storage
- Files persist across devices/sessions (stored in /uploads + data.json)
- Create folders
- Rename, delete files and folders
- Download files via direct link
- Custom Win11-style right-click context menu
- Animated dots background
- Grid and list view

## Deploy (any VPS)

```bash
# Install pm2 for process management
npm install -g pm2
pm2 start server.js --name vault
pm2 save
```

Then reverse-proxy with nginx to your domain.

## Notes
- Files stored in /uploads on disk
- State tracked in data.json
- No auth — anyone with the URL can upload/delete
- Change PORT env var to set a different port
