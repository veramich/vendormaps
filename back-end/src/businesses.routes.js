import express from "express";
import pool from "./db.js";
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireToken, requireAuth, requireAdmin } from './auth.js';
import { geocodeIntersection, geocodeIntersectionWithCityLookup } from './geocode.js';
import { uploadFile } from './storage.js';

const router = express.Router();
const REVIEW_FALLBACK_ERROR = 'Please reword your review. Something seems to give an error.';

const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 30,           
  message: { error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 10,             
  message: { error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Configure multer for handling business submission form data
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed'));
    }
  },
});


router.get("/locations", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        l.id AS location_id,
        l.latitude,
        l.longitude,
        l.original_latitude,
        l.original_longitude,
        l.location_privacy,
        l.location_name,
        l.cross_street_1,
        l.cross_street_2,
        l.city,
        l.state,
        l.zip_code,
        l.phones,
        b.id AS business_id,
        b.name AS business_name,
        b.logo_url AS business_logo,
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
        AND b.moderation_status = 'approved'
        AND l.latitude IS NOT NULL
        AND l.longitude IS NOT NULL
      ORDER BY b.name
    `);

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

router.get("/geocode", geocodeLimiter, async (req, res) => {
  try {
    const { cross_street_1, cross_street_2, city, state, zip } = req.query;
    if (!cross_street_1 || !cross_street_2 || !state) {
      return res.status(400).json({
        error: "Query params required: cross_street_1, cross_street_2, state",
      });
    }
    const coords = city
      ? await geocodeIntersection(String(cross_street_1), String(cross_street_2), String(city), String(state), zip ? String(zip) : null)
      : await geocodeIntersectionWithCityLookup(String(cross_street_1), String(cross_street_2), String(state), zip ? String(zip) : null);
    if (!coords) {
      return res.status(404).json({
        error: "Could not find coordinates for this address",
      });
    }
    res.json({ latitude: coords.lat, longitude: coords.lon, ...(coords.city ? { city: coords.city } : {}), ...(coords.zip ? { zip: coords.zip } : {}), ...(coords.approximate ? { approximate: true } : {}) });
  } catch (err) {
    console.error("GET /geocode error:", err);
    res.status(500).json({ error: "Geocoding failed" });
  }
});

router.get("/ratings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        bl.business_id,
        COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS average_rating,
        COUNT(r.id)::int AS review_count
      FROM vendormap.business_locations bl
      LEFT JOIN vendormap.reviews r ON r.location_id = bl.id
      WHERE bl.is_active = true
      GROUP BY bl.business_id
      HAVING COUNT(r.id) > 0
      ORDER BY bl.business_id
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/ratings error:", err);
    res.status(500).json({ error: "Failed to load ratings data" });
  }
});

router.get("/location-search", geocodeLimiter, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Query param 'q' is required" });

    const url = `${process.env.NOMINATIM_URL}/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=us`;
    const response = await fetch(url, {
      headers: { "User-Agent": process.env.NOMINATIM_USER_AGENT },
    });
    if (!response.ok) return res.status(502).json({ error: "Geocoding service unavailable" });

    const data = await response.json();
    const results = data
      .map((place) => ({
        display_name: place.display_name,
        latitude: parseFloat(place.lat),
        longitude: parseFloat(place.lon),
      }))

    res.json(results);
  } catch (err) {
    console.error("GET /location-search error:", err);
    res.status(500).json({ error: "Location search failed" });
  }
});


router.get("/businesses", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id,
        b.name,
        b.logo_url,
        b.keywords,
        b.amenities,
        c.name AS category_name,
        COALESCE(
          ARRAY_REMOVE(
            ARRAY_AGG(
              DISTINCT COALESCE(lp.thumbnail_url, lp.photo_url)
            ) FILTER (WHERE COALESCE(lp.thumbnail_url, lp.photo_url) IS NOT NULL),
            NULL
          ),
          ARRAY[]::text[]
        ) AS photo_urls,
        (ARRAY_AGG(bl.business_hours ORDER BY bl.id) FILTER (WHERE bl.business_hours IS NOT NULL))[1] AS business_hours
      FROM vendormap.businesses b
      LEFT JOIN vendormap.categories c
        ON c.id = b.category_id
      LEFT JOIN vendormap.business_locations bl
        ON bl.business_id = b.id
        AND bl.is_active = true
      LEFT JOIN vendormap.location_photos lp
        ON lp.location_id = bl.id
        AND lp.moderation_status = 'approved'
      WHERE b.is_active = true
        AND b.moderation_status = 'approved'
      GROUP BY b.id, b.name, b.logo_url, b.keywords, b.amenities, c.name
      ORDER BY b.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching businesses:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get("/locations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
        SELECT
          b.id AS business_id,
          b.name AS business_name,
          b.description,
          b.websites,
          b.email,
          b.logo_url,
          b.keywords,
          b.amenities,
          b.is_chain,
          b.parent_company,
          b.if_verified,
          b.created_at,
          b.updated_at,
          c.id AS category_id,
          c.name AS category_name,
          c.slug AS category_slug,
          c.icon AS category_icon,
          c.color AS category_color,
          bl.id AS location_id,
          bl.location_name,
          bl.is_primary,
          bl.phones,
          bl.local_email,
          bl.cross_street_1,
          bl.cross_street_2,
          bl.city,
          bl.state,
          bl.country,
          bl.zip_code,
          bl.neighborhood,
          bl.always_open,
          bl.weekly_hours_on_website,
          bl.subject_to_change,
          bl.business_hours,
          bl.notes,
          bl.latitude,
          bl.longitude,
          bl.original_latitude,
          bl.original_longitude,
          bl.location_privacy,
          bl.temporarily_closed,
          bl.closed_reason,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', lp.id,
                'photo_url', lp.photo_url,
                'thumbnail_url', lp.thumbnail_url,
                'caption', lp.caption,
                'display_order', lp.display_order,
                'is_primary', lp.is_primary
              )
              ORDER BY lp.is_primary DESC, lp.display_order ASC, lp.created_at ASC
            ) FILTER (WHERE lp.id IS NOT NULL),
            '[]'::json
          ) AS photos
        FROM vendormap.business_locations bl
        JOIN vendormap.businesses b
          ON b.id = bl.business_id
          AND b.is_active = true
          AND b.moderation_status = 'approved'
        LEFT JOIN vendormap.categories c
          ON c.id = b.category_id
        LEFT JOIN vendormap.location_photos lp
          ON lp.location_id = bl.id
          AND lp.moderation_status = 'approved'
        WHERE bl.id = $1
          AND bl.is_active = true
        GROUP BY b.id, c.id, bl.id
        LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const row = result.rows[0];

    res.json({
      id: row.business_id,
      name: row.business_name,
      description: row.description,
      websites: row.websites,
      email: row.email,
      logo_url: row.logo_url,
      icon: row.category_icon,
      keywords: row.keywords,
      is_chain: row.is_chain,
      parent_company: row.parent_company,
      if_verified: row.if_verified,
      category_id: row.category_id,
      category_name: row.category_name,
      category_slug: row.category_slug,
      category_icon: row.category_icon,
      category_color: row.category_color,
      created_at: row.created_at,
      updated_at: row.updated_at,
      locations: [
        {
          location_id: row.location_id,
          location_name: row.location_name,
          is_primary: row.is_primary,
          phones: row.phones,
          local_email: row.local_email,
          cross_street_1: row.cross_street_1,
          cross_street_2: row.cross_street_2,
          city: row.city,
          state: row.state,
          country: row.country,
          zip_code: row.zip_code,
          neighborhood: row.neighborhood,
          always_open: row.always_open,
          weekly_hours_on_website: row.weekly_hours_on_website,
          subject_to_change: row.subject_to_change,
          business_hours: row.business_hours,
          notes: row.notes,
          amenities: row.amenities,
          latitude: row.latitude,
          longitude: row.longitude,
          original_latitude: row.original_latitude,
          original_longitude: row.original_longitude,
          location_privacy: row.location_privacy,
          temporarily_closed: row.temporarily_closed,
          closed_reason: row.closed_reason,
          photos: row.photos,
        },
      ],
    });
  } catch (err) {
    console.error('Error fetching location details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/businesses/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const businessResult = await pool.query(
      `
        SELECT
          b.id,
          b.name,
          b.description,
          b.websites,
          b.email,
          b.logo_url,
          c.icon,
          b.keywords,
          b.amenities,
          b.is_chain,
          b.parent_company,
          b.if_verified,
          b.created_at,
          b.updated_at,
          c.id AS category_id,
          c.name AS category_name,
          c.slug AS category_slug,
          c.icon AS category_icon,
          c.color AS category_color
        FROM vendormap.businesses b
        LEFT JOIN vendormap.categories c
          ON c.id = b.category_id
        WHERE b.id = $1
          AND b.is_active = true
        LIMIT 1
      `,
      [id]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const locationsResult = await pool.query(
      `
        SELECT
          bl.id AS location_id,
          bl.location_name,
          bl.is_primary,
          bl.phones,
          bl.local_email,
          bl.cross_street_1,
          bl.cross_street_2,
          bl.city,
          bl.state,
          bl.country,
          bl.zip_code,
          bl.neighborhood,
          bl.always_open,
          bl.weekly_hours_on_website,
          bl.subject_to_change,
          bl.business_hours,
          bl.notes,
          bl.latitude,
          bl.longitude,
          bl.original_latitude,
          bl.original_longitude,
          bl.location_privacy,
          bl.temporarily_closed,
          bl.closed_reason,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', lp.id,
                'photo_url', lp.photo_url,
                'thumbnail_url', lp.thumbnail_url,
                'caption', lp.caption,
                'display_order', lp.display_order,
                'is_primary', lp.is_primary
              )
              ORDER BY lp.is_primary DESC, lp.display_order ASC, lp.created_at ASC
            ) FILTER (WHERE lp.id IS NOT NULL),
            '[]'::json
          ) AS photos
        FROM vendormap.business_locations bl
        LEFT JOIN vendormap.location_photos lp
          ON lp.location_id = bl.id
          AND lp.moderation_status = 'approved'
        WHERE bl.business_id = $1
          AND bl.is_active = true
        GROUP BY bl.id
        ORDER BY bl.is_primary DESC, bl.created_at ASC
      `,
      [id]
    );

    res.json({
      ...businessResult.rows[0],
      locations: locationsResult.rows.map(location => ({
        ...location,
        amenities: businessResult.rows[0].amenities
      })),
    });
  } catch (err) {
    console.error('Error fetching business details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/locations/:locationId/reviews', async (req, res) => {
  try {
    const { locationId } = req.params;

    const reviewsResult = await pool.query(
      `
        SELECT
          r.id,
          r.rating,
          r.title,
          r.review_text,
          COALESCE(r.helpful_count, 0) AS helpful_count,
          r.created_at,
          r.updated_at
          ,u.username,
          u.firebase_uid,
          u.full_name,
          (r.updated_at IS NOT NULL AND r.updated_at > r.created_at) AS was_edited
        FROM vendormap.reviews r
        LEFT JOIN vendormap.users u
          ON u.id = r.user_id
        WHERE r.location_id = $1
        ORDER BY r.created_at DESC
      `,
      [locationId]
    );

    const summaryResult = await pool.query(
      `
        SELECT
          COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS avg_rating,
          COUNT(*)::int AS review_count
        FROM vendormap.reviews r
        WHERE r.location_id = $1
      `,
      [locationId]
    );

    res.json({
      reviews: reviewsResult.rows,
      avg_rating: Number(summaryResult.rows[0]?.avg_rating ?? 0),
      review_count: Number(summaryResult.rows[0]?.review_count ?? 0),
    });
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: REVIEW_FALLBACK_ERROR });
  }
});


router.post('/businesses', writeLimiter, ...requireAuth, upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'location_images', maxCount: 20 }
]), async (req, res) => {
  try {
    const dbUserId = req.auth.dbUser.id;

    // Parse business data from form
    if (!req.body.business) {
      return res.status(400).json({ error: 'Business data is required' });
    }

    let businessData;
    try {
      businessData = JSON.parse(req.body.business);
    } catch (parseError) {
      console.error('Error parsing business data:', parseError);
      return res.status(400).json({ error: 'Invalid business data format' });
    }

    let logoUrl = null;
    if (req.files?.logo?.[0]) {
      logoUrl = await uploadFile(req.files.logo[0], 'business_logos');
    }

    // Process location images
    const locationImages = req.files?.location_images || [];
    const {
      name,
      category_id,
      description,
      websites,
      email,
      keywords,
      amenities,
      is_chain,
      is_owner,
      locations
    } = businessData;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Business name is required' });
    }

    if (!category_id) {
      return res.status(400).json({ error: 'Category is required' });
    }

    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'At least one location is required' });
    }

    const usStates = [
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
      'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
      'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
      'TX','UT','VT','VA','WA','WV','WI','WY'
    ];

    for (const location of locations) {
      if (!location.cross_street_1 || !location.cross_street_2 || !location.state) {
        return res.status(400).json({ error: 'Cross streets and state are required' });
      }

      if (!usStates.includes(location.state)) {
        return res.status(400).json({ error: 'Business must be located in the United States' });
      }

      // If coordinates missing, geocode from cross streets via Nominatim
      if (!location.latitude || !location.longitude) {
        const coords = await geocodeIntersection(
          location.cross_street_1,
          location.cross_street_2,
          location.city,
          location.state
        );
        if (!coords) {
          return res.status(400).json({
            error: `Could not find coordinates for "${location.cross_street_1} & ${location.cross_street_2}, ${location.city}, ${location.state}". Please double-check the cross streets, city, and state.`,
          });
        }
        location.latitude = coords.lat;
        location.longitude = coords.lon;
        location.geocode_source = location.geocode_source || "nominatim";
      } else {
        location.geocode_source = location.geocode_source ?? null;

      }
    }

    await pool.query('BEGIN');

    try {
      const businessResult = await pool.query(`
        INSERT INTO vendormap.businesses (
          name, category_id, description, websites, email, keywords, 
          amenities, is_chain, logo_url, moderation_status, created_by, if_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
        RETURNING id
      `, [
        name.trim(),
        parseInt(category_id),
        description?.trim() || null,
        websites || [],
        email?.trim() || null,
        keywords || [],
        amenities || [],
        is_chain || false,
        logoUrl,
        dbUserId,
        is_owner || false
      ]);

      const businessId = businessResult.rows[0].id;

      // Track location image index for processing
      let locationImageIndex = 0;

      for (let i = 0; i < locations.length; i++) {
        const location = locations[i];
        const locationResult = await pool.query(`
          INSERT INTO vendormap.business_locations (
            business_id, location_name, cross_street_1, cross_street_2,
            city, state, latitude, longitude, phones, location_privacy,
            always_open, weekly_hours_on_website, subject_to_change,
            business_hours, is_active, geocode_source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, $15)
          RETURNING id
        `, [
          businessId,
          location.location_name?.trim() || null,
          location.cross_street_1.trim(),
          location.cross_street_2.trim(),
          location.city.trim(),
          location.state,
          location.latitude,
          location.longitude,
          location.phones || [],
          location.location_privacy || 'intersection',
          location.always_open || false,
          location.weekly_hours_on_website || false,
          location.subject_to_change || false,
          JSON.stringify(location.business_hours),
          location.geocode_source ?? null,
        ]);

        const locationId = locationResult.rows[0].id;

        // Process location images for this specific location
        const numImagesForLocation = location.image_count || 0;
        for (let j = 0; j < numImagesForLocation && locationImageIndex < locationImages.length; j++) {
          const imageFile = locationImages[locationImageIndex];
          const photoUrl = await uploadFile(imageFile, 'location_photos');
          const thumbnailUrl = photoUrl; // thumbnail generation can be added later

          await pool.query(`
            INSERT INTO vendormap.location_photos (
              location_id, photo_url, thumbnail_url, caption, display_order, 
              is_primary, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            locationId,
            photoUrl,
            thumbnailUrl,
            imageFile.originalname || null, // Use filename as caption for now
            j, // display_order
            j === 0, // first image is primary
            dbUserId
          ]);

          locationImageIndex++;
        }
      }

      await pool.query('COMMIT');

      res.status(201).json({ 
        message: 'Business submitted successfully and is pending approval',
        businessId: businessId
      });

    } catch (insertError) {
      await pool.query('ROLLBACK');
      throw insertError;
    }

  } catch (err) {
    console.error('Error creating business:', err);
    res.status(500).json({ error: 'Failed to submit business' });
  }
});

