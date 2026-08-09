import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.PORT || 4001;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    service: 'auth-service',
    status: 'ok',
    port: PORT
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Auth Service is running' });
});

app.listen(PORT, () => {
  console.log('Auth Service running on http://localhost:' + PORT);
});
