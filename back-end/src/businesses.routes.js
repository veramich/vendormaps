import express from "express";
import pool from "./db.js";
import multer from 'multer';
import { requireToken, requireAuth, requireAdmin } from './auth.js';
import { geocodeIntersection, snapToNearestIntersection } from './geocode.js';
import { uploadFile } from './storage.js';

const router = express.Router();
const REVIEW_FALLBACK_ERROR = 'Please reword your review. Something seems to give an error.';

// Configure multer for handling business submission form data
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit per file
});

// Helper function to validate if coordinates are within US boundaries
function isWithinUSBoundaries(latitude, longitude) {
  // Alaska land boundaries (excluding surrounding ocean)
  if (latitude >= 54.0 && latitude <= 71.5 && 
      longitude >= -179.9 && longitude <= -129.0) {
    // Exclude major bodies of water in Alaska region
    if (latitude > 70.0 && longitude < -145.0) return false; // Arctic Ocean
    if (latitude < 56.0 && longitude < -160.0) return false; // Bering Sea
    return true;
  }
  
  // Continental US land boundaries (more restrictive)
  if (latitude >= 24.4 && latitude <= 49.0 && 
      longitude >= -125.0 && longitude <= -66.9) {
    
    // Exclude Mexico border areas
    if (latitude < 25.8 && longitude > -97.0) return false;
    if (latitude < 31.0 && longitude > -106.0 && longitude < -93.0) return false;
    if (latitude < 32.5 && longitude > -117.0 && longitude < -106.0) return false;
    
    // Exclude Atlantic Ocean (far east)
    if (longitude > -70.0 && latitude < 42.0) return false;
    
    // Exclude Pacific Ocean (far west coastal areas)
    if (longitude < -123.0 && latitude > 46.0) return false; // Washington coast
    if (longitude < -120.0 && latitude < 34.0) return false; // Southern California coast
    
    // Exclude Gulf of Mexico
    if (latitude < 26.0 && longitude > -97.0 && longitude < -80.0) return false;
    
    // Exclude Great Lakes (major water bodies)
    if (latitude > 41.0 && latitude < 49.0 && longitude > -93.0 && longitude < -76.0) {
      // Allow some land areas around Great Lakes but exclude the lakes themselves
      if (latitude > 45.0 && longitude > -90.0 && longitude < -84.0) return false; // Superior
      if (latitude > 44.0 && latitude < 47.0 && longitude > -88.0 && longitude < -84.0) return false; // Michigan
    }
    
    return true;
  }
  
  // Hawaii land boundaries (more restrictive than ocean)
  if (latitude >= 18.9 && latitude <= 22.3 && 
      longitude >= -160.5 && longitude <= -154.7) {
    // Only allow the main Hawaiian islands, exclude surrounding ocean
    return true;
  }
  
  // Puerto Rico and US territories
  if (latitude >= 17.9 && latitude <= 18.5 && 
      longitude >= -67.3 && longitude <= -65.2) {
    return true;
  }
  
  // US Virgin Islands
  if (latitude >= 17.6 && latitude <= 18.4 && 
      longitude >= -65.1 && longitude <= -64.5) {
    return true;
  }
  
  return false;
}


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

// Geocode intersection (cross streets + city + state) to lat/lon via Nominatim
router.get("/geocode", async (req, res) => {
  try {
    const { cross_street_1, cross_street_2, city, state } = req.query;
    if (!cross_street_1 || !cross_street_2 || !city || !state) {
      return res.status(400).json({
        error: "Query params required: cross_street_1, cross_street_2, city, state",
      });
    }
    const coords = await geocodeIntersection(
      String(cross_street_1),
      String(cross_street_2),
      String(city),
      String(state)
    );
    if (!coords) {
      return res.status(404).json({
        error: "Could not find coordinates for this address",
      });
    }
    res.json({ latitude: coords.lat, longitude: coords.lon });
  } catch (err) {
    console.error("GET /geocode error:", err);
    res.status(500).json({ error: "Geocoding failed" });
  }
});

