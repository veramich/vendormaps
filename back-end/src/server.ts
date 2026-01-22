import express from 'express';
import { prisma } from '../lib/prisma.js';

const app = express();
app.use(express.json());

app.get("/", async (req, res) => {
  const vendors = await prisma.vendorlist.findMany();
  res.json(vendors)
  })

app.listen(8000, function() {
    console.log('Server is running on port 8000');
});
