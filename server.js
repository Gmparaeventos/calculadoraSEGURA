/**
 * Calculadora Simple de 4 Operaciones
 * Servidor Node.js/Express
 *
 * Expone:
 *  - GET  /                -> Interfaz web de la calculadora
 *  - GET  /health          -> Health check (usado por el Target Group del ELB)
 *  - GET  /api/instance    -> Devuelve el identificador de la instancia EC2 que respondió
 *  - POST /api/calcular    -> Realiza la operación (suma, resta, multiplicacion, division)
 */

const express = require('express');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;

// Identificador de instancia: intenta leer el Instance ID real de AWS (IMDSv2),
// y si no está disponible (ej. ejecutando local), usa el hostname de la máquina.
let INSTANCE_ID = process.env.INSTANCE_LABEL || null;

async function resolveInstanceId() {
  if (INSTANCE_ID) return;
  try {
    // IMDSv2: primero se solicita un token
    const tokenResp = await fetch('http://169.254.169.254/latest/api/token', {
      method: 'PUT',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      signal: AbortSignal.timeout(1000)
    });
    const token = await tokenResp.text();
    const idResp = await fetch('http://169.254.169.254/latest/meta-data/instance-id', {
      headers: { 'X-aws-ec2-metadata-token': token },
      signal: AbortSignal.timeout(1000)
    });
    INSTANCE_ID = (await idResp.text()).trim();
  } catch (err) {
    INSTANCE_ID = `local-${os.hostname()}`;
  }
  console.log(`[INFO] Instancia identificada como: ${INSTANCE_ID}`);
}
resolveInstanceId();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check — usado por el Target Group del Load Balancer
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', instance: INSTANCE_ID || 'resolving...' });
});

// Identificador de instancia — para comprobar el balanceo de carga desde el navegador
app.get('/api/instance', (req, res) => {
  res.json({ instance: INSTANCE_ID || 'resolving...' });
});

// Endpoint de cálculo
app.post('/api/calcular', (req, res) => {
  const { operacion, a, b } = req.body;
  const numA = Number(a);
  const numB = Number(b);

  if (Number.isNaN(numA) || Number.isNaN(numB)) {
    return res.status(400).json({ error: 'Los valores "a" y "b" deben ser numéricos.' });
  }

  let resultado;
  switch (operacion) {
    case 'suma':
      resultado = numA + numB;
      break;
    case 'resta':
      resultado = numA - numB;
      break;
    case 'multiplicacion':
      resultado = numA * numB;
      break;
    case 'division':
      if (numB === 0) {
        return res.status(400).json({ error: 'No se puede dividir entre cero.' });
      }
      resultado = numA / numB;
      break;
    default:
      return res.status(400).json({ error: 'Operación no soportada. Use: suma, resta, multiplicacion, division.' });
  }

  res.json({
    operacion,
    a: numA,
    b: numB,
    resultado,
    instancia: INSTANCE_ID || 'resolving...'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] Calculadora escuchando en el puerto ${PORT}`);
});
