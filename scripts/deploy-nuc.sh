#!/bin/bash
# Deploy latest to NUC — pull, restart app + tunnel

ssh geoff@fedora.local "
  cd /home/geoff/projects/duckwerksdash &&
  git pull &&
  node scripts/migrate-plastics-table.js &&
  pm2 restart duckwerks &&
  sudo systemctl restart cloudflared &&
  echo 'Done.'
"
