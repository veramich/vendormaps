import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useUser from '../src/useUser';

interface LocationPhoto {
    id: string;
    photo_url: string | null;
    thumbnail_url: string | null;
    caption: string | null;
    display_order: number | null;
    is_primary: boolean;
}

interface BusinessLocation {
    location_id: string;
    location_name: string | null;
    is_primary: boolean;
    phones: string[] | null;
    local_email: string | null;
    cross_street_1: string;
    cross_street_2: string;
    city: string;
    state: string;
    country: string;
    zip_code: string | number;
    neighborhood: string | null;
    business_hours: unknown;
    notes: string | null;
    amenities: unknown;
    latitude: number;
    longitude: number;
    temporarily_closed: boolean;
    closed_reason: string | null;
    photos: LocationPhoto[];
}

interface BusinessDetails {
    id: string;
    name: string;
    description: string | null;
    websites: string[] | null;
    email: string;
    logo_url: string | null;
    icon: string | null;
    keywords: unknown;
    is_chain: boolean;
    parent_company: string | null;
    if_verified: boolean;
    category_id: string | null;
    category_name: string | null;
    category_slug: string | null;
    category_icon: string | null;
    category_color: string | null;
    created_at: string;
    updated_at: string;
    locations: BusinessLocation[];
}

interface Review {
    id: string;
    rating: number;
    title: string | null;
    review_text: string;
    helpful_count: number;
    created_at: string;
    updated_at: string;
    username: string;
    firebase_uid?: string | null;
    full_name: string | null;
    was_edited: boolean;
}

interface ReviewsData {
  reviews: Review[];
  avg_rating: number;
  review_count: number;
}

function parseStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.filter((item): item is string => typeof item === 'string');
                }
            } catch {
            }
        }

        return trimmed
            .split(/,|\||\//)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    return [];
}

function parseAmenities(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.filter((item): item is string => typeof item === 'string');
                }
            } catch {
            }
        }

        return trimmed
            .split(/,|\||\//)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    return [];
}

function getTodayDay(): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
}

