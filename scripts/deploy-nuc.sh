#!/bin/bash
# Deploy latest to NUC — pull, restart app + tunnel

ssh geoff@fedora.local "
  cd /home/geoff/projects/duckwerksdash &&
  git pull &&
  pm2 restart duckwerks &&
  echo 'Done.'
"
