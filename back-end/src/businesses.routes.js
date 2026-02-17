import express from "express";
import pool from "./db.js";

const router = express.Router();

router.get("/locations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        l.id AS location_id,
        l.latitude,
        l.longitude,
        l.location_name,
        l.cross_street_1,
        l.cross_street_2,
        l.city,
        l.state,
        l.zip_code,
        l.phone,
        b.id AS business_id,
        b.name AS business_name,
        c.name AS category_name,
        c.icon AS category_icon,
        c.color AS category_color
      FROM vendormap.business_locations l
      JOIN vendormap.businesses b
        ON b.id = l.business_id
      LEFT JOIN vendormap.categories c
        ON c.id = b.category_id
      WHERE l.is_active = true
        AND b.is_active = true
        AND l.latitude IS NOT NULL
        AND l.longitude IS NOT NULL
      ORDER BY b.name
    `);

    console.log(`Found ${result.rows.length} locations`);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/locations error:", err);
    res.status(500).json({ error: "Failed to load map locations" });
  }
});
router.get("/categories", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, slug, icon, color FROM vendormap.categories ORDER BY id"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /categories error:", err);
    res.status(500).json({ error: "Failed to load categories" });
  }
});

export default router;