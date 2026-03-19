import { useEffect, useState } from 'react';
import useUser from '../src/useUser';
import { formatBusinessHours, API_BASE } from '../src/utils';

function getValidImageUrl(url: string | null | undefined): string | null {
  if (!url || url.trim() === '') return null;
  return url;
}

interface PendingBusiness {
  id: number;
  name: string;
  category_name: string;
  description: string;
  websites: string;
  email: string;
  amenities: string[];
  is_chain: boolean;
  parent_company: string;
  if_verified: boolean;
  created_by: string;
  submitter_email: string;
  submitter_name: string;
  created_at: string;
  moderation_status: string;
  terms_accepted: boolean;
  terms_accepted_at: string;
  terms_version: string;
  verification_data: any;
  logo_url: string | null;
  locations: {
    id: number;
    location_name: string;
    cross_street_1: string;
    cross_street_2: string;
    city: string;
    state: string;
    zip_code: string | null;
    neighborhood: string | null;
    latitude: number;
    longitude: number;
    phones: string[];
    local_email: string | null;
    location_privacy: string;
    geocode_source: string | null;
    business_hours: any;
    always_open: boolean;
    weekly_hours_on_website: boolean;
    subject_to_change: boolean;
    notes: string | null;
    images?: {
      id: number;
      photo_url: string;
      thumbnail_url: string;
      caption: string;
    }[];
  }[];
}

interface PendingClaim {
  id: string;
  business_name: string;
  email: string | null;
  websites: string | null;
}

interface PendingEdit {
  id: string;
  business_name: string;
  business_edits: Record<string, unknown> | null;
  current_name: string;
  current_description: string | null;
  current_websites: string[] | null;
  current_email: string | null;
  current_amenities: string[] | null;
  location_edits: {
    location_id: string;
    location_name: string | null;
    pending_edits: Record<string, unknown> | null;
    current: {
      cross_street_1: string;
      cross_street_2: string;
      city: string;
      state: string;
      phones: string[] | null;
      location_privacy: string;
    };
  }[];
}

interface PendingDeletion {
  id: string;
  name: string;
  delete_reason: string | null;
  updated_at: string;
}

interface PendingPhoto {
  id: string;
  photo_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  location_id: string;
  location_name: string | null;
  cross_street_1: string;
  cross_street_2: string;
  city: string;
  state: string;
  business_id: string;
  business_name: string;
}