router.get('/admin/check-role', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json({
      role: req.auth.dbUser.role,
      userId: String(req.auth.dbUser.id),
    });
  } catch (err) {
    console.error('Error checking admin role:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/admin/pending-businesses', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    let pendingResult;
    try {
      pendingResult = await pool.query(`
        SELECT 
          b.id,
          b.name,
          b.description,
          b.websites,
          b.email,
          b.keywords,
          b.amenities,
          b.is_chain,
          b.if_verified,
          b.logo_url,
          b.created_by,
          b.created_at,
          b.moderation_status,
          c.name as category_name,
          u.email as submitter_email,
          u.full_name as submitter_name
        FROM vendormap.businesses b
        LEFT JOIN vendormap.categories c ON c.id = b.category_id
        LEFT JOIN vendormap.users u ON u.id::text = b.created_by::text
        WHERE b.moderation_status = 'pending' AND (b.is_active = true OR b.is_active IS NULL)
        ORDER BY b.created_at ASC
      `);
    } catch (queryError) {
      console.error('Error in pending businesses query:', queryError);
      throw queryError;
    }

    // Fetch locations for each pending business
    const businessIds = pendingResult.rows.map(row => row.id);
    let locations = [];
    let locationPhotos = [];

    if (businessIds.length > 0) {
      try {
        const locationsResult = await pool.query(`
          SELECT 
            business_id,
            id,
            location_name,
            cross_street_1,
            cross_street_2,
            city,
            state,
            zip_code,
            neighborhood,
            latitude,
            longitude,
            original_latitude,
            original_longitude,
            location_privacy,
            geocode_source,
            phones,
            local_email,
            business_hours,
            always_open,
            weekly_hours_on_website,
            subject_to_change,
            notes
          FROM vendormap.business_locations
          WHERE business_id = ANY($1::uuid[])
          ORDER BY business_id, id
        `, [businessIds]);
        
        locations = locationsResult.rows;
        
        // Fetch location photos
        const locationIds = locations.map(loc => loc.id);
        
        if (locationIds.length > 0) {
          try {
            const photosResult = await pool.query(`
              SELECT 
                location_id,
                id,
                photo_url,
                thumbnail_url,
                caption,
                display_order,
                is_primary
              FROM vendormap.location_photos
              WHERE location_id = ANY($1::uuid[])
              ORDER BY location_id, is_primary DESC, display_order ASC
            `, [locationIds]);
            
            locationPhotos = photosResult.rows;
          } catch (photosError) {
            console.error('Error fetching location photos:', photosError);
            locationPhotos = [];
          }
        }
      } catch (locationsError) {
        console.error('Error fetching locations:', locationsError);
        throw locationsError;
      }
    }

    // Group locations and photos by business_id
    try {
      const businessesWithLocations = pendingResult.rows.map(business => ({
        ...business,
        keywords: Array.isArray(business.keywords) ? business.keywords : [],
        amenities: Array.isArray(business.amenities) ? business.amenities : [],
        parent_company: business.parent_company ?? null,
        terms_accepted: business.terms_accepted ?? false,
        terms_accepted_at: business.terms_accepted_at ?? null,
        terms_version: business.terms_version ?? null,
        verification_data: business.verification_data ?? null,
        locations: locations
          .filter(loc => loc.business_id === business.id)
          .map(location => ({
            ...location,
            images: locationPhotos.filter(photo => photo.location_id === location.id)
          }))
      }));

      res.json(businessesWithLocations);
    } catch (mappingError) {
      console.error('Error mapping business data:', mappingError);
      throw mappingError;
    }
  } catch (err) {
    console.error('Error fetching pending businesses:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/businesses/:id/approve', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { moderator_notes } = req.body;
    const adminUserId = req.auth.dbUser.id;

    await pool.query('BEGIN');

    try {
      // Approve the business
      const businessResult = await pool.query(`
        UPDATE vendormap.businesses 
        SET 
          moderation_status = 'approved', 
          reviewed_at = NOW(), 
          reviewed_by = $1,
          moderator_notes = $2
        WHERE id = $3 AND moderation_status = 'pending'
        RETURNING id
      `, [adminUserId, moderator_notes || null, id]);

      if (businessResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Business not found or already processed' });
      }

      // Activate all locations for this business
      await pool.query(`
        UPDATE vendormap.business_locations 
        SET is_active = true 
        WHERE business_id = $1
      `, [id]);

      await pool.query('COMMIT');

      res.json({ message: 'Business approved successfully' });
    } catch (updateError) {
      await pool.query('ROLLBACK');
      throw updateError;
    }
  } catch (err) {
    console.error('Error approving business:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/businesses/:id/reject', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason, moderator_notes } = req.body;
    const adminUserId = req.auth.dbUser.id;

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Reject the business
    const businessResult = await pool.query(`
      UPDATE vendormap.businesses 
      SET 
        moderation_status = 'rejected',
        reviewed_at = NOW(), 
        reviewed_by = $1,
        rejection_reason = $2,
        moderator_notes = $3
      WHERE id = $4 AND moderation_status = 'pending'
      RETURNING id
    `, [adminUserId, rejection_reason.trim(), moderator_notes || null, id]);

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found or already processed' });
    }

    res.json({ message: 'Business rejected successfully' });
  } catch (err) {
    console.error('Error rejecting business:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Business claim routes
router.post('/businesses/:id/claim', ...requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dbUserId = req.auth.dbUser.id;

    const bizResult = await pool.query(
      `SELECT id, if_verified FROM vendormap.businesses WHERE id = $1 AND moderation_status = 'approved'`,
      [id]
    );
    if (bizResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    if (bizResult.rows[0].if_verified) {
      return res.status(409).json({ error: 'This business already has a verified owner.' });
    }

    await pool.query(
      `UPDATE vendormap.businesses SET claim_pending = true, claim_user_id = $2 WHERE id = $1`,
      [id, dbUserId]
    );

    res.json({ message: 'Claim submitted successfully.' });
  } catch (err) {
    console.error('POST /businesses/:id/claim error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/admin/pending-claims', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name AS business_name, email, websites
      FROM vendormap.businesses
      WHERE claim_pending = true AND if_verified = false AND moderation_status = 'approved'
      ORDER BY updated_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /admin/pending-claims error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/businesses/:id/verify', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE vendormap.businesses SET if_verified = true, claim_pending = false, verified_owner_id = claim_user_id WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    res.json({ message: 'Business verified.' });
  } catch (err) {
    console.error('POST /admin/businesses/:id/verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/businesses/:id/dismiss-claim', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE vendormap.businesses SET claim_pending = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    res.json({ message: 'Claim dismissed.' });
  } catch (err) {
    console.error('POST /admin/businesses/:id/dismiss-claim error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Business edit routes
router.get('/businesses/:id/edit-data', ...requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dbUserId = req.auth.dbUser.id;

    const bizResult = await pool.query(
      `SELECT id, name, category_id, description, websites, email, keywords, amenities,
              is_chain, logo_url, verified_owner_id, moderation_status
       FROM vendormap.businesses
       WHERE id = $1 AND moderation_status = 'approved' AND is_active = true`,
      [id]
    );
    if (bizResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    const biz = bizResult.rows[0];

    const locResult = await pool.query(
      `SELECT id AS location_id, location_name, cross_street_1, cross_street_2, city, state,
              latitude, longitude, phones, location_privacy,
              always_open, weekly_hours_on_website, subject_to_change,
              business_hours, is_primary
       FROM vendormap.business_locations
       WHERE business_id = $1 AND is_active = true
       ORDER BY is_primary DESC NULLS LAST, id ASC`,
      [id]
    );

    const locIds = locResult.rows.map(l => l.location_id);
    let photosByLocation = {};
    if (locIds.length > 0) {
      const photoResult = await pool.query(
        `SELECT id, location_id, photo_url, thumbnail_url, caption, display_order, is_primary, uploaded_by, moderation_status
         FROM vendormap.location_photos
         WHERE location_id = ANY($1::uuid[])
           AND (moderation_status = 'approved' OR uploaded_by = $2)
         ORDER BY location_id, is_primary DESC, display_order ASC`,
        [locIds, dbUserId]
      );
      for (const photo of photoResult.rows) {
        if (!photosByLocation[photo.location_id]) photosByLocation[photo.location_id] = [];
        photosByLocation[photo.location_id].push(photo);
      }
    }

    res.json({
      ...biz,
      locations: locResult.rows.map(loc => ({
        ...loc,
        photos: photosByLocation[loc.location_id] || [],
      })),
      isVerifiedOwner: biz.verified_owner_id === dbUserId,
    });
  } catch (err) {
    console.error('GET /businesses/:id/edit-data error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/businesses/:id', ...requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dbUserId = req.auth.dbUser.id;
    const { businessEdits, locationEdits } = req.body;

    const bizResult = await pool.query(
      `SELECT id, verified_owner_id FROM vendormap.businesses WHERE id = $1 AND moderation_status = 'approved'`,
      [id]
    );
    if (bizResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    const isVerifiedOwner = bizResult.rows[0].verified_owner_id === dbUserId;

    const addressFields = ['cross_street_1', 'cross_street_2', 'city', 'state'];
    const hasAddressChanges = (locationEdits || []).some(loc =>
      addressFields.some(f => loc[f] !== undefined)
    );
    if (hasAddressChanges && !isVerifiedOwner) {
      return res.status(403).json({ error: 'Only the verified owner can edit address information.' });
    }

    await pool.query('BEGIN');
    try {
      if (businessEdits && Object.keys(businessEdits).length > 0) {
        await pool.query(
          `UPDATE vendormap.businesses SET edit_pending = true, pending_edits = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(businessEdits), id]
        );
      }

      for (const locEdit of (locationEdits || [])) {
        const { location_id, ...changes } = locEdit;
        if (addressFields.some(f => changes[f] !== undefined)) {
          const locRow = await pool.query(
            `SELECT cross_street_1, cross_street_2, city, state FROM vendormap.business_locations WHERE id = $1`,
            [location_id]
          );
          if (locRow.rows.length > 0) {
            const cur = locRow.rows[0];
            const cs1 = changes.cross_street_1 || cur.cross_street_1;
            const cs2 = changes.cross_street_2 || cur.cross_street_2;
            const city = changes.city || cur.city;
            const state = changes.state || cur.state;
            try {
              const coords = await geocodeIntersection(cs1, cs2, city, state);
              if (coords) {
                changes.latitude = coords.lat;
                changes.longitude = coords.lon;
                changes.geocode_source = 'geocode_edit';
              }
            } catch (_) {}
          }
        }
        await pool.query(
          `UPDATE vendormap.business_locations SET edit_pending = true, pending_edits = $1 WHERE id = $2 AND business_id = $3`,
          [JSON.stringify(changes), location_id, id]
        );
      }

      await pool.query('COMMIT');
      res.json({ message: 'Edit submitted for review.' });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('PUT /businesses/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/admin/pending-edits', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id, b.name AS business_name, b.pending_edits AS business_edits,
        b.name AS current_name, b.description AS current_description,
        b.websites AS current_websites, b.email AS current_email,
        b.keywords AS current_keywords, b.amenities AS current_amenities,
        COALESCE(json_agg(
          json_build_object(
            'location_id', l.id,
            'location_name', l.location_name,
            'pending_edits', l.pending_edits,
            'current', json_build_object(
              'cross_street_1', l.cross_street_1,
              'cross_street_2', l.cross_street_2,
              'city', l.city,
              'state', l.state,
              'phones', l.phones,
              'location_privacy', l.location_privacy
            )
          )
        ) FILTER (WHERE l.id IS NOT NULL), '[]') AS location_edits
      FROM vendormap.businesses b
      LEFT JOIN vendormap.business_locations l
        ON l.business_id = b.id AND l.edit_pending = true
      WHERE b.edit_pending = true
      GROUP BY b.id, b.name, b.pending_edits, b.description, b.websites, b.email, b.keywords, b.amenities
      ORDER BY b.updated_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /admin/pending-edits error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/businesses/:id/approve-edit', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('BEGIN');
    try {
      const bizResult = await pool.query(
        `SELECT pending_edits FROM vendormap.businesses WHERE id = $1 AND edit_pending = true`,
        [id]
      );
      if (bizResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'No pending edit found.' });
      }

      const pendingEdits = bizResult.rows[0].pending_edits || {};
      const allowedBizFields = ['name', 'category_id', 'description', 'websites', 'email', 'keywords', 'amenities', 'is_chain'];
      const bizEntries = Object.entries(pendingEdits).filter(([k]) => allowedBizFields.includes(k));
      if (bizEntries.length > 0) {
        const setClause = bizEntries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
        await pool.query(
          `UPDATE vendormap.businesses SET ${setClause}, edit_pending = false, pending_edits = NULL, updated_at = NOW() WHERE id = $1`,
          [id, ...bizEntries.map(([, v]) => v)]
        );
      } else {
        await pool.query(
          `UPDATE vendormap.businesses SET edit_pending = false, pending_edits = NULL WHERE id = $1`,
          [id]
        );
      }

      const allowedLocFields = ['location_name', 'cross_street_1', 'cross_street_2', 'city', 'state',
        'latitude', 'longitude', 'phones', 'location_privacy',
        'always_open', 'weekly_hours_on_website', 'subject_to_change',
        'business_hours', 'geocode_source'];
      const locRows = await pool.query(
        `SELECT id, pending_edits FROM vendormap.business_locations WHERE business_id = $1 AND edit_pending = true`,
        [id]
      );
      for (const loc of locRows.rows) {
        const locEdits = loc.pending_edits || {};
        const locEntries = Object.entries(locEdits).filter(([k]) => allowedLocFields.includes(k));
        if (locEntries.length > 0) {
          const setClause = locEntries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
          await pool.query(
            `UPDATE vendormap.business_locations SET ${setClause}, edit_pending = false, pending_edits = NULL, updated_at = NOW() WHERE id = $1`,
            [loc.id, ...locEntries.map(([, v]) => v)]
          );
        } else {
          await pool.query(
            `UPDATE vendormap.business_locations SET edit_pending = false, pending_edits = NULL WHERE id = $1`,
            [loc.id]
          );
        }
      }

      await pool.query('COMMIT');
      res.json({ message: 'Edit approved and applied.' });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('POST /admin/businesses/:id/approve-edit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/businesses/:id/reject-edit', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE vendormap.businesses SET edit_pending = false, pending_edits = NULL WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }
    await pool.query(
      `UPDATE vendormap.business_locations SET edit_pending = false, pending_edits = NULL WHERE business_id = $1`,
      [id]
    );
    res.json({ message: 'Edit rejected.' });
  } catch (err) {
    console.error('POST /admin/businesses/:id/reject-edit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// User profile endpoints
router.get('/user/profile', ...requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query(`
      SELECT 
        id, username, email, full_name, avatar_url, bio, 
        is_active, last_login, banned_at, suspended_until,
        created_at, updated_at, firebase_uid, role
      FROM vendormap.users 
      WHERE firebase_uid = $1
    `, [req.auth.uid]);

    await pool.query(
      'UPDATE vendormap.users SET last_login = NOW() WHERE firebase_uid = $1',
      [req.auth.uid]
    );

    const profile = userResult.rows[0];
    profile.last_login = new Date().toISOString();

    res.json(profile);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/user/profile', ...requireAuth, async (req, res) => {
  try {
    const { username, full_name, bio, avatar_url } = req.body;

    if (!username || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters long' });
    }

    if (username.trim().length > 50) {
      return res.status(400).json({ error: 'Username must be 50 characters or less' });
    }

    if (full_name && full_name.length > 70) {
      return res.status(400).json({ error: 'Full name must be 70 characters or less' });
    }

    if (avatar_url && avatar_url.length > 1000) {
      return res.status(400).json({ error: 'Avatar URL must be 1000 characters or less' });
    }

    const existingUser = await pool.query(
      'SELECT id FROM vendormap.users WHERE username = $1 AND firebase_uid != $2',
      [username.trim(), req.auth.uid]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const updateResult = await pool.query(`
      UPDATE vendormap.users 
      SET 
        username = $1,
        full_name = $2,
        bio = $3,
        avatar_url = $4,
        updated_at = NOW()
      WHERE firebase_uid = $5
      RETURNING id, username, email, full_name, avatar_url, bio, 
               is_active, last_login, banned_at, suspended_until,
               created_at, updated_at, firebase_uid, role
    `, [
      username.trim(),
      full_name?.trim() || null,
      bio?.trim() || null,
      avatar_url?.trim() || null,
      req.auth.uid
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error('Error updating user profile:', err);
    
    // Handle unique constraint violations
    if (err.code === '23505' && err.constraint === 'users_username_key') {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/user/reviews', ...requireAuth, async (req, res) => {
  try {
    const dbUserId = req.auth.dbUser.id;
    const result = await pool.query(`
      SELECT
        r.id,
        r.rating,
        r.title,
        r.review_text,
        r.created_at,
        r.updated_at,
        bl.id AS location_id,
        b.name AS business_name,
        bl.city,
        bl.state
      FROM vendormap.reviews r
      JOIN vendormap.business_locations bl ON bl.id = r.location_id
      JOIN vendormap.businesses b ON b.id = bl.business_id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `, [dbUserId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user reviews:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/user/businesses', ...requireAuth, async (req, res) => {
  try {
    const dbUserId = req.auth.dbUser.id;
    const result = await pool.query(`
      SELECT
        b.id,
        b.name,
        b.moderation_status,
        b.moderator_notes,
        b.rejection_reason,
        b.created_at,
        b.reviewed_at,
        c.name AS category_name,
        (SELECT bl.id FROM vendormap.business_locations bl
         WHERE bl.business_id = b.id AND bl.is_active = true
         ORDER BY bl.is_primary DESC, bl.created_at ASC
         LIMIT 1) AS primary_location_id
      FROM vendormap.businesses b
      LEFT JOIN vendormap.categories c ON c.id = b.category_id
      WHERE b.created_by::text = $1::text
      ORDER BY b.created_at DESC
    `, [dbUserId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user businesses:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/user/avatar', writeLimiter, ...requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const avatarUrl = await uploadFile(req.file, 'avatars');
    await pool.query(
      'UPDATE vendormap.users SET avatar_url = $1, updated_at = NOW() WHERE firebase_uid = $2',
      [avatarUrl, req.auth.uid]
    );
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('Error uploading avatar:', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

router.post('/locations/:locationId/reviews', writeLimiter, requireToken, async (req, res) => {
  try {
    const { locationId } = req.params;
    const { rating, title, review_text } = req.body;

    const numericRating = Number(rating);

    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'Please select your star rating' });
    }

    if (typeof review_text !== 'string' || !review_text.trim()) {
      return res.status(400).json({ error: 'Please add a comment to submit your review' });
    }

    const trimmedReviewText = review_text.trim();
    if (trimmedReviewText.length < 15) {
      return res.status(400).json({
        error: 'Review text must be at least 15 characters long'
      });
    }

    const locationCheck = await pool.query(
      `
        SELECT id
        FROM vendormap.business_locations
        WHERE id = $1
          AND is_active = true
        LIMIT 1
      `,
      [locationId]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const firebaseUid = req.auth.uid;
    const firebaseEmail = req.auth.email;

    let userResult = await pool.query(
      `
        SELECT id, is_active
        FROM vendormap.users
        WHERE firebase_uid = $1
        LIMIT 1
      `,
      [firebaseUid]
    );

    let resolvedUserId = null;

    if (userResult.rows.length > 0) {
      const foundUser = userResult.rows[0];
      if (foundUser.is_active === false) {
        const activateResult = await pool.query(
          `
            UPDATE vendormap.users
            SET is_active = true, updated_at = NOW()
            WHERE id = $1
            RETURNING id
          `,
          [foundUser.id]
        );
        resolvedUserId = activateResult.rows[0]?.id;
      } else {
        resolvedUserId = foundUser.id;
      }
    }

    if (!resolvedUserId && firebaseEmail) {
      const emailResult = await pool.query(
        `
          SELECT id
          FROM vendormap.users
          WHERE email = $1
          LIMIT 1
        `,
        [firebaseEmail]
      );

      if (emailResult.rows.length > 0) {
        const updateResult = await pool.query(
          `
            UPDATE vendormap.users
            SET firebase_uid = $1, is_active = true, updated_at = NOW()
            WHERE id = $2
            RETURNING id
          `,
          [firebaseUid, emailResult.rows[0].id]
        );
        resolvedUserId = updateResult.rows[0]?.id;
      }
    }

    if (!resolvedUserId) {
      let baseUsername = firebaseEmail
        ? firebaseEmail.split('@')[0]
        : `user_${firebaseUid.substring(0, 8)}`;
      baseUsername = baseUsername.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 30);
      if (!baseUsername) {
        baseUsername = `user_${firebaseUid.substring(0, 8)}`;
      }

      let username = baseUsername;
      let attempts = 0;
      let created = false;

      while (!created && attempts < 10) {
        try {
          const createUserResult = await pool.query(
            `
              INSERT INTO vendormap.users (firebase_uid, email, username, is_active, created_at)
              VALUES ($1, $2, $3, true, NOW())
              ON CONFLICT (firebase_uid) DO UPDATE
                SET is_active = true,
                    updated_at = NOW()
              RETURNING id
            `,
            [firebaseUid, firebaseEmail || null, username]
          );
          resolvedUserId = createUserResult.rows[0]?.id;
          created = true;
        } catch (createErr) {
          if (
            createErr.constraint === 'users_username_key' ||
            (createErr.code === '23505' && createErr.message?.includes('username'))
          ) {
            attempts += 1;
            username = `${baseUsername}${attempts}`;
            continue;
          }

          if (
            createErr.constraint === 'users_firebase_uid_key' ||
            (createErr.code === '23505' && createErr.message?.includes('firebase_uid'))
          ) {
            const existingUser = await pool.query(
              `
                SELECT id
                FROM vendormap.users
                WHERE firebase_uid = $1
                LIMIT 1
              `,
              [firebaseUid]
            );
            if (existingUser.rows.length > 0) {
              resolvedUserId = existingUser.rows[0].id;
              created = true;
            }
          }

          break;
        }
      }
    }

    if (!resolvedUserId) {
      return res.status(400).json({
        error: 'User account not found. Could not create user account.',
      });
    }

    const insertResult = await pool.query(
      `
        INSERT INTO vendormap.reviews (
          location_id,
          user_id,
          rating,
          title,
          review_text,
          helpful_count
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, location_id, user_id, rating, title, review_text, helpful_count, created_at, updated_at
      `,
      [
        locationId,
        resolvedUserId,
        numericRating,
        typeof title === 'string' && title.trim() ? title.trim() : null,
        trimmedReviewText,
        0,
      ]
    );

    const insertedReview = insertResult.rows[0];

    userResult = await pool.query(
      `
        SELECT username, full_name
        FROM vendormap.users
        WHERE id = $1
        LIMIT 1
      `,
      [resolvedUserId]
    );

    res.status(201).json({
      ...insertedReview,
      username: userResult.rows[0]?.username ?? 'Unknown',

      full_name: userResult.rows[0]?.full_name ?? null,
      was_edited: false,
    });
  } catch (err) {
    console.error('Error creating review:', err);
    if (err?.code === '23505' && err?.constraint === 'reviews_location_id_user_id_key') {
      return res.status(409).json({
        error: 'You have already reviewed this location. You can edit your existing review instead of posting another one.'
      });
    }
    res.status(500).json({ error: REVIEW_FALLBACK_ERROR });
  }
});

router.patch('/locations/:locationId/reviews/:reviewId', writeLimiter, ...requireAuth, async (req, res) => {
  try {
    const { locationId, reviewId } = req.params;
    const { rating, title, review_text } = req.body;

    if (rating === undefined && title === undefined && review_text === undefined) {
      return res.status(400).json({
        error: 'Please provide at least one field to update: rating, title, or review_text.'
      });
    }

    if (req.auth.dbUser.is_active === false) {
      return res.status(401).json({ error: 'User account not found or inactive' });
    }

    const resolvedUserId = req.auth.dbUser.id;

    const existingReviewResult = await pool.query(
      `
        SELECT id, user_id
        FROM vendormap.reviews
        WHERE id = $1
          AND location_id = $2
        LIMIT 1
      `,
      [reviewId, locationId]
    );

    if (existingReviewResult.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found for this location' });
    }

    if (existingReviewResult.rows[0].user_id !== resolvedUserId) {
      return res.status(403).json({ error: 'You can only edit your own review' });
    }

    const setClauses = [];
    const values = [];

    if (rating !== undefined) {
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ error: 'Please select a valid star rating (1-5)' });
      }
      values.push(numericRating);
      setClauses.push(`rating = $${values.length}`);
    }

    if (title !== undefined) {
      if (title !== null && typeof title !== 'string') {
        return res.status(400).json({ error: 'Title must be a string or null' });
      }

      const normalizedTitle = typeof title === 'string' && title.trim() ? title.trim() : null;
      values.push(normalizedTitle);
      setClauses.push(`title = $${values.length}`);
    }

    if (review_text !== undefined) {
      if (typeof review_text !== 'string' || !review_text.trim()) {
        return res.status(400).json({ error: 'Please add a comment to update your review' });
      }

      const trimmedReviewText = review_text.trim();
      if (trimmedReviewText.length < 15) {
        return res.status(400).json({ error: 'Review text must be at least 15 characters long' });
      }

      values.push(trimmedReviewText);
      setClauses.push(`review_text = $${values.length}`);
    }

    setClauses.push('updated_at = NOW()');

    values.push(reviewId);
    values.push(locationId);

    const updateResult = await pool.query(
      `
        UPDATE vendormap.reviews
        SET ${setClauses.join(', ')}
        WHERE id = $${values.length - 1}
          AND location_id = $${values.length}
        RETURNING id, location_id, user_id, rating, title, review_text, helpful_count, created_at, updated_at
      `,
      values
    );

    const updatedReview = updateResult.rows[0];

    const reviewUserResult = await pool.query(
      `
        SELECT username, full_name
        FROM vendormap.users
        WHERE id = $1
        LIMIT 1
      `,
      [resolvedUserId]
    );

    res.json({
      ...updatedReview,
      username: reviewUserResult.rows[0]?.username ?? 'Unknown',

      full_name: reviewUserResult.rows[0]?.full_name ?? null,
      was_edited: true,
    });
  } catch (err) {
    console.error('Error editing review:', err);
    res.status(500).json({ error: REVIEW_FALLBACK_ERROR });
  }
});

router.delete('/locations/:locationId/reviews/:reviewId', ...requireAuth, async (req, res) => {
  try {
    const { locationId, reviewId } = req.params;

    if (req.auth.dbUser.is_active === false) {
      return res.status(401).json({ error: 'User account not found or inactive' });
    }

    const resolvedUserId = req.auth.dbUser.id;

    // Verify the review exists and belongs to the user
    const existingReviewResult = await pool.query(
      `
        SELECT id, user_id
        FROM vendormap.reviews
        WHERE id = $1
          AND location_id = $2
        LIMIT 1
      `,
      [reviewId, locationId]
    );

    if (existingReviewResult.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found for this location' });
    }

    if (existingReviewResult.rows[0].user_id !== resolvedUserId) {
      return res.status(403).json({ error: 'You can only delete your own review' });
    }

    // Delete the review
    await pool.query(
      `
        DELETE FROM vendormap.reviews
        WHERE id = $1
          AND location_id = $2
          AND user_id = $3
      `,
      [reviewId, locationId, resolvedUserId]
    );

    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: REVIEW_FALLBACK_ERROR });
  }
});

router.post('/locations/:locationId/reviews/:reviewId/helpful', ...requireAuth, async (req, res) => {
  try {
    const { locationId, reviewId } = req.params;
    const { helpful } = req.body;

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ error: 'Helpful must be true or false' });
    }

    const updateResult = await pool.query(
      `
        UPDATE vendormap.reviews r
        SET
          helpful_count = CASE
            WHEN $3::boolean = true THEN COALESCE(r.helpful_count, 0) + 1
            ELSE GREATEST(COALESCE(r.helpful_count, 0) - 1, 0)
          END,
          updated_at = NOW()
        WHERE r.id = $1
          AND r.location_id = $2
        RETURNING r.id, r.location_id, COALESCE(r.helpful_count, 0) AS helpful_count
      `,
      [reviewId, locationId, helpful]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found for this location' });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: REVIEW_FALLBACK_ERROR });
  }
});

// Photo routes
router.post('/locations/:locationId/photos', ...requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const { locationId } = req.params;
    const { caption } = req.body;
    const dbUserId = req.auth.dbUser.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }

    const userPhotoCount = await pool.query(
      `SELECT COUNT(*) FROM vendormap.location_photos WHERE uploaded_by = $1`,
      [dbUserId]
    );
    if (parseInt(userPhotoCount.rows[0].count, 10) >= 5) {
      return res.status(400).json({ error: 'You have reached the maximum of 5 photos.' });
    }

    const locResult = await pool.query(
      `SELECT id FROM vendormap.business_locations WHERE id = $1 AND is_active = true`,
      [locationId]
    );
    if (locResult.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const photoUrl = await uploadFile(req.file, 'location_photos');

    const orderResult = await pool.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM vendormap.location_photos WHERE location_id = $1`,
      [locationId]
    );
    const displayOrder = orderResult.rows[0].next_order;

    const insertResult = await pool.query(`
      INSERT INTO vendormap.location_photos (
        location_id, photo_url, thumbnail_url, caption, display_order,
        is_primary, uploaded_by, moderation_status
      ) VALUES ($1, $2, $3, $4, $5, false, $6, 'pending')
      RETURNING id, photo_url, thumbnail_url, caption, display_order, is_primary, moderation_status
    `, [locationId, photoUrl, photoUrl, caption?.trim() || null, displayOrder, dbUserId]);

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error('POST /locations/:locationId/photos error:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

router.delete('/locations/:locationId/photos/:photoId', ...requireAuth, async (req, res) => {
  try {
    const { locationId, photoId } = req.params;
    const dbUserId = req.auth.dbUser.id;
    const isAdmin = req.auth.dbUser.role === 'admin';

    const photoResult = await pool.query(
      `SELECT lp.id, lp.uploaded_by, b.verified_owner_id
       FROM vendormap.location_photos lp
       JOIN vendormap.business_locations bl ON bl.id = lp.location_id
       JOIN vendormap.businesses b ON b.id = bl.business_id
       WHERE lp.id = $1 AND lp.location_id = $2`,
      [photoId, locationId]
    );
    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const photo = photoResult.rows[0];
    const isUploader = String(photo.uploaded_by) === String(dbUserId);
    const isVerifiedOwner = photo.verified_owner_id === dbUserId;

    if (!isUploader && !isVerifiedOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this photo' });
    }

    await pool.query(`DELETE FROM vendormap.location_photos WHERE id = $1`, [photoId]);
    res.json({ message: 'Photo deleted' });
  } catch (err) {
    console.error('DELETE /locations/:locationId/photos/:photoId error:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

router.get('/admin/pending-photos', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        lp.id, lp.photo_url, lp.thumbnail_url, lp.caption, lp.created_at,
        bl.id AS location_id, bl.location_name, bl.cross_street_1, bl.cross_street_2, bl.city, bl.state,
        b.id AS business_id, b.name AS business_name
      FROM vendormap.location_photos lp
      JOIN vendormap.business_locations bl ON bl.id = lp.location_id
      JOIN vendormap.businesses b ON b.id = bl.business_id
      WHERE lp.moderation_status = 'pending'
      ORDER BY lp.created_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /admin/pending-photos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/photos/:photoId/approve', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { photoId } = req.params;
    const result = await pool.query(
      `UPDATE vendormap.location_photos SET moderation_status = 'approved' WHERE id = $1 AND moderation_status = 'pending' RETURNING id`,
      [photoId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found or already processed' });
    }
    res.json({ message: 'Photo approved' });
  } catch (err) {
    console.error('POST /admin/photos/:photoId/approve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/photos/:photoId/reject', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { photoId } = req.params;
    const result = await pool.query(
      `DELETE FROM vendormap.location_photos WHERE id = $1 AND moderation_status = 'pending' RETURNING id`,
      [photoId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found or already processed' });
    }
    res.json({ message: 'Photo rejected and removed' });
  } catch (err) {
    console.error('POST /admin/photos/:photoId/reject error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit a pending delete request (does NOT immediately delete — requires admin approval)
router.delete('/businesses/:id', ...requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dbUserId = req.auth.dbUser.id;
    const { reason } = req.body;

    // Check if business exists and get ownership info
    const bizResult = await pool.query(
      `SELECT id, name, verified_owner_id FROM vendormap.businesses
       WHERE id = $1 AND moderation_status = 'approved' AND is_active = true`,
      [id]
    );

    if (bizResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found.' });
    }

    const business = bizResult.rows[0];
    const hasVerifiedOwner = business.verified_owner_id !== null;
    const isVerifiedOwner = business.verified_owner_id === dbUserId;

    // Allow delete request if: no verified owner (anyone can request) OR user is the verified owner
    if (hasVerifiedOwner && !isVerifiedOwner) {
      return res.status(403).json({ error: 'Only the verified owner can request deletion of this business.' });
    }

    await pool.query(
      `UPDATE vendormap.businesses
       SET delete_pending = true, delete_reason = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, reason || null]
    );

    res.json({ message: 'Delete request submitted for admin review.' });
  } catch (err) {
    console.error('DELETE /businesses/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: list businesses with pending delete requests
router.get('/admin/pending-deletions', ...requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, delete_reason, updated_at
       FROM vendormap.businesses
       WHERE delete_pending = true AND is_active = true
       ORDER BY updated_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /admin/pending-deletions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: approve a pending delete request (performs the actual soft delete)
router.post('/admin/businesses/:id/approve-delete', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('BEGIN');
    try {
      await pool.query(
        `UPDATE vendormap.business_locations
         SET is_active = false, temporarily_closed = true, updated_at = NOW()
         WHERE business_id = $1`,
        [id]
      );
      await pool.query(
        `UPDATE vendormap.businesses
         SET is_active = false, delete_pending = false, updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
      await pool.query('COMMIT');
      res.json({ message: 'Business deleted.' });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('POST /admin/businesses/:id/approve-delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: reject a pending delete request (clears the flag, business stays live)
router.post('/admin/businesses/:id/reject-delete', ...requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE vendormap.businesses
       SET delete_pending = false, delete_reason = NULL, updated_at = NOW()
       WHERE id = $1 AND delete_pending = true
       RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No pending delete request found for this business.' });
    }
    res.json({ message: 'Delete request rejected. Business remains live.' });
  } catch (err) {
    console.error('POST /admin/businesses/:id/reject-delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;