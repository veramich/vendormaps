import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useUser from '../src/useUser';

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
}

async function getToken(user: { getIdToken: () => Promise<string> }) {
    return user.getIdToken();
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
            fetch('/api/user/profile',    { headers: { authtoken: token } }).then(r => r.json()),
            fetch('/api/user/reviews',    { headers: { authtoken: token } }).then(r => r.json()),
            fetch('/api/user/businesses', { headers: { authtoken: token } }).then(r => r.json()),
            fetch('/api/admin/check-role', { headers: { authtoken: token } })
                .then(r => r.ok ? r.json() : null).catch(() => null),
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
            const token = await getToken(user);
            const res = await fetch('/api/user/profile', {
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
            const token = await getToken(user);
            const form = new FormData();
            form.append('avatar', file);
            const res = await fetch('/api/user/avatar', {
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
    if (!user) return <p>Please <a href="/login">log in</a> to view your profile.</p>;

    return (
        <div style={{ maxWidth: 620, margin: '2rem auto', padding: '0 1rem' }}>
            <h1>Profile</h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div
                    onClick={() => avatarInputRef.current?.click()}
                    style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: '#ddd', overflow: 'hidden', cursor: 'pointer',
                        flexShrink: 0, position: 'relative',
                    }}
                    title="Click to upload avatar"
                >
                    {profile?.avatar_url
                        ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '2rem', color: '#999' }}>
                            {(profile?.username ?? user.email ?? '?')[0].toUpperCase()}
                          </span>
                    }
                    {avatarUploading && (
                        <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '0.75rem',
                        }}>Uploading…</div>
                    )}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                <div>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{profile?.username ?? ''}</div>
                    <div style={{ color: '#666', fontSize: '0.9rem' }}>{user.email}</div>
                    <button onClick={() => avatarInputRef.current?.click()} style={{ marginTop: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                        Change photo
                    </button>
                </div>
            </div>

            {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                    <label>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>Username *</div>
                        <input value={username} onChange={e => setUsername(e.target.value)} maxLength={50} style={{ width: '100%', boxSizing: 'border-box' }} />
                    </label>
                    <label>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>Full name</div>
                        <input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={70} style={{ width: '100%', boxSizing: 'border-box' }} />
                    </label>
                    <label>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>Bio</div>
                        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={500} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                        <div style={{ fontSize: '0.8rem', color: '#888', textAlign: 'right' }}>{bio.length}/500</div>
                    </label>
                    {saveError && <p style={{ color: 'red', margin: 0 }}>{saveError}</p>}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                        <button onClick={handleCancel} disabled={saving}>Cancel</button>
                    </div>
                </div>
            ) : (
                <div style={{ marginBottom: '2rem' }}>
                    {profile?.full_name && <div style={{ marginBottom: '0.25rem' }}><span style={{ color: '#666' }}>Name: </span>{profile.full_name}</div>}
                    {profile?.bio
                        ? <p style={{ margin: '0 0 0.5rem', whiteSpace: 'pre-wrap' }}>{profile.bio}</p>
                        : <p style={{ margin: '0 0 0.5rem', color: '#999' }}>No bio yet.</p>
                    }
                    <button onClick={() => setEditing(true)}>Edit profile</button>
                </div>
            )}

            <section style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Submitted businesses</h2>
                {businesses.length === 0
                    ? <p style={{ color: '#999' }}>You haven't submitted any businesses yet.</p>
                    : businesses.map(b => {
                        const status = STATUS_LABELS[b.moderation_status] ?? { label: b.moderation_status, color: '#555' };
                        return (
                            <div key={b.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <div>
                                        <strong>{b.name}</strong>
                                        {b.category_name && <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.85rem' }}>{b.category_name}</span>}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: status.color, whiteSpace: 'nowrap' }}>
                                        {status.label}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                                    Submitted {new Date(b.created_at).toLocaleDateString()}
                                    {b.reviewed_at && ` · Reviewed ${new Date(b.reviewed_at).toLocaleDateString()}`}
                                </div>
                                {b.moderator_notes && (
                                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', background: '#f9fafb', padding: '0.5rem', borderRadius: 4 }}>
                                        <span style={{ fontWeight: 500 }}>Moderator note: </span>{b.moderator_notes}
                                    </div>
                                )}
                                {b.rejection_reason && (
                                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', background: '#fff1f2', padding: '0.5rem', borderRadius: 4 }}>
                                        <span style={{ fontWeight: 500 }}>Rejection reason: </span>{b.rejection_reason}
                                    </div>
                                )}
                            </div>
                        );
                    })
                }
            </section>

            <section style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>My reviews</h2>
                {reviews.length === 0
                    ? <p style={{ color: '#999' }}>You haven't written any reviews yet.</p>
                    : reviews.map(r => (
                        <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <Link to={`/locations/${r.location_id}`} style={{ fontWeight: 600 }}>
                                    {r.business_name}
                                </Link>
                                <span style={{ color: '#f59e0b', whiteSpace: 'nowrap' }}><Stars rating={r.rating} /></span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.4rem' }}>
                                {r.city}, {r.state} · {new Date(r.created_at).toLocaleDateString()}
                                {r.updated_at && r.updated_at > r.created_at && ' (edited)'}
                            </div>
                            {r.title && <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{r.title}</div>}
                            <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{r.review_text}</div>
                        </div>
                    ))
                }
            </section>

            {isAdmin && (
                <div style={{ paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                    <button onClick={() => navigate('/admin/review')}>Admin: Review pending submissions</button>
                </div>
            )}
        </div>
    );
}
