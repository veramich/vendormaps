import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useUser from '../src/useUser';
import { toStringArray, MapsChooser, getTodayDay, isOpenNow, formatBusinessHours, renderStars, API_BASE } from '../src/utils';

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
    always_open: boolean;
    weekly_hours_on_website: boolean;
    subject_to_change: boolean;
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
    const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
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

        fetch(`${API_BASE}/api/locations/${id}`)
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
        fetch(`${API_BASE}/api/locations/${id}/reviews`)
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
            const response = await fetch(`${API_BASE}/api/locations/${id}/reviews`, {
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
            const response = await fetch(`${API_BASE}/api/locations/${id}/reviews/${reviewId}/helpful`, {
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
            const response = await fetch(`${API_BASE}/api/locations/${id}/reviews/${reviewId}`, {
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

    async function handleReviewDelete(reviewId: string) {
        if (!id || !user) {
            setReviewError('You must be logged in to delete your review');
            return;
        }

        if (!confirm('Are you sure you want to delete this review? This action cannot be undone.')) {
            return;
        }

        setDeletingReviewId(reviewId);
        setReviewError(null);

        try {
            const reviewToDelete = reviewsData.reviews.find((review) => review.id === reviewId);
            if (!reviewToDelete) {
                throw new Error('Review not found');
            }

            const token = await user.getIdToken();
            const response = await fetch(`${API_BASE}/api/locations/${id}/reviews/${reviewId}`, {
                method: 'DELETE',
                headers: {
                    'authtoken': token,
                },
            });

            if (!response.ok) {
                const payload = await response.json();
                throw new Error(payload?.error || `Server error: ${response.status}`);
            }

            // Update reviews data after successful deletion
            setReviewsData((previous) => {
                const nextCount = previous.review_count - 1;
                const nextAvg =
                    nextCount === 0
                        ? 0
                        : Number(
                              ((previous.avg_rating * previous.review_count - reviewToDelete.rating) / nextCount).toFixed(2)
                          );

                return {
                    ...previous,
                    avg_rating: nextAvg,
                    review_count: nextCount,
                    reviews: previous.reviews.filter((review) => review.id !== reviewId),
                };
            });

            if (editingReviewId === reviewId) {
                cancelEditingReview();
            }
        } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete review';
            setReviewError(message);
        } finally {
            setDeletingReviewId(null);
        }
    }

    async function handleClaimSubmit() {
        if (!user || !business) return;
        setClaimSubmitting(true);
        setClaimMessage(null);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`${API_BASE}/api/businesses/${business.id}/claim`, {
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

    const keywords = useMemo(() => toStringArray(business?.keywords), [business?.keywords]);
    const allAmenities = useMemo(() => {
        const seen = new Set<string>();
        business?.locations.forEach((loc) => toStringArray(loc.amenities).forEach((a) => seen.add(a)));
        return [...seen];
    }, [business?.locations]);
    const allPhotos = useMemo(() =>
        business?.locations.flatMap((loc) =>
            loc.photos.filter((p) => p.photo_url || p.thumbnail_url)
        ) ?? [],
    [business?.locations]);

    const photoStripRef = useRef<HTMLDivElement>(null);
    const scrollStrip = (direction: 'left' | 'right') => {
        photoStripRef.current?.scrollBy({ left: direction === 'left' ? -240 : 240, behavior: 'smooth' });
    };

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

            {/* Hero */}
            <div className="bp-hero">
                {(business.logo_url || business.category_icon) && (
                    <img
                        src={business.logo_url ?? `/${business.category_icon}`}
                        alt={`${business.name} logo`}
                        className="bp-hero-logo"
                    />
                )}
                <div className="bp-hero-info">
                    <h1 className="bp-hero-name">{business.name}</h1>
                    <div className="bp-hero-badges">
                        {business.if_verified && (
                            <span className="bp-badge bp-badge-verified">✔ Verified</span>
                        )}
                        {reviewsData.review_count > 0 && (
                            <span className="bp-badge bp-badge-rating">
                                ★ {reviewsData.avg_rating.toFixed(1)} ({reviewsData.review_count})
                            </span>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                onClick={() => navigate(`/businesses/${business.id}/edit`)}
                                className="btn btn-secondary btn-small"
                            >
                                Edit
                            </button>
                            {!business.if_verified && !claimMessage && !showClaimForm && (
                                <button
                                    type="button"
                                    onClick={() => setShowClaimForm(true)}
                                    className="btn btn-outline btn-small"
                                    style={{ color: '#ff7300' }}
                                >
                                    Claim
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Photo strip */}
            {allPhotos.length > 0 && (
                <div className="bp-photo-strip-wrapper">
                    {allPhotos.length > 3 && (
                        <button type="button" className="bp-strip-arrow bp-strip-arrow-left" onClick={() => scrollStrip('left')} aria-label="Scroll photos left">‹</button>
                    )}
                    <div className="bp-photo-strip" ref={photoStripRef}>
                        {allPhotos.map((photo) => {
                            const src = photo.thumbnail_url ?? photo.photo_url!;
                            return (
                                <img
                                    key={photo.id}
                                    src={src}
                                    alt=""
                                    className="bp-photo-strip-img"
                                    height={120}
                                    loading="lazy"
                                    decoding="async"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                            );
                        })}
                    </div>
                    {allPhotos.length > 3 && (
                        <button type="button" className="bp-strip-arrow bp-strip-arrow-right" onClick={() => scrollStrip('right')} aria-label="Scroll photos right">›</button>
                    )}
                </div>
            )}

            {/* Locations */}
            {business.locations.length === 0 ? (
                <p className="bp-empty">No active locations found.</p>
            ) : (
                <div className="locations-grid">
                    {business.locations.map((location) => {
                        const hours = formatBusinessHours(location.business_hours);
                        const businessQuery = `${location.cross_street_1} & ${location.cross_street_2}, ${location.city}, ${location.state}`;

                        return (
                            <section key={location.location_id} className="location-card">
                                {location.temporarily_closed && (
                                    <p className="location-closed">
                                        ⚠ Temporarily closed{location.closed_reason ? `: ${location.closed_reason}` : ''}
                                    </p>
                                )}

                                <div className="bp-location-header">
                                    <div className="bp-location-address">
                                        <span>📍 {location.cross_street_1} & {location.cross_street_2}</span>
                                        <span className="bp-location-city">{location.city}, {location.state} {location.zip_code}</span>
                                    </div>
                                    <div className="bp-location-actions">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const params = new URLSearchParams({
                                                    viewLat: location.latitude.toString(),
                                                    viewLng: location.longitude.toString(),
                                                    locationId: location.location_id,
                                                });
                                                navigate(`/?${params.toString()}`);
                                            }}
                                            className="btn btn-primary btn-small"
                                        >
                                            Map
                                        </button>
                                        <MapsChooser lat={location.latitude} lng={location.longitude} query={businessQuery} className="btn btn-secondary btn-small">
                                            Directions
                                        </MapsChooser>
                                    </div>
                                </div>

                                {location.phones && location.phones.map((ph, i) => (
                                    <p key={i} className="bp-contact-row">📞 <a href={`tel:${ph}`}>{ph}</a></p>
                                ))}
                                {location.local_email && (
                                    <p className="bp-contact-row">✉️ <a href={`mailto:${location.local_email}`}>{location.local_email}</a></p>
                                )}
                                {business.email && !location.local_email && (
                                    <p className="bp-contact-row">✉️ <a href={`mailto:${business.email}`}>{business.email}</a></p>
                                )}
                                {business.websites && business.websites.length > 0 && (
                                    <p className="bp-contact-row">🌐 {business.websites.map((url: string, i: number) => (
                                        <span key={i}>
                                            {i > 0 && ', '}
                                            <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                                        </span>
                                    ))}</p>
                                )}
                                {business.description && (
                                    <p className="bp-description" style={{ marginTop: '8px' }}>{business.description}</p>
                                )}

                                <div className="hours-section">
                                    <h2 className="section-title">Hours</h2>
                                    {location.always_open ? (
                                        <p className="hours-always-open">Open 24/7</p>
                                    ) : location.weekly_hours_on_website ? (
                                        <p className="hours-not-listed">
                                            Hours posted weekly on business website
                                            {business.websites && business.websites.length > 0 && (
                                                <> — {business.websites.map((site: string, i: number) => (
                                                    <span key={i}>
                                                        {i > 0 && ', '}
                                                        <a href={site} target="_blank" rel="noopener noreferrer">{site}</a>
                                                    </span>
                                                ))}</>
                                            )}
                                        </p>
                                    ) : (
                                        <>
                                            {location.subject_to_change && (
                                                <p className="hours-subject-to-change">⚠️ Business hours are subject to change due to weather, events, or other reasons. Please check directly with business for accurate hours.</p>
                                            )}
                                            {hours.length > 0 ? (
                                                <div className="hours-table">
                                                    {hours.map((line, i) => {
                                                        const colonIdx = line.indexOf(':');
                                                        const day = colonIdx > -1 ? line.slice(0, colonIdx).trim() : '';
                                                        const time = colonIdx > -1 ? line.slice(colonIdx + 1).trim() : line;
                                                        const isToday = day.length >= 3 && getTodayDay().toLowerCase().startsWith(day.slice(0, 3).toLowerCase());
                                                        const openStatus = isToday ? isOpenNow(time) : null;
                                                        return (
                                                            <div key={i} className={`hours-row ${isToday ? 'hours-row-today' : ''}`}>
                                                                <span className="hours-day-col">{day || line}</span>
                                                                {day && (
                                                                    <>
                                                                        <span className="hours-time-col">{time}</span>
                                                                        {openStatus !== null && (
                                                                            <span className={`hours-status-col hours-status-${openStatus ? 'open' : 'closed'}`}>
                                                                                {openStatus ? 'Open' : 'Closed'}
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="hours-not-listed">Not listed</p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}

            {/* ── Claim ── */}
            {(claimMessage || showClaimForm) && (
                <div className="bp-claim">
                    {claimMessage && (
                        <p className={`claim-message ${claimMessage.startsWith('Your claim') ? 'claim-message-success' : 'claim-message-error'}`}>
                            {claimMessage}
                        </p>
                    )}
                    {showClaimForm && (
                        <div className="claim-form">
                            <p className="claim-form-description">Submit a claim? We'll reach out using the contact info on file.</p>
                            <div className="claim-form-buttons">
                                <button type="button" onClick={handleClaimSubmit} disabled={claimSubmitting} className="btn btn-primary btn-small">
                                    {claimSubmitting ? 'Submitting…' : 'Confirm'}
                                </button>
                                <button type="button" onClick={() => setShowClaimForm(false)} className="btn btn-secondary btn-small">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Meta info */}
            {(business.parent_company || keywords.length > 0 || allAmenities.length > 0) && (
                <div className="bp-meta">
                    {business.parent_company && (
                        <div className="bp-meta-row">
                            <span className="bp-meta-label">Parent</span>
                            <span>{business.parent_company}</span>
                        </div>
                    )}
                    {keywords.length > 0 && (
                        <div className="bp-meta-row">
                            <span className="bp-meta-label">Tags</span>
                            <span className="bp-keywords">{keywords.join(' · ')}</span>
                        </div>
                    )}
                    {allAmenities.length > 0 && (
                        <div className="bp-meta-row bp-meta-row-wrap">
                            <span className="bp-meta-label">Amenities</span>
                            <div className="amenities-grid">
                                {allAmenities.map((amenity, i) => (
                                    <span key={i} className="amenity-tag">{amenity}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Reviews */}
            <section className="reviews-section">
                <div className="bp-reviews-header">
                    <h2 className="section-title" style={{ margin: 0 }}>Reviews</h2>
                    {reviewsData.review_count > 0 && (
                        <span className="bp-avg-rating">
                            ★ {reviewsData.avg_rating.toFixed(1)} · {reviewsData.review_count} review{reviewsData.review_count === 1 ? '' : 's'}
                        </span>
                    )}
                </div>

                {reviewsLoading ? (
                    <p>Loading reviews...</p>
                ) : reviewsData.reviews.length === 0 ? (
                    <p className="bp-empty">No reviews yet.</p>
                ) : (
                    <div className="reviews-grid">
                        {reviewsData.reviews.map((review) => (() => {
                            const isOwner = Boolean(user && review.firebase_uid && user.uid === review.firebase_uid);
                            const isEditing = editingReviewId === review.id;
                            const hasHelpfulSelected = helpfulSelections.has(review.id);
                            return (
                                <article key={review.id} className="review-card">
                                    {isEditing ? (
                                        <form onSubmit={(event) => handleReviewEditSubmit(event, review.id)}>
                                            <label className="review-edit-form">
                                                Rating
                                                <div className="review-form-rating" onMouseLeave={() => setEditHoverRating(0)}>
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
                                                        >★</button>
                                                    ))}
                                                    <span className="rating-text">{editRating}/5</span>
                                                </div>
                                            </label>
                                            <label className="review-edit-form">
                                                Title
                                                <input type="text" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Quick summary" />
                                            </label>
                                            <label className="review-edit-form">
                                                Comment
                                                <textarea required value={editText} onChange={(event) => setEditText(event.target.value)} rows={4} placeholder="Share your updated experience" />
                                            </label>
                                            <div className="review-edit-buttons">
                                                <button type="submit" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</button>
                                                <button type="button" onClick={cancelEditingReview} disabled={savingEdit}>Cancel</button>
                                            </div>
                                        </form>
                                    ) : (
                                        <>
                                            <div className="bp-review-top">
                                                <span className="bp-review-stars">{renderStars(review.rating)}</span>
                                                {review.title && <strong className="bp-review-title-text">{review.title}</strong>}
                                            </div>
                                            <p className="review-text">{review.review_text}</p>
                                            <div className="bp-review-footer">
                                                <span className="review-meta">
                                                    {review.full_name || review.username || 'Unknown'} · {new Date(review.updated_at).toLocaleDateString()}{review.was_edited ? ' · edited' : ''}
                                                </span>
                                                <div className="review-actions">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleHelpfulVote(review.id)}
                                                        disabled={votingReviewId === review.id}
                                                    >
                                                        {hasHelpfulSelected ? '👍' : 'Helpful'}{review.helpful_count > 0 ? ` (${review.helpful_count})` : ''}
                                                    </button>
                                                    {isOwner && (
                                                        <>
                                                            <button type="button" onClick={() => startEditingReview(review)}>Edit</button>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleReviewDelete(review.id)}
                                                                disabled={deletingReviewId === review.id}
                                                                style={{ color: '#dc3545' }}
                                                            >
                                                                {deletingReviewId === review.id ? 'Deleting...' : 'Delete'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </article>
                            );
                        })())}
                    </div>
                )}

                <h2 className="section-title">Add a review</h2>
                <form onSubmit={handleReviewSubmit} className="review-form">
                    <div className="review-form-grid">
                        <label className="review-form-label">
                            Rating
                            <div className="review-form-rating" onMouseLeave={() => setHoverRating(0)}>
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
                                    >★</button>
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
            </section>
        </main>
    );
}