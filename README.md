# Calculadora AWS — Tarea 03: Gestiona la Seguridad en la Nube

Aplicación web de una calculadora de 4 operaciones (suma, resta, multiplicación,
división), construida en **Node.js/Express**, pensada para desplegarse en una
arquitectura de AWS **segura, dinámica y escalable**: VPC con subredes
públicas/privadas, EC2 en Auto Scaling Group, Elastic Load Balancer y
monitoreo con CloudWatch.

La aplicación muestra en pantalla el **ID de la instancia EC2** que respondió
la petición, para poder comprobar visualmente cómo el Load Balancer distribuye
el tráfico entre instancias.

---

## 1. Contenido del proyecto

```
project/
├── server.js              # Servidor Express (calculadora + health check + instance id)
├── package.json            # Dependencias del proyecto
├── public/
│   └── index.html           # Interfaz web de la calculadora
├── deploy/
│   └── user-data.sh          # Script de arranque para el Launch Template de EC2
├── .gitignore
└── README.md                # Este archivo
```

## 2. Ejecución local (prueba rápida antes de subir a AWS)

Requisitos: Node.js 18 o superior.

```bash
cd project
npm install
npm start
```

La aplicación quedará disponible en `http://localhost:80` (o el puerto que
definas en la variable de entorno `PORT`). El endpoint `/api/instance`
mostrará `local-<hostname>` cuando no se ejecuta dentro de AWS.

Endpoints disponibles:

| Método | Ruta            | Descripción                                   |
|--------|-----------------|------------------------------------------------|
| GET    | `/`             | Interfaz web de la calculadora                 |
| GET    | `/health`       | Health check (usado por el Target Group)        |
| GET    | `/api/instance` | Devuelve el ID de la instancia que responde     |
| POST   | `/api/calcular` | Recibe `{operacion, a, b}` y devuelve el resultado |

---

## 3. Diagrama de arquitectura

Ver `diagrama/arquitectura.png`. Representa la VPC con subredes públicas
(ALB + NAT Gateway) y privadas (instancias EC2 en Auto Scaling Group, **sin
rol IAM asignado**), el flujo de tráfico desde Internet, la descarga del
código vía `git clone` desde GitHub durante el arranque, y el monitoreo con
CloudWatch que dispara el escalado automático.

## 4. Despliegue en AWS (paso a paso)

> **Nota importante:** esta versión del proyecto **no utiliza ningún rol
> IAM** (no se asigna Instance Profile a las instancias EC2). El código de
> la aplicación se obtiene directamente mediante `git clone` desde un
> repositorio **público** de GitHub durante el arranque de la instancia
> (`user-data`), por lo que no se requieren credenciales ni permisos
> adicionales de AWS para el despliegue.

### Paso 0 — Publicar el código en GitHub

1. Crea un repositorio público en GitHub y sube el contenido de este
   proyecto (o solo la carpeta `project/`).
2. Copia la URL HTTPS del repositorio, por ejemplo:
   ```
   https://github.com/<tu-usuario>/<tu-repositorio>.git
   ```
3. Edita `deploy/user-data.sh` y reemplaza el valor de la variable
   `REPO_URL` con la URL de tu repositorio.

### Paso 1 — Red (VPC)

1. Crea una **VPC personalizada** (ej. `10.0.0.0/16`).
2. Crea **2 subredes públicas** (una por cada AZ, ej. `10.0.1.0/24` y
   `10.0.2.0/24`) y **2 subredes privadas** (ej. `10.0.11.0/24` y
   `10.0.12.0/24`), distribuidas en al menos **2 Zonas de Disponibilidad**.
3. Crea un **Internet Gateway** y asócialo a la VPC.
4. Crea una tabla de rutas pública con ruta `0.0.0.0/0` → Internet Gateway,
   asociada a las subredes públicas.
5. Crea un **NAT Gateway** en una subred pública (necesario para que las
   instancias privadas descarguen paquetes de `dnf`/`npm`) y una tabla de
   rutas privada con ruta `0.0.0.0/0` → NAT Gateway.

### Paso 1.5 — Acceso a Internet para las instancias privadas

