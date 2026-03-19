import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toStringArray, normalize, isZipCode, haversineMiles, MapsChooser, API_BASE, isBusinessOpenNow } from '../src/utils';
import { DAY_OPTIONS, DAY_NAMES, RADIUS_OPTIONS } from '../src/constants';

interface BusinessRow {
	id: string;
	name: string;
	logo_url?: string | null;
	photo_urls?: string[] | string | null;
	category_name?: string | null;
	business_hours?: Record<number, { closed: boolean; open_24_hours: boolean }> | null;
	description?: string | null;
	amenities?: string[] | string | null;
}

interface CategoryRow {
	id: string;
	name: string;
	icon?: string | null;
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
	cross_street_1?: string | null;
	cross_street_2?: string | null;
}

interface BusinessListItem {
	id: string;
	name: string;
	locationId: string | null;
	photoUrls: string[];
	categories: string[];
	categoryIcon: string | null;
	daysOpen: string[];
	description: string;
	amenities: string[];
	city: string;
	state: string;
	zipCode: string;
	crossStreet1: string;
	crossStreet2: string;
	latitude: number | null;
	longitude: number | null;
	businessHours: unknown;
}

function getFallbackCategoryIcon(categories: string[]): string {
	if (!categories.length) return '/icon-transparent.png';
	const categoryName = categories[0].toLowerCase().trim();
	return `/${categoryName}.png`;
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
	const [openNowFilter, setOpenNowFilter] = useState(false);

	useEffect(() => {
		let mounted = true;

		async function loadBusinesses() {
			try {
				setLoading(true);
				setError(null);

				const [businessesResponse, locationsResponse, categoriesResponse] = await Promise.all([
					fetch(`${API_BASE}/api/businesses`),
					fetch(`${API_BASE}/api/locations`),
					fetch(`${API_BASE}/api/categories`),
				]);

				if (!businessesResponse.ok || !locationsResponse.ok || !categoriesResponse.ok) {
					throw new Error(
						`Server error: ${businessesResponse.status}/${locationsResponse.status}/${categoriesResponse.status}`
					);
				}

				const businessRows = (await businessesResponse.json()) as BusinessRow[];
				const locationRows = (await locationsResponse.json()) as LocationRow[];
				const categoryRows = (await categoriesResponse.json()) as CategoryRow[];

				const categoryIconMap = new Map<string, string>();
				categoryRows.forEach((category) => {
					if (category.icon) {
						categoryIconMap.set(category.name.toLowerCase().trim(), category.icon);
					}
				});

				const byId = new Map<string, BusinessListItem>();

				businessRows.forEach((row) => {
					const categories = row.category_name ? [row.category_name] : [];
					const photoUrls = toStringArray(row.photo_urls);
					const normalizedLogo = row.logo_url?.trim();
					if (normalizedLogo && !photoUrls.includes(normalizedLogo)) {
						photoUrls.unshift(normalizedLogo);
					}

					const categoryIcon = categories.length > 0
						? categoryIconMap.get(categories[0].toLowerCase().trim()) || null
						: null;

					byId.set(row.id, {
						id: row.id,
						name: row.name,
						locationId: null,
						photoUrls,
						categories,
						categoryIcon,
						daysOpen: row.business_hours
						? DAY_NAMES.filter((_, i) => row.business_hours![i] && !row.business_hours![i].closed)
						: [],
						description: row.description ?? "",
						amenities: toStringArray(row.amenities),
						city: "",
						state: "",
						zipCode: "",
						crossStreet1: "",
						crossStreet2: "",
						latitude: null,
						longitude: null,
						businessHours: row.business_hours ?? null,
					});
				});

				locationRows.forEach((row) => {
					const existing = byId.get(row.business_id);
					if (!existing) {
						const categories = row.category_name ? [row.category_name] : [];
						const categoryIcon = categories.length > 0
							? categoryIconMap.get(categories[0].toLowerCase().trim()) || null
							: null;

						byId.set(row.business_id, {
							id: row.business_id,
							name: row.business_name,
							locationId: row.location_id,
							photoUrls: [],
							categories,
							categoryIcon,
							daysOpen: [],
							description: "",
							amenities: [],
							city: row.city?.trim() ?? "",
							state: row.state?.trim() ?? "",
							zipCode: row.zip_code != null ? String(row.zip_code).trim() : "",
							crossStreet1: row.cross_street_1?.trim() ?? "",
							crossStreet2: row.cross_street_2?.trim() ?? "",
							latitude: row.latitude ?? null,
							longitude: row.longitude ?? null,
							businessHours: null,
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
					if (!existing.crossStreet1 && row.cross_street_1) {
						existing.crossStreet1 = row.cross_street_1.trim();
					}
					if (!existing.crossStreet2 && row.cross_street_2) {
						existing.crossStreet2 = row.cross_street_2.trim();
					}

					if (
						row.category_name &&
						!existing.categories.some(
							(category) => normalize(category) === normalize(row.category_name as string)
						)
					) {
						existing.categories.push(row.category_name);
						if (!existing.categoryIcon) {
							existing.categoryIcon = categoryIconMap.get(row.category_name.toLowerCase().trim()) || null;
						}
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
				const res = await fetch(`${API_BASE}/api/location-search?q=${encodeURIComponent(q + ", USA")}`);
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
		const amenity = normalize(selectedAmenity);

		return businesses.filter((business) => {
			const normalizedName = normalize(business.name);
			const normalizedCategories = business.categories.map(normalize);
			const normalizedDays = business.daysOpen.map(normalize);
			const normalizedAmenities = business.amenities.map(normalize);

			const queryWords = query.split(/\s+/).filter(Boolean);
			const matchesSearch =
				!query ||
				queryWords.some((word) =>
					normalizedName.includes(word) ||
					normalizedCategories.some((item) => item.includes(word)) ||
					normalizedAmenities.some((item) => item.includes(word)) ||
					normalize(business.description).includes(word)
				);

			let matchesLocation = true;
			if (location) {
				if (isZipCode(location) && zipCenter) {
					if (business.latitude != null && business.longitude != null) {
						const dist = haversineMiles(
							zipCenter.lat,
							zipCenter.lng,
							business.latitude,
							business.longitude
						);
						matchesLocation = dist <= radiusMiles;
					} else {
						matchesLocation = normalize(business.zipCode).includes(location);
					}
				} else if (!isZipCode(location)) {
					matchesLocation =
						normalize(business.city).includes(location) ||
						normalize(business.state).includes(location);
				}
			}

			const matchesCategory = !category || normalizedCategories.includes(category);

			const matchesDay =
				!day ||
				normalizedDays.some(
					(openDay) => openDay === day || openDay.startsWith(day.slice(0, 3))
				);

			const matchesAmenity = !amenity || normalizedAmenities.some((a) => a === amenity);

			const matchesOpenNow = !openNowFilter || isBusinessOpenNow(business.businessHours);

			return matchesSearch && matchesLocation && matchesCategory && matchesDay && matchesAmenity && matchesOpenNow;
		});
	}, [businesses, searchQuery, locationQuery, zipCenter, radiusMiles, selectedCategory, selectedDay, selectedAmenity, openNowFilter]);

	const showingZipRadius = isZipCode(locationQuery.trim()) && zipCenter != null;

	return (
		<main>
			<div className="search-container">
				<input
					type="text"
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder="Search by name, description, or amenities"
					aria-label="Search businesses by name, description, or amenities"
				/>
				<input
					type="text"
					value={locationQuery}
					onChange={(event) => setLocationQuery(event.target.value)}
					placeholder="City, state, or zip code"
					aria-label="Filter by city, state, or zip code"
				/>

				<button
					type="button"
					onClick={() => setShowFilters((previous) => !previous)}
					aria-label="Toggle filters"
				>
					<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
						<path d="M1 2h12L8 7v4l-2 1V7L1 2z" fill="currentColor" />
					</svg>
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
					<button
						type="button"
						onClick={() => setOpenNowFilter((prev) => !prev)}
						className={`businesses-list-filter-button ${openNowFilter ? 'active' : ''}`}
					>
						Open Now
					</button>
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
										<div className="business-card-photos">
											<div className="business-card-photo-grid">
												<img
													src={business.categoryIcon || getFallbackCategoryIcon(business.categories)}
													alt={`${business.categories.join(", ") || 'Business'} category icon`}
													loading="lazy"
													className="business-card-photo business-card-category-icon"
													onError={(event) => {
														if (event.currentTarget.src !== '/icon-transparent.png') {
															event.currentTarget.src = '/icon-transparent.png';
														}
													}}
												/>
											</div>
										</div>
									)}
									<div className="business-card-content">
										<h3 className="business-card-title">{business.name}</h3>
										<p className="business-card-category">
											{business.categories.join(", ") || "Not listed"}
										</p>
										{(business.city || business.state) && (
											<p className="business-card-location">
												{(business.crossStreet1 || business.crossStreet2) && (
													<span>
														{[business.crossStreet1, business.crossStreet2]
															.filter(Boolean)
															.join(" & ")}
													</span>
												)}
												<br /> {[business.city, business.state].filter(Boolean).join(", ")}
												{business.zipCode ? ` ${business.zipCode}` : ""}
											</p>
										)}
										<div className="business-card-actions">
											{business.locationId ? (
												<Link to={`/locations/${business.locationId}`}>Details</Link>
											) : (
												<span>Location unavailable</span>
											)}
											{business.latitude != null && business.longitude != null && (
												<MapsChooser lat={business.latitude} lng={business.longitude} query={business.name} className="open-in-maps-btn">
													Maps &rarr;
												</MapsChooser>
											)}
										</div>
									</div>
								</article>
							))}
						</div>
					)}
				</>
			)}
		</main>
	);
}
