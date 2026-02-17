import express from "express";
import cors from "cors";
import "dotenv/config";
import pool from "./db.js";
import businessesRoutes from "./businesses.routes.js";

const app = express();

app.use(
  cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" })
);
app.use(express.json());
app.use("/api", businessesRoutes);

app.get('/', async (req, res) =>{
  try {
    const result = await pool.query('SELECT name FROM vendormap.businesses LIMIT 5');
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

const port = process.env.PORT || 8000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});