import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import useUser from "../src/useUser";

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

type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type BusinessHours = { always_open: boolean; weekly_hours_on_website: boolean } & Record<DayIndex, DayHours>;

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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

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
  weekly_hours_on_website: false,
  0: { closed: true, open_24_hours: false, periods: [] },                 // Sunday
  1: DEFAULT_DAY_HOURS(),                                                  // Monday
  2: DEFAULT_DAY_HOURS(),                                                  // Tuesday
  3: DEFAULT_DAY_HOURS(),                                                  // Wednesday
  4: DEFAULT_DAY_HOURS(),                                                  // Thursday
  5: DEFAULT_DAY_HOURS(),                                                  // Friday
  6: { closed: false, open_24_hours: false, periods: [{ id: crypto.randomUUID(), open: "10:00", close: "15:00", closes_next_day: false }] }, // Saturday
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

const COMMON_AMENITIES = {
  "Business Types": [
    "Home Based", "Sidewalk Based", "Food Truck", "Farmer's Market", "Pop Ups", "Catering", "Private Events", "Farmer's Market Only"
  ],
  "Ordering Methods": [
    "DM To Order", "Text To Order", "Call To Order", "Order Online", "Walk-Up Orders", "Order Ahead", "Pre-Order Required", "No Walk-Ins", "Time-Slot Reservations"
  ],
  "Payment Options": [
    "Cash Only", "Cash Preferred", "Tap To Pay", "Credit Cards", "Cash App", "Zelle", "Venmo"
  ],
  "Dietary Options": [
    "Vegan Options", "Vegetarian Options", "Gluten-Free Options", "Halal Options", "Kosher Options", "Locally Sourced Ingredients", "Organic Options"
  ],
  "Accessibility": [
    "Curbside Pickup", "Delivery", "US Shipping", "International Shipping", "Street Parking", "Parking Lot", "Wheelchair Accessible", "Outdoor Seating", "Restrooms"
  ]
};

const ALL_COMMON_AMENITIES = Object.values(COMMON_AMENITIES).flat();

