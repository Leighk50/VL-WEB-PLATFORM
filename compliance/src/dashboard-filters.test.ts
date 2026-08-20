import { describe, expect, it } from "vitest";
import { filterAssessments } from "./risk-navigation";
import {
  filterDocuments,
  filterFoodTasks,
  filterPatAssets,
  filterRegisterItems,
  filterRiskByStatus,
  mainDashboardCards,
} from "./dashboard-filters";

const now = new Date("2026-08-19T12:00:00Z");

describe("dashboard drill-down filters", () => {
  it("links every main dashboard card to its URL filter", () => {
    const cards = mainDashboardCards({ patOverdue:2, patDueSoon:1, openActions:3, expiredDocuments:4, documentsDueSoon:5, patRequired:6, extinguishers:7, furnishingEvidence:8, assets:9 });
    expect(Object.fromEntries(cards.map(([label,,,url]) => [label,url]))).toMatchObject({
      "PAT overdue":"/pat?filter=overdue", "PAT due soon":"/pat?filter=due-soon", "Open actions":"/actions?filter=open",
      "Expired certificates":"/documents?filter=expired", "Certificates due soon":"/documents?filter=due-soon",
      "Furnishing evidence":"/furnishings?filter=evidence-required",
    });
  });

  it("makes PAT dashboard counts equal their filtered asset results", () => {
    const assets = [
      { id:1, pat_status:"PAT Required", pat_next_date:"2026-08-18" },
      { id:2, pat_status:"PAT Required", pat_next_date:null },
      { id:3, pat_status:"PAT Required", pat_next_date:"2026-09-01" },
      { id:4, pat_status:"PAT Not Required", pat_next_date:"2026-08-01" },
    ];
    expect(filterPatAssets(assets,"overdue",now).map(x=>x.id)).toEqual([1,2]);
    expect(filterPatAssets(assets,"due-soon",now).map(x=>x.id)).toEqual([3]);
  });

  it("filters open actions, PAT-required assets and furnishing evidence", () => {
    expect(filterRegisterItems([{status:"Open"},{status:"Complete"}],"actions","open")).toHaveLength(1);
    expect(filterRegisterItems([{pat_status:"PAT Required"},{pat_status:"PAT Not Required"}],"assets","pat-required")).toHaveLength(1);
    expect(filterRegisterItems([{fire_status:"Evidence required"},{fire_status:"Fire regulated/compliant"}],"furnishings","evidence-required")).toHaveLength(1);
  });

  it("filters expired and due-soon certificates consistently", () => {
    const documents=[{id:1,review_date:"2026-08-18"},{id:2,review_date:"2026-09-01"},{id:3,review_date:null}];
    expect(filterDocuments(documents,"expired",now).map(x=>x.id)).toEqual([1]);
    expect(filterDocuments(documents,"due-soon",now).map(x=>x.id)).toEqual([2]);
  });

  it("combines risk category and dashboard status filters", () => {
    const risks=[
      {id:1,area:"Kitchen",category:"Fire Safety",status:"Review Due",review_date:"2026-09-01",site_verification_required:0,high_risk_count:0,open_action_count:0},
      {id:2,area:"Kitchen",category:"Fire Safety",status:"Requires Site Verification",review_date:"2027-01-01",site_verification_required:1,high_risk_count:1,open_action_count:1},
      {id:3,area:"External",category:"General",status:"Action Required",review_date:"2026-08-01",site_verification_required:0,high_risk_count:0,open_action_count:0},
    ];
    const kitchen=filterAssessments(risks,"Kitchen");
    expect(filterRiskByStatus(kitchen,"review-due",now).map(x=>x.id)).toEqual([1]);
    expect(filterRiskByStatus(kitchen,"site-verification",now).map(x=>x.id)).toEqual([2]);
    expect(filterRiskByStatus(risks,"action-required",now).map(x=>x.id)).toEqual([2,3]);
    expect(filterRiskByStatus(risks,"high-risk",now).map(x=>x.id)).toEqual([2]);
  });

  it("drills food metrics into matching task records", () => {
    const tasks=[{id:1,status:"outstanding",due_at:"2026-08-19T10:00:00Z"},{id:2,status:"outstanding",due_at:"2026-08-19T15:00:00Z"},{id:3,status:"completed"}];
    expect(filterFoodTasks(tasks,"outstanding",now)).toHaveLength(2);
    expect(filterFoodTasks(tasks,"overdue",now).map(x=>x.id)).toEqual([1]);
    expect(filterFoodTasks(tasks,"completed",now).map(x=>x.id)).toEqual([3]);
  });
});
