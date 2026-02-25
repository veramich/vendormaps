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

export default function BusinessesList() {
	const [businesses, setBusinesses] = useState<BusinessListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [showFilters, setShowFilters] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState("");
	const [selectedDay, setSelectedDay] = useState("");

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
						});
						return;
					}

					if (!existing.locationId) {
						existing.locationId = row.location_id;
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

	const categoryOptions = useMemo(() => {
		const options = new Set<string>();
		businesses.forEach((business) => {
			business.categories.forEach((category) => {
				if (category.trim()) {
					options.add(category);
				}
			});
		});
		return [...options].sort((a, b) => a.localeCompare(b));
	}, [businesses]);

	const filteredBusinesses = useMemo(() => {
		const query = normalize(searchQuery);
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

			const matchesCategory = !category || normalizedCategories.includes(category);

			const matchesDay =
				!day ||
				normalizedDays.some(
					(openDay) => openDay === day || openDay.startsWith(day.slice(0, 3))
				);

			return matchesSearch && matchesCategory && matchesDay;
		});
	}, [businesses, searchQuery, selectedCategory, selectedDay]);

	return (
		<main style={{ padding: "20px" }}>
			<h1 style={{ marginBottom: "12px" }}>Business Directory</h1>
			<div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
				<input
					type="text"
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder="Search by name, keywords, or amenities"
					aria-label="Search businesses by name, keywords, or amenities"
					style={{
						flex: 1,
						padding: "10px",
						border: "1px solid #cbd5e1",
						borderRadius: "8px",
					}}
				/>

				<button
					type="button"
					onClick={() => setShowFilters((previous) => !previous)}
					aria-label="Toggle filters"
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: "6px",
						padding: "10px 12px",
						border: "1px solid #cbd5e1",
						borderRadius: "8px",
						background: "orange",
					}}
				>
					<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
						<path d="M1 2h12L8 7v4l-2 1V7L1 2z" fill="currentColor" />
					</svg>
					Filters
				</button>
			</div>

			{showFilters && (
				<section
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
						gap: "10px",
						marginBottom: "16px",
					}}
				>
					<label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
						Category
						<select
							value={selectedCategory}
							onChange={(event) => setSelectedCategory(event.target.value)}
							style={{ padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
						>
							<option value="">All categories</option>
							{categoryOptions.map((category) => (
								<option key={category} value={category}>
									{category}
								</option>
							))}
						</select>
					</label>

					<label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
						Days Open
						<select
							value={selectedDay}
							onChange={(event) => setSelectedDay(event.target.value)}
							style={{ padding: "9px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
						>
							<option value="">Any day</option>
							{DAY_OPTIONS.map((day) => (
								<option key={day} value={day}>
									{day}
								</option>
							))}
						</select>
					</label>

					</section>
			)}

			{loading && <p>Loading businesses...</p>}

			{!loading && error && (
				<p style={{ color: "#b91c1c" }}>Could not load businesses: {error}</p>
			)}

			{!loading && !error && (
				<>
					<p style={{ marginBottom: "12px" }}>
						Showing {filteredBusinesses.length} of {businesses.length} businesses
					</p>

					{filteredBusinesses.length === 0 ? (
						<p>No businesses match your current search and filters.</p>
					) : (
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
								gap: "12px",
							}}
						>
							{filteredBusinesses.map((business) => (
								<article
									key={business.id}
									style={{
										border: "1px solid #e2e8f0",
										borderRadius: "10px",
										padding: "12px",
									}}
								>
									{business.photoUrls.length > 0 ? (
										<div style={{ marginBottom: "10px" }}>
											<div
												style={{
													display: "grid",
													gridTemplateColumns: "repeat(3, 1fr)",
													gap: "6px",
												}}
											>
												{business.photoUrls.slice(0, 3).map((photoUrl, index) => (
													<img
														key={`${business.id}-${photoUrl}-${index}`}
														src={photoUrl}
														alt={`${business.name} photo ${index + 1}`}
														loading="lazy"
														onError={(event) => {
															event.currentTarget.style.display = "none";
														}}
														style={{
															width: "100%",
															height: "95px",
															objectFit: "cover",
															borderRadius: "8px",
															border: "1px solid #e2e8f0",
														}}
													/>
												))}
											</div>
											{business.photoUrls.length > 3 && (
												<p style={{ marginTop: "6px", fontSize: "12px" }}>
													+{business.photoUrls.length - 3} more photo
													{business.photoUrls.length - 3 !== 1 ? "s" : ""}
												</p>
											)}
										</div>
									) : (
										<div
											aria-hidden="true"
											style={{
												width: "100%",
												height: "140px",
												borderRadius: "8px",
												marginBottom: "10px",
												border: "1px solid #e2e8f0",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												background: "#f8fafc",
												fontSize: "34px",
											}}
										>
											🏪
										</div>
									)}
									<h3 style={{ marginBottom: "8px" }}>{business.name}</h3>
									<p style={{ marginBottom: "6px", fontSize: "14px" }}>
										Category: {business.categories.join(", ") || "Not listed"}
									</p>
									<p style={{ marginBottom: "6px", fontSize: "14px" }}>
										Days open: {business.daysOpen.join(", ") || "Not listed"}
									</p>
									<p style={{ marginBottom: "10px", fontSize: "14px" }}>
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