// Snap a map click to the nearest intersection (for privacy: pin shows intersection only unless owner chooses exact)
router.post("/snap-to-intersection", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: "latitude and longitude are required" });
    }
    if (!isWithinUSBoundaries(lat, lon)) {
      return res.status(400).json({ error: "Coordinates must be within US boundaries" });
    }
    const snapped = await snapToNearestIntersection(lat, lon);
    if (!snapped) {
      return res.status(404).json({
        error: "No intersection found near this point. Try another spot or enter the address manually.",
      });
    }
    res.json({
      latitude: snapped.lat,
      longitude: snapped.lon,
      original_latitude: lat,
      original_longitude: lon,
      snap_distance_meters: snapped.snap_distance_meters,
      geocode_source: "map_snap",
    });
  } catch (err) {
    console.error("POST /snap-to-intersection error:", err);
    res.status(500).json({ error: "Snap to intersection failed" });
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
        c.name AS category_name,
        COALESCE(
          ARRAY_REMOVE(
            ARRAY_AGG(
              DISTINCT COALESCE(lp.thumbnail_url, lp.photo_url)
            ) FILTER (WHERE COALESCE(lp.thumbnail_url, lp.photo_url) IS NOT NULL),
            NULL
          ),
          ARRAY[]::text[]
        ) AS photo_urls
      FROM vendormap.businesses b
      LEFT JOIN vendormap.categories c
        ON c.id = b.category_id
      LEFT JOIN vendormap.business_locations bl
        ON bl.business_id = b.id
        AND bl.is_active = true
      LEFT JOIN vendormap.location_photos lp
        ON lp.location_id = bl.id
      WHERE b.is_active = true
        AND b.moderation_status = 'approved'
      GROUP BY b.id, b.name, b.logo_url, b.keywords, c.name
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
          bl.business_hours,
          bl.notes,
          bl.amenities,
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
          b.keywords,
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
          bl.business_hours,
          bl.notes,
          bl.amenities,
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
        WHERE bl.business_id = $1
          AND bl.is_active = true
        GROUP BY bl.id
        ORDER BY bl.is_primary DESC, bl.created_at ASC
      `,
      [id]
    );

    res.json({
      ...businessResult.rows[0],
      locations: locationsResult.rows,
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

router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await pool.query(
      `
        SELECT id, username, full_name, email, firebase_uid, created_at, updated_at
        FROM vendormap.users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(userResult.rows[0]);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/businesses', ...requireAuth, upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'location_images', maxCount: 20 }
]), async (req, res) => {
  try {
    const dbUserId = req.auth.dbUser.id;

    // Debug logging
    console.log('Request body:', req.body);
    console.log('Files:', req.files);

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

    // Handle logo upload
    let logoUrl = null;
    if (req.files?.logo?.[0]) {
      logoUrl = await uploadFile(req.files.logo[0], 'business_logos');
    }

    // Process location images for later insertion
    const locationImages = req.files?.location_images || [];
    console.log(`Received ${locationImages.length} location images`);
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
      if (!location.cross_street_1 || !location.cross_street_2 || !location.city || !location.state) {
        return res.status(400).json({ error: 'All location fields (cross streets, city, state) are required' });
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
            error: `Could not find coordinates for "${location.cross_street_1} & ${location.cross_street_2}, ${location.city}, ${location.state}". Check the address or try selecting a location on the map.`,
          });
        }
        location.latitude = coords.lat;
        location.longitude = coords.lon;
        location.geocode_source = location.geocode_source || "nominatim";
        location.location_snapped = location.location_snapped ?? false;
        location.original_latitude = location.original_latitude ?? null;
        location.original_longitude = location.original_longitude ?? null;
        location.snap_distance_meters = location.snap_distance_meters ?? null;
      } else {
        location.geocode_source = location.geocode_source ?? null;
        location.location_snapped = location.location_snapped ?? false;
        location.original_latitude = location.original_latitude ?? null;
        location.original_longitude = location.original_longitude ?? null;
        location.snap_distance_meters = location.snap_distance_meters ?? null;
      }

      if (!isWithinUSBoundaries(location.latitude, location.longitude)) {
        return res.status(400).json({
          error: 'Business location must be within United States boundaries. Please select a location on the US map or correct the address.',
        });
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
            business_hours, is_active,
            geocode_source, location_snapped, original_latitude, original_longitude, snap_distance_meters
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $13, $14, $15, $16)
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
          JSON.stringify(location.business_hours),
          location.geocode_source ?? null,
          location.location_snapped ?? false,
          location.original_latitude ?? null,
          location.original_longitude ?? null,
          location.snap_distance_meters ?? null,
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

