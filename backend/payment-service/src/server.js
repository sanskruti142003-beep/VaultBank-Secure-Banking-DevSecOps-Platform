import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 4004;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    service: 'payment-service',
    status: 'ok',
    port: PORT
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Payment Service is running' });
});

app.listen(PORT, () => {
  console.log('Payment Service running on http://localhost:' + PORT);
});
