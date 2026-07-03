

https://github.com/user-attachments/assets/8b4195e4-15f0-42ad-aa99-00dd0afaf2c6



# field

**Your personal visual field. Collect images from anywhere and break free from the algorithm.**

Field is a self-hosted visual collection tool — a private moodboard (or mood board) you control, accessible from your phone, desktop, and browser. No algorithm, no ads, no feed designed to keep you scrolling. Just a continuous visual field of everything you've chosen to look at.

---

## Why Field

It has become increasingly difficult to capture, organize, and reference a growing collection of visual inspiration and ephemera. Whether it's a screenshot, a photo you took, or something you found on a website, you can use Field to collect and browse it all, in one quiet space that's genuinely yours.

Field is built around a simple idea: your collection of images deserves it own place to function as  a map, an atlas, or an archive. 

https://github.com/user-attachments/assets/1f000815-4c70-4604-84cc-3da3a3daa559

- **Collect from anywhere** — upload from your desktop, phone camera roll, or clip images directly from any website with the browser extension

- **Own your data** — images live in your own Cloudflare R2 bucket, metadata in your own D1 database. Nothing is shared, analyzed, or monetized

- **Access from anywhere** — works as a progressive web app on mobile, full browser on desktop

- **Organize your way** — chip-style tags, boards/folders, and a filter system that stays out of your way until you need it

- **No friction** — batch upload, auto-resize, auto-save on tagging, shuffle

---

## What it looks like

- A masonry scroll grid as the default view — everything at once, different sizes, no cropping
- Tag filter panel — multi-select, shown as removable chips
- Boards view — folder-style categories (photography, sketchbook, collage) with mosaic covers
- Full-screen image viewer with flip-through navigation, swipe on mobile, arrow keys on desktop
- Edit panel — tags, notes, board assignments, all in one place

---

## The browser extension

Field ships with a Chrome/Brave extension that lets you save images from any website directly to your collection. Right-click an image → **Save to Field**, or click the extension icon to browse and pick from all images on the current page. Source URL and page title are captured automatically as a note.

Falls back to a screenshot crop for sites that block direct image downloads.

---

## Stack

Field is built entirely on Cloudflare's free tier:

- **Cloudflare Pages** — hosts the frontend and serverless functions
- **Cloudflare R2** — stores image files (10GB free, no egress fees)
- **Cloudflare D1** — SQLite database for image metadata, tags, and boards
- **Cloudflare Workers** — handles upload, fetch, update, delete API routes

The frontend is a single `index.html` file with no framework dependencies. The browser extension uses the Chrome Extensions Manifest V3 API and works in Chrome, Brave, and any Chromium-based browser.

---

## Setup

You'll need a free [Cloudflare account](https://cloudflare.com) and [Node.js](https://nodejs.org) (LTS version) installed.

### 1. Clone the repo

```bash
git clone https://github.com/nolsova/field.git
cd field
```

### 2. Install Wrangler

Cloudflare's CLI tool. If you get a permissions error on Mac, see the [permissions fix](#permissions-fix-mac) below.

```bash
npm install -g wrangler
```

### 3. Log in to Cloudflare

```bash
wrangler login
```

This opens a browser window — no API keys to paste anywhere.

### 4. Create your R2 bucket and D1 database

In the [Cloudflare dashboard](https://dash.cloudflare.com):

**R2 bucket:**
1. Go to **R2 Object Storage** → **Create bucket**
2. Name it `field-images`

**D1 database:**
1. Go to **D1 SQL Database** → **Create database**
2. Name it `field-db`
3. Copy the **Database ID** shown on the overview page

### 5. Update wrangler.toml

Open `wrangler.toml` and fill in your database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "field-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 6. Run the database migrations

```bash
wrangler d1 execute field-db --remote --file=./schema.sql
wrangler d1 execute field-db --remote --file=./schema-v2.sql
```

### 7. Set your API key secret

Generate a random secret key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store it in Cloudflare (copy the output, paste when prompted):

```bash
wrangler pages secret put FIELD_API_KEY --project-name field
```

### 8. Deploy

```bash
wrangler pages deploy public --project-name=field
```

Your site will be live at `https://field.pages.dev` (or a custom domain if you set one up).

---

## Browser extension

1. In Chrome or Brave, go to `chrome://extensions` or `brave://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked** → select the `field-extension` folder
4. Click the extension's settings icon (⚙) and enter:
   - **Field URL:** your deployed URL (e.g. `https://field.pages.dev`)
   - **API Key:** the secret you generated above

---

## Keeping it private

Field uses your API key to protect write operations (upload, edit, delete). For full privacy — including read access — use [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/) (free for personal use) to put a login screen in front of the whole site.

When you're ready to make your collection public, remove the Access policy. The API key still protects write operations so only you can add or edit images.

---

## Permissions fix (Mac)

If `npm install -g wrangler` gives a permissions error, run these first:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

Then try the install again.

---

## Roadmap

- [ ] Pagination / infinite scroll for large libraries
- [ ] Tag rename and merge
- [ ] Full-text search across tags and notes
- [ ] One-click deploy button
- [ ] Firefox extension support

---

## License

MIT — use it, fork it, make it yours.

---

## Disclaimer: A note from the creator

I'm a newbie and this project was built collaboratively with Claude AI over many sessions of trial, error, and iteration. I'm not a developer. This is a personal tool that grew into something I wanted to share.

## Philosophy

Inspired by a desire for a new internet, Field is built on the belief that your visual thinking deserves a quiet, personal space. Not a feed, not a social network, not a product that monetizes your attention.

---

*Built by [Sol Nova](https://solnova.me)*