// Admin-only endpoints
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
    console.log('Admin pending-businesses endpoint called');

    // Fetch pending businesses with their locations
    let pendingResult;
    try {
      console.log('Executing pending businesses query...');
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
      console.log('Pending businesses query successful:', pendingResult.rows.length, 'rows');
    } catch (queryError) {
      console.error('Error in pending businesses query:', queryError);
      throw queryError;
    }

    // Fetch locations for each pending business
    const businessIds = pendingResult.rows.map(row => row.id);
    let locations = [];
    let locationPhotos = [];
    
    console.log('Business IDs to fetch locations for:', businessIds);
    
    if (businessIds.length > 0) {
      try {
        console.log('Fetching locations...');
        const locationsResult = await pool.query(`
          SELECT 
            business_id,
            id,
            location_name,
            cross_street_1,
            cross_street_2,
            city,
            state,
            latitude,
            longitude,
            original_latitude,
            original_longitude,
            location_privacy,
            geocode_source,
            location_snapped,
            snap_distance_meters,
            phones,
            business_hours
          FROM vendormap.business_locations
          WHERE business_id = ANY($1::uuid[])
          ORDER BY business_id, id
        `, [businessIds]);
        
        locations = locationsResult.rows;
        console.log('Locations fetched:', locations.length);
        
        // Fetch location photos
        const locationIds = locations.map(loc => loc.id);
        console.log('Location IDs to fetch photos for:', locationIds);
        
        if (locationIds.length > 0) {
          try {
            console.log('Fetching location photos...');
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
            console.log('Location photos fetched:', locationPhotos.length);
          } catch (photosError) {
            console.error('Error fetching location photos:', photosError);
            // Continue without photos instead of failing
            locationPhotos = [];
          }
        }
      } catch (locationsError) {
        console.error('Error fetching locations:', locationsError);
        throw locationsError;
      }
    }

    // Group locations and photos by business_id
    console.log('Grouping data...');
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

      console.log('Final data prepared, sending response with', businessesWithLocations.length, 'businesses');
      res.json(businessesWithLocations);
    } catch (mappingError) {
      console.error('Error mapping business data:', mappingError);
      throw mappingError;
    }
  } catch (err) {
    console.error('Error fetching pending businesses:', err);
    const message = err?.message || 'Server error';
    res.status(500).json({ error: 'Server error', details: message });
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

// User profile endpoints (current user by Firebase token)
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

// User profile by database ID (for /users/:userId routes; :userId is DB id)
router.get('/users/:userId', ...requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = String(req.auth.dbUser.id);
    const currentUserRole = req.auth.dbUser.role;
    const isSelf = currentUserId === userId;
    const isAdmin = currentUserRole === 'admin';
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Not allowed to view this profile' });
    }
    const userResult = await pool.query(`
      SELECT id, username, email, full_name, avatar_url, bio,
        is_active, last_login, banned_at, suspended_until,
        created_at, updated_at, firebase_uid, role
      FROM vendormap.users
      WHERE id = $1
    `, [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const profile = userResult.rows[0];
    if (isSelf) {
      profile.last_login = new Date().toISOString();
      await pool.query(
        'UPDATE vendormap.users SET last_login = NOW() WHERE id = $1',
        [userId]
      );
    }
    res.json(profile);
  } catch (err) {
    console.error('Error fetching user by id:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/users/:userId', ...requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, full_name, bio, avatar_url } = req.body;
    const currentUserId = String(req.auth.dbUser.id);
    const currentUserRole = req.auth.dbUser.role;
    const isSelf = currentUserId === userId;
    const isAdmin = currentUserRole === 'admin';
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Not allowed to edit this profile' });
    }
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
      'SELECT id FROM vendormap.users WHERE username = $1 AND id != $2',
      [username.trim(), userId]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    const updateResult = await pool.query(`
      UPDATE vendormap.users
      SET username = $1, full_name = $2, bio = $3, avatar_url = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING id, username, email, full_name, avatar_url, bio,
        is_active, last_login, banned_at, suspended_until,
        created_at, updated_at, firebase_uid, role
    `, [
      username.trim(),
      full_name?.trim() || null,
      bio?.trim() || null,
      avatar_url?.trim() || null,
      userId
    ]);
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error('Error updating user by id:', err);
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
        c.name AS category_name
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

router.post('/user/avatar', ...requireAuth, upload.single('avatar'), async (req, res) => {
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

// Review routes: require valid Firebase token only (DB user may be auto-created)
router.post('/locations/:locationId/reviews', requireToken, async (req, res) => {
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
    if (trimmedReviewText.length < 10) {
      return res.status(400).json({
        error: 'Review text must be at least 10 characters long'
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
        SELECT username, full_name, firebase_uid
        FROM vendormap.users
        WHERE id = $1
        LIMIT 1
      `,
      [resolvedUserId]
    );

    res.status(201).json({
      ...insertedReview,
      username: userResult.rows[0]?.username ?? 'Unknown',
      firebase_uid: userResult.rows[0]?.firebase_uid ?? null,
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
    if (err.message && err.message.includes('pattern')) {
      return res.status(400).json({
        error: err.message,
        details: 'The review text does not match the required pattern. Please check the database constraints.'
      });
    }
    res.status(500).json({ error: REVIEW_FALLBACK_ERROR });
  }
});

router.patch('/locations/:locationId/reviews/:reviewId', ...requireAuth, async (req, res) => {
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
      if (trimmedReviewText.length < 10) {
        return res.status(400).json({ error: 'Review text must be at least 10 characters long' });
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
        SELECT username, full_name, firebase_uid
        FROM vendormap.users
        WHERE id = $1
        LIMIT 1
      `,
      [resolvedUserId]
    );

    res.json({
      ...updatedReview,
      username: reviewUserResult.rows[0]?.username ?? 'Unknown',
      firebase_uid: reviewUserResult.rows[0]?.firebase_uid ?? null,
      full_name: reviewUserResult.rows[0]?.full_name ?? null,
      was_edited: true,
    });
  } catch (err) {
    console.error('Error editing review:', err);
    if (err?.message && err.message.includes('pattern')) {
      return res.status(400).json({ error: 'Updated review text does not match the required format.' });
    }
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

export default router;