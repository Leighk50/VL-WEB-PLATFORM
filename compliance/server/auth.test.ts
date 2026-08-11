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
    extinguisher1 = 0;
  const tokens: Record<string, string> = {};

  it("bootstraps an empty database before serving and safely reruns migrations", async () => {
    const before = await db.all<{ version: number }>(
      "SELECT version FROM schema_migrations",
    );
    expect(before.map((row) => row.version)).toEqual([1, 2]);
    await migrateDatabase();
    await migrateDatabase();
    const after = await db.all<{ version: number }>(
      "SELECT version FROM schema_migrations",
    );
    expect(after.map((row) => row.version)).toEqual([1, 2]);
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
    const documentList = await request(app)
      .get("/api/documents")
      .set(auth(tokens.staff))
      .expect(200);
    expect(
      documentList.body.find((row: any) => row.id === document.body.id)
        .attachment_count,
    ).toBe(2);
    await request(app)
      .get(`/api/document-attachments/${attachments.body[0].id}/file`)
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
});
