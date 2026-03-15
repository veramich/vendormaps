import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import useUser from "../src/useUser";
import { capitalizeWords, normalize, API_BASE } from "../src/utils";
import { US_STATES } from "../src/constants";
import { HoursEditor } from "../src/components/HoursEditor";
import type { BusinessHours } from "../src/components/HoursEditor";
import { AmenitiesEditor } from "../src/components/AmenitiesEditor";

interface LocationPhoto {
  id: string;
  photo_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  display_order: number;
  is_primary: boolean;
  moderation_status: 'pending' | 'approved';
}

interface EditLocation {
  location_id: string;
  location_name: string;
  cross_street_1: string;
  cross_street_2: string;
  city: string;
  state: string;
  phones: string[];
  location_privacy: "exact" | "intersection" | "grid";
  always_open: boolean;
  weekly_hours_on_website: boolean;
  subject_to_change: boolean;
  business_hours: BusinessHours | null;
}

interface EditForm {
  name: string;
  category_id: string;
  description: string;
  websites: string[];
  email: string;
  keywords: string[];
  amenities: string[];
  locations: EditLocation[];
}

interface Category {
  id: number;
  name: string;
  icon: string;
}

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Business Info", "Location", "Hours", "Details"];

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
  const [websiteInput, setWebsiteInput] = useState("");
  const [locationPhotos, setLocationPhotos] = useState<Record<string, LocationPhoto[]>>({});
  const [photoUploading, setPhotoUploading] = useState<Record<string, boolean>>({});
  const [photoErrors, setPhotoErrors] = useState<Record<string, string | null>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [businessData, setBusinessData] = useState<any>(null);
  const [step, setStep] = useState(1);

  useEffect(() => {
    fetch(`${API_BASE}/api/categories`)
      .then((res) => res.json())
      .then(setCategories)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!user || !id) return;
    const fetchData = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE}/api/businesses/${id}/edit-data`, {
          headers: { authtoken: token, Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || "Failed to load business data.");
          return;
        }
        const data = await res.json();
        setIsVerifiedOwner(data.isVerifiedOwner);
        setBusinessData(data);
        setForm({
          name: data.name || "",
          category_id: String(data.category_id || ""),
          description: data.description || "",
          websites: Array.isArray(data.websites) ? data.websites : [],
          email: data.email || "",
          keywords: Array.isArray(data.keywords) ? data.keywords : [],
          amenities: Array.isArray(data.amenities) ? data.amenities : [],
          locations: (data.locations || []).map((loc: any) => ({
            location_id: loc.location_id,
            location_name: loc.location_name || "",
            cross_street_1: loc.cross_street_1 || "",
            cross_street_2: loc.cross_street_2 || "",
            city: loc.city || "",
            state: loc.state || "",
            phones: Array.isArray(loc.phones) ? loc.phones : [],
            location_privacy: loc.location_privacy || "intersection",
            always_open: loc.always_open || false,
            weekly_hours_on_website: loc.weekly_hours_on_website || false,
            subject_to_change: loc.subject_to_change || false,
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

  const addKeyword = () => {
    if (!form) return;
    const trimmed = normalize(keywordInput);
    if (trimmed && !form.keywords.includes(trimmed) && form.keywords.length < 10) {
      setForm({ ...form, keywords: [...form.keywords, trimmed] });
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    if (!form) return;
    setForm({ ...form, keywords: form.keywords.filter((k) => k !== kw) });
  };

  const addAmenity = (amenity: string) => {
    if (!form) return;
    if (amenity && !form.amenities.includes(amenity) && form.amenities.length < 20) {
      setForm({ ...form, amenities: [...form.amenities, amenity] });
    }
  };

  const removeAmenity = (amenity: string) => {
    if (!form) return;
    setForm({ ...form, amenities: form.amenities.filter((a) => a !== amenity) });
  };

  const addWebsite = () => {
    if (!form) return;
    let website = websiteInput.trim();
    if (website && !form.websites.includes(website)) {
      if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
      setForm({ ...form, websites: [...form.websites, website] });
      setWebsiteInput("");
    }
  };

  const removeWebsite = (index: number) => {
    if (!form) return;
    setForm({ ...form, websites: form.websites.filter((_, i) => i !== index) });
  };

  const uploadPhoto = async (locationId: string, file: File) => {
    if (!user) return;
    setPhotoUploading(prev => ({ ...prev, [locationId]: true }));
    setPhotoErrors(prev => ({ ...prev, [locationId]: null }));
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`${API_BASE}/api/locations/${locationId}/photos`, {
        method: 'POST',
        headers: { authtoken: token, Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setLocationPhotos(prev => ({ ...prev, [locationId]: [...(prev[locationId] || []), data] }));
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
      const res = await fetch(`${API_BASE}/api/locations/${locationId}/photos/${photoId}`, {
        method: 'DELETE',
        headers: { authtoken: token, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      setLocationPhotos(prev => ({ ...prev, [locationId]: (prev[locationId] || []).filter(p => p.id !== photoId) }));
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
      const res = await fetch(`${API_BASE}/api/businesses/${id}`, {
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
    if (!deleteReason.trim()) {
      setError("Please provide a reason for deletion.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/businesses/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", authtoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: deleteReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      setDeleteRequested(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const validateStep = (s: number): string | null => {
    if (!form) return null;
    if (s === 1) {
      if (!form.name.trim()) return "Business name is required.";
      if (!form.category_id) return "Please select a category.";
    }
    if (s === 2) {
      const loc = form.locations[0];
      if (isVerifiedOwner) {
        if (!loc.cross_street_1.trim()) return "Cross Street 1 is required.";
        if (!loc.cross_street_2.trim()) return "Cross Street 2 is required.";
        if (!loc.city.trim()) return "City is required.";
        if (!loc.state) return "State is required.";
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

  if (deleteRequested) {
    return (
      <div>
        <h1>Delete Request Submitted</h1>
        <p>Your request to delete this business has been sent to admin for review. The listing will remain visible until approved.</p>
        <button onClick={() => navigate(`/locations/${form?.locations[0]?.location_id}`)}>Back to business</button>
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
    <div className="wizard-container">
      <div className="wizard-scroll-area">
        <h1>Edit Business</h1>
        <p style={{ marginBottom: '8px', fontSize: '14px', color: '#94a3b8' }}>
          Changes are reviewed before being applied.
        </p>
        {!isVerifiedOwner && (
          <p style={{ marginBottom: '16px', fontSize: '13px', color: '#64748b' }}>
            Address fields can only be edited by the verified owner.
          </p>
        )}

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
              {/* ── Step 1: Business Info ── */}
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
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
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
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWebsite(); } }}
                      placeholder="https://example.com"
                    />
                    <button type="button" onClick={addWebsite}>Add Website</button>
                  </label>
                  {form.websites.length > 0 && (
                    <div>
                      {form.websites.map((url, i) => (
                        <div key={i}>
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

                <label>
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="contact@business.com"
                  />
                </label>
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              {/* ── Step 2: Location ── */}
              <fieldset>
                <legend>Location</legend>
                {form.locations.map((loc, locationIndex) => (
                  <div key={loc.location_id} className="wizard-location-block">
                    <label>
                      Cross Street 1 *
                      <input
                        type="text"
                        value={loc.cross_street_1}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, cross_street_1: capitalizeWords(e.target.value) })}
                        disabled={!isVerifiedOwner}
                        title={!isVerifiedOwner ? "Only the verified owner can edit the address" : undefined}
                        placeholder="e.g. Main St"
                      />
                    </label>

                    <label>
                      Cross Street 2 *
                      <input
                        type="text"
                        value={loc.cross_street_2}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, cross_street_2: capitalizeWords(e.target.value) })}
                        disabled={!isVerifiedOwner}
                        title={!isVerifiedOwner ? "Only the verified owner can edit the address" : undefined}
                        placeholder="e.g. First Ave"
                      />
                    </label>

                    <label>
                      City *
                      <input
                        type="text"
                        value={loc.city}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, city: capitalizeWords(e.target.value) })}
                        disabled={!isVerifiedOwner}
                        title={!isVerifiedOwner ? "Only the verified owner can edit the address" : undefined}
                        placeholder="e.g. Los Angeles"
                      />
                    </label>

                    <label>
                      State *
                      <select
                        value={loc.state}
                        onChange={(e) => updateLocation(locationIndex, { ...loc, state: e.target.value })}
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
                  </div>
                ))}
              </fieldset>
            </>
          )}

          {step === 3 && (
            <>
              {/* ── Step 3: Hours ── */}
              <div>
                {form.locations.map((loc, locationIndex) => (
                  <fieldset key={loc.location_id}>
                    <legend>Hours</legend>
                    <HoursEditor
                      hours={loc.business_hours}
                      flags={{ always_open: loc.always_open, weekly_hours_on_website: loc.weekly_hours_on_website, subject_to_change: loc.subject_to_change }}
                      onChange={(h) => updateLocation(locationIndex, { ...loc, business_hours: h })}
                      onFlagsChange={(f) => updateLocation(locationIndex, { ...loc, ...f })}
                    />
                  </fieldset>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              {/* ── Step 4: Keywords, Amenities, Photos ── */}
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
                <p><small>Select all that apply.</small></p>
                <AmenitiesEditor
                  amenities={form.amenities}
                  onAdd={addAmenity}
                  onRemove={removeAmenity}
                  maxCount={20}
                />
              </fieldset>

              {form.locations.map((loc) => (
                <fieldset key={loc.location_id}>
                  <legend>Photos</legend>

                  {(locationPhotos[loc.location_id] || []).length > 0 && (
                    <div className="photo-gallery" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                      {(locationPhotos[loc.location_id] || []).map(photo => (
                        <div 
                          key={photo.id} 
                          className="photo-item"
                          style={{ 
                            position: 'relative',
                            width: '120px',
                            height: '120px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '2px solid #e5e7eb',
                            backgroundColor: '#f9fafb'
                          }}
                        >
                          <img
                            src={photo.thumbnail_url ?? photo.photo_url}
                            alt={photo.caption ?? 'Location photo'}
                            className={`photo-thumbnail ${photo.moderation_status === 'pending' ? 'photo-thumbnail-pending' : ''}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              opacity: photo.moderation_status === 'pending' ? '0.7' : '1'
                            }}
                          />
                          {photo.moderation_status === 'pending' && (
                            <span 
                              className="photo-pending-badge"
                              style={{
                                position: 'absolute',
                                bottom: '4px',
                                left: '4px',
                                backgroundColor: 'rgba(245, 158, 11, 0.9)',
                                color: 'white',
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 'bold'
                              }}
                            >
                              Pending
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => deletePhoto(loc.location_id, photo.id)}
                            className="photo-delete-button"
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(239, 68, 68, 0.9)',
                              color: 'white',
                              border: 'none',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.9)';
                              e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.9)';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            ×
                          </button>
                          {photo.caption && (
                            <div 
                              className="photo-caption"
                              style={{
                                position: 'absolute',
                                bottom: '0',
                                left: '0',
                                right: '0',
                                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                color: 'white',
                                fontSize: '11px',
                                padding: '4px 6px',
                                maxHeight: '40px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                lineHeight: '1.2'
                              }}
                              title={photo.caption}
                            >
                              {photo.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="photo-upload-form">
                    <label>
                      Add photo
                      <input
                        type="file"
                        accept="image/*"
                        disabled={photoUploading[loc.location_id]}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) { uploadPhoto(loc.location_id, file); e.target.value = ''; }
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
              ))}

              {(isVerifiedOwner || (businessData && businessData.verified_owner_id === null)) && (
                <fieldset style={{ borderColor: 'rgba(220,38,38,0.3)' }}>
                  <legend style={{ color: '#fca5a5' }}>Danger Zone</legend>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn btn-danger"
                    disabled={submitting || deleting}
                  >
                    Delete Business
                  </button>
                </fieldset>
              )}
            </>
          )}
        </form>
      </div>

      {/* ── Navigation ── */}
      <div className="wizard-nav">
        {step > 1 && (
          <button key="back" type="button" className="wizard-back-btn" onClick={goBack}>
            ← Back
          </button>
        )}
        {step < TOTAL_STEPS ? (
          <button key="next" type="button" className="wizard-next-btn" onClick={goNext}>
            Next →
          </button>
        ) : (
          <button key="submit" type="submit" form="wizard-form" className="wizard-submit-btn" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Edit for Review"}
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-header">Delete Business</h3>
            <p className="modal-paragraph">
              Are you sure you want to delete this business? This action cannot be undone.
            </p>
            <label className="modal-label">
              Reason for deletion *
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
                onClick={() => { setShowDeleteConfirm(false); setDeleteReason(""); }}
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
    </div>
  );
}