export default function AdminReview() {
  const { user, isLoading } = useUser();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<PendingBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<{ [key: number]: string }>({});
  const [moderatorNotes, setModeratorNotes] = useState<{ [key: number]: string }>({});
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<PendingDeletion[]>([]);

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) return;
      
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE}/api/admin/check-role`, {
          headers: {
            'authtoken': token,
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUserRole(userData.role);
        } else {
          setError('Failed to verify admin access');
        }
      } catch (err) {
        setError('Error checking admin access');
      }
    };

    if (user) {
      checkAdminRole();
    }
  }, [user]);

  useEffect(() => {
    const fetchPendingBusinesses = async () => {
      if (!user || userRole !== 'admin') return;

      try {
        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE}/api/admin/pending-businesses`, {
          headers: {
            'authtoken': token,
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setBusinesses(data);
        } else {
          const err = await response.json();
          setError(err.error || 'Failed to fetch pending businesses');
        }
      } catch (err) {
        setError('Error fetching pending businesses');
      } finally {
        setLoading(false);
      }
    };

    if (userRole === 'admin') {
      fetchPendingBusinesses();
    }
  }, [user, userRole]);

  useEffect(() => {
    const fetchPendingClaims = async () => {
      if (!user || userRole !== 'admin') return;
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${API_BASE}/api/admin/pending-claims`, {
          headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setClaims(await response.json());
        }
      } catch {
        // non-fatal — claims section just stays empty
      }
    };
    if (userRole === 'admin') fetchPendingClaims();
  }, [user, userRole]);

  useEffect(() => {
    const fetchPendingEdits = async () => {
      if (!user || userRole !== 'admin') return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE}/api/admin/pending-edits`, {
          headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setPendingEdits(await res.json());
        }
      } catch {
        // non-fatal — pending edits section just stays empty
      }
    };
    if (userRole === 'admin') fetchPendingEdits();
  }, [user, userRole]);

  const updateEditStatus = async (businessId: string, action: 'approve-edit' | 'reject-edit') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/admin/businesses/${businessId}/${action}`, {
        method: 'POST',
        headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPendingEdits(prev => prev.filter(e => e.id !== businessId));
      } else {
        const err = await res.json();
        setError(err.error || `Failed to ${action}`);
      }
    } catch {
      setError(`Error performing ${action}`);
    }
  };

  useEffect(() => {
    const fetchPendingDeletions = async () => {
      if (!user || userRole !== 'admin') return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE}/api/admin/pending-deletions`, {
          headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setPendingDeletions(await res.json());
        }
      } catch {
        // non-fatal
      }
    };
    if (userRole === 'admin') fetchPendingDeletions();
  }, [user, userRole]);

  const updateDeletionStatus = async (businessId: string, action: 'approve-delete' | 'reject-delete') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/admin/businesses/${businessId}/${action}`, {
        method: 'POST',
        headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPendingDeletions(prev => prev.filter(d => d.id !== businessId));
      } else {
        const err = await res.json();
        setError(err.error || `Failed to ${action}`);
      }
    } catch {
      setError(`Error performing ${action}`);
    }
  };

  useEffect(() => {
    const fetchPendingPhotos = async () => {
      if (!user || userRole !== 'admin') return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE}/api/admin/pending-photos`, {
          headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setPendingPhotos(await res.json());
        }
      } catch {
        // non-fatal
      }
    };
    if (userRole === 'admin') fetchPendingPhotos();
  }, [user, userRole]);

  const updatePhotoStatus = async (photoId: string, action: 'approve' | 'reject') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/admin/photos/${photoId}/${action}`, {
        method: 'POST',
        headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPendingPhotos(prev => prev.filter(p => p.id !== photoId));
      } else {
        const err = await res.json();
        setError(err.error || `Failed to ${action} photo`);
      }
    } catch {
      setError(`Error performing photo ${action}`);
    }
  };

  const updateClaimStatus = async (businessId: string, action: 'verify' | 'dismiss-claim') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE}/api/admin/businesses/${businessId}/${action}`, {
        method: 'POST',
        headers: { 'authtoken': token, 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setClaims(prev => prev.filter(c => c.id !== businessId));
      } else {
        const err = await response.json();
        setError(err.error || `Failed to ${action}`);
      }
    } catch {
      setError(`Error performing ${action}`);
    }
  };

  const updateBusinessStatus = async (businessId: number, action: 'approve' | 'reject') => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      
      const requestBody: any = {
        moderator_notes: moderatorNotes[businessId] || ''
      };

      if (action === 'reject') {
        const reason = rejectionReason[businessId];
        if (!reason || !reason.trim()) {
          setError('Please provide a rejection reason');
          return;
        }
        requestBody.rejection_reason = reason.trim();
      }

      const response = await fetch(`${API_BASE}/api/admin/businesses/${businessId}/${action}`, {
        method: 'POST',
        headers: {
          'authtoken': token,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        setBusinesses(prev => prev.filter(b => b.id !== businessId));
        setRejectionReason(prev => ({ ...prev, [businessId]: '' }));
        setModeratorNotes(prev => ({ ...prev, [businessId]: '' }));
      } else {
        const err = await response.json();
        setError(err.error || `Failed to ${action} business`);
      }
    } catch (err) {
      setError(`Error ${action}ing business`);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div>
        <h1>Access Denied</h1>
        <p>You must be logged in to access this page.</p>
      </div>
    );
  }

  if (userRole === null) {
    return <div>Checking admin access...</div>;
  }

  if (userRole !== 'admin') {
    return (
      <div>
        <h1>Access Denied</h1>
        <p>You do not have permission to access this admin page.</p>
      </div>
    );
  }


  if (loading) {
    return <div>Loading pending businesses...</div>;
  }

  if (error) {
    return (
      <div>
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Admin Review - Pending Business Submissions</h1>
      <p>Review and approve/reject business submissions from users.</p>
      
      {businesses.length === 0 ? (
        <p>No pending businesses to review.</p>
      ) : (
        <div>
          <p><strong>{businesses.length}</strong> pending submission(s)</p>
          
          {businesses.map(business => (
            <div key={business.id} className="admin-business-card">
              <div className="business-page" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '16px' }}>
                <h2 className="business-title">{business.name}</h2>

                {getValidImageUrl(business.logo_url) && (
                  <img
                    src={getValidImageUrl(business.logo_url)!}
                    alt="Business logo"
                    className="business-logo"
                    style={{ maxWidth: '120px', maxHeight: '120px', objectFit: 'contain' }}
                  />
                )}

                <p><strong>Category:</strong> {business.category_name}</p>
                {business.is_chain && <p><strong>Chain:</strong> Yes</p>}
                {business.description && <p className="business-description">{business.description}</p>}
                {business.websites && (
                  <p className="business-websites">
                    <strong>Website:</strong>{' '}
                    {Array.isArray(business.websites)
                      ? business.websites.map((url: string, i: number) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                          </span>
                        ))
                      : <a href={String(business.websites)} target="_blank" rel="noopener noreferrer">{String(business.websites)}</a>}
                  </p>
                )}
                {business.email && (
                  <p className="business-email">
                    <strong>Email:</strong>{' '}
                    <a href={`mailto:${business.email}`}>{business.email}</a>
                  </p>
                )}
                {business.parent_company && <p><strong>Parent Company:</strong> {business.parent_company}</p>}
                {business.amenities.length > 0 && (
                  <p><strong>Amenities:</strong> {business.amenities.join(', ')}</p>
                )}

                <div className="locations-grid" style={{ marginTop: '16px' }}>
                  {business.locations.map((location) => {
                    const hours = formatBusinessHours(location.business_hours);
                    return (
                      <section key={location.id} className="location-card">
                        {location.location_name && (
                          <p><strong>{location.location_name}</strong></p>
                        )}
                        <p>📍 {location.cross_street_1} & {location.cross_street_2}, {location.city}, {location.state}{location.zip_code ? ` ${location.zip_code}` : ''}</p>
                        {location.neighborhood && <p>🏘️ {location.neighborhood}</p>}
                        {location.phones && location.phones.length > 0 && location.phones.map((ph, i) => (
                          <p key={i}>📞 <a href={`tel:${ph}`}>{ph}</a></p>
                        ))}
                        {location.local_email && (
                          <p>✉️ <a href={`mailto:${location.local_email}`}>{location.local_email}</a></p>
                        )}

                        {location.images && location.images.length > 0 && (
                          <div className="photo-gallery">
                            {location.images.map(image => {
                              const imageUrl = getValidImageUrl(image.thumbnail_url || image.photo_url);
                              if (!imageUrl) return null;
                              return (
                                <figure key={image.id} className="photo-figure">
                                  <img
                                    src={imageUrl}
                                    alt={image.caption || 'Location image'}
                                    className="location-photo"
                                  />
                                  {image.caption && (
                                    <figcaption className="photo-caption">{image.caption}</figcaption>
                                  )}
                                </figure>
                              );
                            })}
                          </div>
                        )}

                        <div className="hours-section">
                          {location.always_open ? (
                            <p><strong>Hours:</strong> Open 24/7</p>
                          ) : location.weekly_hours_on_website ? (
                            <p><strong>Hours:</strong> Posted weekly on business website</p>
                          ) : hours.length > 0 ? (
                            <>
                              <strong>Business hours:</strong>
                              <div className="hours-list">
                                {hours.map((line, i) => {
                                  const colonIdx = line.indexOf(':');
                                  const day = colonIdx > -1 ? line.slice(0, colonIdx).trim() : '';
                                  const time = colonIdx > -1 ? line.slice(colonIdx + 1).trim() : line;
                                  return (
                                    <div key={i} className="hours-day">
                                      <span className="hours-day-label">{day || line}</span>
                                      {day && <span className="hours-time">{time}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          ) : null}
                          {location.subject_to_change && (
                            <p><em>Hours subject to change</em></p>
                          )}
                        </div>

                        {location.notes && (
                          <p><strong>Notes:</strong> {location.notes}</p>
                        )}

                        <p style={{ fontSize: '0.85em', color: '#888', marginTop: '8px' }}>
                          📌 {Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}
                          {' · '}{location.location_privacy}
                          {location.geocode_source ? ` · ${location.geocode_source}` : ''}
                        </p>
                      </section>
                    );
                  })}
                </div>
              </div>

              {/* Admin metadata */}
              <p><strong>Submitted by:</strong> {business.submitter_name} ({business.submitter_email})</p>
              <p><strong>Submitted:</strong> {new Date(business.created_at).toLocaleDateString()}</p>
              <p><strong>Terms Accepted:</strong> {business.terms_accepted ? 'Yes' : 'No'}
                {business.terms_accepted_at && ` (${new Date(business.terms_accepted_at).toLocaleDateString()})`}
                {business.terms_version && ` - Version: ${business.terms_version}`}
              </p>

              {business.verification_data && Object.keys(business.verification_data).length > 0 && (
                <details>
                  <summary><strong>Verification Data</strong></summary>
                  <pre>{JSON.stringify(business.verification_data, null, 2)}</pre>
                </details>
              )}
              
              {/* Moderator Notes */}
              <div className="admin-moderator-notes">
                <label>
                  <strong>Moderator Notes (optional):</strong>
                  <br />
                  <textarea
                    value={moderatorNotes[business.id] || ''}
                    onChange={(e) => setModeratorNotes(prev => ({ ...prev, [business.id]: e.target.value }))}
                    rows={3}
                    cols={60}
                    placeholder="Add any notes about this review..."
                  />
                </label>
              </div>
              
              {/* Rejection Reason */}
              <div className="admin-rejection-reason">
                <label>
                  <strong>Rejection Reason (required if rejecting):</strong>
                  <br />
                  <textarea
                    value={rejectionReason[business.id] || ''}
                    onChange={(e) => setRejectionReason(prev => ({ ...prev, [business.id]: e.target.value }))}
                    rows={2}
                    cols={60}
                    placeholder="If rejecting, explain why..."
                  />
                </label>
              </div>
              
              <div className="admin-actions">
                <button 
                  onClick={() => updateBusinessStatus(business.id, 'approve')}
                  className="admin-approve-button"
                >
                  ✅ Approve
                </button>
                <button 
                  onClick={() => updateBusinessStatus(business.id, 'reject')}
                  className="admin-reject-button"
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <hr className="admin-section-divider" />
      <h1>Pending Ownership Claims</h1>
      <p>Review requests from users claiming to own an existing business.</p>

      {claims.length === 0 ? (
        <p>No pending claims.</p>
      ) : (
        <div>
          <p><strong>{claims.length}</strong> pending claim(s)</p>
          {claims.map(claim => (
            <div key={claim.id} className="admin-claim-card">
              <h2>{claim.business_name}</h2>
              {claim.email && <p><strong>Email:</strong> {claim.email}</p>}
              {claim.websites && <p><strong>Website:</strong> {claim.websites}</p>}
              {!claim.email && !claim.websites && <p>No contact info on file.</p>}

              <div className="admin-claim-actions">
                <button
                  onClick={() => updateClaimStatus(claim.id, 'verify')}
                  className="admin-approve-button"
                >
                  ✅ Verify
                </button>
                <button
                  onClick={() => updateClaimStatus(claim.id, 'dismiss-claim')}
                  className="admin-reject-button"
                >
                  ❌ Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <hr className="admin-section-divider" />
      <h1>Pending Business Edits</h1>
      <p>Review proposed edits submitted by users. Approving will apply the changes to the live listing.</p>

      {pendingEdits.length === 0 ? (
        <p>No pending edits.</p>
      ) : (
        <div>
          <p><strong>{pendingEdits.length}</strong> pending edit(s)</p>
          {pendingEdits.map(edit => (
            <div key={edit.id} className="admin-edit-card">
              <h2>{edit.business_name}</h2>

              {edit.business_edits && Object.keys(edit.business_edits).length > 0 && (
                <div>
                  <h3>Business Field Changes</h3>
                  <table className="admin-comparison-table">
                    <thead>
                      <tr>
                        <th className="admin-table-header">Field</th>
                        <th className="admin-table-header">Current</th>
                        <th className="admin-table-header">Proposed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(edit.business_edits).map(([field, proposed]) => {
                        const currentMap: Record<string, unknown> = {
                          name: edit.current_name,
                          description: edit.current_description,
                          websites: edit.current_websites,
                          email: edit.current_email,
                          amenities: edit.current_amenities,
                        };
                        const current = currentMap[field];
                        const fmt = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v ?? '');
                        return (
                          <tr key={field}>
                            <td className="admin-table-cell">{field}</td>
                            <td className="admin-table-cell-current">{fmt(current)}</td>
                            <td className="admin-table-cell-proposed">{fmt(proposed)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {edit.location_edits.filter(l => l.pending_edits && Object.keys(l.pending_edits).length > 0).length > 0 && (
                <div className="admin-location-changes">
                  <h3>Location Changes</h3>
                  {edit.location_edits
                    .filter(l => l.pending_edits && Object.keys(l.pending_edits).length > 0)
                    .map(loc => (
                      <div key={loc.location_id} className="admin-location-change-section">
                        <h4>{loc.location_name ?? 'Unnamed Location'}</h4>
                        <table className="admin-comparison-table">
                          <thead>
                            <tr>
                              <th className="admin-table-header">Field</th>
                              <th className="admin-table-header">Current</th>
                              <th className="admin-table-header">Proposed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(loc.pending_edits!).map(([field, proposed]) => {
                              const currentMap: Record<string, unknown> = loc.current as Record<string, unknown>;
                              const current = currentMap[field];
                              const fmt = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v ?? '');
                              return (
                                <tr key={field}>
                                  <td className="admin-table-cell">{field}</td>
                                  <td className="admin-table-cell-current">{fmt(current)}</td>
                                  <td className="admin-table-cell-proposed">{fmt(proposed)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))
                  }
                </div>
              )}

              <div className="admin-edit-actions">
                <button
                  onClick={() => updateEditStatus(edit.id, 'approve-edit')}
                  className="admin-approve-button"
                >
                  ✅ Approve Edit
                </button>
                <button
                  onClick={() => updateEditStatus(edit.id, 'reject-edit')}
                  className="admin-reject-button"
                >
                  ❌ Reject Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <hr className="admin-section-divider" />
      <h1>Pending Business Deletions</h1>
      <p>Review deletion requests submitted by users. Approving will remove the business from the map.</p>

      {pendingDeletions.length === 0 ? (
        <p>No pending deletion requests.</p>
      ) : (
        <div>
          <p><strong>{pendingDeletions.length}</strong> pending deletion(s)</p>
          {pendingDeletions.map(d => (
            <div key={d.id} className="admin-edit-card">
              <h2>{d.name}</h2>
              <p><strong>Reason:</strong> {d.delete_reason || <em>No reason provided</em>}</p>
              <p><strong>Requested:</strong> {new Date(d.updated_at).toLocaleDateString()}</p>
              <div className="admin-edit-actions">
                <button onClick={() => updateDeletionStatus(d.id, 'approve-delete')} className="admin-approve-button">
                  ✅ Approve Deletion
                </button>
                <button onClick={() => updateDeletionStatus(d.id, 'reject-delete')} className="admin-reject-button">
                  ❌ Reject Deletion
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <hr className="admin-section-divider" />
      <h1>Pending Photos</h1>
      <p>Review photos submitted by users. Approving makes them visible on the listing.</p>

      {pendingPhotos.length === 0 ? (
        <p>No pending photos.</p>
      ) : (
        <div>
          <p><strong>{pendingPhotos.length}</strong> pending photo(s)</p>
          <div className="admin-photos-grid">
            {pendingPhotos.map(photo => (
              <div key={photo.id} className="admin-photo-card">
                <img
                  src={photo.thumbnail_url ?? photo.photo_url}
                  alt={photo.caption ?? 'Pending photo'}
                  className="admin-photo-image"
                />
                {photo.caption && <p className="admin-photo-caption">{photo.caption}</p>}
                <p className="admin-photo-business-name">
                  <strong>{photo.business_name}</strong>
                </p>
                <p className="admin-photo-location">
                  {photo.location_name ? `${photo.location_name} — ` : ''}{photo.cross_street_1} & {photo.cross_street_2}, {photo.city}, {photo.state}
                </p>
                <div className="admin-photo-actions">
                  <button
                    onClick={() => updatePhotoStatus(photo.id, 'approve')}
                    className="admin-photo-approve-button"
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => updatePhotoStatus(photo.id, 'reject')}
                    className="admin-photo-reject-button"
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}