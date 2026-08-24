# Client content review portal

Admin uploads a markdown content plan and images. Clients preview every post
as it will look on Instagram, Facebook, LinkedIn or Pinterest, and leave notes.

## Run locally

```bash
npm install
npm install -g netlify-cli      # once
netlify dev                     # serves the app and the functions together
```

`npm run vite` alone will start the UI, but the API calls need `netlify dev`.

## Deploy free on Netlify

1. Push this folder to a new GitHub repo.
2. Netlify, Add new site, Import an existing project, pick the repo.
   Build command `npm run build`, publish directory `dist`. Both come from netlify.toml.
3. Site configuration, Environment variables, add `ADMIN_PASSCODE` with a passcode
   of your choosing. Redeploy after adding it.
4. Open the site, tap the lock in the header, enter that passcode, upload the plan.

Free tier covers this: 100 GB bandwidth, 300 build minutes, 125k function calls
per month, and Netlify Blobs for storage.

## How data is stored

Netlify Blobs, store name `portal`, three keys:

- `plan` parsed content plan
- `images` map of post id to compressed data URL
- `feedback` map of post id to status and comments

Reads are public. Writes to `plan` and `images` require the passcode, checked
inside the function. Comments are open to anyone with the link, which is what
you want for a client review link.

## Markdown format

```
# RATNA JEWELLERS — 7-DAY SOCIAL MEDIA CONTENT PLAN
## Week: Monday 7 September – Sunday 13 September 2026

## BRAND DIRECTION
Brand:
Ratna Jewellers

# MONDAY — 7 SEPTEMBER
## Theme: "Teej Is Coming"

### POST 1 — MORNING
Type: Cultural
Format: Reel
HOOK:
...
CAPTION:
...
HASHTAGS:
#Teej2026
AI VISUAL:
...
```

Recognised field labels: Type, Format, HOOK, CAPTION, HASHTAGS, SCRIPT,
TEXT ON SCREEN, SLIDE 1..n, VISUAL, AI VISUAL.

## Limits worth knowing

- Images are compressed to 1280px JPEG in the browser before upload.
- One plan per site. For several clients, deploy one site per client, or add a
  client id to the blob keys and the URL.
- Anyone with the link can read and comment. Add Netlify Identity or a
  password-protected branch if a client needs privacy.
