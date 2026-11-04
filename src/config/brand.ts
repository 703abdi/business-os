// Customize this file first. It is the single place for business name, colors,
// services, pricing, goals, and neutral operating defaults.
export const BRAND = {
  name: "Your Business", shortName: "YB", owner: "Owner", ownerFullName: "Business Owner",
  contact: { phone: "", email: "", address: "" },
  offer: "Your main offer", tagline: "A clear description of what your business does.",
  serviceArea: "Your service area", timezone: "America/New_York",
  colors: { primary: "#2563eb", primaryDark: "#1d4ed8", accent: "#f59e0b", ink: "#111827" },
  links: { googleReview: "", booking: "", website: "", facebook: "", instagram: "", tiktok: "" },
  services: [
    { name: "Sample Service", category: "service", price: 100, durationMin: 60, description: "Replace this with your first service." },
    { name: "Sample Premium Service", category: "service", price: 200, durationMin: 120, description: "Replace this with your premium service." },
  ],
  mapCenter: { lat: 39.8283, lng: -98.5795, zoom: 4 }, revShare: { partner: "Partner", percent: 0 },
  capacity: { maxJobsPerWeek: 10, maxJobsPerDay: 2, workdays: [1, 2, 3, 4, 5] }, speedToLeadMinutes: 15,
  baseline: { date: "2026-01-01", reviews: 0, rating: 0, jobsPerWeek: 0, monthlyRevenue: 0, bestMonthRevenue: 0, members: 0, mrr: 0, adSpendPerMonth: 0 },
  goals: { mrr: 0, reviews: 0, jobsPerWeek: 0 },
} as const;

export type BrandConfig = typeof BRAND;
