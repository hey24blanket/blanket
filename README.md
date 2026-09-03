# Blanket

Personal dashboard for web apps and project relationships.

## Features

- Live iframe thumbnails for registered web apps
- Add, edit and delete app URLs, names and descriptions
- Open apps directly from the dashboard
- Blender-like project map with draggable nodes
- Drag from node ports to create many-to-many app/project relationships
- Pan and zoom the map
- Browser auto-save with `localStorage`
- Manual save/load to GitHub through a Vercel serverless API

## GitHub state save

The dashboard works immediately with browser-local auto-save.

To enable **GitHub 저장 / 불러오기**, set this Vercel environment variable on the `blanket` project:

- `GITHUB_TOKEN`: a GitHub token that can read/write the private `hey24blanket/blanket` repository

Optional:

- `GITHUB_REPO=hey24blanket/blanket`
- `GITHUB_STATE_PATH=data/blanket-state.json`

Never put the token in frontend code or commit it to GitHub.
