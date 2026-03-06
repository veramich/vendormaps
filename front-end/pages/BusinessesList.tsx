import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

interface BusinessRow {
	id: string;
	name: string;
	logo_url?: string | null;
	photo_urls?: string[] | string | null;
	category_name?: string | null;
	days_open?: string[] | string | null;
	keywords?: string[] | string | null;
	amenities?: string[] | string | null;
}

interface LocationRow {
	location_id: string;
	business_id: string;
	business_name: string;
	category_name?: string | null;
	city?: string | null;
	state?: string | null;
	zip_code?: string | number | null;
	latitude?: number | null;
	longitude?: number | null;
}

interface BusinessListItem {
	id: string;
	name: string;
	locationId: string | null;
	photoUrls: string[];
	categories: string[];
	daysOpen: string[];
	keywords: string[];
	amenities: string[];
	city: string;
	state: string;
	zipCode: string;
	latitude: number | null;
	longitude: number | null;
}

const DAY_OPTIONS = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

const RADIUS_OPTIONS = [1, 5, 10, 25];

function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean);
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return [];

		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return parsed
						.filter((item): item is string => typeof item === "string")
						.map((item) => item.trim())
						.filter(Boolean);
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

function normalize(text: string): string {
	return text.trim().toLowerCase();
}

