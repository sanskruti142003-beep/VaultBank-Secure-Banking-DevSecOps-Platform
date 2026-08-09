import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 4007;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    service: 'dead-letter-service',
    status: 'ok',
    port: PORT
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Dead Letter Service is running' });
});

app.listen(PORT, () => {
  console.log('Dead Letter Service running on http://localhost:' + PORT);
});
