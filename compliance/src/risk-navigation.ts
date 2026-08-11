export const assessmentFilters = [
  { value: "All", label: "All", kind: "all" },
  { value: "General", label: "General", kind: "category" },
  { value: "Kitchen", label: "Kitchen", kind: "area" },
  { value: "Restaurant", label: "Restaurant", kind: "area" },
  { value: "Accommodation", label: "Accommodation", kind: "area" },
  { value: "Bar/Cellar", label: "Bar / Cellar", kind: "area" },
  { value: "Events", label: "Events", kind: "area" },
  { value: "External", label: "External", kind: "area" },
  { value: "Fire Safety", label: "Fire Safety", kind: "category" },
] as const;

export function filterAssessments(items: any[], value: string) {
  const filter = assessmentFilters.find((item) => item.value === value) || assessmentFilters[0];
  if (filter.kind === "all") return items;
  return items.filter((item) => item[filter.kind] === filter.value);
}

const query = (filter: string) =>
  filter && filter !== "All" ? `?category=${encodeURIComponent(filter)}` : "";

export const riskListPath = (filter: string) => `/risk${query(filter)}`;
export const riskDetailPath = (id: number, filter: string) =>
  `/risk/${id}${query(filter)}`;
