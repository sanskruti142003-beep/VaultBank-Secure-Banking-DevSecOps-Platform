import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 4002;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    service: 'account-service',
    status: 'ok',
    port: PORT
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Account Service is running' });
});

app.listen(PORT, () => {
  console.log('Account Service running on http://localhost:' + PORT);
});
