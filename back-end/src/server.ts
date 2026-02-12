import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const port = process.env.PORT || 8000;

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/', async (req, res) =>{
  try {
    const result = await pool.query('SELECT name FROM vendormap.businesses LIMIT 1');
    res.send(result.rows[0].name);    
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  } 
});

app.get('/api/businesses', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM vendormap.businesses');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching businesses:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/', (req, res) => {
  const { name, location } = req.body;
  res.send(`Received data: Name - ${name}, Location - ${location}`);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});