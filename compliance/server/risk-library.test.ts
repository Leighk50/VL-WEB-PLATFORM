import { describe, expect, it } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { migrations } from "./migrations.js";
import { BOOTSTRAP_RISK_NOTE, RISK_CONTENT_REVIEW_DATE, RISK_NEXT_REVIEW_DATE, bootstrapRiskLibrary, reviewBootstrappedRiskContent, riskLevel, riskScore, riskTemplates } from "./risk-library.js";
import type { DatabaseAdapter } from "./db.js";
import { riskHazardSchema, riskReviewSchema } from "./validation.js";

describe("risk assessment library", () => {
  it("uses the documented 1-5 likelihood by 1-5 severity matrix", () => {
    expect(riskScore(1, 1)).toBe(1);
    expect(riskScore(5, 5)).toBe(25);
    expect(riskLevel(4)).toBe("Low");
    expect(riskLevel(5)).toBe("Medium");
    expect(riskLevel(10)).toBe("High");
    expect(riskLevel(15)).toBe("Critical");
  });

  it("contains the complete non-empty Village Limits template library", () => {
    expect(riskTemplates).toHaveLength(37);
    expect(new Set(riskTemplates.map((item) => item.key)).size).toBe(37);
    expect(riskTemplates.filter((item) => item.category === "General")).toHaveLength(12);
    expect(riskTemplates.filter((item) => item.category === "Fire Safety")).toHaveLength(25);
    expect(riskTemplates.reduce((total, item) => total + item.hazards.length, 0)).toBe(155);
    expect(riskTemplates.every((item) => item.hazards.length >= 4)).toBe(true);
    expect(riskTemplates.find((item) => item.title.startsWith("Deep Fat"))?.hazards.join(" ")).toMatch(/thermostat|oil|suppression/i);
  });

  it("reviews untouched templates without rewriting user history or linked records", async () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations) raw.exec(migration.sqlite);
    const database: DatabaseAdapter = {
      provider: "sqlite",
      get: async (statement, params = []) => raw.prepare(statement).get(...params as SQLInputValue[]) as any,
      all: async (statement, params = []) => raw.prepare(statement).all(...params as SQLInputValue[]) as any[],
      run: async (statement, params = []) => { const result = raw.prepare(statement).run(...params as SQLInputValue[]); return { lastInsertRowid:Number(result.lastInsertRowid), changes:Number(result.changes) }; },
      exec: async statement => raw.exec(statement),
      allocateAssetReference: async () => "VL-000001",
    };
    const venueId = Number((await database.run("INSERT INTO venues(name,is_demo) VALUES('Village Limits',0)")).lastInsertRowid);
    await bootstrapRiskLibrary(database);
    expect(Number((await database.get<any>("SELECT count(*) n FROM risk_assessments"))!.n)).toBe(37);
    expect(Number((await database.get<any>("SELECT count(*) n FROM risk_hazards"))!.n)).toBe(155);
    expect(Number((await database.get<any>("SELECT count(*) n FROM risk_assessments WHERE status='Requires Site Verification' AND site_verification_required=1 AND assessment_date=? AND review_date=?", [RISK_CONTENT_REVIEW_DATE, RISK_NEXT_REVIEW_DATE]))!.n)).toBe(37);
    expect(Number((await database.get<any>("SELECT count(*) n FROM risk_hazards WHERE initial_score=initial_likelihood*initial_severity AND residual_score=residual_likelihood*residual_severity AND residual_score<=initial_score AND existing_controls<>'Requires site verification'"))!.n)).toBe(155);

    const [untouched, historical] = await database.all<any>("SELECT * FROM risk_assessments ORDER BY id LIMIT 2");
    await database.run("UPDATE risk_assessments SET assessment_date='2026-08-01',signed_at=NULL,review_date=NULL,content_reviewed_at=NULL,content_review_note=NULL,notes=?,updated_by=NULL WHERE id=?", [BOOTSTRAP_RISK_NOTE, untouched.id]);
    await database.run("UPDATE risk_assessments SET assessment_date='2025-03-04',signed_at='2025-03-05T00:00:00',signed_by='Recorded reviewer',review_date='2026-03-05',content_reviewed_at=NULL,content_review_note=NULL,notes=?,updated_by=99 WHERE id=?", [BOOTSTRAP_RISK_NOTE, historical.id]);
    const oldHazard = await database.get<any>("SELECT * FROM risk_hazards WHERE assessment_id=? LIMIT 1", [untouched.id]);
    await database.run("UPDATE risk_hazards SET existing_controls='Requires site verification',further_action=? WHERE id=?", [`Verify site-specific arrangements, records, staff competence and condition for: ${oldHazard.hazard}.`, oldHazard.id]);
    const documentId = Number((await database.run("INSERT INTO documents(venue_id,type,title) VALUES(?,'Evidence','Existing evidence')", [venueId])).lastInsertRowid);
    await database.run("INSERT INTO document_links(document_id,entity_type,entity_id) VALUES(?,'risk_assessment',?)", [documentId, historical.id]);
    await database.run("INSERT INTO photos(entity_type,entity_id,storage_key) VALUES('risk_assessment',?,'risk/history.jpg')", [historical.id]);
    await database.run("INSERT INTO actions(description,venue_id,related_type,related_id) VALUES('Existing action',?,'risk_assessment',?)", [venueId, historical.id]);
    await database.run("INSERT INTO risk_assessment_history(assessment_id,version,snapshot_json,reason) VALUES(?,1,'{}','Existing history')", [historical.id]);

    const result = await reviewBootstrappedRiskContent(database);
    expect(result).toMatchObject({ assessmentsReviewed: 1, historicalDatesPreserved: 1 });
    expect(await database.get("SELECT assessment_date,review_date,status,site_verification_required FROM risk_assessments WHERE id=?", [untouched.id])).toMatchObject({ assessment_date:RISK_CONTENT_REVIEW_DATE, review_date:RISK_NEXT_REVIEW_DATE, status:"Requires Site Verification", site_verification_required:1 });
    expect(await database.get("SELECT assessment_date,signed_at,review_date FROM risk_assessments WHERE id=?", [historical.id])).toMatchObject({ assessment_date:"2025-03-04", signed_at:"2025-03-05T00:00:00", review_date:"2026-03-05" });
    expect((await database.get<any>("SELECT existing_controls FROM risk_hazards WHERE id=?", [oldHazard.id]))!.existing_controls).not.toBe("Requires site verification");
    expect(Number((await database.get<any>("SELECT count(*) n FROM document_links"))!.n)).toBe(1);
    expect(Number((await database.get<any>("SELECT count(*) n FROM photos"))!.n)).toBe(1);
    expect(Number((await database.get<any>("SELECT count(*) n FROM actions"))!.n)).toBe(1);
    expect(Number((await database.get<any>("SELECT count(*) n FROM risk_assessment_history"))!.n)).toBe(1);
    expect(Number((await database.get<any>("SELECT count(*) n FROM risk_assessments"))!.n)).toBe(37);
    expect(Number((await database.get<any>("SELECT count(*) n FROM risk_hazards"))!.n)).toBe(155);
    raw.close();
  });

  it("saves a hazard without per-hazard workflow fields", () => {
    const result = riskHazardSchema.parse({
      hazard: "Hot surface",
      who_may_be_harmed: "Staff",
      how_harmed: "Burns",
      existing_controls: "Guarding and training",
      further_action: "Review guarding",
      initial_likelihood: 3,
      initial_severity: 4,
      residual_likelihood: 2,
      residual_severity: 4,
    });
    expect(result.responsible_person).toBeUndefined();
    expect(result.target_date).toBeUndefined();
    expect(result.completion_document_id).toBeUndefined();
  });

  it("validates one assessment-level confirmation", () => {
    expect(riskReviewSchema.parse({
      assessor: "Assessor",
      assessment_date: "2026-08-13",
      reviewed_by: "Approver",
      approval_date: "2026-08-13",
      next_review_date: "2027-08-13",
      status: "Current",
      notes: "Assessment reviewed as a whole",
      confirmation: true,
    })).toMatchObject({ reviewed_by: "Approver", status: "Current" });
  });
});
