import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 4003;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    service: 'transaction-service',
    status: 'ok',
    port: PORT
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Transaction Service is running' });
});

app.listen(PORT, () => {
  console.log('Transaction Service running on http://localhost:' + PORT);
});
