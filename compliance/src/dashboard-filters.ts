export const DUE_SOON_DAYS = 30;

export function mainDashboardCards(d: any) {
  return [
    ["PAT overdue", d.patOverdue, "red", "/pat?filter=overdue"],
    ["PAT due soon", d.patDueSoon, "amber", "/pat?filter=due-soon"],
    ["Open actions", d.openActions, d.openActions ? "amber" : "green", "/actions?filter=open"],
    ["Expired certificates", d.expiredDocuments, "red", "/documents?filter=expired"],
    ["Certificates due soon", d.documentsDueSoon, "amber", "/documents?filter=due-soon"],
    ["PAT required", d.patRequired, "green", "/assets?filter=pat-required"],
    ["Extinguishers", d.extinguishers, "green", "/extinguishers?filter=all"],
    ["Furnishing evidence", d.furnishingEvidence, "amber", "/furnishings?filter=evidence-required"],
    ["Total assets", d.assets, "green", "/assets"],
  ];
}

export const filterLabels: Record<string, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  open: "Open",
  expired: "Expired",
  "pat-required": "PAT required",
  "evidence-required": "Evidence required",
  "review-due": "Review due",
  "action-required": "Action required",
  "site-verification": "Requires site verification",
  current: "Current",
  "high-risk": "High-risk findings",
  "content-reviewed": "Content reviewed",
  outstanding: "Outstanding",
  completed: "Complete",
  due: "Checks due",
  "temperature-exceptions": "Temperature exceptions",
};

export function dateBounds(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const soonDate = new Date(now);
  soonDate.setUTCDate(soonDate.getUTCDate() + DUE_SOON_DAYS);
  return { today, soon: soonDate.toISOString().slice(0, 10) };
}

export function filterRegisterItems(items: any[], kind: string, filter: string, category = "") {
  return items.filter((item) => {
    const matches =
      !filter || filter === "all" ||
      (kind === "assets" && filter === "pat-required" && item.pat_status === "PAT Required") ||
      (kind === "furnishings" && filter === "evidence-required" && ["Evidence required", "Requires assessment"].includes(item.fire_status)) ||
      (kind === "actions" && filter === "open" && !["Closed", "Complete"].includes(item.status));
    const categoryMatches = !category || category === "all" || String(item.source_category || item.related_type || "").toLowerCase().includes(category.toLowerCase());
    return matches && categoryMatches;
  });
}

export function filterPatAssets(items: any[], filter: string, now = new Date()) {
  const { today, soon } = dateBounds(now);
  return items.filter((item) => {
    if (item.pat_status !== "PAT Required") return false;
    if (filter === "overdue") return !item.pat_next_date || item.pat_next_date < today;
    if (filter === "due-soon") return item.pat_next_date >= today && item.pat_next_date <= soon;
    return true;
  });
}

export function filterDocuments(items: any[], filter: string, now = new Date()) {
  const { today, soon } = dateBounds(now);
  if (filter === "expired") return items.filter((item) => item.review_date && item.review_date < today);
  if (filter === "due-soon") return items.filter((item) => item.review_date >= today && item.review_date <= soon);
  return items;
}

export function filterRiskByStatus(items: any[], filter: string, now = new Date()) {
  const { today, soon } = dateBounds(now);
  if (filter === "review-due") return items.filter((item) => item.status === "Review Due" || (item.review_date >= today && item.review_date <= soon));
  if (filter === "overdue") return items.filter((item) => item.status !== "Archived" && item.review_date && item.review_date < today);
  if (filter === "action-required") return items.filter((item) => item.status !== "Archived" && (item.status === "Action Required" || Number(item.open_action_count) > 0));
  if (filter === "site-verification") return items.filter((item) => item.status !== "Archived" && (item.status === "Requires Site Verification" || Number(item.site_verification_required) === 1));
  if (filter === "current") return items.filter((item) => item.status === "Current");
  if (filter === "high-risk") return items.filter((item) => item.status !== "Archived" && Number(item.high_risk_count) > 0);
  if (filter === "content-reviewed") return items.filter((item) => Boolean(item.content_reviewed_at));
  return items;
}

export function filterFoodTasks(items: any[], filter: string, now = new Date()) {
  if (!filter || filter === "due") return items;
  if (filter === "completed") return items.filter((item) => item.status === "completed");
  if (filter === "outstanding") return items.filter((item) => item.status === "outstanding");
  if (filter === "overdue") return items.filter((item) => item.status === "outstanding" && item.due_at && new Date(item.due_at) < now);
  return items;
}
