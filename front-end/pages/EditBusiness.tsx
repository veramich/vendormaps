import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import useUser from "../src/useUser";

interface LocationPhoto {
  id: string;
  photo_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  display_order: number;
  is_primary: boolean;
  moderation_status: 'pending' | 'approved';
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
type BusinessHours = { always_open: boolean } & Record<DayIndex, DayHours>;

interface EditLocation {
  location_id: string;
  location_name: string;
  cross_street_1: string;
  cross_street_2: string;
  city: string;
  state: string;
  phones: string[];
  location_privacy: "exact" | "intersection" | "grid";
  business_hours: BusinessHours;
}

interface EditForm {
  name: string;
  category_id: string;
  description: string;
  websites: string[];
  email: string;
  keywords: string[];
  amenities: string[];
  is_chain: boolean;
  locations: EditLocation[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const DEFAULT_HOUR_PERIOD = (): HourPeriod => ({
  id: crypto.randomUUID(),
  open: "09:00",
  close: "17:00",
  closes_next_day: false,
});

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY",
];

const COMMON_AMENITIES = [
  "Home Based", "Sidewalk Based", "Food Truck", "Farmer's Market", "Pop Ups", "Catering", "Private Events", "Farmer's Market Only", "Pop Up Only", "Catering Only",
  "DM To Order", "Text To Order", "Call To Order", "Order Online", "Walk-Up Orders", "Order Ahead", "Pre-Order Required", "No Walk-Ins", "Time-Slot Reservations",
  "Cash Only", "Cash Preferred", "Tap To Pay", "Credit Cards", "Cash App", "Zelle", "Venmo", "PayPal", "Apple Cash", "Google Pay", "Samsung Pay",
  "Pickup", "Curbside Pickup", "Delivery", "Shipping", "US Shipping", "International Shipping", "Street Parking", "Parking Lot", "Wheelchair Accessible", "Outdoor Seating", "Restrooms",
  "Vegan Options", "Vegetarian Options", "Gluten-Free Options", "Halal Options", "Kosher Options", "Locally Sourced Ingredients", "Organic Options", "Late Night"
];

interface Category {
  id: number;
  name: string;
  icon: string;
}

export default function EditBusiness() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading } = useUser();

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<EditForm | null>(null);
  const [isVerifiedOwner, setIsVerifiedOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [amenityInput, setAmenityInput] = useState("");
  const [locationPhotos, setLocationPhotos] = useState<Record<string, LocationPhoto[]>>({});
  const [captionInputs, setCaptionInputs] = useState<Record<string, string>>({});
  const [photoUploading, setPhotoUploading] = useState<Record<string, boolean>>({});
  const [photoErrors, setPhotoErrors] = useState<Record<string, string | null>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [businessData, setBusinessData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then(setCategories)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!user || !id) return;
    const fetchData = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/businesses/${id}/edit-data`, {
          headers: { authtoken: token, Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || "Failed to load business data.");
          return;
        }
        const data = await res.json();
        setIsVerifiedOwner(data.isVerifiedOwner);
        setBusinessData(data); // Store the full business data
        setForm({
          name: data.name || "",
          category_id: String(data.category_id || ""),
          description: data.description || "",
          websites: Array.isArray(data.websites) ? data.websites : [],
          email: data.email || "",
          keywords: Array.isArray(data.keywords) ? data.keywords : [],
          amenities: Array.isArray(data.amenities) ? data.amenities : [],
          is_chain: data.is_chain || false,
          locations: (data.locations || []).map((loc: any) => ({
            location_id: loc.location_id,
            location_name: loc.location_name || "",
            cross_street_1: loc.cross_street_1 || "",
            cross_street_2: loc.cross_street_2 || "",
            city: loc.city || "",
            state: loc.state || "",
            phones: Array.isArray(loc.phones) ? loc.phones : [],
            location_privacy: loc.location_privacy || "intersection",
            business_hours: loc.business_hours,
          })),
        });
        const photos: Record<string, LocationPhoto[]> = {};
        for (const loc of data.locations || []) {
          photos[loc.location_id] = loc.photos || [];
        }
        setLocationPhotos(photos);
      } catch {
        setError("Failed to load business data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, id]);

  const updateLocation = (index: number, loc: EditLocation) => {
    if (!form) return;
    const locations = [...form.locations];
    locations[index] = loc;
    setForm({ ...form, locations });
  };

  const updateLocationHours = (locationIndex: number, hours: BusinessHours) => {
    if (!form) return;
    const locations = [...form.locations];
    locations[locationIndex] = { ...locations[locationIndex], business_hours: hours };
    setForm({ ...form, locations });
  };

  const updateDayHours = (locationIndex: number, day: DayIndex, updates: Partial<DayHours>) => {
    if (!form) return;
    const loc = form.locations[locationIndex];
    const updatedHours = { ...loc.business_hours, [day]: { ...loc.business_hours[day], ...updates } };
    updateLocationHours(locationIndex, updatedHours as BusinessHours);
  };

  const addHourPeriod = (locationIndex: number, day: DayIndex) => {
    if (!form) return;
    const dayHours = form.locations[locationIndex].business_hours[day];
    updateDayHours(locationIndex, day, { periods: [...dayHours.periods, DEFAULT_HOUR_PERIOD()] });
  };

  const updateHourPeriod = (locationIndex: number, day: DayIndex, periodId: string, updates: Partial<HourPeriod>) => {
    if (!form) return;
    const dayHours = form.locations[locationIndex].business_hours[day];
    updateDayHours(locationIndex, day, {
      periods: dayHours.periods.map(p => p.id === periodId ? { ...p, ...updates } : p),
    });
  };

  const removeHourPeriod = (locationIndex: number, day: DayIndex, periodId: string) => {
    if (!form) return;
    const dayHours = form.locations[locationIndex].business_hours[day];
    if (dayHours.periods.length > 1) {
      updateDayHours(locationIndex, day, { periods: dayHours.periods.filter(p => p.id !== periodId) });
    }
  };

  const addKeyword = () => {
    if (!form) return;
    const trimmed = keywordInput.trim().toLowerCase();
    if (trimmed && !form.keywords.includes(trimmed) && form.keywords.length < 10) {
      setForm({ ...form, keywords: [...form.keywords, trimmed] });
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    if (!form) return;
    setForm({ ...form, keywords: form.keywords.filter((k) => k !== kw) });
  };

  const addAmenity = (amenity?: string) => {
    if (!form) return;
    const toAdd = amenity || amenityInput.trim();
    if (toAdd && !form.amenities.includes(toAdd) && form.amenities.length < 20) {
      setForm({ ...form, amenities: [...form.amenities, toAdd] });
      setAmenityInput("");
    }
  };

  const removeAmenity = (amenity: string) => {
    if (!form) return;
    setForm({ ...form, amenities: form.amenities.filter((a) => a !== amenity) });
  };

  const uploadPhoto = async (locationId: string, file: File) => {
    if (!user) return;
    setPhotoUploading(prev => ({ ...prev, [locationId]: true }));
    setPhotoErrors(prev => ({ ...prev, [locationId]: null }));
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('photo', file);
      const caption = captionInputs[locationId]?.trim() || '';
      if (caption) formData.append('caption', caption);
      const res = await fetch(`/api/locations/${locationId}/photos`, {
        method: 'POST',
        headers: { authtoken: token, Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setLocationPhotos(prev => ({
        ...prev,
        [locationId]: [...(prev[locationId] || []), data],
      }));
      setCaptionInputs(prev => ({ ...prev, [locationId]: '' }));
    } catch (err: any) {
      setPhotoErrors(prev => ({ ...prev, [locationId]: err.message || 'Upload failed' }));
    } finally {
      setPhotoUploading(prev => ({ ...prev, [locationId]: false }));
    }
  };

  const deletePhoto = async (locationId: string, photoId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/locations/${locationId}/photos/${photoId}`, {
        method: 'DELETE',
        headers: { authtoken: token, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      setLocationPhotos(prev => ({
        ...prev,
        [locationId]: (prev[locationId] || []).filter(p => p.id !== photoId),
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to delete photo');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const businessEdits = {
        name: form.name,
        category_id: form.category_id,
        description: form.description,
        websites: form.websites,
        email: form.email,
        keywords: form.keywords,
        amenities: form.amenities,
        is_chain: form.is_chain,
      };
      const locationEdits = form.locations.map(loc => {
        const edit: any = {
          location_id: loc.location_id,
          location_name: loc.location_name,
          phones: loc.phones,
          location_privacy: loc.location_privacy,
          business_hours: loc.business_hours,
        };
        if (isVerifiedOwner) {
          edit.cross_street_1 = loc.cross_street_1;
          edit.cross_street_2 = loc.cross_street_2;
          edit.city = loc.city;
          edit.state = loc.state;
        }
        return edit;
      });

      const res = await fetch(`/api/businesses/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          authtoken: token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ businessEdits, locationEdits }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Submission failed");
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !id) return;
    setDeleting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/businesses/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          authtoken: token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: deleteReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading || (loading && user)) return <div>Loading...</div>;

  if (!user) {
    return (
      <div>
        <h1>Login Required</h1>
        <p>You must be logged in to edit a business.</p>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div>
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>Go back</button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div>
        <h1>Edit Submitted for Review</h1>
        <p>Your changes have been submitted and are pending admin approval. The current listing remains visible until approved.</p>
        <button onClick={() => navigate(`/locations/${form?.locations[0]?.location_id}`)}>Back to business</button>
      </div>
    );
  }

  if (!form) return <div>Loading...</div>;

  return (
    <div>
      <h1>Edit Business</h1>
      <p>Changes are reviewed before being applied. The current listing stays visible in the meantime.</p>
      {!isVerifiedOwner && (
        <p><small>Address and coordinate fields can only be edited by the verified owner.</small></p>
      )}

      {error && <div><strong>Error:</strong> {error}</div>}

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
            <input
              type="checkbox"
              checked={form.is_chain}
              onChange={(e) => setForm({ ...form, is_chain: e.target.checked })}
            />
            This business has multiple locations
          </label>
        </fieldset>

        <fieldset>
          <legend>Keywords (up to 10)</legend>
          <label>
            Add keyword
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

        <fieldset>
          <legend>Amenities (up to 20)</legend>
          <label>
            Add custom amenity
            <input
              type="text"
              value={amenityInput}
              onChange={(e) => setAmenityInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAmenity(); } }}
              placeholder="e.g. Free WiFi, Outdoor Seating"
            />
            <button type="button" onClick={() => addAmenity()} disabled={form.amenities.length >= 20}>
              Add Amenity
            </button>
          </label>
          <div>
            <strong>Common amenities:</strong>
            <div>
              {COMMON_AMENITIES.map((amenity) => (
                <label key={amenity} className="amenity-checkbox-label">
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
            <div key={loc.location_id}>
              <h3>Location {locationIndex + 1}{loc.location_name ? ` — ${loc.location_name}` : ''}</h3>

              <label>
                Location Name
                <input
                  type="text"
                  value={loc.location_name}
                  onChange={(e) => updateLocation(locationIndex, { ...loc, location_name: e.target.value })}
                  placeholder="e.g. Downtown, North Side"
                />
              </label>

              <label>
                Cross Street 1 *
                <input
                  type="text"
                  value={loc.cross_street_1}
                  onChange={(e) => updateLocation(locationIndex, { ...loc, cross_street_1: e.target.value })}
                  required
                  disabled={!isVerifiedOwner}
                  title={!isVerifiedOwner ? "Only the verified owner can edit the address" : undefined}
                />
              </label>

              <label>
                Cross Street 2 *
                <input
                  type="text"
                  value={loc.cross_street_2}
                  onChange={(e) => updateLocation(locationIndex, { ...loc, cross_street_2: e.target.value })}
                  required
                  disabled={!isVerifiedOwner}
                  title={!isVerifiedOwner ? "Only the verified owner can edit the address" : undefined}
                />
              </label>

              <label>
                City *
                <input
                  type="text"
                  value={loc.city}
                  onChange={(e) => updateLocation(locationIndex, { ...loc, city: e.target.value })}
                  required
                  disabled={!isVerifiedOwner}
                  title={!isVerifiedOwner ? "Only the verified owner can edit the address" : undefined}
                />
              </label>

              <label>
                State *
                <select
                  value={loc.state}
                  onChange={(e) => updateLocation(locationIndex, { ...loc, state: e.target.value })}
                  required
                  disabled={!isVerifiedOwner}
                  title={!isVerifiedOwner ? "Only the verified owner can edit the address" : undefined}
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
                  <option value="exact">Show exact location</option>
                  <option value="grid">Show general area only</option>
                </select>
              </label>

              <fieldset>
                <legend>Hours for {loc.location_name || `Location ${locationIndex + 1}`}</legend>

                <label>
                  <input
                    type="checkbox"
                    checked={loc.business_hours?.always_open}
                    onChange={(e) =>
                      updateLocationHours(locationIndex, { ...loc.business_hours, always_open: e.target.checked })
                    }
                  />
                  Open 24/7
                </label>

                {!loc.business_hours?.always_open && (
                  <div>
                    {DAYS.map((day) => {
                      const dayHours = loc.business_hours?.[day] as DayHours | undefined;
                      if (!dayHours) return null;
                      return (
                        <div key={day}>
                          <h4>{DAY_NAMES[day]}</h4>

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
                                  <button type="button" onClick={() => addHourPeriod(locationIndex, day)}>
                                    Add another set of hours for {DAY_NAMES[day]}
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
                <legend>Photos for {loc.location_name || `Location ${locationIndex + 1}`}</legend>

                {(locationPhotos[loc.location_id] || []).length > 0 && (
                  <div className="photo-gallery">
                    {(locationPhotos[loc.location_id] || []).map(photo => (
                      <div key={photo.id} className="photo-item">
                        <img
                          src={photo.thumbnail_url ?? photo.photo_url}
                          alt={photo.caption ?? 'Location photo'}
                          className={`photo-thumbnail ${photo.moderation_status === 'pending' ? 'photo-thumbnail-pending' : ''}`}
                        />
                        {photo.moderation_status === 'pending' && (
                          <span className="photo-pending-badge">
                            Pending
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => deletePhoto(loc.location_id, photo.id)}
                          className="photo-delete-button"
                        >
                          ×
                        </button>
                        {photo.caption && (
                          <div className="photo-caption">{photo.caption}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="photo-upload-form">
                  <label>
                    Caption (optional)
                    <input
                      type="text"
                      value={captionInputs[loc.location_id] || ''}
                      onChange={e => setCaptionInputs(prev => ({ ...prev, [loc.location_id]: e.target.value }))}
                      placeholder="Describe the photo"
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Add photo
                    <input
                      type="file"
                      accept="image/*"
                      disabled={photoUploading[loc.location_id]}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadPhoto(loc.location_id, file);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  {photoUploading[loc.location_id] && <small>Uploading…</small>}
                  {photoErrors[loc.location_id] && (
                    <small className="photo-error">{photoErrors[loc.location_id]}</small>
                  )}
                  <small>Photos are reviewed before appearing on the listing.</small>
                </div>
              </fieldset>
            </div>
          ))}
        </fieldset>

        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Edit for Review"}
        </button>
        <button type="button" onClick={() => navigate(-1)} className="button-secondary">
          Cancel
        </button>
        
        {(isVerifiedOwner || (businessData && businessData.verified_owner_id === null)) && (
          <button 
            type="button" 
            onClick={() => setShowDeleteConfirm(true)} 
            className="btn btn-danger"
            style={{ marginLeft: '10px' }}
            disabled={submitting || deleting}
          >
            Delete Business
          </button>
        )}
      </form>
      
      <form>
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-header">Delete Business</h3>
            <p className="modal-paragraph">
              Are you sure you want to delete this business? This action cannot be undone. 
            </p>
            
            <label className="modal-label">
              Reason for deletion (optional):
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g., Business closed permanently, duplicate listing, etc."
                className="modal-textarea"
                maxLength={500}
              />
            </label>
            
            <div className="modal-buttons">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteReason("");
                }}
                disabled={deleting}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="btn btn-danger"
              >
                {deleting ? 'Deleting...' : 'Delete Business'}
              </button>
            </div>
          </div>
        </div>
      )}
      </form>
    </div>
  );
}
