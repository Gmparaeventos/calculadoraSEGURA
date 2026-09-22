#!/bin/bash
# ============================================================
# User Data - Launch Template - Calculadora AWS (Tarea 03)
# Amazon Linux 2023
# Este script se ejecuta automáticamente al arrancar cada
# instancia EC2 gestionada por el Auto Scaling Group.
#
# IMPORTANTE: Esta versión NO utiliza ningún rol IAM (no se asigna
# Instance Profile a las instancias). El despliegue del código se
# realiza clonando el repositorio público de GitHub directamente
# con "git clone", por lo que no se requieren credenciales ni
# permisos adicionales de AWS para obtener la aplicación.
# ============================================================
set -e

# 1. Actualizar el sistema e instalar Node.js 18 y Git
dnf update -y
dnf install -y nodejs npm stress git

# 2. Clonar el proyecto desde GitHub
#    Sustituye la URL por la de tu propio repositorio (debe ser público,
#    ya que al no usar rol IAM ni credenciales, no hay forma de
#    autenticarse contra un repositorio privado desde la instancia).
REPO_URL="https://github.com/Gmparaeventos/calculadoraSEGURA.git"

mkdir -p /opt
cd /opt
git clone "$REPO_URL" calculadora
cd /opt/calculadora

# Si el código de la aplicación vive dentro de una subcarpeta del
# repositorio (por ejemplo "project/"), ajusta el WorkingDirectory
# del servicio systemd más abajo, o descomenta la siguiente línea:
# cd /opt/calculadora/project

# 3. Instalar dependencias de la aplicación
npm install --omit=dev

# 5. Configurar el servicio systemd para que la app inicie con el sistema
#    y se reinicie automáticamente si falla.
cat > /etc/systemd/system/calculadora.service << 'EOF'
[Unit]
Description=Calculadora AWS - Tarea 03
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/calculadora
ExecStart=/usr/bin/node /opt/calculadora/server.js
User=root
Restart=always
RestartSec=5
Environment=PORT=80

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable calculadora
systemctl start calculadora

echo "[INFO] Despliegue de la calculadora completado."
