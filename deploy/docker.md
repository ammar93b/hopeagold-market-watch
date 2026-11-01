# Running Market Watch in Docker (Mac, Raspberry Pi) and managing it with Portainer

Market Watch can run as a **Docker container**. The same files work on a Mac and on a Raspberry Pi, and **Portainer** gives you one web page to start, stop, restart and read the logs of every container you run (Market Watch, Pantti auctions Finland, Pi-hole …).

> **Status:** the Docker files are written and the program inside them is tested, but the container itself has not been built on a real machine yet. The first build is the test. If a step fails, open an issue with the message it printed.

**Only one copy may run.** If the Mac service (launchd), the Pi service (systemd) and a container all run, every alert arrives several times. Stop the other one first (step 3).

Docker is **optional**. The plain service (`deploy/raspberry-pi.md`, README) works as before. Choose Docker if you want Portainer, or to run several programs the same way.

## Docker or the plain service?

| | Plain service (launchd / systemd) | Docker |
|---|---|---|
| Mac | Light: no extra programs | Docker Desktop keeps a hidden Linux machine running: about 1–2 GB of memory. Not worth it on a Mac, unless you want to try it |
| Raspberry Pi | Works | Light on Linux; the better choice with Portainer |
| One page for all programs | No | Yes (Portainer) |
| The AI tool | Installed on the computer | Installed inside the image; log in once (step 5) |
| Updates | `git pull`, restart | `git pull`, `docker compose up -d --build` |

## What the Docker files do

- **`Dockerfile`**: Node 22 plus the AI command-line tool (Claude Code by default; `--build-arg AI_NPM_PACKAGE=<package>` for another one, or empty for none) plus the Market Watch code. Runs as the unprivileged user `node`. Works on Intel/AMD and ARM (Mac M-chips, Raspberry Pi 64-bit).
- **`docker-compose.yml`**: the container `hopeagold-marketwatch`, restarted automatically after a crash, a reboot or a power cut.
  - the dashboard is published on **`127.0.0.1:3002` only**: reachable from the computer itself, never from the network;
  - `.env` is mounted read-only, `data/` is mounted from your folder (settings, history and findings survive updates);
  - the AI tool's login is kept in a Docker volume (`ai-login`), so you log in once;
  - the AI tool is found at `/usr/local/bin/claude` inside the container, whatever `AI_COMMAND` says in your `.env`;
  - a health check asks the dashboard every minute; logs are capped at 3 × 2 MB.

## 1. Install Docker

**Raspberry Pi** (64-bit Raspberry Pi OS):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # then log out and in again
docker compose version             # Docker Compose v2
```

**Mac:** install Docker Desktop (docker.com), start it once.

## 2. Download Market Watch

```bash
git clone https://github.com/ammar93b/hopeagold-market-watch.git ~/hopeagold-market-watch
cd ~/hopeagold-market-watch        # main branch
```

## 3. Settings and data

Moving from the plain service on the same computer: stop it, and keep your `.env` and `data/`.

```bash
npm run service:remove             # Mac or Pi: stop the plain service first
```

Moving from the Mac to a Pi: do step 5 of `deploy/raspberry-pi.md` (copy `.env` and `data/`), but skip the Node, AI tool and `npm run service:install` steps.

New install:

```bash
mkdir -p data
cp .env.example .env
nano .env                          # NTFY_TOPIC=…, and the AI lines (README → "AI tool")
```

The AI lines in `.env` (`AI_ARGS`, `AI_MODEL`, `AI_OUTPUT` …) are used as they are. Only the program path is replaced: inside the container the AI tool is always at `/usr/local/bin/claude`.

## 4. Build and start

```bash
docker compose up -d --build       # the first build takes a few minutes
docker compose ps                  # "healthy" after about a minute
docker compose logs -f             # Ctrl+C to leave
```

## 5. Log in to the AI tool, once

```bash
docker compose exec -it marketwatch claude
```

Type `/login` and follow the link it shows (on a Pi without a screen, open the link on your Mac). Then `/exit`. The login stays in the `ai-login` volume. Without it every check ends with an AI error in the Runs tab.

## 6. Test the phone and the dashboard

```bash
docker compose exec marketwatch node run.js --test-push    # "🪙 Market Watch test" arrives
```

Dashboard: **http://localhost:3002** on the computer running Docker. On a Pi, from your Mac: `ssh -N -L 3002:localhost:3002 <your-user>@<pi-address>`, then open http://localhost:3002 on the Mac.

---

## Portainer: one page for all your containers

Install it once on the Pi (or Mac):

```bash
docker volume create portainer_data
docker run -d --name portainer --restart=always \
  -p 127.0.0.1:9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:lts
```

Open it: on the computer itself **https://localhost:9443**; on a Pi from your Mac `ssh -N -L 9443:localhost:9443 <your-user>@<pi-address>`, then https://localhost:9443 (your browser warns about the certificate: it is Portainer's own; accept it). **Create the admin user within a few minutes**, or Portainer locks itself and has to be restarted (`docker restart portainer`). Choose "Get started" and the local environment.

Then **Containers** lists `hopeagold-marketwatch` (and Pantti, Pi-hole …): start, stop, restart, logs, memory and CPU, and a **Console** button that opens a terminal inside it (for example to run `claude` and log in again). Portainer is for watching and controlling. First setup and updates are done with `docker compose` as above.

> Portainer can control every container on the computer, so keep it on `127.0.0.1` (as above) or behind your own VPN. Don't open its port to the internet.

## Day to day

| What | How |
|---|---|
| Is it running? | `docker compose ps`, or Portainer → Containers |
| Recent log lines | `docker compose logs --tail 80`, or Portainer → the container → Logs |
| Restart | `docker compose restart` |
| Run one check now | the dashboard's button, or `docker compose exec marketwatch node run.js` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| The AI tool asks to log in again | `docker compose exec -it marketwatch claude`, `/login` |
| Changed `.env` | `docker compose restart` |
| Stop it | `docker compose down` (data and login are kept) |
| Remove the AI login too | `docker compose down -v` |

## If something goes wrong

- **The container keeps restarting:** `docker compose logs --tail 80`. Usually `.env` is missing (`cp .env.example .env`) or `data/` was created by Docker as root: `sudo chown -R 1000:1000 data`.
- **Permission denied on `data/`:** the container runs as user id 1000 (the first user on a Pi). Another id: `sudo chown -R 1000:1000 data`.
- **Alerts arrive twice:** another copy is running: `npm run service:status`, `docker ps`.
- **AI errors in the Runs tab:** log in again (step 5).
- **The dashboard doesn't open:** `docker compose ps` should say healthy; on a Pi you need the SSH tunnel (step 6).
- **Blocked websites:** with Pi-hole, allow the domains in `deploy/raspberry-pi.md`, plus `registry-1.docker.io`, `production.cloudflare.docker.com`, `deb.debian.org`, `registry.npmjs.org` and `ghcr.io` for builds and updates.
- **Time zone:** the container uses Europe/Helsinki whatever the computer's clock zone is.

## Limits

- Containers stop when the Mac sleeps, like the plain service. Only a Pi runs around the clock.
- Market Watch is advice only. It never bids or buys for you.