Dado que el `user-data` necesita descargar paquetes (`dnf`, `npm`) y clonar
el repositorio desde GitHub (`git clone` por HTTPS, puerto 443), las
instancias en subred privada **deben tener salida a Internet a través del
NAT Gateway** configurado en el Paso 1. Sin rol IAM ni acceso a servicios de
AWS por API, esta es la única vía de salida que necesita la instancia.

### Paso 2 — Grupos de seguridad (Security Groups)

1. **SG-ELB** (para el Load Balancer):
   - Entrada: HTTP 80 / HTTPS 443 desde `0.0.0.0/0`.
   - Salida: todo el tráfico permitido.
2. **SG-EC2** (para las instancias de la calculadora):
   - Entrada: puerto 80 **solo desde SG-ELB** (no desde `0.0.0.0/0`).
   - Salida: todo el tráfico permitido (para actualizaciones y llamadas a
     metadatos de AWS).

### Paso 3 — Rol IAM

**Este proyecto no utiliza ningún rol IAM.** No se crea ni se asigna
Instance Profile a las instancias EC2. La monitorización de CPU que
utiliza el Auto Scaling Group se basa en la métrica estándar
`CPUUtilization`, que el **hipervisor de EC2 publica automáticamente en
CloudWatch a nivel de host** (métrica básica, cada 5 minutos), sin que la
instancia necesite permisos ni credenciales propias para reportarla. Por
eso es posible cumplir con el monitoreo y el escalado automático exigidos
por la tarea sin necesidad de asignar un rol.

### Paso 4 — Launch Template

1. Crea un **Launch Template** con:
   - AMI: Amazon Linux 2023.
   - Tipo de instancia: `t2.micro` o `t3.micro`.
   - Security Group: `SG-EC2`.
   - Rol IAM / Instance Profile: **ninguno** (dejar sin asignar).
   - **User data**: el contenido de `deploy/user-data.sh`.

### Paso 5 — Elastic Load Balancer

1. Crea un **Target Group** (HTTP, puerto 80) con health check en la ruta
   `/health`.
2. Crea un **Application Load Balancer** en las **subredes públicas**, con
   `SG-ELB`, y un listener HTTP (80) que envíe tráfico al Target Group.

### Paso 6 — Auto Scaling Group

1. Crea un **Auto Scaling Group** a partir del Launch Template, en las
   **subredes privadas**.
2. Configura:
   - Mínimo: 2 instancias.
   - Deseado: 2 instancias.
   - Máximo: 4 instancias (o el valor que definas).
3. Asocia el ASG al Target Group del ELB.

### Paso 7 — CloudWatch (monitoreo y escalado automático)

1. Crea una **alarma de CloudWatch** sobre la métrica `CPUUtilization` del
   ASG: umbral **> 70%** durante 2 períodos de 60 segundos.
2. Vincula la alarma a una **política de escalado (scale-out)** del ASG que
   agregue 1 instancia al dispararse.
3. (Opcional pero recomendado) Crea una segunda alarma de **scale-in** para
   cuando la CPU baje de un umbral bajo (ej. 30%), y su política asociada.

---

## 5. Cómo probar la arquitectura

### Prueba del balanceo de carga (ELB)

1. Abre el DNS público del Load Balancer en el navegador.
2. Actualiza la página varias veces (F5): el campo **"Servidor respondiendo
   desde"** debe alternar entre los distintos Instance IDs, demostrando que
   el ELB distribuye el tráfico entre las instancias del ASG.

### Prueba de Auto Scaling + CloudWatch

1. Conéctate a una instancia vía **Session Manager** (no se necesita SSH ni
   IP pública gracias a estar en subred privada).
2. Ejecuta un comando de estrés de CPU:
   ```bash
   stress --cpu 4 --timeout 300
   ```
3. Observa en la consola de CloudWatch cómo la métrica de CPU supera el
   umbral, se dispara la alarma y el ASG lanza una nueva instancia
   automáticamente. Captura la pantalla en ese momento para el documento
   técnico.

---

## 6. Limpieza de recursos

Al finalizar el laboratorio, elimina en este orden para evitar cargos y
dependencias huérfanas: Auto Scaling Group → Load Balancer y Target Group →
Launch Template → NAT Gateway → Internet Gateway → Subredes → VPC.
