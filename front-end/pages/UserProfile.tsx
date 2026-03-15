import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useUser from '../src/useUser';
import { API_BASE } from '../src/utils';

interface DbProfile {
    id: string;
    username: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    bio: string | null;
    role: string;
}

interface UserReview {
    id: string;
    rating: number;
    title: string | null;
    review_text: string;
    created_at: string;
    updated_at: string | null;
    location_id: string;
    business_name: string;
    city: string;
    state: string;
}

interface UserBusiness {
    id: string;
    name: string;
    moderation_status: 'pending' | 'approved' | 'rejected';
    moderator_notes: string | null;
    rejection_reason: string | null;
    created_at: string;
    reviewed_at: string | null;
    category_name: string | null;
    primary_location_id: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    pending:  { label: 'Pending review', color: '#b45309' },
    approved: { label: 'Approved',       color: '#15803d' },
    rejected: { label: 'Rejected',       color: '#b91c1c' },
};

function Stars({ rating }: { rating: number }) {
    return <span title={`${rating}/5`}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>;
}

export default function UserProfile() {
    const { user, isLoading } = useUser();
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [profile, setProfile] = useState<DbProfile | null>(null);
    const [editing, setEditing] = useState(false);
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [bio, setBio] = useState('');
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [reviews, setReviews] = useState<UserReview[]>([]);
    const [businesses, setBusinesses] = useState<UserBusiness[]>([]);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!user) return;
        user.getIdToken().then((token: string) => Promise.all([
            fetch(`${API_BASE}/api/user/profile`,    { headers: { authtoken: token } }).then(res => res.json()),
            fetch(`${API_BASE}/api/user/reviews`,    { headers: { authtoken: token } }).then(res => res.json()),
            fetch(`${API_BASE}/api/user/businesses`, { headers: { authtoken: token } }).then(res => res.json()),
            fetch(`${API_BASE}/api/admin/check-role`, { headers: { authtoken: token } })
                .then(res => res.ok ? res.json() : null).catch(() => null),
        ])).then(([profileData, reviewsData, businessesData, adminData]: [
            DbProfile,
            UserReview[],
            UserBusiness[],
            { role?: string } | null,
        ]) => {
            setProfile(profileData);
            setUsername(profileData.username ?? '');
            setFullName(profileData.full_name ?? '');
            setBio(profileData.bio ?? '');
            setReviews(Array.isArray(reviewsData) ? reviewsData : []);
            setBusinesses(Array.isArray(businessesData) ? businessesData : []);
            if (adminData?.role === 'admin') setIsAdmin(true);
        }).catch(() => {});
    }, [user]);

    async function handleSave() {
        if (!user) return;
        setSaveError('');
        setSaving(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`${API_BASE}/api/user/profile`, {
                method: 'PUT',
                headers: { authtoken: token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, full_name: fullName, bio }),
            });
            const data = await res.json();
            if (!res.ok) { setSaveError(data.error ?? 'Failed to save profile'); return; }
            setProfile(data);
            setEditing(false);
        } catch {
            setSaveError('Failed to save profile');
        } finally {
            setSaving(false);
        }
    }

    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setAvatarUploading(true);
        try {
            const token = await user.getIdToken();
            const form = new FormData();
            form.append('avatar', file);
            const res = await fetch(`${API_BASE}/api/user/avatar`, {
                method: 'POST',
                headers: { authtoken: token },
                body: form,
            });
            const data = await res.json();
            if (res.ok) setProfile(prev => prev ? { ...prev, avatar_url: data.avatar_url } : prev);
        } finally {
            setAvatarUploading(false);
            if (avatarInputRef.current) avatarInputRef.current.value = '';
        }
    }

    function handleCancel() {
        if (!profile) return;
        setUsername(profile.username ?? '');
        setFullName(profile.full_name ?? '');
        setBio(profile.bio ?? '');
        setSaveError('');
        setEditing(false);
    }

    if (isLoading) return <p>Loading...</p>;
    if (!user) return (
        <>
            <h1>Profile</h1>      
            <p>Seems like you're not logged in. To view your profile, please <a href="/login">log in</a> or <a href="/create-account">sign up</a> here.</p>
        </>
    );

    return (
        <div className="user-profile-container">
            <h1>Profile</h1>

            <div className="profile-header">
                <div
                    onClick={() => avatarInputRef.current?.click()}
                    className="avatar-container"
                    title="Click to upload avatar"
                >
                    {profile?.avatar_url
                        ? <img src={profile.avatar_url} alt="avatar" className="avatar-image" />
                        : <span className="avatar-placeholder">
                            {(profile?.username ?? user.email ?? '?')[0].toUpperCase()}
                          </span>
                    }
                    {avatarUploading && (
                        <div className="avatar-uploading-overlay">Uploading…</div>
                    )}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden-input" onChange={handleAvatarChange} />
                <div className="user-info">
                    <div className="user-username">{profile?.username ?? ''}</div>
                    <div className="user-email">{user.email}</div>
                    
                </div>
            </div>
            <div className="profile-actions">
                <button onClick={() => avatarInputRef.current?.click()} className="btn btn-secondary">
                        Change Photo
                </button>

                <button onClick={() => setEditing(true)} className="btn btn-secondary">Edit Profile</button>

            </div>

            {editing ? (
                <div className="edit-form">
                    <label>
                        <div className="form-label">Username *</div>
                        <input value={username} onChange={e => setUsername(e.target.value)} maxLength={50} className="form-input" />
                    </label>
                    <label>
                        <div className="form-label">Full name</div>
                        <input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={70} className="form-input" />
                    </label>
                    <label>
                        <div className="form-label">Bio</div>
                        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={500} className="form-textarea" />
                        <div className="char-counter">{bio.length}/500</div>
                    </label>
                    {saveError && <p className="error-message">{saveError}</p>}
                    <div className="form-buttons">
                        <button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                        <button onClick={handleCancel} disabled={saving}>Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="profile-content">
                    {profile?.full_name && <div className="profile-detail"><span className="profile-detail-label">Name: </span>{profile.full_name}</div>}
                    {profile?.bio
                        ? <p className="profile-bio">{profile.bio}</p>
                        : <p className="profile-bio-empty">No bio yet.</p>
                    }
                    
                </div>
            )}

            <section className="profile-section">
                <h2 className="section-title">Submitted businesses</h2>
                {businesses.length === 0
                    ? <p className="empty-state">You haven't submitted any businesses yet.</p>
                    : businesses.map(b => {
                        const status = STATUS_LABELS[b.moderation_status] ?? { label: b.moderation_status, color: '#555' };
                        return (
                            <div key={b.id} className="card">
                                <div className="card-header">
                                    <div>
                                        {b.moderation_status === 'approved' && b.primary_location_id
                                            ? <Link to={`/locations/${b.primary_location_id}`} className="business-name review-link">{b.name}</Link>
                                            : <span className="business-name">{b.name}</span>
                                        }
                                        {b.category_name && <span className="category-name">{b.category_name}</span>}
                                    </div>
                                    <span className="status-badge" style={{ color: status.color }}>
                                        {status.label}
                                    </span>
                                </div>
                                <div className="card-meta">
                                    Submitted {new Date(b.created_at).toLocaleDateString()}
                                    {b.reviewed_at && ` · Reviewed ${new Date(b.reviewed_at).toLocaleDateString()}`}
                                </div>
                                {b.moderator_notes && (
                                    <div className="moderator-note">
                                        <span className="note-label">Moderator note: </span>{b.moderator_notes}
                                    </div>
                                )}
                                {b.rejection_reason && (
                                    <div className="rejection-reason">
                                        <span className="note-label">Rejection reason: </span>{b.rejection_reason}
                                    </div>
                                )}
                            </div>
                        );
                    })
                }
            </section>

            <section className="profile-section">
                <h2 className="section-title">My reviews</h2>
                {reviews.length === 0
                    ? <p className="empty-state">You haven't written any reviews yet.</p>
                    : reviews.map(res => (
                        <div key={res.id} className="card">
                            <div className="card-header">
                                <Link to={`/locations/${res.location_id}`} className="review-link">
                                    {res.business_name}
                                </Link>
                                <span className="rating-stars"><Stars rating={res.rating} /></span>
                            </div>
                            <div className="card-meta">
                                {res.city}, {res.state} · {new Date(res.created_at).toLocaleDateString()}
                                {res.updated_at && res.updated_at > res.created_at && ' (edited)'}
                            </div>
                            {res.title && <div className="review-title">{res.title}</div>}
                            <div className="review-text">{res.review_text}</div>
                        </div>
                    ))
                }
            </section>

            {isAdmin && (
                <div className="admin-section">
                    <button onClick={() => navigate('/admin/review')}>Admin: Review pending submissions</button>
                </div>
            )}
        </div>
    );
}
