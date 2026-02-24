import { useEffect, useState } from 'react';
import useUser from '../src/useUser';

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
  keywords: string[];
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
    latitude: number;
    longitude: number;
    phones: string[];
    location_privacy: string;
    business_hours: any;
    images?: {
      id: number;
      photo_url: string;
      thumbnail_url: string;
      caption: string;
    }[];
  }[];
}

export default function AdminReview() {
  const { user, isLoading } = useUser();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<PendingBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<{ [key: number]: string }>({});
  const [moderatorNotes, setModeratorNotes] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) return;
      
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/admin/check-role', {
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
        const response = await fetch('/api/admin/pending-businesses', {
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

      const response = await fetch(`/api/admin/businesses/${businessId}/${action}`, {
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
            <div key={business.id} style={{ border: '1px solid #ccc', margin: '20px 0', padding: '20px' }}>
              <h2>{business.name}</h2>
              <p><strong>Category:</strong> {business.category_name}</p>
              <p><strong>Description:</strong> {business.description || 'None provided'}</p>
              
              {getValidImageUrl(business.logo_url) && (
                <div style={{ margin: '10px 0' }}>
                  <strong>Business Logo:</strong>
                  <div style={{ marginTop: '5px' }}>
                    <img 
                      src={getValidImageUrl(business.logo_url)!} 
                      alt="Business logo" 
                      style={{ maxWidth: '200px', maxHeight: '100px', objectFit: 'contain' }} 
                    />
                  </div>
                </div>
              )}
              <p><strong>Website:</strong> {business.websites || 'None provided'}</p>
              <p><strong>Email:</strong> {business.email || 'None provided'}</p>
              <p><strong>Is Chain:</strong> {business.is_chain ? 'Yes' : 'No'}</p>
              {business.is_chain && business.parent_company && (
                <p><strong>Parent Company:</strong> {business.parent_company}</p>
              )}
              <p><strong>Verified:</strong> {business.if_verified ? 'Yes' : 'No'}</p>
              <p><strong>Status:</strong> {business.moderation_status}</p>
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
              
              {business.keywords.length > 0 && (
                <p><strong>Keywords:</strong> {business.keywords.join(', ')}</p>
              )}
              
              {business.amenities.length > 0 && (
                <p><strong>Amenities:</strong> {business.amenities.join(', ')}</p>
              )}
              
              <h3>Locations ({business.locations.length})</h3>
              {business.locations.map((location, index) => (
                <div key={location.id} style={{ marginLeft: '20px', marginBottom: '10px' }}>
                  <h4>Location {index + 1} {location.location_name && `- ${location.location_name}`}</h4>
                  <p><strong>Address:</strong> {location.cross_street_1} & {location.cross_street_2}, {location.city}, {location.state}</p>
                  {location.latitude && location.longitude && (
                    <p><strong>Coordinates:</strong> {Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}</p>
                  )}
                  <p><strong>Phone:</strong> {location.phones || 'None provided'}</p>
                  <p><strong>Privacy:</strong> {location.location_privacy}</p>
                  
                  {location.images && location.images.length > 0 && (
                    <div style={{ margin: '10px 0' }}>
                      <strong>Location Images ({location.images.length}):</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                        {location.images.map(image => {
                          const imageUrl = getValidImageUrl(image.thumbnail_url || image.photo_url);
                          if (!imageUrl) return null;
                          
                          return (
                            <div key={image.id}>
                              <img 
                                src={imageUrl} 
                                alt={image.caption || 'Location image'} 
                                style={{ width: '100px', height: '100px', objectFit: 'cover', border: '1px solid #ddd' }} 
                              />
                              {image.caption && (
                                <div style={{ fontSize: '12px', maxWidth: '100px', textAlign: 'center' }}>
                                  {image.caption}
                                </div>
                              )}
                            </div>
                          );
                        }).filter(Boolean)}
                      </div>
                    </div>
                  )}
                  
                  {location.business_hours && (
                    <details>
                      <summary><strong>Business Hours</strong></summary>
                      <pre>{JSON.stringify(location.business_hours, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))}
              
              {/* Moderator Notes */}
              <div style={{ marginTop: '20px' }}>
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
              <div style={{ marginTop: '10px' }}>
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
              
              <div style={{ marginTop: '20px' }}>
                <button 
                  onClick={() => updateBusinessStatus(business.id, 'approve')}
                  style={{ 
                    backgroundColor: 'green', 
                    color: 'white', 
                    padding: '10px 20px', 
                    marginRight: '10px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  ✅ Approve
                </button>
                <button 
                  onClick={() => updateBusinessStatus(business.id, 'reject')}
                  style={{ 
                    backgroundColor: 'red', 
                    color: 'white', 
                    padding: '10px 20px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}