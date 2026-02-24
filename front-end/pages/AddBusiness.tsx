//Commented Out Reverse Geocoding since it caused some bugs. Can revisit adding this back later with a more robust implementation if desired.
import { useSearchParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import useUser from "../src/useUser";

function isWithinUSBoundaries(latitude: number, longitude: number): boolean {
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

interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface HourPeriod {
  id: string;
  open: string;
  close: string;
  closes_next_day: boolean;
}

interface DayHours {
  closed: boolean;
  open_24_hours: boolean;
  periods: HourPeriod[];
}

interface BusinessHours {
  always_open: boolean;
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

interface Location {
  id: string;
  location_name: string;
  cross_street_1: string;
  cross_street_2: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  original_latitude: number | null;
  original_longitude: number | null;
  location_snapped: boolean;
  geocode_source: string | null;
  snap_distance_meters: number | null;
  phones: string[];
  location_privacy: "exact" | "intersection" | "grid";
  business_hours: BusinessHours;
  images: File[];
  image_count?: number;
}

interface BusinessFormData {
  name: string;
  category_id: string;
  description: string;
  websites: string[];
  email: string;
  keywords: string[];
  amenities: string[];
  is_chain: boolean;
  is_owner: boolean;
  locations: Location[];
  logo: File | null;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const DEFAULT_HOUR_PERIOD = (): HourPeriod => ({
  id: crypto.randomUUID(),
  open: "09:00",
  close: "17:00",
  closes_next_day: false,
});

const DEFAULT_DAY_HOURS = (): DayHours => ({
  closed: false,
  open_24_hours: false,
  periods: [DEFAULT_HOUR_PERIOD()],
});

const DEFAULT_HOURS = (): BusinessHours => ({
  always_open: false,
  monday: DEFAULT_DAY_HOURS(),
  tuesday: DEFAULT_DAY_HOURS(),
  wednesday: DEFAULT_DAY_HOURS(),
  thursday: DEFAULT_DAY_HOURS(),
  friday: DEFAULT_DAY_HOURS(),
  saturday: { closed: false, open_24_hours: false, periods: [{ id: crypto.randomUUID(), open: "10:00", close: "15:00", closes_next_day: false }] },
  sunday: { closed: true, open_24_hours: false, periods: [] },
});

const DEFAULT_LOCATION = (): Location => ({
  id: crypto.randomUUID(),
  location_name: "",
  cross_street_1: "",
  cross_street_2: "",
  city: "",
  state: "",
  latitude: null,
  longitude: null,
  original_latitude: null,
  original_longitude: null,
  location_snapped: false,
  geocode_source: null,
  snap_distance_meters: null,
  phones: [],
  location_privacy: "intersection",
  business_hours: DEFAULT_HOURS(),
  images: [],
});

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
]; 

const COMMON_AMENITIES = [
  "Home Based", "Sidewalk Based", "Farmer's Market", "Pop Ups", "Catering", "Private Events", "Farmer's Market Only", "Pop Up Only", "Catering Only",
  "DM To Order", "Text To Order", "Call To Order", "Order Online", "Walk-Up Orders", "Order Ahead", "Pre-Order Required", "No Walk-Ins", "Time-Slot Reservations",
  "Cash Only", "Cash Preferred", "Tap To Pay", "Credit Cards", "Cash App", "Zelle", "Venmo", "PayPal", "Apple Cash", "Google Pay", "Samsung Pay",
  "Pickup", "Curbside Pickup", "Delivery", "Shipping", "US Shipping", "International Shipping", "Street Parking", "Parking Lot", "Wheelchair Accessible", "Outdoor Seating", "Restrooms",
  "Vegan Options", "Vegetarian Options", "Gluten-Free Options", "Halal Options", "Kosher Options", "Locally Sourced Ingredients", "Organic Options", "Late Night"
];

export default function AddBusiness() {
  const [searchParams] = useSearchParams();
  // const navigate = useNavigate();
  const { user, isLoading } = useUser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<BusinessFormData>({
    name: "",
    category_id: "",
    description: "",
    websites: [],
    email: "",
    keywords: [],
    amenities: [],
    is_chain: false,
    is_owner: false,
    locations: [DEFAULT_LOCATION()],
    logo: null,
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [amenityInput, setAmenityInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geolocating, setGeolocating] = useState(false);
  // const [geocodeLookupIndex, setGeocodeLookupIndex] = useState<number | null>(null);
  // const [geocodeError, setGeocodeError] = useState<string | null>(null);
  // const geocodeTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  
  // Restore form draft saved before navigating to the map to pick a location
  useEffect(() => {
    const draft = sessionStorage.getItem('addBusinessDraft');
    if (draft) {
      try {
        setForm(JSON.parse(draft));
      } catch {}
      sessionStorage.removeItem('addBusinessDraft');
    }
  }, []);

  useEffect(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    if (lat && lng) {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);

      if (!Number.isNaN(parsedLat) && !Number.isNaN(parsedLng) &&
          !isWithinUSBoundaries(parsedLat, parsedLng)) {
        setError('The selected location is outside the United States. Please select a location within the US boundaries.');
      }
    }
  }, [searchParams]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      setGeolocating(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch address information');
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Reverse geocoding error:', err);
      return null;
    } finally {
      setGeolocating(false);
    }
  };

  const parseAddressData = (data: any) => {
    if (!data || !data.address) return null;

    const address = data.address;
    
    const street1 = address.road || address.street || address.highway || 
                   address.pedestrian || address.footway || '';
    
    let street2 = '';
    
    const displayName = data.display_name || '';
    const nameParts = displayName.split(',').map((part: string) => part.trim());
    
    const streetKeywords = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Boulevard', 'Blvd', 
                           'Drive', 'Dr', 'Lane', 'Ln', 'Way', 'Circle', 'Cir'];
    
    const potentialStreets = nameParts.filter((part: string) => 
      streetKeywords.some(keyword => part.includes(keyword)) && part !== street1
    );
    
    if (potentialStreets.length > 0) {
      street2 = potentialStreets[0];
    } else {
      street2 = address.neighbourhood || address.suburb || address.hamlet || 
               `Near ${street1}` || 'Cross Street';
    }
    
    const city = address.city || address.town || address.village || 
                address.municipality || address.county || '';
    
    const state = address.state || address.province || address.region || '';
    
    const convertStateToAbbreviation = (stateName: string): string => {
      const stateMap: { [key: string]: string } = {
        'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
        'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
        'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
        'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
        'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
        'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
        'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
        'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
        'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
        'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
        'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
        'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
        'Wisconsin': 'WI', 'Wyoming': 'WY'
      };
      
      return stateMap[stateName] || stateName;
    };

    return {
      cross_street_1: street1,
      cross_street_2: street2,
      city: city,
      state: convertStateToAbbreviation(state)
    };
  };

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(console.error);
  }, []);

    const selectedLocation = useMemo(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    if (!lat || !lng) return null;

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) return null;
    
    // Validate that coordinates are within US boundaries
    if (!isWithinUSBoundaries(parsedLat, parsedLng)) {
      console.warn('Location coordinates are outside US boundaries:', parsedLat, parsedLng);
      return null;
    }

    return { lat: parsedLat, lng: parsedLng };
  }, [searchParams]);

  // Require a map-selected location — redirect back to home if none present
  // useEffect(() => {
  //   if (!selectedLocation) {
  //     navigate('/', { replace: true });
  //   }
  // }, []);

  useEffect(() => {
    if (selectedLocation && form.locations.length > 0 && !form.locations[0].latitude) {
      const autoFillAddress = async () => {
        // Snap click to nearest intersection for privacy (map pins show intersection unless owner chooses exact)
        let snappedLat = selectedLocation.lat;
        let snappedLng = selectedLocation.lng;
        let originalLat: number | null = null;
        let originalLng: number | null = null;
        let locationSnapped = false;
        let geocodeSource: string | null = null;
        let snapDistanceMeters: number | null = null;

        try {
          const snapRes = await fetch("/api/snap-to-intersection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: selectedLocation.lat,
              longitude: selectedLocation.lng,
            }),
          });
          if (snapRes.ok) {
            const snapData = await snapRes.json();
            snappedLat = snapData.latitude;
            snappedLng = snapData.longitude;
            originalLat = snapData.original_latitude;
            originalLng = snapData.original_longitude;
            locationSnapped = true;
            geocodeSource = snapData.geocode_source || "map_snap";
            snapDistanceMeters = snapData.snap_distance_meters ?? null;
          }
        } catch (_) {
          // Fallback: use click as pin (no snap)
          originalLat = selectedLocation.lat;
          originalLng = selectedLocation.lng;
        }

        updateLocation(0, {
          ...form.locations[0],
          latitude: snappedLat,
          longitude: snappedLng,
          original_latitude: originalLat,
          original_longitude: originalLng,
          location_snapped: locationSnapped,
          geocode_source: geocodeSource,
          snap_distance_meters: snapDistanceMeters,
        });

        // Reverse geocode the snapped intersection to get cross street names (so label matches pin)
        const geocodeData = await reverseGeocode(snappedLat, snappedLng);
        if (geocodeData) {
          const addressInfo = parseAddressData(geocodeData);
          if (addressInfo) {
            updateLocation(0, {
              ...form.locations[0],
              latitude: snappedLat,
              longitude: snappedLng,
              original_latitude: originalLat,
              original_longitude: originalLng,
              location_snapped: locationSnapped,
              geocode_source: geocodeSource,
              snap_distance_meters: snapDistanceMeters,
              cross_street_1: addressInfo.cross_street_1 || form.locations[0].cross_street_1,
              cross_street_2: addressInfo.cross_street_2 || form.locations[0].cross_street_2,
              city: addressInfo.city || form.locations[0].city,
              state: addressInfo.state || form.locations[0].state,
            });
          }
        }
      };

      autoFillAddress();
    }
  }, [selectedLocation]);

  const addKeyword = () => {
    const trimmed = keywordInput.trim().toLowerCase();
    if (trimmed && !form.keywords.includes(trimmed) && form.keywords.length < 10) {
      setForm({ ...form, keywords: [...form.keywords, trimmed] });
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setForm({ ...form, keywords: form.keywords.filter((k) => k !== kw) });
  };

  const addAmenity = (amenity?: string) => {
    const toAdd = amenity || amenityInput.trim();
    if (toAdd && !form.amenities.includes(toAdd) && form.amenities.length < 20) {
      setForm({ ...form, amenities: [...form.amenities, toAdd] });
      setAmenityInput("");
    }
  };

  const removeAmenity = (amenity: string) => {
    setForm({ ...form, amenities: form.amenities.filter((a) => a !== amenity) });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setForm({ ...form, logo: e.target.files[0] });
    }
  };

  const removeLogo = () => {
    setForm({ ...form, logo: null });
  };

  const handleLocationImageUpload = (locationIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files).slice(0, 3);
      const updatedLocations = form.locations.map((location, index) => 
        index === locationIndex 
          ? { ...location, images: [...location.images, ...newImages].slice(0, 3) }
          : location
      );
      setForm({ ...form, locations: updatedLocations });
    }
  };

  const removeLocationImage = (locationIndex: number, imageIndex: number) => {
    const updatedLocations = form.locations.map((location, index) => 
      index === locationIndex 
        ? { ...location, images: location.images.filter((_, i) => i !== imageIndex) }
        : location
    );
    setForm({ ...form, locations: updatedLocations });
  };

  const addLocation = () => {
    setForm({ ...form, locations: [...form.locations, DEFAULT_LOCATION()] });
  };

  const updateLocation = (index: number, loc: Location) => {
    const locations = [...form.locations];
    locations[index] = loc;
    setForm({ ...form, locations });
  };

  const removeLocation = (index: number) => {
    if (form.locations.length > 1) {
      const locations = form.locations.filter((_, i) => i !== index);
      setForm({ ...form, locations });
    }
  };

  const updateLocationHours = (locationIndex: number, hours: BusinessHours) => {
    const locations = [...form.locations];
    locations[locationIndex] = { ...locations[locationIndex], business_hours: hours };
    setForm({ ...form, locations });
  };

  const updateDayHours = (locationIndex: number, day: string, updates: Partial<DayHours>) => {
    const loc = form.locations[locationIndex];
    const updatedHours = {
      ...loc.business_hours,
      [day]: { ...loc.business_hours[day as keyof BusinessHours] as DayHours, ...updates },
    };
    updateLocationHours(locationIndex, updatedHours as BusinessHours);
  };

  const addHourPeriod = (locationIndex: number, day: string) => {
    const loc = form.locations[locationIndex];
    const dayHours = loc.business_hours[day as keyof BusinessHours] as DayHours;
    const newPeriod = DEFAULT_HOUR_PERIOD();
    updateDayHours(locationIndex, day, {
      periods: [...dayHours.periods, newPeriod],
    });
  };

  const updateHourPeriod = (locationIndex: number, day: string, periodId: string, updates: Partial<HourPeriod>) => {
    const loc = form.locations[locationIndex];
    const dayHours = loc.business_hours[day as keyof BusinessHours] as DayHours;
    const updatedPeriods = dayHours.periods.map(period =>
      period.id === periodId ? { ...period, ...updates } : period
    );
    updateDayHours(locationIndex, day, { periods: updatedPeriods });
  };

  const removeHourPeriod = (locationIndex: number, day: string, periodId: string) => {
    const loc = form.locations[locationIndex];
    const dayHours = loc.business_hours[day as keyof BusinessHours] as DayHours;
    if (dayHours.periods.length > 1) {
      const updatedPeriods = dayHours.periods.filter(period => period.id !== periodId);
      updateDayHours(locationIndex, day, { periods: updatedPeriods });
    }
  };

  // const lookupCoordinatesFromAddress = async (locationIndex: number) => {
  //   const location = form.locations[locationIndex];
  //   if (!location.cross_street_1?.trim() || !location.cross_street_2?.trim() || !location.city?.trim() || !location.state) {
  //     setGeocodeError("Please fill in both cross streets, city, and state first.");
  //     return;
  //   }
  //   setGeocodeError(null);
  //   setGeocodeLookupIndex(locationIndex);
  //   try {
  //     const params = new URLSearchParams({
  //       cross_street_1: location.cross_street_1.trim(),
  //       cross_street_2: location.cross_street_2.trim(),
  //       city: location.city.trim(),
  //       state: location.state,
  //     });
  //     const response = await fetch(`/api/geocode?${params}`);
  //     if (!response.ok) {
  //       const data = await response.json().catch(() => ({}));
  //       throw new Error(data.error || "Could not find coordinates for this address.");
  //     }
  //     const data = await response.json();
  //     updateLocation(locationIndex, {
  //       ...location,
  //       latitude: data.latitude,
  //       longitude: data.longitude,
  //     });
  //   } catch (err: any) {
  //     setGeocodeError(err.message || "Lookup failed.");
  //   } finally {
  //     setGeocodeLookupIndex(null);
  //   }
  // };

  // const scheduleAutoGeocode = (locationIndex: number, loc: Location) => {
  //   if (geocodeTimers.current[locationIndex]) {
  //     clearTimeout(geocodeTimers.current[locationIndex]);
  //   }
  //   // Don't overwrite coordinates that were set from the map
  //   if (loc.latitude && loc.longitude) return;
  //   if (!loc.cross_street_1?.trim() || !loc.cross_street_2?.trim() || !loc.city?.trim() || !loc.state) {
  //     return;
  //   }
  //   setGeocodeError(null);
  //   geocodeTimers.current[locationIndex] = setTimeout(async () => {
  //     setGeocodeLookupIndex(locationIndex);
  //     try {
  //       const params = new URLSearchParams({
  //         cross_street_1: loc.cross_street_1.trim(),
  //         cross_street_2: loc.cross_street_2.trim(),
  //         city: loc.city.trim(),
  //         state: loc.state,
  //       });
  //       const response = await fetch(`/api/geocode?${params}`);
  //       if (!response.ok) {
  //         const data = await response.json().catch(() => ({}));
  //         setGeocodeError(data.error || "Could not find coordinates for this address.");
  //         return;
  //       }
  //       const data = await response.json();
  //       setForm(prev => {
  //         const locations = [...prev.locations];
  //         locations[locationIndex] = { ...locations[locationIndex], latitude: data.latitude, longitude: data.longitude };
  //         return { ...prev, locations };
  //       });
  //     } catch (err: any) {
  //       setGeocodeError(err.message || "Lookup failed.");
  //     } finally {
  //       setGeocodeLookupIndex(null);
  //       delete geocodeTimers.current[locationIndex];
  //     }
  //   }, 800);
  // };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!user) {
        throw new Error("You must be logged in to add a business");
      }

      const token = await user.getIdToken();

      const formData = new FormData();
      
      // Prepare business data with image counts for each location
      const businessDataWithCounts = {
        ...form,
        logo: undefined, // Remove logo from JSON
        locations: form.locations.map(location => ({
          ...location,
          images: undefined, // Remove images from JSON  
          image_count: location.images.length
        }))
      };
      
      formData.append('business', JSON.stringify(businessDataWithCounts));

      if (form.logo) {
        formData.append('logo', form.logo);
      }

      form.locations.forEach(location => {
        location.images.forEach(image => {
          formData.append('location_images', image);
        });
      });

      const response = await fetch("/api/businesses", {
        method: "POST",
        headers: {
          'authtoken': token,
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Submission failed");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div>
        <h1>Business Submitted for Review!</h1>
        <p>
          Thank you for submitting <strong>{form.name}</strong>. Your business listing 
          is now pending approval from our team. You will be notified once it has been reviewed.
        </p>
        {!form.is_owner && (
          <p>
            <strong>Note:</strong> You indicated that you are not the business owner. 
            The actual owner can claim this business later once it's approved.
          </p>
        )}
        <p>
          <button onClick={() => window.location.reload()}>Add Another Business</button>
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div>
        <h1>Login Required</h1>
        <p>You must be logged in to add a business. Please log in and try again.</p>
      </div>
    ); 
  }

  return (
    <div>
      <h1>Add a Business</h1>
      <p>
        Add a business here! All submissions are reviewed before 
        being published. Please note that businesses must be located in the United States.
      </p>
      
      {geolocating && <p><em>Looking up address from map location…</em></p>}

      {error && (
        <div>
          <strong>Error:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        
        <fieldset>
          <legend>Business Information</legend>

          <label>
            Business Name *
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>

          <label>
            Category *
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              required
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              maxLength={1000}
              placeholder="Describe the business..."
            />
          </label>

          <div>
            <strong>Websites</strong>
            {form.websites.map((url, i) => (
              <div key={i}>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => {
                    const updated = [...form.websites];
                    updated[i] = e.target.value;
                    setForm({ ...form, websites: updated });
                  }}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && !/^https?:\/\//i.test(val)) {
                      const updated = [...form.websites];
                      updated[i] = `https://${val}`;
                      setForm({ ...form, websites: updated });
                    }
                  }}
                  pattern="https?://[^\s]+\.[a-zA-Z]{2,}(/[^\s]*)?"
                  title="URL must include a valid suffix (e.g. .com, .co, .org)"
                  placeholder="https://example.com"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, websites: form.websites.filter((_, j) => j !== i) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, websites: [...form.websites, ""] })}
            >
              Add Website
            </button>
          </div>

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="contact@business.com"
            />
          </label>

          <label>
            Are you the business owner? *
            <select
              value={form.is_owner ? "yes" : "no"}
              onChange={(e) => setForm({ ...form, is_owner: e.target.value === "yes" })}
              required
            >
              <option value="">Please select</option>
              <option value="yes">Yes, I own this business</option>
              <option value="no">No, I'm adding it for the community</option>
            </select>
          </label>
          {!form.is_owner && (
            <p>
              <small>
                The business owner can claim this listing later once it's approved.
              </small>
            </p>
          )}

          <label>
            <input
              type="checkbox"
              checked={form.is_chain}
              onChange={(e) => setForm({ ...form, is_chain: e.target.checked })}
            />
            This business has multiple locations
          </label>
        </fieldset>

        <fieldset>
          <legend>Business Logo</legend>
          
          {!form.logo && (
            <label>
              Upload business logo
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
              />
            </label>
          )}

          {form.logo && (
            <div>
              <span>{form.logo.name}</span>
              <button type="button" onClick={removeLogo}>Remove</button>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Keywords (up to 10)</legend>
          <label>
            Add keyword
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="e.g. coffee, breakfast, wifi"
            />
            <button type="button" onClick={addKeyword} disabled={form.keywords.length >= 10}>
              Add Keyword
            </button>
          </label>

          <div>
            {form.keywords.map((kw) => (
              <span key={kw}>
                {kw} <button type="button" onClick={() => removeKeyword(kw)}>×</button>
              </span>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Amenities (up to 20)</legend>
          
          <label>
            Add custom amenity
            <input
              type="text"
              value={amenityInput}
              onChange={(e) => setAmenityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAmenity();
                }
              }}
              placeholder="e.g. Free WiFi, Outdoor Seating"
            />
            <button type="button" onClick={() => addAmenity()} disabled={form.amenities.length >= 20}>
              Add Amenity
            </button>
          </label>

          <div>
            <strong>Common amenities:</strong>
            <p><small>Select all that apply. The more you select, the higher chance of attracting customers.</small></p>
            <div>
              {COMMON_AMENITIES.map((amenity) => (
                <label key={amenity} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginRight: '1rem', marginBottom: '0.4rem' }}>
                  <input
                    type="checkbox"
                    checked={form.amenities.includes(amenity)}
                    onChange={(e) => {
                      if (e.target.checked) addAmenity(amenity);
                      else removeAmenity(amenity);
                    }}
                    disabled={!form.amenities.includes(amenity) && form.amenities.length >= 20}
                  />
                  {amenity}
                </label>
              ))}
            </div>
          </div>

          {form.amenities.filter(a => !COMMON_AMENITIES.includes(a)).length > 0 && (
            <div>
              <strong>Custom amenities:</strong>
              <div>
                {form.amenities.filter(a => !COMMON_AMENITIES.includes(a)).map((amenity) => (
                  <span key={amenity}>
                    {amenity} <button type="button" onClick={() => removeAmenity(amenity)}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Locations</legend>

          {form.locations.map((loc, locationIndex) => (
            <div key={loc.id}>
              <h3>Location {locationIndex + 1}</h3>

              {form.locations.length > 1 && (
                <button type="button" onClick={() => removeLocation(locationIndex)}>
                  Remove This Location
                </button>
              )}

              <label>
                Location Name (If multiple locations)
                <input
                  type="text"
                  value={loc.location_name}
                  onChange={(e) => updateLocation(locationIndex, { ...loc, location_name: e.target.value })}
                  placeholder="e.g. Downtown, North Side"
                />
              </label>

              {loc.latitude && loc.longitude && (
                <div>
                  <div>
                  <strong>Coordinates:</strong> {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                  </div>
                  <div>
                    <strong>We aren't the best at finding the cross streets 😅. Please double-check the street names.
                    Don't worry, it won't change the location on the map! </strong>
                  </div>
                </div>
              )}

              {/* {!loc.latitude && !loc.longitude && (
                <div>
                  {geocodeLookupIndex === locationIndex
                    ? <em>Looking up coordinates…</em>
                    : (
                      <>
                        <em>No coordinates yet. Fill in the address below and coordinates will be looked up automatically.</em>
                        {" "}
                      </>
                    )
                  }
                  {geocodeError && geocodeLookupIndex === null && (
                    <>
                      <span style={{ color: "red", marginLeft: "8px" }}>{geocodeError}</span>
                      {" "}
                      <button
                        type="button"
                        onClick={() => lookupCoordinatesFromAddress(locationIndex)}
                        disabled={geocodeLookupIndex !== null || !loc.cross_street_1?.trim() || !loc.cross_street_2?.trim() || !loc.city?.trim() || !loc.state}
                      >
                        Retry
                      </button>
                    </>
                  )}
                </div>
              )} */}

              <label>
                Cross Street 1 *
                <input
                  type="text"
                  value={loc.cross_street_1}
                  onChange={(e) => {
                    const updated = { ...loc, cross_street_1: e.target.value };
                    updateLocation(locationIndex, updated);
                    // scheduleAutoGeocode(locationIndex, updated);
                  }}
                  required
                  placeholder="e.g. Main St"
                />
              </label>

              <label>
                Cross Street 2 *
                <input
                  type="text"
                  value={loc.cross_street_2}
                  onChange={(e) => {
                    const updated = { ...loc, cross_street_2: e.target.value };
                    updateLocation(locationIndex, updated);
                    // scheduleAutoGeocode(locationIndex, updated);
                  }}
                  required
                  placeholder="e.g. First Ave"
                />
              </label>

              <label>
                City *
                <input
                  type="text"
                  value={loc.city}
                  onChange={(e) => {
                    const updated = { ...loc, city: e.target.value };
                    updateLocation(locationIndex, updated);
                    // scheduleAutoGeocode(locationIndex, updated);
                  }}
                  required
                  placeholder="e.g. Los Angeles"
                />
              </label>

              <label>
                State *
                <select
                  value={loc.state}
                  onChange={(e) => {
                    const updated = { ...loc, state: e.target.value };
                    updateLocation(locationIndex, updated);
                    // scheduleAutoGeocode(locationIndex, updated);
                  }}
                  required
                >
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              <div>
                <strong>Phone Numbers</strong>
                {loc.phones.map((phone, phoneIndex) => (
                  <div key={phoneIndex}>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        const updated = [...loc.phones];
                        updated[phoneIndex] = e.target.value.replace(/\D/g, '');
                        updateLocation(locationIndex, { ...loc, phones: updated });
                      }}
                      pattern="\d{10}"
                      maxLength={10}
                      title="Enter a 10-digit phone number (digits only)"
                      placeholder="5551234567"
                    />
                    <button
                      type="button"
                      onClick={() => updateLocation(locationIndex, { ...loc, phones: loc.phones.filter((_, j) => j !== phoneIndex) })}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateLocation(locationIndex, { ...loc, phones: [...loc.phones, ""] })}
                >
                  Add Phone Number
                </button>
              </div>
 
              <label>
                Location Privacy
                <select
                  value={loc.location_privacy}
                  onChange={(e) => updateLocation(locationIndex, { ...loc, location_privacy: e.target.value as any })}
                >
                  <option value="intersection">Show nearest intersection (recommended for privacy)</option>
                  <option value="exact">Show exact location (where you clicked)</option>
                  <option value="grid">Show general area only</option>
                </select>
              </label>

              <fieldset>
                <legend>Hours for {loc.location_name || `Location ${locationIndex + 1}`}</legend>

                <label>
                  <input
                    type="checkbox"
                    checked={loc.business_hours.always_open}
                    onChange={(e) =>
                      updateLocationHours(locationIndex, { ...loc.business_hours, always_open: e.target.checked })
                    }
                  />
                  Open 24/7
                </label>

                {!loc.business_hours.always_open && (
                  <div>
                    {DAYS.map((day) => {
                      const dayHours = loc.business_hours[day] as DayHours;
                      return (
                        <div key={day}>
                          <h4>{day.charAt(0).toUpperCase() + day.slice(1)}</h4>

                          <label>
                            <input
                              type="checkbox"
                              checked={dayHours.closed}
                              onChange={(e) => updateDayHours(locationIndex, day, { closed: e.target.checked, periods: e.target.checked ? [] : [DEFAULT_HOUR_PERIOD()] })}
                            />
                            Closed
                          </label>

                          {!dayHours.closed && (
                            <>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={dayHours.open_24_hours}
                                  onChange={(e) => updateDayHours(locationIndex, day, { open_24_hours: e.target.checked, periods: e.target.checked ? [] : [DEFAULT_HOUR_PERIOD()] })}
                                />
                                24 hours
                              </label>

                              {!dayHours.open_24_hours && (
                                <div>
                                  {dayHours.periods.map((period, periodIndex) => (
                                    <div key={period.id}>
                                      <strong>Hours {periodIndex + 1}:</strong>
                                      
                                      <label>
                                        Open:
                                        <input
                                          type="time"
                                          value={period.open}
                                          onChange={(e) => updateHourPeriod(locationIndex, day, period.id, { open: e.target.value })}
                                        />
                                      </label>

                                      <label>
                                        Close:
                                        <input
                                          type="time"
                                          value={period.close}
                                          onChange={(e) => updateHourPeriod(locationIndex, day, period.id, { close: e.target.value })}
                                        />
                                      </label>

                                      <label>
                                        <input
                                          type="checkbox"
                                          checked={period.closes_next_day}
                                          onChange={(e) => updateHourPeriod(locationIndex, day, period.id, { closes_next_day: e.target.checked })}
                                        />
                                        Closes next day (e.g. closes at 2 AM)
                                      </label>

                                      {dayHours.periods.length > 1 && (
                                        <button 
                                          type="button" 
                                          onClick={() => removeHourPeriod(locationIndex, day, period.id)}
                                        >
                                          Remove these hours
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  
                                  <button 
                                    type="button" 
                                    onClick={() => addHourPeriod(locationIndex, day)}
                                  >
                                    Add another set of hours for {day.charAt(0).toUpperCase() + day.slice(1)}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend>Location Images (up to 3)</legend>
                
                {loc.images.length < 3 && (
                  <label>
                    Upload images for this location
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleLocationImageUpload(locationIndex, e)}
                    />
                  </label>
                )}

                <div>
                  {loc.images.map((image, imageIndex) => (
                    <div key={imageIndex}>
                      <span>{image.name}</span>
                      <button 
                        type="button" 
                        onClick={() => removeLocationImage(locationIndex, imageIndex)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
          ))}

          {form.is_chain && (
            <button type="button" onClick={addLocation}>
              Add Another Location
            </button>
          )}
        </fieldset>

        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Business for Review"}
        </button>
      </form>
    </div>
  );
}