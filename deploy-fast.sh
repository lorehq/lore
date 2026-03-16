#!/bin/bash
cd /home/andrew/Github/lore
GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build -o /tmp/lore-deploy . && \
scp /tmp/lore-deploy lore-test@10.0.160.131:/tmp/lore && \
ssh lore-test@10.0.160.131 '
  for p in /usr/lib/node_modules/@lorehq/cli-linux-x64/lore /usr/lib/node_modules/@lorehq/cli/node_modules/@lorehq/cli-linux-x64/lore; do
    if [ -d "$(dirname "$p")" ]; then
      sudo rm -f "$p" && sudo cp /tmp/lore "$p" && sudo chmod +x "$p"
    fi
  done
' && \
echo "Deployed."
