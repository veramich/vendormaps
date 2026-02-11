import express from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: true
  }
});

const app = express();

app.get('/hello', function(req, res) {
  res.send('Hello');
});
app.use(express.json());

app.post('/hello', function(req, res) {
  res.send('Hello' + req.body.name + '!');
})

app.get('/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ now: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = 8000;
app.listen(PORT, async function() {
    try {
      await pool.query('SELECT 1');
      console.log('Connected to Neon database');
    } catch (err) {
      console.error('Database connection error:', err);
    }
    console.log(`Server is running on port ${PORT}`);
});
