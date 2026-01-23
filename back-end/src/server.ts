import express from 'express';
import { prisma } from '../lib/prisma.js';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173'
}));

app.get("/api/vendors", async (req, res) => {
  try {
    const vendors = await prisma.vendorlist.findMany();
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

app.listen(8000, function() {
    console.log('Server is running on port 8000');
});
