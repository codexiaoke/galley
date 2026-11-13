# Deployment

**English** · [简体中文](deployment.zh-CN.md)

Docker on the server is the only requirement. The short version is in the
[README](../README.md#with-docker); this page has the details.

## Two ways to expose the site

- **A port.** Leave the domain empty. Readers visit `http://server-address:port`. No HTTPS — fine for a
  first look.
- **A domain with HTTPS.** Give it a domain that already points at this server. A Caddy container is
  added on ports 80 and 443 and handles certificates and renewal; Galley's own port stays on localhost.
  Afterwards set the site address to `https://your-domain` in the admin's site settings.

On a cloud VM you also have to open the port in the provider's security group (the port you chose, or 80
and 443 with a domain). The script cannot do that for you.

The first run of `deploy.sh` asks three things — the public port (default 3000), the domain (optional),
and the admin password (8 characters or more, or let it generate one) — and writes them to `.env`. If a
local firewall (ufw, firewalld) is active, it offers to open the port.

Images are built by GitHub Actions: every push to `main` runs the checks and tests, then builds on native
x86 and ARM runners and publishes to `ghcr.io/codexiaoke/galley`. Deployments download through the
[1ms mirror](https://1ms.run/guide/temp) by default, using `ghcr.1ms.run/codexiaoke/galley:latest`.
The server only downloads, so two cores are plenty. To use another registry, set `GALLEY_IMAGE=...`
in `.env`; use `GALLEY_IMAGE=ghcr.io/codexiaoke/galley:latest` to pull directly from GHCR.

## When the server cannot download the image

If downloading through the mirror is still slow or unavailable, build the image on your own machine
and ship it over SSH. The server still only needs Docker:

```bash
./release.sh user@server
```

This checks the server's architecture, builds for it locally, compresses and uploads the image, copies
the config files to `~/galley` on the server, and runs `deploy.sh` there. The first run asks the same
three questions. To update later, pull the latest code locally and run the same command again —
configuration and data on the server are left alone.

Each release completes SSH authentication before building or uploading, then reuses that connection
for checks, uploads, and startup without repeated SSH password prompts. The script does not store
the password and closes the connection when it exits or is interrupted. A lost connection fails
instead of prompting behind the upload progress. With `pv` installed locally, the Galley upload shows bytes
transferred, speed, and elapsed time.

To upload it yourself instead, just build the bundle:

```bash
./release.sh --pack
```

That produces `dist/galley-deploy.tar` (x86 by default; use `./release.sh --pack arm64` for ARM). Copy it
over, then:

```bash
tar xf galley-deploy.tar && cd galley-deploy && ./deploy.sh
```

- You need `ssh user@server` to work, and that user to be able to run docker directly (otherwise
  `sudo usermod -aG docker $USER` and log in again).
- Building an x86 image on an ARM Mac goes through emulation and is slower than a native build.
- The compressed image is a bit over 100 MB.

Local builds use npmmirror for npm/pnpm dependencies and the Aliyun Debian mirror for system packages
by default. Override them with the local environment variables `GALLEY_NPM_REGISTRY` and
`GALLEY_APT_MIRROR` before running `release.sh`; explicitly empty values select the official sources.
The script does not read your local `.env`. Runtime settings still come from the server's `.env`.

If you would rather build from source on the server, set `GALLEY_BUILD=1` in `.env` before running
`./deploy.sh`. On its first run it asks whether the server is in mainland China and switches to mirrors
for dependency downloads if so.

## Day to day

| Command | What it does |
|---|---|
| `./deploy.sh` | Restart after editing `.env` (port, domain, password) |
| `./deploy.sh update` | Pull the latest image and restart (on a server deployed with `release.sh`, run `./release.sh` locally instead) |
| `./deploy.sh status` | Container state and health check |
| `./deploy.sh logs` | Tail the logs |
| `./deploy.sh stop` | Stop, keeping the data |

- **Data** lives in the `galley-data` volume (database and uploaded images). Upgrades and rebuilds leave
  it alone; schema migrations run at startup.
- **Backups** are on the admin's backup page: one archive with a full database snapshot and every image,
  which the same page can restore on another server. The server also keeps a daily backup under
  `backups/` in the data directory, the last seven, downloadable from that page or switched off there.
- **Health check** is `/healthz`, already wired into the image.
- If you would rather not use the scripts, the comments at the top of `docker-compose.yml` describe the
  manual steps. Behind your own Nginx, pass `X-Forwarded-Proto` and `X-Forwarded-Host`.

## Environment variables

| Variable | What it does |
|---|---|
| `GALLEY_ADMIN_PASSWORD` | Admin password, at least 8 characters, no composition rules. Without it the admin is unavailable |
| `GALLEY_DATA_DIR` | Data directory. `/data` in the image, `./data` when running locally |
| `GALLEY_PORT` | Public port when deploying with Docker, default 3000 (in `.env`; `deploy.sh` fills it in) |
| `GALLEY_DOMAIN` | Domain to bind when deploying with Docker. Set it and HTTPS is configured automatically |
| `GALLEY_IMAGE` | Which image to run, default `ghcr.1ms.run/codexiaoke/galley:latest` (1ms mirror). Pin a version with `ghcr.1ms.run/codexiaoke/galley:sha-<commit>` |
| `PORT` | Port the process listens on inside the container, default 3000. Rarely needs changing |
| `GALLEY_SMTP_URL` | Optional. SMTP URL for notifications, e.g. `smtps://user:password@smtp.example.com:465`. Can also be set in the admin; the environment wins if both are present |
| `GALLEY_NOTIFY_TO` | Optional. Where notifications go. Needed together with the one above |
| `GALLEY_MAIL_FROM` | Optional. Sender address; defaults to the recipient |
| `GALLEY_SECRET_KEY` | Optional. Key used to encrypt the SMTP password stored in the database. Generated into `.secret-key` in the data directory if unset |

## Presenting and recording

Every article has a **Present** button next to its title (`/posts/<slug>/present`). The article becomes a
full-screen deck: each second-level heading starts a slide, a lone `---` splits one, and `:::notes` under
a heading becomes speaker notes. Arrow keys step forward — if a slide holds a code animation or an
algorithm player, that plays through before the page turns. The control bar has autoplay and a speed
setting from 0.75× to 2× that slows or speeds the in-slide animations too. Keys: `A` autoplay, `-` / `=`
slower / faster, `F` full screen, `N` notes, `Esc` to leave.

**Recording.** Press *Record* on the control bar, choose landscape or portrait, autoplay (with a speed)
or manual paging, captions and microphone — then pick **this tab** in the browser's share dialog. Only
the slide area is captured, and when the deck ends (or you press `Esc`) it saves an MP4. All of it
happens in your browser: nothing is uploaded and the server does no work, so a small VPS is fine. Needs
desktop Chrome or Edge; a bigger window gives a sharper video.

**PDF.** Press *PDF* on the control bar. Every slide is laid out one after another and the print dialog
opens: choose *Save as PDF*, margins *None*, and tick *Background graphics*. One PDF page per slide,
which makes a decent handout. While reviewing an article that is not live yet, *Preview presentation* on
the review page shows the same thing.