function parseTimeToMinutes(timeStr: string): number | null {
    const clean = timeStr.trim().toLowerCase().replace(/\s+/g, '');
    const match = clean.match(/^(\d{1,2})(?::(\d{2}))?([ap]m)?$/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3];
    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

function isOpenNow(timeRangeStr: string): boolean | null {
    const lower = timeRangeStr.toLowerCase().trim();
    if (lower === 'closed' || lower === 'not available') return false;
    const dashMatch = lower.replace(/\s+/g, '').match(/^(.+?)[-–](.+)$/);
    if (!dashMatch) return null;
    const openMin = parseTimeToMinutes(dashMatch[1]);
    const closeMin = parseTimeToMinutes(dashMatch[2]);
    if (openMin === null || closeMin === null) return null;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    return currentMin >= openMin && currentMin < closeMin;
}

function formatBusinessHours(hours: unknown): string[] {
    if (!hours) return [];

    if (typeof hours === 'string') {
        const trimmed = hours.trim();
        if (!trimmed) return [];

        try {
            const parsed = JSON.parse(trimmed);
            return formatBusinessHours(parsed);
        } catch {
            return [trimmed];
        }
    }

    if (Array.isArray(hours)) {
        return hours
            .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
            .filter(Boolean);
    }

    if (typeof hours === 'object') {
        const DAY_NAMES_MAP = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const NUMERIC_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6']);
        const STRING_DAY_KEYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
        const STRING_DAY_ORDER: Record<string, number> = {
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
        };

        const formatValue = (label: string, value: unknown): string => {
            if (typeof value === 'string') return `${label}: ${value}`;
            if (Array.isArray(value)) return `${label}: ${value.join(', ')}`;
            if (value && typeof value === 'object') {
                const schedule = value as Record<string, unknown>;
                let timeStr: string;
                if (schedule.closed === true) {
                    timeStr = 'Closed';
                } else if (schedule.open_24_hours === true) {
                    timeStr = 'Open 24 hours';
                } else if (Array.isArray(schedule.periods) && schedule.periods.length > 0) {
                    timeStr = schedule.periods
                        .map((period: unknown) => {
                            if (period && typeof period === 'object') {
                                const p = period as Record<string, unknown>;
                                if (p.open && p.close) return `${p.open} – ${p.close}`;
                            }
                            return '';
                        })
                        .filter(Boolean)
                        .join(', ');
                } else {
                    timeStr = 'Hours not available';
                }
                return `${label}: ${timeStr}`;
            }
            return `${label}: ${String(value ?? '')}`;
        };

        const entries = Object.entries(hours as Record<string, unknown>);
        const numericEntries = entries.filter(([key]) => NUMERIC_KEYS.has(key));
        if (numericEntries.length > 0) {
            return numericEntries
                .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
                .map(([key, value]) => formatValue(DAY_NAMES_MAP[parseInt(key, 10)], value));
        }

        return entries
            .filter(([day]) => STRING_DAY_KEYS.has(day.toLowerCase()))
            .sort(([a], [b]) => (STRING_DAY_ORDER[a.toLowerCase()] ?? 7) - (STRING_DAY_ORDER[b.toLowerCase()] ?? 7))
            .map(([day, value]) => formatValue(day.charAt(0).toUpperCase() + day.slice(1), value));
    }

    return [String(hours)];
}


function renderStars(rating: number, outOf = 5): string {
    return Array.from({ length: outOf }, (_, index) => (index < rating ? '★' : '☆')).join('');
}

export default function BusinessPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useUser();
    const navigate = useNavigate();
    const [business, setBusiness] = useState<BusinessDetails | null>(null);
    const [reviewsData, setReviewsData] = useState<ReviewsData>({ reviews: [], avg_rating: 0, review_count: 0 });
    const [loading, setLoading] = useState(true);
    const [reviewsLoading, setReviewsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reviewError, setReviewError] = useState<string | null>(null);
    const [submittingReview, setSubmittingReview] = useState(false);
    const [votingReviewId, setVotingReviewId] = useState<string | null>(null);
    const [helpfulSelections, setHelpfulSelections] = useState<Set<string>>(new Set());
    const [formRating, setFormRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [formTitle, setFormTitle] = useState('');
    const [formText, setFormText] = useState('');
    const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
    const [editRating, setEditRating] = useState(5);
    const [editHoverRating, setEditHoverRating] = useState(0);
    const [editTitle, setEditTitle] = useState('');
    const [editText, setEditText] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [showClaimForm, setShowClaimForm] = useState(false);
    const [claimSubmitting, setClaimSubmitting] = useState(false);
    const [claimMessage, setClaimMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!id) {
            setError('Missing location id');
            setLoading(false);
            setReviewsLoading(false);
            return;
        }

        let mounted = true;

        fetch(`/api/locations/${id}`)
            .then((response) => {
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('Location not found');
                    }
                    throw new Error(`Server error: ${response.status}`);
                }
                return response.json();
            })
            .then((data: BusinessDetails) => {
                if (!mounted) return;
                setBusiness(data);
                setLoading(false);
            })
            .catch((fetchError) => {
                if (!mounted) return;
                const message = fetchError instanceof Error ? fetchError.message : 'Failed to load business';
                setError(message);
                setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [id]);

    useEffect(() => {
        setHelpfulSelections(new Set());
    }, [id]);

    useEffect(() => {
        if (!id) {
            setReviewsLoading(false);
            return;
        }

        let mounted = true;

        setReviewsLoading(true);
        fetch(`/api/locations/${id}/reviews`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }
                return response.json();
            })
            .then((data: ReviewsData) => {
                if (!mounted) return;
                setReviewsData(data);
                setReviewsLoading(false);
            })
            .catch((fetchError) => {
                if (!mounted) return;
                const message = fetchError instanceof Error ? fetchError.message : 'Failed to load reviews';
                setReviewError(message);
                setReviewsLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [id]);

    async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!id) return;

        if (!user) {
            setReviewError('You must be logged in to submit a review');
            return;
        }

        setSubmittingReview(true);
        setReviewError(null);

        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/locations/${id}/reviews`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'authtoken': token,
                },
                body: JSON.stringify({
                    rating: formRating,
                    title: formTitle,
                    review_text: formText,
                }),
            });

            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload?.error || `Server error: ${response.status}`);
            }

            const newReview = payload as Review;

            setReviewsData((previous) => {
                const nextCount = previous.review_count + 1;
                const nextAvg =
                    nextCount === 0
                        ? 0
                        : Number(((previous.avg_rating * previous.review_count + newReview.rating) / nextCount).toFixed(2));

                return {
                    reviews: [newReview, ...previous.reviews],
                    review_count: nextCount,
                    avg_rating: nextAvg,
                };
            });

            setFormRating(5);
            setHoverRating(0);
            setFormTitle('');
            setFormText('');
        } catch (submitError) {
            const message = submitError instanceof Error ? submitError.message : 'Failed to submit review';
            setReviewError(message);
        } finally {
            setSubmittingReview(false);
        }
    }

    async function handleHelpfulVote(reviewId: string) {
        if (!user) {
            setReviewError('You must be logged in to vote');
            return;
        }

        const isSelected = helpfulSelections.has(reviewId);
        const helpful = !isSelected;

        setVotingReviewId(reviewId);
        setReviewError(null);

        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/locations/${id}/reviews/${reviewId}/helpful`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'authtoken': token,
                },
                body: JSON.stringify({ helpful }),
            });

            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload?.error || `Server error: ${response.status}`);
            }

            const updatedHelpfulCount = Number(payload.helpful_count ?? 0);

            setHelpfulSelections((previous) => {
                const next = new Set(previous);
                if (helpful) {
                    next.add(reviewId);
                } else {
                    next.delete(reviewId);
                }
                return next;
            });

            setReviewsData((previous) => ({
                ...previous,
                reviews: previous.reviews.map((review) =>
                    review.id === reviewId
                        ? { ...review, helpful_count: updatedHelpfulCount }
                        : review
                ),
            }));
        } catch (voteError) {
            const message = voteError instanceof Error ? voteError.message : 'Failed to update helpful count';
            setReviewError(message);
        } finally {
            setVotingReviewId(null);
        }
    }

    function startEditingReview(review: Review) {
        setReviewError(null);
        setEditingReviewId(review.id);
        setEditRating(review.rating);
        setEditHoverRating(0);
        setEditTitle(review.title ?? '');
        setEditText(review.review_text);
    }

    function cancelEditingReview() {
        setEditingReviewId(null);
        setEditRating(5);
        setEditHoverRating(0);
        setEditTitle('');
        setEditText('');
    }

    async function handleReviewEditSubmit(event: React.FormEvent<HTMLFormElement>, reviewId: string) {
        event.preventDefault();

        if (!id || !user) {
            setReviewError('You must be logged in to edit your review');
            return;
        }

        setSavingEdit(true);
        setReviewError(null);

        try {
            const originalReview = reviewsData.reviews.find((review) => review.id === reviewId);
            if (!originalReview) {
                throw new Error('Review not found');
            }

            const token = await user.getIdToken();
            const response = await fetch(`/api/locations/${id}/reviews/${reviewId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    authtoken: token,
                },
                body: JSON.stringify({
                    rating: editRating,
                    title: editTitle,
                    review_text: editText,
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || `Server error: ${response.status}`);
            }

            const updatedReview = payload as Review;

            setReviewsData((previous) => {
                const nextAvg =
                    previous.review_count === 0
                        ? 0
                        : Number(
                              (
                                  (previous.avg_rating * previous.review_count - originalReview.rating + updatedReview.rating) /
                                  previous.review_count
                              ).toFixed(2)
                          );

                return {
                    ...previous,
                    avg_rating: nextAvg,
                    reviews: previous.reviews.map((review) => (review.id === reviewId ? updatedReview : review)),
                };
            });

            cancelEditingReview();
        } catch (editError) {
            const message = editError instanceof Error ? editError.message : 'Failed to update review';
            setReviewError(message);
        } finally {
            setSavingEdit(false);
        }
    }

    async function handleClaimSubmit() {
        if (!user || !business) return;
        setClaimSubmitting(true);
        setClaimMessage(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/businesses/${business.id}/claim`, {
                method: 'POST',
                headers: { authtoken: token },
            });
            const data = await res.json();
            if (res.ok) {
                setClaimMessage('Your claim has been submitted and is under review.');
                setShowClaimForm(false);
            } else {
                setClaimMessage(data.error || 'Failed to submit claim.');
            }
        } catch {
            setClaimMessage('An error occurred. Please try again.');
        } finally {
            setClaimSubmitting(false);
        }
    }

    const keywords = useMemo(() => parseStringList(business?.keywords), [business?.keywords]);

    if (loading) {
        return <main className="business-page">Loading business details...</main>;
    }

    if (error || !business) {
        return (
            <main className="business-page">
                <h1>Business Details</h1>
                <p className="error-text">{error ?? 'Business not found'}</p>
            </main>
        );
    }

    return (
        <main className="business-page">
            <h1 className="business-title">{business.name}</h1>

            {business.logo_url 
                ? <img
                    src={business.logo_url}
                    alt={`${business.name} logo`}
                    className="business-logo"
                />
                : business.category_icon && <img
                    src={`/${business.category_icon}`}
                    alt={`${business.name} icon`}
                    className="business-logo"
                />      
            }

            <div>
                <span>
                <p><strong>Category:</strong> {business.category_name ?? 'Not listed'}</p>
                <p><strong>Verified:</strong> {business.if_verified ? '✔ Verified owner' : 'Not verified'}</p>
                {!business.if_verified && user && (
                    <div className="claim-actions">
                        {claimMessage && (
                            <p className={`claim-message ${claimMessage.startsWith('Your claim') ? 'claim-message-success' : 'claim-message-error'}`}>
                                {claimMessage}
                            </p>
                        )}
                        {!showClaimForm && !claimMessage && (
                            <button
                                type="button"
                                onClick={() => setShowClaimForm(true)}
                                className="btn btn-outline btn-small"
                                style={{ color: '#3b82f6', borderColor: '#3b82f6' }}
                            >
                                Claim this business
                            </button>
                        )}
                        {showClaimForm && (
                            <div className="claim-form">
                                <p className="claim-form-description">Submit a claim for this business? We'll reach out using the contact info on file.</p>
                                <div className="claim-form-buttons">
                                    <button
                                        type="button"
                                        onClick={handleClaimSubmit}
                                        disabled={claimSubmitting}
                                        className="btn btn-primary btn-small"
                                    >
                                        {claimSubmitting ? 'Submitting…' : 'Confirm'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowClaimForm(false)}
                                        className="btn btn-secondary btn-small"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {user && (
                    <button
                        type="button"
                        onClick={() => navigate(`/businesses/${business.id}/edit`)}
                        className="btn btn-secondary btn-small"
                        style={{ marginTop: '8px' }}
                    >
                        Edit this business
                    </button>
                )}
                </span>
            </div>
            {business.parent_company && <p><strong>Parent company:</strong> {business.parent_company}</p>}
            {business.description && <p className="business-description">{business.description}</p>}

            {business.websites && business.websites.length > 0 && (
                <p className="business-websites">
                    <strong>Website{business.websites.length > 1 ? 's' : ''}:</strong>{' '}
                    {business.websites.map((url, i) => (
                        <span key={i}>
                            {i > 0 && ', '}
                            <a href={url} target="_blank" rel="noreferrer">{url}</a>
                        </span>
                    ))}
                </p>
            )}

            {keywords.length > 0 && (
                <p className="business-keywords">
                    <strong>Keywords:</strong> {keywords.join(', ')}
                </p>
            )}

            {business.email && (
                <p className="business-email">
                    <strong>Email:</strong> <a href={`mailto:${business.email}`}>{business.email}</a>
                </p>
            )}

            <h2 className="section-title">Locations</h2>

            {business.locations.length === 0 ? (
                <p>No active locations found for this business.</p>
            ) : (
                <div className="locations-grid">
                    {business.locations.map((location) => {
                        const hours = formatBusinessHours(location.business_hours);
                        return (
                            <section
                                key={location.location_id}
                                className="location-card"
                            >
                                <h3 className="location-title">
                                    {location.location_name ?? 'Unnamed Location'}
                                    {location.is_primary ? ' (Primary)' : ''}
                                </h3>

                                <p>
                                    📍 {location.cross_street_1} & {location.cross_street_2}, {location.city}, {location.state} {location.zip_code}
                                </p>

                                <button
                                    type="button"
                                    onClick={() => {
                                        const params = new URLSearchParams({
                                            viewLat: location.latitude.toString(),
                                            viewLng: location.longitude.toString(),
                                            locationId: location.location_id
                                        });
                                        navigate(`/?${params.toString()}`);
                                    }}
                                    className="btn btn-primary"
                                    style={{ marginTop: '8px', marginBottom: '8px' }}
                                >
                                    View on Map
                                </button>

                                {location.phones && location.phones.map((ph, i) => <p key={i}>📞 {ph}</p>)}
                                {location.local_email && <p>✉️ {location.local_email}</p>}
                                {location.temporarily_closed && (
                                    <p className="location-closed">
                                        Temporarily closed{location.closed_reason ? `: ${location.closed_reason}` : ''}
                                    </p>
                                )}

                                <div>
                                    {location.photos.length > 0 ? (
                                        <div className="photo-gallery">
                                            {location.photos.map((photo) => {
                                                const imageUrl = photo.thumbnail_url ?? photo.photo_url;
                                                if (!imageUrl) return null;

                                                return (
                                                    <figure key={photo.id} className="photo-figure">
                                                        <img
                                                            src={imageUrl}
                                                            alt={photo.caption ?? `${business.name} location photo`}
                                                            className="location-photo"
                                                        />
                                                        {photo.caption && (
                                                            <figcaption className="photo-caption">
                                                                {photo.caption}
                                                            </figcaption>
                                                        )}
                                                    </figure>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p>Add Photos to this business</p>
                                    )}
                                </div>

                                <div className="hours-section">
                                    <strong>Business hours:</strong>
                                    <p className="hours-warning">⚠️ Hours may vary due to weather, local events, or holidays. Please check with the business directly for the most accurate information.</p>
                                    {hours.length > 0 ? (
                                        <div className="hours-list">
                                            {hours.map((line, i) => {
                                                const colonIdx = line.indexOf(':');
                                                const day = colonIdx > -1 ? line.slice(0, colonIdx).trim() : '';
                                                const time = colonIdx > -1 ? line.slice(colonIdx + 1).trim() : line;
                                                const isToday = day.length >= 3 && getTodayDay().toLowerCase().startsWith(day.slice(0, 3).toLowerCase());
                                                const openStatus = isToday ? isOpenNow(time) : null;
                                                return (
                                                    <div
                                                        key={i}
                                                        className={`hours-day ${isToday ? 'hours-day-today' : ''}`}
                                                    >
                                                        <span className="hours-day-label">{day || line}</span>
                                                        {day && <span className="hours-time">{time}</span>}
                                                        {openStatus !== null && (
                                                            <span className={`hours-status ${openStatus ? 'hours-status-open' : 'hours-status-closed'}`}>
                                                                {openStatus ? 'Open now' : 'Closed now'}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="hours-not-listed">Not listed</p>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}

            {business.locations.some(location => parseAmenities(location.amenities).length > 0) && (
                <section className="amenities-section">
                    <h2 className="section-title">Amenities</h2>
                    {business.locations.map((location) => {
                        const amenities = parseAmenities(location.amenities);
                        if (amenities.length === 0) return null;
                        
                        return (
                            <div key={location.location_id} className="amenities-location">
                                {business.locations.length > 1 && (
                                    <h3 className="amenities-location-title">
                                        {location.location_name ?? 'Unnamed Location'}
                                    </h3>
                                )}
                                <div className="amenities-grid">
                                    {amenities.map((amenity, index) => (
                                        <span
                                            key={index}
                                            className="amenity-tag"
                                        >
                                            {amenity}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </section>
            )}

            <section className="reviews-section">
                <h2 className="section-title">Reviews</h2>
                <p className="reviews-summary">
                    Average rating: {reviewsData.avg_rating.toFixed(2)} ({reviewsData.review_count} review{reviewsData.review_count === 1 ? '' : 's'})
                </p>

                <form onSubmit={handleReviewSubmit} className="review-form">
                    <h3 className="review-form-title">Add a review</h3>

                    <div className="review-form-grid">
                        <label className="review-form-label">
                            Rating
                            <div
                                className="review-form-rating"
                                onMouseLeave={() => setHoverRating(0)}
                            >
                                {[1, 2, 3, 4, 5].map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setFormRating(value)}
                                        onMouseEnter={() => setHoverRating(value)}
                                        onFocus={() => setHoverRating(value)}
                                        aria-label={`Set rating to ${value} star${value === 1 ? '' : 's'}`}
                                        aria-pressed={formRating === value}
                                        className={`star-button ${value <= (hoverRating || formRating) ? 'star-active' : 'star-inactive'}`}
                                    >
                                        ★
                                    </button>
                                ))}
                                <span className="rating-text">{formRating}/5</span>
                            </div>
                        </label>

                        <label className="review-form-label">
                            Title
                            <input
                                type="text"
                                value={formTitle}
                                onChange={(event) => setFormTitle(event.target.value)}
                                placeholder="Quick summary"
                            />
                        </label>
                    </div>

                    <label className="review-form-comment">
                         Comment
                        <textarea
                            required
                            value={formText}
                            onChange={(event) => setFormText(event.target.value)}
                            rows={4}
                            placeholder="Share your experience"
                        />
                    </label>

                    <div className="review-form-submit">
                        <button type="submit" disabled={submittingReview}>
                            {submittingReview ? 'Submitting...' : 'Submit review'}
                        </button>
                        {reviewError && <span className="review-error">{reviewError}</span>}
                    </div>
                </form>

                {reviewsLoading ? (
                    <p>Loading reviews...</p>
                ) : reviewsData.reviews.length === 0 ? (
                    <p>No reviews yet for this location.</p>
                ) : (
                    <div className="reviews-grid">
                        {reviewsData.reviews.map((review) => (
                            (() => {
                                const isOwner = Boolean(user && review.firebase_uid && user.uid === review.firebase_uid);
                                const isEditing = editingReviewId === review.id;
                                const hasHelpfulSelected = helpfulSelections.has(review.id);

                                return (
                            <article
                                key={review.id}
                                className="review-card"
                            >
                                {isEditing ? (
                                    <form onSubmit={(event) => handleReviewEditSubmit(event, review.id)}>
                                        <label className="review-edit-form">
                                            Rating
                                            <div
                                                className="review-form-rating"
                                                onMouseLeave={() => setEditHoverRating(0)}
                                            >
                                                {[1, 2, 3, 4, 5].map((value) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => setEditRating(value)}
                                                        onMouseEnter={() => setEditHoverRating(value)}
                                                        onFocus={() => setEditHoverRating(value)}
                                                        aria-label={`Set edit rating to ${value} star${value === 1 ? '' : 's'}`}
                                                        aria-pressed={editRating === value}
                                                        className={`star-button ${value <= (editHoverRating || editRating) ? 'star-active' : 'star-inactive'}`}
                                                    >
                                                        ★
                                                    </button>
                                                ))}
                                                <span className="rating-text">{editRating}/5</span>
                                            </div>
                                        </label>

                                        <label className="review-edit-form">
                                            Title
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(event) => setEditTitle(event.target.value)}
                                                placeholder="Quick summary"
                                            />
                                        </label>

                                        <label className="review-edit-form">
                                            Comment
                                            <textarea
                                                required
                                                value={editText}
                                                onChange={(event) => setEditText(event.target.value)}
                                                rows={4}
                                                placeholder="Share your updated experience"
                                            />
                                        </label>

                                        <div className="review-edit-buttons">
                                            <button type="submit" disabled={savingEdit}>
                                                {savingEdit ? 'Saving...' : 'Save changes'}
                                            </button>
                                            <button type="button" onClick={cancelEditingReview} disabled={savingEdit}>
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <>
                                        <p className="review-title">
                                            <strong>{review.title || null}</strong>
                                        </p>
                                        <p className="review-rating">Rating: {renderStars(review.rating)} ({review.rating}/5)</p>
                                        <p className="review-text">{review.review_text}</p>
                                        <p className="review-meta">
                                            Helpful: {review.helpful_count} · by {review.full_name || review.username || 'Unknown' } on {new Date(review.updated_at).toLocaleDateString()}
                                        </p>
                                        <div className="review-actions">
                                            <button
                                                type="button"
                                                onClick={() => handleHelpfulVote(review.id)}
                                                disabled={votingReviewId === review.id}
                                            >
                                                {hasHelpfulSelected ? 'Helpful ✓' : 'Helpful'}
                                            </button>
                                            {isOwner && (
                                                <button type="button" onClick={() => startEditingReview(review)}>
                                                    Edit review
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </article>
                                );
                            })()
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}