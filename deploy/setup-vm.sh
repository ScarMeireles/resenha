#!/usr/bin/env bash
# Prepara a VM (Ubuntu da Oracle) uma única vez: instala o Docker, libera as portas no firewall do Ubuntu
# e gera o deploy/.env com segredos aleatórios. Os segredos nascem e ficam só na VM.
# Uso (na VM, dentro de ~/resenha/deploy):  bash setup-vm.sh seu-nome.duckdns.org
set -euo pipefail

DOMAIN="${1:?Uso: bash setup-vm.sh seu-nome.duckdns.org}"
cd "$(dirname "$0")"

echo "==> Instalando Docker"
sudo apt-get update -q
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io docker-compose-v2 iptables-persistent
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

# As imagens Ubuntu da Oracle vêm com o iptables bloqueando tudo menos SSH (além da "Security List" do painel).
echo "==> Liberando portas 80/443 (HTTPS), 7881/tcp e 7882/udp (mídia)"
for rule in "tcp 80" "tcp 443" "tcp 7881" "udp 7882"; do
  set -- $rule
  sudo iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p "$1" --dport "$2" -j ACCEPT
done
sudo netfilter-persistent save

if [ -f .env ]; then
  echo "==> deploy/.env já existe; mantendo os segredos atuais"
else
  echo "==> Gerando deploy/.env com segredos aleatórios"
  umask 077
  cat > .env <<ENV
RESENHA_DOMAIN=$DOMAIN
LIVEKIT_API_KEY=API$(openssl rand -hex 8)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
JWT_SIGNING_KEY=$(openssl rand -hex 32)
ENV
fi

echo
echo "Pronto. Saia da VM e entre de novo (para valer o grupo docker) e rode:"
echo "  cd ~/resenha/deploy && docker compose up -d --build"
