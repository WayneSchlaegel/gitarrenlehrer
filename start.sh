#!/bin/bash
# Startet den Gitarrenlehrer (falls nicht schon läuft) und öffnet ihn im Browser
cd "$(dirname "$0")"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
URL="http://localhost:5173/"
if ! curl -s -o /dev/null "$URL"; then
  nohup npm run dev -- --port 5173 --strictPort > /tmp/gitarrenlehrer.log 2>&1 &
  for i in $(seq 1 30); do curl -s -o /dev/null "$URL" && break; sleep 0.5; done
fi
if command -v brave-browser >/dev/null; then brave-browser "$URL"
elif command -v brave >/dev/null; then brave "$URL"
else xdg-open "$URL"; fi
