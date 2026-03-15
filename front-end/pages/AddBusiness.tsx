import { useState, useEffect, type FormEvent } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import useUser from "../src/useUser";
import { generateUUID, capitalizeWords, configureLeafletDefaultIcon, normalize, API_BASE } from "../src/utils";
import { US_STATES } from "../src/constants";
import { HoursEditor } from "../src/components/HoursEditor";
import type { BusinessHours } from "../src/components/HoursEditor";
import { AmenitiesEditor } from "../src/components/AmenitiesEditor";

configureLeafletDefaultIcon();

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], 16); }, [lat, lng, map]);
  return null;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface GeocodeResponse {
  latitude: number;
  longitude: number;
  approximate?: boolean;
  city?: string;
  zip?: string;
  error?: string;
}

interface ApiErrorResponse {
  error?: string;
}

interface Location {
  id: string;
  location_name: string;
  cross_street_1: string;
  cross_street_2: string;
  city: string;
  state: string;
  zip?: string;
  latitude: number | null;
  longitude: number | null;
  phones: string[];
  location_privacy: "exact" | "intersection" | "grid";
  approximate?: boolean;
  always_open: boolean;
  weekly_hours_on_website: boolean;
  subject_to_change: boolean;
  business_hours: BusinessHours | null;
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

const DEFAULT_LOCATION = (): Location => ({
  id: generateUUID(),
  location_name: "",
  cross_street_1: "",
  cross_street_2: "",
  city: "",
  state: "",
  latitude: null,
  longitude: null,
  phones: [],
  location_privacy: "intersection",
  always_open: false,
  weekly_hours_on_website: false,
  subject_to_change: false,
  business_hours: null,
  images: [],
});

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Business Info", "Location", "Hours", "Details"];

export default function AddBusiness() {
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
  const [websiteInput, setWebsiteInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [geocodingIndex, setGeocodingIndex] = useState<number | null>(null);
  const [geocodeErrors, setGeocodeErrors] = useState<Record<number, string>>({});
  const [geocodeAttempts, setGeocodeAttempts] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<number>(1);

  useEffect(() => {
    fetch(`${API_BASE}/api/categories`)
      .then((res) => res.json() as Promise<Category[]>)
      .then(setCategories)
      .catch(console.error);
  }, []);

  const addKeyword = () => {
    const trimmed = normalize(keywordInput);
    if (trimmed && !form.keywords.includes(trimmed) && form.keywords.length < 10) {
      setForm({ ...form, keywords: [...form.keywords, trimmed] });
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setForm({ ...form, keywords: form.keywords.filter((k) => k !== kw) });
  };

  const addAmenity = (amenity: string) => {
    if (amenity && !form.amenities.includes(amenity) && form.amenities.length < 20) {
      setForm({ ...form, amenities: [...form.amenities, amenity] });
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

  const updateLocation = (index: number, loc: Location) => {
    setForm(prev => {
      const locations = [...prev.locations];
      locations[index] = loc;
      return { ...prev, locations };
    });
  };

  const geocodeLocation = async (locationIndex: number, loc: Location) => {
    // Can geocode with either: all 4 fields OR just cross streets + state (will auto-populate city)
    const hasCrossStreetsAndState = loc.cross_street_1.trim() && loc.cross_street_2.trim() && loc.state;
    const hasCity = loc.city.trim();
    
    if (!hasCrossStreetsAndState) return;
    
    setGeocodingIndex(locationIndex);
    setGeocodeErrors((prev) => { const next = { ...prev }; delete next[locationIndex]; return next; });
    setGeocodeAttempts((prev) => ({ ...prev, [locationIndex]: (prev[locationIndex] ?? 0) + 1 }));
    try {
      const params = new URLSearchParams({
        cross_street_1: loc.cross_street_1.trim(),
        cross_street_2: loc.cross_street_2.trim(),
        state: loc.state,
      });
      
      // Only include city if it's provided
      if (hasCity) {
        params.set('city', loc.city.trim());
      }
      if (loc.zip?.trim()) {
        params.set('zip', loc.zip.trim());
      }
      
      const res = await fetch(`${API_BASE}/api/geocode?${params}`);
      const data = await res.json() as GeocodeResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not find location");
      
      // Update location with coordinates and city (if city was auto-populated)
      const updates: Partial<Location> = {
        latitude: data.latitude,
        longitude: data.longitude,
        approximate: data.approximate ?? false,
      };
      
      // If we got a city back from geocoding and current city is empty, auto-populate it
      if (data.city && !hasCity) {
        updates.city = data.city;
      }
      // Auto-populate zip if not already set
      if (data.zip && !loc.zip?.trim()) {
        updates.zip = data.zip;
      }
      
      updateLocation(locationIndex, { ...loc, ...updates });
    } catch (err: unknown) {
      updateLocation(locationIndex, { ...loc, latitude: null, longitude: null });
      setGeocodeErrors((prev) => ({ ...prev, [locationIndex]: err instanceof Error ? err.message : "Geocoding failed" }));
    } finally {
      setGeocodingIndex(null);
    }
  };

  const MAX_GEOCODE_ATTEMPTS = 1;

  // Reset attempt counter when the user changes address fields
  const locationAddressKey = form.locations
    .map((l) => `${l.cross_street_1}|${l.cross_street_2}|${l.state}|${l.zip ?? ''}`)
    .join(';');
  useEffect(() => {
    setGeocodeAttempts({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationAddressKey]);

  // Auto-geocode each location when cross streets + state are filled (debounced)
  useEffect(() => {
    if (step !== 2) return;
    const timers = form.locations.map((loc, i) => {
      if (!loc.cross_street_1.trim() || !loc.cross_street_2.trim() || !loc.state) return null;
      if ((geocodeAttempts[i] ?? 0) >= MAX_GEOCODE_ATTEMPTS) return null;
      return setTimeout(() => geocodeLocation(i, loc), 600);
    });
    return () => { timers.forEach((t) => t && clearTimeout(t)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, locationAddressKey, geocodeAttempts]);

  const validateStep = (step: number): string | null => {
    if (step === 1) {
      if (!form.name.trim()) return "Business name is required.";
      if (!form.category_id) return "Please select a category.";
    }
    if (step === 2) {
      for (let i = 0; i < form.locations.length; i++) {
        const loc = form.locations[i];
        if (!loc.cross_street_1.trim()) return "Cross Street 1 is required.";
        if (!loc.cross_street_2.trim()) return "Cross Street 2 is required.";
        if (!loc.state) return "State is required.";
        if (geocodingIndex === i) return "Still finding coordinates. Please wait.";
        if (!loc.latitude || !loc.longitude) return "Could not find map coordinates. Please check the cross streets and state.";
      }
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo(0, 0);
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo(0, 0);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!user) {
        throw new Error("You must be logged in to add a business");
      }

      const token = await user.getIdToken();

      const formData = new FormData();

      const businessDataWithCounts = {
        ...form,
        logo: undefined,
        locations: form.locations.map(location => ({
          ...location,
          images: undefined,
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

      const response = await fetch(`${API_BASE}/api/businesses`, {
        method: "POST",
        headers: {
          'authtoken': token,
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json() as ApiErrorResponse;
        throw new Error(err.error ?? "Submission failed");
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
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
          is now pending approval from our team.
          {form.is_owner && (
            <> Additionally, your ownership claim will be reviewed separately after the business is approved.</>
          )}
          {' '}You will be notified once it has been reviewed.
        </p>
        {!form.is_owner && (
          <p>
            <strong>Note:</strong> You indicated that you are not the business owner.
            The actual owner can claim this business later once it's approved.
          </p>
        )}
        <p>
          <button onClick={() => window.location.href = '/add-business'}>Add Another Business</button>
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
    <div className="wizard-container">
      <div className="wizard-scroll-area">
        <h1>Add a Business</h1>

        {/* Step indicator */}
        <div className="wizard-steps">
          {STEP_LABELS.map((label, i) => (
            <div
              key={i}
              className={`wizard-step${step === i + 1 ? " active" : ""}${step > i + 1 ? " completed" : ""}`}
            >
              <div className="wizard-step-number">{step > i + 1 ? "✓" : i + 1}</div>
              <div className="wizard-step-label">{label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="wizard-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        <form id="wizard-form" onSubmit={handleSubmit}>
          {step === 1 && (
            <>
              {/* Step 1: Business Info */}
              <fieldset>
                <legend>Business Information</legend>

                <label>
                  Business Name *
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>

                <label>
                  Category *
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  >
                    <option value="">Select a category</option>
                    {[...categories]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </label>

                <fieldset>
                  <legend>Business Logo</legend>
                  {!form.logo ? (
                    <label>
                      Upload business logo. Other photos can be uploaded on details step.
                      <input type="file" accept="image/*" onChange={handleLogoUpload} />
                    </label>
                  ) : (
                    <div>
                      <span>{form.logo.name}</span>
                      <button type="button" onClick={removeLogo}>Remove</button>
                    </div>
                  )}
                </fieldset>

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
                  <strong>Websites</strong> <br />
                  <small>For social media use website/username (e.g., instagram.com/username)</small>

                  <div className="add-field-row">
                    
                    <input
                      type="url"
                      value={websiteInput}
                      onChange={(e) => setWebsiteInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWebsite(); } }}
                      placeholder="https://example.com"
                    />
                    <button type="button" onClick={addWebsite} className={websiteInput.trim() ? 'btn-ready' : ''}>Add Website</button>
                  </div>
                  {form.websites.length > 0 && (
                    <div>
                      {form.websites.map((url, i) => (
                        <div key={i} className="add-field-row">
                          <input
                            type="url"
                            value={url}
                            onChange={(e) => { const u = [...form.websites]; u[i] = e.target.value; setForm({ ...form, websites: u }); }}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v && !/^https?:\/\//i.test(v)) { const u = [...form.websites]; u[i] = `https://${v}`; setForm({ ...form, websites: u }); } }}
                            pattern="https?://[^\s]+\.[a-zA-Z]{2,}(/[^\s]*)?"
                            title="URL must include a valid suffix (e.g. .com, .co, .org)"
                          />
                          <button type="button" onClick={() => removeWebsite(i)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <strong>Email</strong>
                  {form.email ? (
                    <div className="add-field-row">
                      <input
                        type="email"
                        value={form.email}
                        readOnly
                      />
                      <button type="button" onClick={() => { setEmailInput(form.email); setForm({ ...form, email: '' }); }}>Remove</button>
                    </div>
                  ) : (
                    <div className="add-field-row">
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (emailInput.trim()) { setForm({ ...form, email: emailInput.trim() }); setEmailInput(''); } } }}
                        placeholder="contact@business.com"
                      />
                      <button
                        type="button"
                        onClick={() => { if (emailInput.trim()) { setForm({ ...form, email: emailInput.trim() }); setEmailInput(''); } }}
                        className={emailInput.trim() ? 'btn-ready' : ''}
                      >Add Email</button>
                    </div>
                  )}
                </div>

                <div>
                  <strong>Phone Numbers</strong>
                  {form.locations[0].phones.map((phone, phoneIndex) => (
                    <div key={phoneIndex} className="add-field-row">
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                          const updated = [...form.locations[0].phones];
                          updated[phoneIndex] = e.target.value.replace(/\D/g, '');
                          updateLocation(0, { ...form.locations[0], phones: updated });
                        }}
                        pattern="\d{10}"
                        maxLength={10}
                        title="Enter a 10-digit phone number (digits only)"
                        placeholder="5551234567"
                      />
                      <button
                        type="button"
                        onClick={() => updateLocation(0, { ...form.locations[0], phones: form.locations[0].phones.filter((_, j) => j !== phoneIndex) })}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="add-field-row">
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (phoneInput.trim()) { updateLocation(0, { ...form.locations[0], phones: [...form.locations[0].phones, phoneInput.trim()] }); setPhoneInput(''); } } }}
                      maxLength={10}
                      placeholder="5551234567"
                    />
                    <button
                      type="button"
                      onClick={() => { if (phoneInput.trim()) { updateLocation(0, { ...form.locations[0], phones: [...form.locations[0].phones, phoneInput.trim()] }); setPhoneInput(''); } }}
                      className={phoneInput.trim() ? 'btn-ready' : ''}
                    >
                      Add Phone Number
                    </button>
                  </div>
                </div>

                <label>
                  Are you the business owner? *
                  <select
                    value={form.is_owner ? "yes" : "no"}
                    onChange={(e) => setForm({ ...form, is_owner: e.target.value === "yes" })}
                  >
                    <option value="">Please select</option>
                    <option value="yes">Yes, I own this business</option>
                    <option value="no">No, I'm adding it for the community</option>
                  </select>
                </label>
                {form.is_owner && (
                  <p><small>Your ownership claim will be reviewed by our team after the business is approved.</small></p>
                )}
                {!form.is_owner && (
                  <p><small>The business owner can claim this listing later once it's approved.</small></p>
                )}
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              {/* Step 2: Location */}
              <fieldset>
                <legend>Location</legend>
                <small>Please provide the main cross streets. We are currently not able to find small streets accurately.</small>

                {form.locations.map((loc, locationIndex) => (
                  <div key={loc.id} className="wizard-location-block">
                    <label>
                      Cross Street 1 *
                      <input
                        type="text"
                        value={loc.cross_street_1}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, cross_street_1: capitalizeWords(e.target.value) })}
                        placeholder="e.g. Main St"
                      />
                    </label>

                    <label>
                      Cross Street 2 *
                      <input
                        type="text"
                        value={loc.cross_street_2}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, cross_street_2: capitalizeWords(e.target.value) })}
                        placeholder="e.g. First Ave"
                      />
                    </label>

                    <label>
                      City
                      <input
                        type="text"
                        value={loc.city}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, city: capitalizeWords(e.target.value) })}
                        placeholder="You can add the zip code instead if you are not sure of the city."
                      />
                    </label>

                    <label>
                      State *
                      <select
                        value={loc.state}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, state: e.target.value })}
                      >
                        <option value="">Select state</option>
                        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>

                    <label>
                      Zip Code
                      <input
                        type="text"
                        value={loc.zip ?? ''}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                        placeholder="e.g. 90210"
                        maxLength={5}
                        inputMode="numeric"
                      />
                      <small style={{ color: '#666', fontSize: '0.9em' }}>
                        Helps find small streets more accurately
                      </small>
                    </label>

                    <div className="wizard-geocode-section">
                      <div className="wizard-map-preview">
                        <MapContainer
                          center={[39.5, -98.35]}
                          zoom={loc.latitude && loc.longitude ? 16 : 4}
                          style={{ height: "250px", width: "100%" }}
                          scrollWheelZoom={false}
                          attributionControl={false}
                        >
                          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" subdomains="abcd" />
                          {loc.latitude && loc.longitude && (
                            <>
                              <Marker position={[loc.latitude, loc.longitude]} />
                              <MapRecenter lat={loc.latitude} lng={loc.longitude} />
                            </>
                          )}
                        </MapContainer>
                      </div>
                      {geocodingIndex === locationIndex && <p>Finding location...</p>}
                      {geocodeErrors[locationIndex] && (
                        <p className="wizard-geocode-error">
                          {(geocodeAttempts[locationIndex] ?? 0) >= MAX_GEOCODE_ATTEMPTS
                            ? "Could not find this intersection after several attempts. Please double-check the street names, city, state, or try adding a zip code."
                            : geocodeErrors[locationIndex]}
                        </p>
                      )}
                      {loc.latitude && loc.longitude && (
                        loc.approximate ? (
                          <p className="wizard-geocode-error">
                            Could not find that exact intersection — showing an approximate location on {loc.cross_street_1}. Double-check the street names and try again, or proceed if this looks close enough.
                          </p>
                        ) : (
                          <p className="wizard-geocode-success">
                            Business will be shown here. <br /> For privacy and safety concerns, the exact location won't be shown on the map.
                          </p>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </fieldset>
            </>
          )}

          {step === 3 && (
            <>
              {/* Step 3: Hours */}
              {form.locations.map((loc, locationIndex) => (
                <fieldset key={loc.id}>
                  <legend>Hours</legend>
                  <HoursEditor
                    hours={loc.business_hours}
                    flags={{ always_open: loc.always_open, weekly_hours_on_website: loc.weekly_hours_on_website, subject_to_change: loc.subject_to_change }}
                    onChange={(h) => updateLocation(locationIndex, { ...loc, business_hours: h })}
                    onFlagsChange={(f) => updateLocation(locationIndex, { ...loc, ...f })}
                  />
                </fieldset>
              ))}
            </>
          )}

          {step === 4 && (
            <>
              {/* Step 4: Amenities, Keywords, Photos */}
              <fieldset>
                <legend>Amenities (up to 20)</legend>
                <p><small>Select all that apply. The more you select, the higher chance of attracting customers.</small></p>
                <AmenitiesEditor
                  amenities={form.amenities}
                  onAdd={addAmenity}
                  onRemove={removeAmenity}
                  maxCount={20}
                />
              </fieldset>

              <fieldset>
                <legend>Keywords (up to 10)</legend>
                <label>
                  Add keywords. This is what people will search for, so include menu items, services, vibe, etc.
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
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

              {form.locations.map((loc, locationIndex) => (
                <fieldset key={loc.id}>
                  <legend>
                    Photos for this Location (up to 3)
                  </legend>
                  {loc.images.length < 3 && (
                    <label>
                      Upload images
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
                        <button type="button" onClick={() => removeLocationImage(locationIndex, imageIndex)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
            </>
          )}
        </form>
      </div>

      {/* Navigation */}
      <div className="wizard-nav">
        {step > 1 && (
          <button type="button" className="wizard-back-btn" onClick={goBack}>
            ← Back
          </button>
        )}
        {step < TOTAL_STEPS ? (
          <button key="next" type="button" className="wizard-next-btn" onClick={goNext}>
            Next →
          </button>
        ) : (
          <button key="submit" type="submit" form="wizard-form" className="wizard-submit-btn" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Business for Review"}
          </button>
        )}
      </div>
    </div>
  );
}
