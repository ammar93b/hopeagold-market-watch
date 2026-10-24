# Running Market Watch on a Raspberry Pi 5

Market Watch runs the same code on a Raspberry Pi as on a Mac. The Pi runs it around the clock, so checks happen even when your MacBook is closed or away.

> **Status:** the Linux service (systemd) and these steps are written but not yet tested on a real Pi. The first install is the test. If a step fails, send us the message it printed.

**Only one computer may run Market Watch.** If the Mac and the Pi both run it, every alert arrives twice. Stop the Mac service before you start the Pi (step 6).

---

## What you need

- Raspberry Pi 5 (4 GB or more; it's already set up for Pi-hole, so it's ready)
- **64-bit** Raspberry Pi OS (most AI command-line tools need it).
- An account for your AI tool (README → "AI tool"), the same one you use on the Mac
- Internet access to download the code from GitHub (the repo is public, no account needed)

## 1. Check the Pi

Log in to the Pi from your Mac's Terminal:

```bash
ssh <your-user>@<pi-address>
```

Then check it:

```bash
dpkg --print-architecture   # must say arm64  (armhf = 32-bit: reinstall the 64-bit system)
free -h                     # memory: 4 GB or more
timedatectl                 # time zone must be Europe/Helsinki
```

Set the time zone if needed (run hours follow it):

```bash
sudo timedatectl set-timezone Europe/Helsinki
```

Update the system (it has been off for a while):

```bash
sudo apt update && sudo apt full-upgrade -y
```

## 2. Install Node.js 22 and git

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node --version              # v22.x
```

## 3. Install your AI tool and log in

```bash
# install your AI command-line tool, then run it once to log in. Built with Claude Code:
#   curl -fsSL https://claude.ai/install.sh | bash   then: claude
# (any other AI command-line tool works too: README → "AI tool"). On a Pi without a screen it usually shows a link: open it on your Mac.
which <program>             # its full path, for AI_COMMAND in .env
```

Market Watch uses this login for its AI steps. Copy your `AI_…` lines from the Mac's `.env` (step 5), and change `AI_COMMAND` to the Pi's path.

## 4. Download Market Watch

Use the `main` branch only.

```bash
git clone https://github.com/ammar93b/hopeagold-market-watch.git ~/hopeagold-market-watch
cd ~/hopeagold-market-watch
git branch --show-current   # main
```

GitHub asks for your username and a token. Use a **read-only token** that can only read this repository (github.com → Settings → Developer settings → Fine-grained tokens → Only select repositories → `hopeagold-market-watch` → Contents: Read-only). Git remembers it on the Pi.

Market Watch has no packages to install. Run the tests to check the download:

```bash
npm test                    # 20 tests, all should pass
```

## 5. Copy your settings and data from the Mac

Your `.env` (phone topic) and `data/` (Bought history, settings) are not on GitHub. Copy them from the Mac. Run this **on the Mac**:

```bash
cd ~/Documents/hopeagold-market-watch
npm run service:remove      # stop the Mac service first
scp -r .env data <your-user>@<pi-address>:~/hopeagold-market-watch/
```

This copies `.env` and the whole `data` folder (Bought history and settings).

## 6. Test the phone

On the Pi:

```bash
cd ~/hopeagold-market-watch
npm run test-push           # "🪙 Market Watch test" arrives on your phone
```

## 7. Start it for good

```bash
npm run service:install     # installs the background service
sudo loginctl enable-linger <your-user>   # the install prints this line: run it once
npm run service:status      # "Service: active"
```

`enable-linger` makes the service start after a power cut or reboot, without anyone logging in.

## 8. See the dashboard from your Mac

The dashboard only listens on the Pi itself (`127.0.0.1`), for safety. From your Mac, open a secure tunnel:

```bash
ssh -N -L 3002:localhost:3002 <your-user>@<pi-address>
```

Leave that window open, then open **http://localhost:3002** in your Mac's browser. Phone access to the dashboard will be designed separately.

---

## Day to day

| What | How |
|---|---|
| See if it's running | `npm run service:status` |
| Recent log lines | `npm run log` |
| Restart it | `npm run service:restart` |
| Run one check now | `npm run check` (with phone alerts) or `npm run dry` (no alerts) |
| Update to the latest code | `cd ~/hopeagold-market-watch && git pull && npm run service:restart` |
| Service's own log | `journalctl --user -u hopeagold-marketwatch -n 50` |
| The AI tool asks to log in again | run it, log in, then `npm run service:restart` |
| Pi maintenance | `sudo apt update && sudo apt full-upgrade -y` every month or two |

## If something goes wrong

- **"Not installed" or "Unit exists but is not loaded":** run `npm run service:install` again.
- **Service keeps restarting:** `journalctl --user -u hopeagold-marketwatch -n 80` shows why. Usually a missing `.env` value or an AI tool login problem.
- **No checks happening:** `npm run log`. Check the time zone (`timedatectl`), and that the Pi is on the network.
- **Blocked websites:** if you run Pi-hole, allow these domains: `api.huuto.net`, `www.tori.fi`, `api.gold-api.com`, `api.frankfurter.dev`, `ntfy.sh`, `github.com`, and your AI tool's own domains. A blocked domain shows up as a failed check in the Runs tab.

## Limits of this setup

- The Pi must be on and connected to the internet. Checks catch up after an outage.
- The AI tool uses your own account and its limits, shared with your normal use (as on the Mac).
- Market Watch is advice only. It never bids or buys for you.