export default function AddBusiness() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [websiteInput, setWebsiteInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outsideUS, setOutsideUS] = useState(false);


  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng")



  useEffect(() => {
    if (lat && lng) {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);

      if (!Number.isNaN(parsedLat) && !Number.isNaN(parsedLng)) {
        fetch(`/api/locations/validate-location?lat=${parsedLat}&lng=${parsedLng}`)
          .then(response => response.json())
          .then(data => {
            if (!data.valid) {
              setOutsideUS(true);
            }
          })
          .catch((error) => {
            console.warn('Location validation failed:', error);
          });
      }
    }
  }, [lat, lng]);



  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
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
    
    return { lat: parsedLat, lng: parsedLng };
  }, [searchParams]);

  useEffect(() => {
    if (!selectedLocation) {
      navigate('/', { replace: true });
    }
  }, [selectedLocation, navigate]);

  useEffect(() => {
    if (selectedLocation && form.locations.length > 0 && !form.locations[0].latitude) {
      const autoFillAddress = async () => {
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

  const addWebsite = () => {
    let website = websiteInput.trim();
    if (website && !form.websites.includes(website)) {
      if (!/^https?:\/\//i.test(website)) {
        website = `https://${website}`;
      }
      setForm({ ...form, websites: [...form.websites, website] });
      setWebsiteInput("");
    }
  };

  const removeWebsite = (index: number) => {
    setForm({ ...form, websites: form.websites.filter((_, i) => i !== index) });
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

  const updateLocationHours = (locationIndex: number, hours: BusinessHours) => {
    const locations = [...form.locations];
    locations[locationIndex] = { ...locations[locationIndex], business_hours: hours };
    setForm({ ...form, locations });
  };

  const updateDayHours = (locationIndex: number, day: DayIndex, updates: Partial<DayHours>) => {
    const loc = form.locations[locationIndex];
    const updatedHours = {
      ...loc.business_hours,
      [day]: { ...loc.business_hours[day], ...updates },
    };
    updateLocationHours(locationIndex, updatedHours as BusinessHours);
  };

  const addHourPeriod = (locationIndex: number, day: DayIndex) => {
    const loc = form.locations[locationIndex];
    const dayHours = loc.business_hours[day];
    const newPeriod = DEFAULT_HOUR_PERIOD();
    updateDayHours(locationIndex, day, {
      periods: [...dayHours.periods, newPeriod],
    });
  };

  const updateHourPeriod = (locationIndex: number, day: DayIndex, periodId: string, updates: Partial<HourPeriod>) => {
    const loc = form.locations[locationIndex];
    const dayHours = loc.business_hours[day];
    const updatedPeriods = dayHours.periods.map(period =>
      period.id === periodId ? { ...period, ...updates } : period
    );
    updateDayHours(locationIndex, day, { periods: updatedPeriods });
  };

  const removeHourPeriod = (locationIndex: number, day: DayIndex, periodId: string) => {
    const loc = form.locations[locationIndex];
    const dayHours = loc.business_hours[day];
    if (dayHours.periods.length > 1) {
      const updatedPeriods = dayHours.periods.filter(period => period.id !== periodId);
      updateDayHours(locationIndex, day, { periods: updatedPeriods });
    }
  };

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

  if (outsideUS) {
    return (
      <div>
        <h1>Location Outside the United States</h1>
        <p>The selected location is outside the United States. VendorMap only supports businesses located within the US.</p>
        <p><a href="/">Go back to the map</a> and select a location within the United States.</p>
      </div>
    );
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
            
            <label>
              Add website URL
              <input
                type="url"
                value={websiteInput}
                onChange={(e) => setWebsiteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addWebsite();
                  }
                }}
                placeholder="https://example.com"
              />
              <button type="button" onClick={addWebsite}>
                Add Another Website
              </button>
            </label>

            {form.websites.length > 0 && (
              <div>
                <strong>Current websites:</strong>
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
                    />
                    <button
                      type="button"
                      onClick={() => removeWebsite(i)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
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
            <div className="amenity-sections">
              {Object.entries(COMMON_AMENITIES).map(([sectionName, amenities]) => (
                <div key={sectionName} className="amenity-section">
                  <div className="amenity-section-header">{sectionName}</div>
                  <div className="amenity-section-grid">
                    {amenities.map((amenity) => {
                      const isChecked = form.amenities.includes(amenity);
                      const isDisabled = !isChecked && form.amenities.length >= 20;
                      return (
                        <label 
                          key={amenity} 
                          className={`amenity-checkbox-item ${
                            isChecked ? 'checked' : ''
                          } ${
                            isDisabled ? 'disabled' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) addAmenity(amenity);
                              else removeAmenity(amenity);
                            }}
                            disabled={isDisabled}
                          />
                          <span>{amenity}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {form.amenities.filter(a => !ALL_COMMON_AMENITIES.includes(a)).length > 0 && (
            <div>
              <strong>Custom amenities:</strong>
              <div>
                {form.amenities.filter(a => !ALL_COMMON_AMENITIES.includes(a)).map((amenity) => (
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

              <label>
                Cross Street 1 *
                <input
                  type="text"
                  value={loc.cross_street_1}
                  onChange={(e) => {
                    const updated = { ...loc, cross_street_1: e.target.value };
                    updateLocation(locationIndex, updated);
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
 
              {form.is_owner && (
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
              )}

              <fieldset>
                <legend>Hours for {loc.location_name || `Location ${locationIndex + 1}`}</legend>
                
                <div className="hours-form">
                  <div className="hours-form-header">
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
                    
                    <label>
                      <input
                        type="checkbox"
                        checked={loc.business_hours.weekly_hours_on_website}
                        onChange={(e) =>
                          updateLocationHours(locationIndex, { ...loc.business_hours, weekly_hours_on_website: e.target.checked })
                        }
                      />
                       Hours posted weekly on website
                    </label>
                  </div>

                  {!loc.business_hours.always_open && (
                    <div className="days-grid">
                      {DAYS.map((day) => {
                        const dayHours = loc.business_hours[day] as DayHours;
                        return (
                          <div key={day} className="day-hours-container">
                            <div className="day-header">{DAY_NAMES[day]}</div>

                            <div className="day-controls">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={dayHours.closed}
                                  onChange={(e) => updateDayHours(locationIndex, day, { closed: e.target.checked, periods: e.target.checked ? [] : [DEFAULT_HOUR_PERIOD()] })}
                                />
                                Closed
                              </label>

                              {!dayHours.closed && (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={dayHours.open_24_hours}
                                    onChange={(e) => updateDayHours(locationIndex, day, { open_24_hours: e.target.checked, periods: e.target.checked ? [] : [DEFAULT_HOUR_PERIOD()] })}
                                  />
                                  24 hours
                                </label>
                              )}
                            </div>

                            {!dayHours.closed && !dayHours.open_24_hours && (
                              <div className="time-periods">
                                {dayHours.periods.map((period, periodIndex) => (
                                  <div key={period.id} className="hour-period">
                                    {dayHours.periods.length > 1 && (
                                      <div className="period-header">Hours {periodIndex + 1}</div>
                                    )}
                                    
                                    <div className="time-inputs-group">
                                      <div className="time-input-wrapper">
                                        <div className="time-input-label">Open</div>
                                        <input
                                          className="time-input"
                                          type="time"
                                          value={period.open}
                                          onChange={(e) => updateHourPeriod(locationIndex, day, period.id, { open: e.target.value })}
                                        />
                                      </div>

                                      <div className="time-input-wrapper">
                                        <div className="time-input-label">Close</div>
                                        <input
                                          className="time-input"
                                          type="time"
                                          value={period.close}
                                          onChange={(e) => updateHourPeriod(locationIndex, day, period.id, { close: e.target.value })}
                                        />
                                      </div>
                                    </div>

                                    <div className="closes-next-day">
                                      <input
                                        type="checkbox"
                                        checked={period.closes_next_day}
                                        onChange={(e) => updateHourPeriod(locationIndex, day, period.id, { closes_next_day: e.target.checked })}
                                      />
                                      <span>Closes next day (e.g. closes at 2 AM)</span>
                                    </div>

                                    {dayHours.periods.length > 1 && (
                                      <div className="period-actions">
                                        <button 
                                          type="button" 
                                          onClick={() => removeHourPeriod(locationIndex, day, period.id)}
                                        >
                                          Remove these hours
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                
                                <button 
                                  type="button" 
                                  className="add-period-btn"
                                  onClick={() => addHourPeriod(locationIndex, day)}
                                >
                                  Add another set of hours for {DAY_NAMES[day]}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
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
              Add Another Location for this Business
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