function isZipCode(value: string): boolean {
	return /^\d{5}$/.test(value.trim());
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 3958.8;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function BusinessesList() {
	const [businesses, setBusinesses] = useState<BusinessListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [locationQuery, setLocationQuery] = useState("");
	const [radiusMiles, setRadiusMiles] = useState(5);
	const [zipCenter, setZipCenter] = useState<{ lat: number; lng: number } | null>(null);
	const [zipGeocoding, setZipGeocoding] = useState(false);
	const [zipError, setZipError] = useState<string | null>(null);
	const [showFilters, setShowFilters] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState("");
	const [selectedDay, setSelectedDay] = useState("");
	const [selectedAmenity, setSelectedAmenity] = useState("");

	useEffect(() => {
		let mounted = true;

		async function loadBusinesses() {
			try {
				setLoading(true);
				setError(null);

				const [businessesResponse, locationsResponse] = await Promise.all([
					fetch("/api/businesses"),
					fetch("/api/locations"),
				]);

				if (!businessesResponse.ok || !locationsResponse.ok) {
					throw new Error(
						`Server error: ${businessesResponse.status}/${locationsResponse.status}`
					);
				}

				const businessRows = (await businessesResponse.json()) as BusinessRow[];
				const locationRows = (await locationsResponse.json()) as LocationRow[];

				const byId = new Map<string, BusinessListItem>();

				businessRows.forEach((row) => {
					const categories = row.category_name ? [row.category_name] : [];
					const photoUrls = toStringArray(row.photo_urls);
					const normalizedLogo = row.logo_url?.trim();
					if (normalizedLogo && !photoUrls.includes(normalizedLogo)) {
						photoUrls.unshift(normalizedLogo);
					}

					byId.set(row.id, {
						id: row.id,
						name: row.name,
						locationId: null,
						photoUrls,
						categories,
						daysOpen: toStringArray(row.days_open),
						keywords: toStringArray(row.keywords),
						amenities: toStringArray(row.amenities),
						city: "",
						state: "",
						zipCode: "",
						latitude: null,
						longitude: null,
					});
				});

				locationRows.forEach((row) => {
					const existing = byId.get(row.business_id);
					if (!existing) {
						byId.set(row.business_id, {
							id: row.business_id,
							name: row.business_name,
							locationId: row.location_id,
							photoUrls: [],
							categories: row.category_name ? [row.category_name] : [],
							daysOpen: [],
							keywords: [],
							amenities: [],
							city: row.city?.trim() ?? "",
							state: row.state?.trim() ?? "",
							zipCode: row.zip_code != null ? String(row.zip_code).trim() : "",
							latitude: row.latitude ?? null,
							longitude: row.longitude ?? null,
						});
						return;
					}

					if (!existing.locationId) {
						existing.locationId = row.location_id;
					}

					if (!existing.city && row.city) existing.city = row.city.trim();
					if (!existing.state && row.state) existing.state = row.state.trim();
					if (!existing.zipCode && row.zip_code != null) {
						existing.zipCode = String(row.zip_code).trim();
					}
					if (existing.latitude == null && row.latitude != null) {
						existing.latitude = row.latitude;
						existing.longitude = row.longitude ?? null;
					}

					if (
						row.category_name &&
						!existing.categories.some(
							(category) => normalize(category) === normalize(row.category_name as string)
						)
					) {
						existing.categories.push(row.category_name);
					}
				});

				const merged = [...byId.values()].sort((a, b) =>
					a.name.localeCompare(b.name)
				);

				if (mounted) {
					setBusinesses(merged);
				}
			} catch (requestError) {
				if (mounted) {
					const message =
						requestError instanceof Error
							? requestError.message
							: "Unable to load businesses";
					setError(message);
				}
			} finally {
				if (mounted) {
					setLoading(false);
				}
			}
		}

		void loadBusinesses();

		return () => {
			mounted = false;
		};
	}, []);

	// Geocode zip codes automatically as the user types
	useEffect(() => {
		const q = locationQuery.trim();
		if (!isZipCode(q)) {
			setZipCenter(null);
			setZipError(null);
			return;
		}

		let cancelled = false;
		setZipGeocoding(true);
		setZipError(null);

		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/location-search?q=${encodeURIComponent(q + ", USA")}`);
				const data = await res.json();
				if (cancelled) return;
				if (!res.ok || !Array.isArray(data) || data.length === 0) {
					setZipError("Zip code not found.");
					setZipCenter(null);
				} else {
					setZipCenter({ lat: data[0].latitude, lng: data[0].longitude });
				}
			} catch {
				if (!cancelled) {
					setZipError("Could not look up zip code.");
					setZipCenter(null);
				}
			} finally {
				if (!cancelled) setZipGeocoding(false);
			}
		}, 500);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [locationQuery]);

	const categoryOptions = useMemo(() => {
		const options = new Set<string>();
		businesses.forEach((business) => {
			business.categories.forEach((category) => {
				if (category.trim()) options.add(category);
			});
		});
		return [...options].sort((a, b) => a.localeCompare(b));
	}, [businesses]);

	const amenityOptions = useMemo(() => {
		const options = new Set<string>();
		businesses.forEach((business) => {
			business.amenities.forEach((a) => { if (a.trim()) options.add(a); });
		});
		return [...options].sort((a, b) => a.localeCompare(b));
	}, [businesses]);

	const filteredBusinesses = useMemo(() => {
		const query = normalize(searchQuery);
		const location = normalize(locationQuery);
		const category = normalize(selectedCategory);
		const day = normalize(selectedDay);

		return businesses.filter((business) => {
			const normalizedName = normalize(business.name);
			const normalizedCategories = business.categories.map(normalize);
			const normalizedDays = business.daysOpen.map(normalize);
			const normalizedKeywords = business.keywords.map(normalize);
			const normalizedAmenities = business.amenities.map(normalize);

			const matchesSearch =
				!query ||
				normalizedName.includes(query) ||
				normalizedCategories.some((item) => item.includes(query)) ||
				normalizedKeywords.some((item) => item.includes(query)) ||
				normalizedAmenities.some((item) => item.includes(query));

			let matchesLocation = true;
			if (location) {
				if (isZipCode(location) && zipCenter) {
					// Radius filter: only include businesses with known coordinates within range
					if (business.latitude != null && business.longitude != null) {
						const dist = haversineMiles(
							zipCenter.lat,
							zipCenter.lng,
							business.latitude,
							business.longitude
						);
						matchesLocation = dist <= radiusMiles;
					} else {
						// No coordinates — fall back to zip string match
						matchesLocation = normalize(business.zipCode).includes(location);
					}
				} else if (!isZipCode(location)) {
					matchesLocation =
						normalize(business.city).includes(location) ||
						normalize(business.state).includes(location);
				}
				// If it looks like a zip but hasn't geocoded yet, skip filter (show all)
			}

			const matchesCategory = !category || normalizedCategories.includes(category);

			const matchesDay =
				!day ||
				normalizedDays.some(
					(openDay) => openDay === day || openDay.startsWith(day.slice(0, 3))
				);

			const amenity = normalize(selectedAmenity);
		const matchesAmenity = !amenity || business.amenities.some((a) => normalize(a) === amenity);

		return matchesSearch && matchesLocation && matchesCategory && matchesDay && matchesAmenity;
		});
	}, [businesses, searchQuery, locationQuery, zipCenter, radiusMiles, selectedCategory, selectedDay, selectedAmenity]);

	const showingZipRadius = isZipCode(locationQuery.trim()) && zipCenter != null;

	return (
		<main className="businesses-list-main">
			<h1 className="businesses-list-title">Business Directory</h1>
			<div>
				<input
					type="text"
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder="Search by name, keywords, or amenities"
					aria-label="Search businesses by name, keywords, or amenities"
					className="businesses-list-search-input"
				/>
				<input
					type="text"
					value={locationQuery}
					onChange={(event) => setLocationQuery(event.target.value)}
					placeholder="City, state, or zip code"
					aria-label="Filter by city, state, or zip code"
					className="businesses-list-search-input"
				/>

				<button
					type="button"
					onClick={() => setShowFilters((previous) => !previous)}
					aria-label="Toggle filters"
					className="businesses-list-filter-button"
				>
					<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
						<path d="M1 2h12L8 7v4l-2 1V7L1 2z" fill="currentColor" />
					</svg>
					Filters
				</button>
			</div>

			{zipGeocoding && (
				<p className="businesses-list-geocoding-message">
					Looking up zip code...
				</p>
			)}
			{zipError && (
				<p className="businesses-list-error-message">{zipError}</p>
			)}
			{showingZipRadius && (
				<div className="businesses-list-radius-container">
					<span>Radius:</span>
					{RADIUS_OPTIONS.map((miles) => (
						<button
							key={miles}
							type="button"
							onClick={() => setRadiusMiles(miles)}
							className={`businesses-list-radius-button ${radiusMiles === miles ? 'active' : ''}`}
						>
							{miles} mi
						</button>
					))}
				</div>
			)}

			{showFilters && (
				<section className="businesses-list-filters-section">
					<label className="businesses-list-filter-label">
						Category
						<select
							value={selectedCategory}
							onChange={(event) => setSelectedCategory(event.target.value)}
							className="businesses-list-filter-select"
						>
							<option value="">All categories</option>
							{categoryOptions.map((category) => (
								<option key={category} value={category}>
									{category}
								</option>
							))}
						</select>
					</label>

					<label className="businesses-list-filter-label">
						Days Open
						<select
							value={selectedDay}
							onChange={(event) => setSelectedDay(event.target.value)}
							className="businesses-list-filter-select"
						>
							<option value="">Any day</option>
							{DAY_OPTIONS.map((day) => (
								<option key={day} value={day}>
									{day}
								</option>
							))}
						</select>
					</label>
					<label className="businesses-list-filter-label">
						Amenities
						<select
							value={selectedAmenity}
							onChange={(event) => setSelectedAmenity(event.target.value)}
							className="businesses-list-filter-select"
						>
							<option value="">Any amenity</option>
							{amenityOptions.map((a) => (
								<option key={a} value={a}>{a}</option>
							))}
						</select>
					</label>
				</section>
			)}

			{loading && <p>Loading businesses...</p>}

			{!loading && error && (
				<p className="businesses-list-error">Could not load businesses: {error}</p>
			)}

			{!loading && !error && (
				<>
					<p className="businesses-list-count">
						Showing {filteredBusinesses.length} of {businesses.length} businesses
						{showingZipRadius && ` within ${radiusMiles} mi of ${locationQuery.trim()}`}
					</p>

					{filteredBusinesses.length === 0 ? (
						<p>No businesses match your current search and filters.</p>
					) : (
						<div className="businesses-list-grid">
							{filteredBusinesses.map((business) => (
								<article
									key={business.id}
									className="business-card"
								>
									{business.photoUrls.length > 0 ? (
										<div className="business-card-photos">
											<div className="business-card-photo-grid">
												{business.photoUrls.slice(0, 3).map((photoUrl, index) => (
													<img
														key={`${business.id}-${photoUrl}-${index}`}
														src={photoUrl}
														alt={`${business.name} photo ${index + 1}`}
														loading="lazy"
														onError={(event) => {
															event.currentTarget.style.display = "none";
														}}
														className="business-card-photo"
													/>
												))}
											</div>
											{business.photoUrls.length > 3 && (
												<p className="business-card-photo-count">
													+{business.photoUrls.length - 3} more photo
													{business.photoUrls.length - 3 !== 1 ? "s" : ""}
												</p>
											)}
										</div>
									) : (
										<div
											aria-hidden="true"
											className="business-card-placeholder"
										>
											🏪
										</div>
									)}
									<h3 className="business-card-title">{business.name}</h3>
									<p className="business-card-category">
										Category: {business.categories.join(", ") || "Not listed"}
									</p>
									{(business.city || business.state) && (
										<p className="business-card-location">
											📍 {[business.city, business.state].filter(Boolean).join(", ")}
											{business.zipCode ? ` ${business.zipCode}` : ""}
										</p>
									)}
									<p className="business-card-days">
										Days open: {business.daysOpen.join(", ") || "Not listed"}
									</p>
									<p className="business-card-keywords">
										Keywords: {business.keywords.join(", ") || "Not listed"}
									</p>
									{business.locationId ? (
										<Link to={`/locations/${business.locationId}`}>View details</Link>
									) : (
										<span>Location unavailable</span>
									)}
								</article>
							))}
						</div>
					)}
				</>
			)}
		</main>
	);
}
