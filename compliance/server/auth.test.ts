import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
process.env.SQLITE_PATH = `.data/test-${process.pid}.db`;
process.env.DEMO_SEED = "true";
process.env.LOGIN_RATE_LIMIT = "100";
const { default: app } = await import("./index.js");
const { db, migrateDatabase } = await import("./db.js");

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
describe("venue security, current authorization and immutable history", () => {
  let venue1 = 0,
    venue2 = 0,
    location1 = 0,
    location2 = 0,
    asset1 = 0,
    asset2 = 0,
    extinguisher1 = 0,
    fridge1 = 0,
    freezer1 = 0;
  const tokens: Record<string, string> = {};

  it("bootstraps an empty database before serving and safely reruns migrations", async () => {
    const before = await db.all<{ version: number }>(
      "SELECT version FROM schema_migrations",
    );
    expect(before.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    await migrateDatabase();
    await migrateDatabase();
    const after = await db.all<{ version: number }>(
      "SELECT version FROM schema_migrations",
    );
    expect(after.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(await db.get("SELECT id FROM assets LIMIT 1")).toBeTruthy();
  });

  beforeAll(async () => {
    venue1 = Number(
      (await db.get<any>("SELECT id FROM venues ORDER BY id LIMIT 1"))!.id,
    );
    location1 = Number(
      (await db.get<any>(
        "SELECT id FROM locations WHERE venue_id=? ORDER BY id LIMIT 1",
        [venue1],
      ))!.id,
    );
    const venue = await db.run(
      "INSERT INTO venues(name,is_demo) VALUES('Second Venue Test',1)",
    );
    venue2 = Number(venue.lastInsertRowid);
    const location = await db.run(
      "INSERT INTO locations(venue_id,name) VALUES(?,?)",
      [venue2, "Other Venue Bar"],
    );
    location2 = Number(location.lastInsertRowid);
    asset1 = Number(
      (await db.get<any>(
        "SELECT id FROM assets WHERE venue_id=? ORDER BY id LIMIT 1",
        [venue1],
      ))!.id,
    );
    asset2 = Number(
      (
        await db.run(
          "INSERT INTO assets(barcode,description,venue_id,location_id,pat_status,is_demo) VALUES(?,?,?,?,?,1)",
          ["V2-ASSET", "Other venue asset", venue2, location2, "PAT Required"],
        )
      ).lastInsertRowid,
    );
    extinguisher1 = Number(
      (
        await db.run(
          "INSERT INTO extinguishers(barcode,type,venue_id,location_id,is_demo) VALUES(?,?,?,?,1)",
          ["EXT-TEST-1", "CO2", venue1, location1],
        )
      ).lastInsertRowid,
    );
    const passwordHash = bcrypt.hashSync("ChangeMe!123", 4);
    for (const [name, role] of [
      ["staff", "staff"],
      ["contractor", "contractor"],
      ["auditor", "auditor"],
    ]) {
      await db.run(
        "INSERT INTO users(email,password_hash,name,role,venue_id) VALUES(?,?,?,?,?)",
        [`${name}@test.local`, passwordHash, name, role, venue1],
      );
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: `${name}@test.local`, password: "ChangeMe!123" });
      tokens[name] = login.body.token;
    }
    const admin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@demo.local", password: "ChangeMe!123" });
    tokens.admin = admin.body.token;
  });

  it("does not list another venue's records or locations", async () => {
    const records = await request(app)
      .get("/api/assets")
      .set(auth(tokens.staff))
      .expect(200);
    expect(records.body.every((row: any) => row.venue_id === venue1)).toBe(
      true,
    );
    expect(records.body.some((row: any) => row.id === asset2)).toBe(false);
    const bootstrap = await request(app)
      .get("/api/bootstrap")
      .set(auth(tokens.staff))
      .expect(200);
    expect(
      bootstrap.body.locations.every((row: any) => row.venue_id === venue1),
    ).toBe(true);
  });

  it("cannot fetch another venue's record", async () => {
    await request(app)
      .get(`/api/assets/${asset2}`)
      .set(auth(tokens.staff))
      .expect(403);
  });

  it("cannot create into another venue", async () => {
    await request(app)
      .post("/api/assets")
      .set(auth(tokens.staff))
      .send({
        barcode: "DENIED-V2",
        description: "Denied",
        venue_id: venue2,
        location_id: location2,
        pat_status: "Assessment Required",
        status: "Active",
      })
      .expect(403);
  });

  it("cannot patch an existing record to another venue", async () => {
    await request(app)
      .patch(`/api/assets/${asset1}`)
      .set(auth(tokens.staff))
      .send({ venue_id: venue2 })
      .expect(403);
    expect(
      (await db.get<any>("SELECT venue_id FROM assets WHERE id=?", [asset1]))!
        .venue_id,
    ).toBe(venue1);
  });

  it("cannot use a location from another venue", async () => {
    await request(app)
      .patch(`/api/assets/${asset1}`)
      .set(auth(tokens.staff))
      .send({ location_id: location2 })
      .expect(400);
    await request(app)
      .post("/api/assets")
      .set(auth(tokens.staff))
      .send({
        barcode: "BAD-LOCATION",
        description: "Denied",
        venue_id: venue1,
        location_id: location2,
        pat_status: "Assessment Required",
        status: "Active",
      })
      .expect(400);
  });

  it("uses current role and venue immediately rather than stale token claims", async () => {
    const staffId = Number(
      (await db.get<any>(
        "SELECT id FROM users WHERE email='staff@test.local'",
      ))!.id,
    );
    await request(app)
      .get(`/api/assets/${asset1}`)
      .set(auth(tokens.staff))
      .expect(200);
    await db.run("UPDATE users SET venue_id=? WHERE id=?", [venue2, staffId]);
    await request(app)
      .get(`/api/assets/${asset1}`)
      .set(auth(tokens.staff))
      .expect(403);
    await request(app)
      .get(`/api/assets/${asset2}`)
      .set(auth(tokens.staff))
      .expect(200);
    await db.run("UPDATE users SET venue_id=?,role='auditor' WHERE id=?", [
      venue1,
      staffId,
    ]);
    await request(app)
      .post("/api/assets")
      .set(auth(tokens.staff))
      .send({
        barcode: "STALE-ROLE",
        description: "Denied",
        venue_id: venue1,
        location_id: location1,
        pat_status: "Assessment Required",
        status: "Active",
      })
      .expect(403);
    await db.run("UPDATE users SET role='staff' WHERE id=?", [staffId]);
  });

  it("keeps auditors read-only while staff and contractors can write in scope", async () => {
    await request(app)
      .post("/api/assets")
      .set(auth(tokens.auditor))
      .send({
        barcode: "AUDITOR-DENIED",
        description: "Denied",
        venue_id: venue1,
        status: "Active",
        pat_status: "Assessment Required",
      })
      .expect(403);
    await request(app)
      .post("/api/assets")
      .set(auth(tokens.staff))
      .send({
        barcode: "STAFF-OK",
        description: "Staff record",
        venue_id: venue1,
        location_id: location1,
        status: "Active",
        pat_status: "Assessment Required",
      })
      .expect(201);
    await request(app)
      .post("/api/assets")
      .set(auth(tokens.contractor))
      .send({
        barcode: "CONTRACTOR-OK",
        description: "Contractor record",
        venue_id: venue1,
        location_id: location1,
        status: "Active",
        pat_status: "PAT Required",
      })
      .expect(201);
  });

  it("rejects unknown fields", async () => {
    await request(app)
      .patch(`/api/assets/${asset1}`)
      .set(auth(tokens.staff))
      .send({ injected_column: "no" })
      .expect(400);
  });

  it("keeps PAT history append-only", async () => {
    await request(app)
      .post(`/api/assets/${asset1}/pat-tests`)
      .set(auth(tokens.staff))
      .send({ result: "Pass", test_date: "2026-08-10" })
      .expect(201);
    await request(app)
      .post(`/api/assets/${asset1}/pat-tests`)
      .set(auth(tokens.staff))
      .send({ result: "Fail", test_date: "2026-08-11" })
      .expect(201);
    const history = await request(app)
      .get(`/api/assets/${asset1}/pat-tests`)
      .set(auth(tokens.staff))
      .expect(200);
    expect(history.body.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps extinguisher checks append-only", async () => {
    const check = (date: string, result: string) => ({
      check_date: date,
      result,
      pin_seal_ok: 1,
      hose_ok: 1,
      signage_present: 1,
      positioned_ok: 1,
      accessible: 1,
    });
    await request(app)
      .post(`/api/extinguishers/${extinguisher1}/checks`)
      .set(auth(tokens.contractor))
      .send(check("2026-08-10", "Pass"))
      .expect(201);
    await request(app)
      .post(`/api/extinguishers/${extinguisher1}/checks`)
      .set(auth(tokens.contractor))
      .send(check("2026-08-11", "Fail"))
      .expect(201);
    const history = await request(app)
      .get(`/api/extinguishers/${extinguisher1}/checks`)
      .set(auth(tokens.contractor))
      .expect(200);
    expect(history.body.length).toBe(2);
  });

  it("enforces call-point administration, venue isolation and inactive status", async () => {
    await request(app)
      .post("/api/fire-alarm-call-points")
      .set(auth(tokens.staff))
      .send({
        venue_id: venue1,
        code: "DENIED",
        description: "Denied",
        location_id: location1,
      })
      .expect(403);
    const point = await request(app)
      .post("/api/fire-alarm-call-points")
      .set(auth(tokens.admin))
      .send({
        venue_id: venue1,
        code: "CP01",
        description: "Main entrance",
        location_id: location1,
        active: 1,
      })
      .expect(201);
    const otherPoint = await request(app)
      .post("/api/fire-alarm-call-points")
      .set(auth(tokens.admin))
      .send({
        venue_id: venue2,
        code: "CP01",
        description: "Other venue",
        location_id: location2,
        active: 1,
      })
      .expect(201);
    const list = await request(app)
      .get("/api/fire-alarm-call-points")
      .set(auth(tokens.staff))
      .expect(200);
    expect(list.body.every((row: any) => row.venue_id === venue1)).toBe(true);
    await request(app)
      .post("/api/fire-alarm-tests")
      .set(auth(tokens.staff))
      .send({
        venue_id: venue1,
        call_point_id: otherPoint.body.id,
        test_datetime: "2026-08-11T09:00",
        result: "Pass",
        alarm_operated: 1,
        reset_successful: 1,
      })
      .expect(400);
    await request(app)
      .patch(`/api/fire-alarm-call-points/${point.body.id}`)
      .set(auth(tokens.admin))
      .send({ active: 0 })
      .expect(200);
    await request(app)
      .post("/api/fire-alarm-tests")
      .set(auth(tokens.staff))
      .send({
        venue_id: venue1,
        call_point_id: point.body.id,
        test_datetime: "2026-08-11T09:00",
        result: "Pass",
        alarm_operated: 1,
        reset_successful: 1,
      })
      .expect(400);
  });

  it("records append-only weekly tests and calculates call-point rotation", async () => {
    const point = await request(app)
      .post("/api/fire-alarm-call-points")
      .set(auth(tokens.admin))
      .send({
        venue_id: venue1,
        code: "CP02",
        description: "Kitchen exit",
        location_id: location1,
        active: 1,
      })
      .expect(201);
    const test = await request(app)
      .post("/api/fire-alarm-tests")
      .set(auth(tokens.contractor))
      .send({
        venue_id: venue1,
        call_point_id: point.body.id,
        test_datetime: "2026-08-01T09:00",
        result: "Pass",
        alarm_operated: 1,
        sounders_activated: 1,
        panel_indication_correct: 1,
        reset_successful: 1,
      })
      .expect(201);
    await request(app)
      .patch(`/api/fire-alarm-tests/${test.body.id}`)
      .set(auth(tokens.admin))
      .send({ result: "Fail" })
      .expect(405);
    await request(app)
      .put(`/api/settings/venues/${venue1}`)
      .set(auth(tokens.admin))
      .send({ call_point_warning_days: 7 })
      .expect(200);
    const report = await request(app)
      .get(`/api/fire-alarm-rotation?venue_id=${venue1}`)
      .set(auth(tokens.staff))
      .expect(200);
    expect(report.body.warningDays).toBe(7);
    expect(
      report.body.points.find((row: any) => row.id === point.body.id),
    ).toMatchObject({ test_count: 1, overdue: true });
  });

  it("keeps multiple document attachments private, venue-scoped and historical", async () => {
    const document = await request(app)
      .post("/api/documents")
      .set(auth(tokens.staff))
      .send({
        venue_id: venue1,
        location_id: location1,
        type: "PAT certificate",
        title: "Annual PAT evidence",
        issue_date: "2026-08-11",
      })
      .expect(201);
    await request(app)
      .post(`/api/documents/${document.body.id}/attachments`)
      .set(auth(tokens.staff))
      .attach("files", Buffer.from("%PDF-test-one"), {
        filename: "certificate.pdf",
        contentType: "application/pdf",
      })
      .attach("files", Buffer.from("image-test"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);
    const attachments = await request(app)
      .get(`/api/documents/${document.body.id}/attachments`)
      .set(auth(tokens.staff))
      .expect(200);
    expect(attachments.body).toHaveLength(2);
    const pdfAttachment = attachments.body.find(
      (item: any) => item.mime_type === "application/pdf",
    );
    const imageAttachment = attachments.body.find(
      (item: any) => item.mime_type === "image/jpeg",
    );
    const pdfFile = await request(app)
      .get(`/api/document-attachments/${pdfAttachment.id}/file`)
      .set(auth(tokens.staff))
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    expect(pdfFile.headers["content-disposition"]).toContain(
      'inline; filename="certificate.pdf"',
    );
    const imageFile = await request(app)
      .get(`/api/document-attachments/${imageAttachment.id}/file`)
      .set(auth(tokens.staff))
      .expect(200)
      .expect("Content-Type", /image\/jpeg/);
    expect(imageFile.headers["content-disposition"]).toContain(
      'inline; filename="photo.jpg"',
    );
    const documentList = await request(app)
      .get("/api/documents")
      .set(auth(tokens.staff))
      .expect(200);
    expect(
      documentList.body.find((row: any) => row.id === document.body.id)
        .attachment_count,
    ).toBe(2);
    await request(app)
      .get(`/api/document-attachments/${pdfAttachment.id}/file`)
      .expect(401);
    const renewed = await request(app)
      .post("/api/documents")
      .set(auth(tokens.staff))
      .send({
        venue_id: venue1,
        type: "PAT certificate",
        title: "Annual PAT evidence",
        version: 2,
        previous_version_id: document.body.id,
      })
      .expect(201);
    expect(renewed.body.previous_version_id).toBe(document.body.id);
    const history = await request(app)
      .get(`/api/documents/${document.body.id}/attachments`)
      .set(auth(tokens.staff))
      .expect(200);
    expect(history.body).toHaveLength(2);
    const otherDocument = await request(app)
      .post("/api/documents")
      .set(auth(tokens.admin))
      .send({ venue_id: venue2, type: "Other", title: "Other venue document" })
      .expect(201);
    const otherAttachment = await request(app)
      .post(`/api/documents/${otherDocument.body.id}/attachments`)
      .set(auth(tokens.admin))
      .attach("files", Buffer.from("private-other-venue"), {
        filename: "other.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    await request(app)
      .get(`/api/documents/${otherDocument.body.id}/attachments`)
      .set(auth(tokens.staff))
      .expect(403);
    await request(app)
      .get(`/api/document-attachments/${otherAttachment.body[0].id}/file`)
      .set(auth(tokens.staff))
      .expect(403);
    await request(app)
      .post(`/api/documents/${otherDocument.body.id}/attachments`)
      .set(auth(tokens.staff))
      .attach("files", Buffer.from("denied"), {
        filename: "denied.pdf",
        contentType: "application/pdf",
      })
      .expect(403);
  });

  it("versions risk assessments, links actions and protects historical versions", async () => {
    const assessment = await request(app).post("/api/risk-assessments").set(auth(tokens.staff)).send({
      venue_id: venue1, title: "Test kitchen risk", category: "Fire Safety", area: "Kitchen",
      location_id: location1, assessment_date: "2026-06-01", status: "Requires Site Verification",
      overall_risk_rating: "Requires site verification", site_verification_required: 1,
    }).expect(201);
    await db.run("UPDATE risk_assessments SET template_key=? WHERE id=?", ["test-confirm-template", assessment.body.id]);
    await db.run("INSERT INTO risk_template_registry(venue_id,template_key,assessment_id) VALUES(?,?,?)", [venue1, "test-confirm-template", assessment.body.id]);
    await request(app).post("/api/risk-assessments").set(auth(tokens.staff)).send({
      venue_id: venue2, title: "Denied", category: "General", area: "General",
      assessment_date: "2026-08-11", status: "Draft", overall_risk_rating: "Low", site_verification_required: 1,
    }).expect(403);
    const hazard = await request(app).post(`/api/risk-assessments/${assessment.body.id}/hazards`).set(auth(tokens.staff)).send({
      hazard: "Hot oil", who_may_be_harmed: "Kitchen staff", how_harmed: "Burns",
      existing_controls: "Requires site verification", initial_likelihood: 4, initial_severity: 5,
      further_action: "Verify high-limit thermostat", residual_likelihood: 3, residual_severity: 5,
    }).expect(201);
    expect(hazard.body.initial_score).toBe(20);
    expect(hazard.body.responsible_person).toBeNull();
    expect(hazard.body.target_date).toBeNull();
    const photo = await request(app).post(`/api/risk_assessment/${assessment.body.id}/photos`).set(auth(tokens.staff)).attach("file", Buffer.from("risk-photo"), { filename: "risk.jpg", contentType: "image/jpeg" }).field("is_main", "0").expect(201);
    await request(app).get(`/files/${photo.body.storage_key}`).expect(401);
    await request(app).get(`/files/${photo.body.storage_key}`).set(auth(tokens.staff)).expect(200).expect("Content-Type", /image\/jpeg/);
    const action = await request(app).post(`/api/risk-hazards/${hazard.body.id}/action`).set(auth(tokens.staff)).send({}).expect(201);
    expect(action.body.related_type).toBe("risk_assessment_hazard");
    const reviewed = await request(app).post(`/api/risk-assessments/${assessment.body.id}/review`).set(auth(tokens.staff)).send({
      assessor: "Leigh", assessment_date: "2026-06-01", reviewed_by: "Leigh",
      approval_date: "2026-08-11", next_review_date: "2027-06-01",
      status: "Current", confirmation: true, notes: "Site review completed",
    }).expect(201);
    expect(reviewed.body.previous_version_id).toBe(assessment.body.id);
    expect(reviewed.body.version).toBe(2);
    expect(reviewed.body.signed_by).toBe("Leigh");
    expect(reviewed.body.assessment_date).toBe("2026-06-01");
    expect(reviewed.body.review_date).toBe("2027-06-01");
    expect(reviewed.body.status).toBe("Current");
    expect(reviewed.body.template_key).toBeNull();
    const detail = await request(app).get(`/api/risk-assessments/${reviewed.body.id}`).set(auth(tokens.staff)).expect(200);
    expect(detail.body.hazards).toHaveLength(1);
    expect(detail.body.photos).toHaveLength(1);
    expect(detail.body.actions).toHaveLength(1);
    expect(Number((await db.get<any>("SELECT count(*) n FROM risk_assessments WHERE venue_id=? AND template_key=?", [venue1, "test-confirm-template"]))!.n)).toBe(1);
    expect(Number((await db.get<any>("SELECT count(*) n FROM photos WHERE entity_type='risk_assessment' AND entity_id=?", [assessment.body.id]))!.n)).toBe(1);
    expect(Number((await db.get<any>("SELECT count(*) n FROM actions WHERE related_type='risk_assessment_hazard' AND related_id=?", [hazard.body.id]))!.n)).toBe(1);
    const secondReview = await request(app).post(`/api/risk-assessments/${reviewed.body.id}/review`).set(auth(tokens.staff)).send({
      assessor: "Leigh", assessment_date: "2027-06-01", reviewed_by: "Leigh",
      approval_date: "2027-06-01", next_review_date: "2028-06-01",
      status: "Current", confirmation: true, notes: "Second whole-assessment review",
    }).expect(201);
    expect(secondReview.body.version).toBe(3);
    expect(secondReview.body.previous_version_id).toBe(reviewed.body.id);
    expect(secondReview.body.template_key).toBeNull();
    const secondDetail = await request(app).get(`/api/risk-assessments/${secondReview.body.id}`).set(auth(tokens.staff)).expect(200);
    expect(secondDetail.body.hazards).toHaveLength(1);
    expect(secondDetail.body.photos).toHaveLength(1);
    expect(secondDetail.body.actions).toHaveLength(1);
    expect(await db.get("SELECT assessment_date,review_date,status FROM risk_assessments WHERE id=?", [assessment.body.id])).toMatchObject({ assessment_date: "2026-06-01", review_date: null, status: "Archived" });
    expect(await db.get("SELECT assessment_date,review_date,status FROM risk_assessments WHERE id=?", [reviewed.body.id])).toMatchObject({ assessment_date: "2026-06-01", review_date: "2027-06-01", status: "Archived" });
    await request(app).patch(`/api/risk-assessments/${assessment.body.id}`).set(auth(tokens.staff)).send({ notes: "silent overwrite" }).expect(409);
    const history = await db.all("SELECT * FROM risk_assessment_history WHERE assessment_id=?", [assessment.body.id]);
    expect(history.length).toBeGreaterThan(0);
  });

  it("administers multiple refrigeration units and filters inactive units", async () => {
    const create = (name: string, type: string, active = 1) => request(app)
      .post("/api/food-hygiene/equipment").set(auth(tokens.admin)).send({
        venue_id: venue1, name, equipment_type: type, location_id: location1,
        active, lower_limit: type === "freezer" ? -22 : 1,
        upper_limit: type === "freezer" ? -18 : 5, notes: "Configured test unit",
      });
    fridge1 = (await create("Test Upright Fridge", "fridge").expect(201)).body.id;
    freezer1 = (await create("Test Chest Freezer", "freezer").expect(201)).body.id;
    const inactive = (await create("Retired Fridge", "fridge", 0).expect(201)).body.id;
    const activeList = await request(app).get("/api/food-hygiene/equipment").set(auth(tokens.staff)).expect(200);
    expect(activeList.body.map((row: any) => row.id)).toEqual(expect.arrayContaining([fridge1, freezer1]));
    expect(activeList.body.some((row: any) => row.id === inactive)).toBe(false);
    const adminList = await request(app).get(`/api/food-hygiene/equipment?venue_id=${venue1}&include_inactive=1`).set(auth(tokens.admin)).expect(200);
    expect(adminList.body.some((row: any) => row.id === inactive && row.active === 0)).toBe(true);
  });

  it("saves in-range readings and flags below/above-range readings unresolved", async () => {
    const save = (equipment_id: number, temperature: number) => request(app)
      .post("/api/food-hygiene/readings").set(auth(tokens.staff))
      .send({ equipment_id, reading_type: equipment_id === freezer1 ? "freezer" : "fridge", temperature });
    expect((await save(fridge1, 3).expect(201)).body).toMatchObject({ compliant: 1, resolution_status: "resolved" });
    expect((await save(fridge1, 0).expect(201)).body).toMatchObject({ compliant: 0, resolution_status: "unresolved", lower_limit_snapshot: 1, upper_limit_snapshot: 5 });
    expect((await save(fridge1, 6).expect(201)).body).toMatchObject({ compliant: 0, resolution_status: "unresolved" });
  });

  it("requires a listed corrective action and preserves satisfactory recheck history", async () => {
    const original = await request(app).post("/api/food-hygiene/readings").set(auth(tokens.staff)).send({ equipment_id: freezer1, reading_type: "freezer", temperature: -15 }).expect(201);
    await request(app).post(`/api/food-hygiene/readings/${original.body.id}/corrective-action`).set(auth(tokens.staff)).send({ corrective_action_type: "other" }).expect(400);
    const recheck = await request(app).post("/api/food-hygiene/readings").set(auth(tokens.staff)).send({ equipment_id: freezer1, reading_type: "freezer", temperature: -19, recheck_of_id: original.body.id }).expect(201);
    expect(recheck.body).toMatchObject({ compliant: 1, recheck_of_id: original.body.id });
    expect(await db.get("SELECT compliant,resolution_status,corrective_action_type FROM food_temperature_readings WHERE id=?", [original.body.id])).toMatchObject({ compliant: 0, resolution_status: "resolved", corrective_action_type: "recheck" });
    expect(Number((await db.get<any>("SELECT count(*) n FROM food_temperature_readings WHERE id IN (?,?)", [original.body.id, recheck.body.id]))!.n)).toBe(2);
  });

  it("links a temperature exception to the existing Action / Defect register", async () => {
    const original = await request(app).post("/api/food-hygiene/readings").set(auth(tokens.staff)).send({ equipment_id: fridge1, reading_type: "fridge", temperature: 9 }).expect(201);
    const resolved = await request(app).post(`/api/food-hygiene/readings/${original.body.id}/corrective-action`).set(auth(tokens.staff)).send({ corrective_action_type: "raise_action", notes: "Engineer required" }).expect(200);
    expect(resolved.body.action_id).toBeTruthy();
    expect(await db.get("SELECT related_type,related_id,status FROM actions WHERE id=?", [resolved.body.action_id])).toMatchObject({ related_type: "food_temperature_reading", related_id: original.body.id, status: "Open" });
  });

  it("refuses refrigeration readings until both unit limits are configured", async () => {
    const unit = await db.run("INSERT INTO food_equipment(venue_id,name,equipment_type,active) VALUES(?,'Unconfigured Test Fridge','fridge',1)", [venue1]);
    const response = await request(app).post("/api/food-hygiene/readings").set(auth(tokens.staff)).send({ equipment_id: unit.lastInsertRowid, reading_type: "fridge", temperature: 3 }).expect(409);
    expect(response.body).toMatchObject({ code: "LIMITS_NOT_CONFIGURED" });
    expect(Number((await db.get<any>("SELECT count(*) n FROM food_temperature_readings WHERE equipment_id=?", [unit.lastInsertRowid]))!.n)).toBe(0);
  });

  it("returns all active refrigeration units with seven-day reading and warning history", async () => {
    const overview = await request(app).get("/api/food-hygiene/refrigeration-overview").set(auth(tokens.staff)).expect(200);
    expect(overview.body.equipment.map((row: any) => row.id)).toEqual(expect.arrayContaining([fridge1, freezer1]));
    expect(overview.body.equipment.every((row: any) => row.active === 1)).toBe(true);
    expect(overview.body.readings.some((row: any) => row.equipment_id === fridge1 && row.compliant === 0)).toBe(true);
    expect(overview.body.readings.every((row: any) => row.equipment_name && row.recorded_at)).toBe(true);
  });

  it("atomically allocates venue references and rejects duplicate assets", async () => {
    const first = await request(app)
      .post("/api/assets/generated-reference")
      .set(auth(tokens.staff))
      .send({ venue_id: venue1 })
      .expect(201);
    const second = await request(app)
      .post("/api/assets/generated-reference")
      .set(auth(tokens.staff))
      .send({ venue_id: venue1 })
      .expect(201);
    expect(first.body.reference).toMatch(/^VL-\d{6}$/);
    expect(second.body.reference).not.toBe(first.body.reference);
    const created = await request(app)
      .post("/api/assets")
      .set(auth(tokens.staff))
      .send({ barcode: first.body.reference, description: "Generated asset", venue_id: venue1 })
      .expect(201);
    const duplicate = await request(app)
      .post("/api/assets")
      .set(auth(tokens.staff))
      .send({ barcode: first.body.reference, description: "Duplicate", venue_id: venue1 })
      .expect(409);
    expect(duplicate.body).toMatchObject({ code: "DUPLICATE_ASSET_REFERENCE", assetId: created.body.id });
  });

  it("keeps scanned asset lookup venue scoped for administrators and staff", async () => {
    await request(app)
      .get(`/api/assets/barcode/${encodeURIComponent("V2-ASSET")}?venue_id=${venue1}`)
      .set(auth(tokens.admin))
      .expect(404);
    await request(app)
      .get(`/api/assets/barcode/${encodeURIComponent("V2-ASSET")}?venue_id=${venue2}`)
      .set(auth(tokens.admin))
      .expect(200);
    await request(app)
      .get(`/api/assets/barcode/${encodeURIComponent("V2-ASSET")}`)
      .set(auth(tokens.staff))
      .expect(404);
  });

  it("keeps dashboard counts aligned with authorised filtered drill-down records", async () => {
    const [dashboard, assets, actions, documents, furnishings, riskDashboard, risks] = await Promise.all([
      request(app).get("/api/dashboard").set(auth(tokens.staff)).expect(200),
      request(app).get("/api/assets").set(auth(tokens.staff)).expect(200),
      request(app).get("/api/actions").set(auth(tokens.staff)).expect(200),
      request(app).get("/api/documents").set(auth(tokens.staff)).expect(200),
      request(app).get("/api/furnishings").set(auth(tokens.staff)).expect(200),
      request(app).get("/api/risk-assessments/dashboard").set(auth(tokens.staff)).expect(200),
      request(app).get("/api/risk-assessments").set(auth(tokens.staff)).expect(200),
    ]);
    const today = new Date().toISOString().slice(0,10), soon = new Date(Date.now()+30*864e5).toISOString().slice(0,10), activeRisks = risks.body.filter((item:any)=>item.status!=="Archived");
    expect(assets.body.filter((item:any)=>item.pat_status==="PAT Required"&&(!item.pat_next_date||item.pat_next_date<today))).toHaveLength(dashboard.body.patOverdue);
    expect(assets.body.filter((item:any)=>item.pat_status==="PAT Required"&&item.pat_next_date>=today&&item.pat_next_date<=soon)).toHaveLength(dashboard.body.patDueSoon);
    expect(actions.body.filter((item:any)=>!["Closed","Complete"].includes(item.status))).toHaveLength(dashboard.body.openActions);
    expect(documents.body.filter((item:any)=>item.review_date&&item.review_date<today)).toHaveLength(dashboard.body.expiredDocuments);
    expect(documents.body.filter((item:any)=>item.review_date>=today&&item.review_date<=soon)).toHaveLength(dashboard.body.documentsDueSoon);
    expect(furnishings.body.filter((item:any)=>["Evidence required","Requires assessment"].includes(item.fire_status))).toHaveLength(dashboard.body.furnishingEvidence);
    expect(activeRisks.filter((item:any)=>item.status==="Review Due"||(item.review_date>=today&&item.review_date<=soon))).toHaveLength(riskDashboard.body.reviewDue);
    expect(activeRisks.filter((item:any)=>item.review_date&&item.review_date<today)).toHaveLength(riskDashboard.body.overdue);
    expect(activeRisks.filter((item:any)=>item.status==="Action Required"||Number(item.open_action_count)>0)).toHaveLength(riskDashboard.body.actionRequired);
    expect(activeRisks.filter((item:any)=>item.status==="Requires Site Verification"||Number(item.site_verification_required)===1)).toHaveLength(riskDashboard.body.siteVerification);
    expect(activeRisks.filter((item:any)=>Number(item.high_risk_count)>0)).toHaveLength(riskDashboard.body.highRisk);
    expect(actions.body.filter((item:any)=>!["Closed","Complete"].includes(item.status)&&item.source_category==="Fire Safety")).toHaveLength(riskDashboard.body.openFireActions);
    expect(actions.body.filter((item:any)=>String(item.related_type||"").startsWith("risk_assessment")).every((item:any)=>item.source_title&&item.source_record_id)).toBe(true);
  });
});
