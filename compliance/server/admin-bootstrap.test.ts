import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.SQLITE_PATH = `.data/admin-bootstrap-${process.pid}.db`;
process.env.DEMO_SEED = "false";

const { db, migrateDatabase } = await import("./db.js");
const { AdminBootstrapError, INITIAL_LOCATION_NAMES, createAdministrator } =
  await import("./admin-bootstrap.js");

const firstAdmin = {
  email: "owner@villagelimits.example",
  displayName: "Village Limits Owner",
  password: "First-Admin-Secure-123!",
  passwordConfirmation: "First-Admin-Secure-123!",
};

beforeAll(async () => {
  await migrateDatabase();
});

describe("administrator bootstrap", () => {
  it("creates the real venue, default locations and administrator without demo records", async () => {
    const created = await createAdministrator(firstAdmin);
    const user = await db.get<{
      email: string;
      password_hash: string;
      role: string;
      venue_id: number;
      active: number;
    }>(
      "SELECT email,password_hash,role,venue_id,active FROM users WHERE id=?",
      [created.id],
    );
    const venue = await db.get<{ name: string; is_demo: number }>(
      "SELECT name,is_demo FROM venues WHERE id=?",
      [created.venueId],
    );
    const locations = await db.all<{ name: string }>(
      "SELECT name FROM locations WHERE venue_id=?",
      [created.venueId],
    );

    expect(user).toMatchObject({
      email: firstAdmin.email,
      role: "administrator",
      venue_id: created.venueId,
      active: 1,
    });
    expect(await bcrypt.compare(firstAdmin.password, user!.password_hash)).toBe(
      true,
    );
    expect(venue).toEqual({ name: "Village Limits", is_demo: 0 });
    expect(locations.map(({ name }) => name)).toEqual(
      expect.arrayContaining([...INITIAL_LOCATION_NAMES]),
    );

    for (const table of [
      "assets",
      "extinguishers",
      "furnishings",
      "pat_tests",
      "extinguisher_checks",
      "fire_alarm_tests",
      "documents",
      "photos",
      "actions",
    ]) {
      const count = await db.get<{ count: number }>(
        `SELECT COUNT(*) count FROM ${table}`,
      );
      expect(Number(count?.count), table).toBe(0);
    }
    expect(Number((await db.get<{ count:number }>("SELECT COUNT(*) count FROM risk_assessments"))?.count)).toBe(37);
    expect(Number((await db.get<{ count:number }>("SELECT COUNT(*) count FROM risk_hazards"))?.count)).toBe(155);
    expect(Number((await db.get<{ count:number }>("SELECT COUNT(*) count FROM risk_assessments WHERE site_verification_required=1"))?.count)).toBe(37);
    expect(Number((await db.get<{ count:number }>("SELECT COUNT(*) count FROM fire_alarm_call_points"))?.count)).toBe(5);
    await migrateDatabase();
    expect(Number((await db.get<{ count:number }>("SELECT COUNT(*) count FROM risk_assessments"))?.count)).toBe(37);
    expect(Number((await db.get<{ count:number }>("SELECT COUNT(*) count FROM fire_alarm_call_points"))?.count)).toBe(5);
    const demoVenues = await db.get<{ count: number }>(
      "SELECT COUNT(*) count FROM venues WHERE is_demo=1",
    );
    expect(Number(demoVenues?.count)).toBe(0);
  });

  it("rejects duplicate email addresses case-insensitively", async () => {
    await expect(
      createAdministrator(
        { ...firstAdmin, email: firstAdmin.email.toUpperCase() },
        { allowAdditionalAdmin: true },
      ),
    ).rejects.toThrow(AdminBootstrapError);
  });

  it("requires explicit approval before creating another active administrator", async () => {
    const secondAdmin = {
      ...firstAdmin,
      email: "second-owner@villagelimits.example",
      displayName: "Second Owner",
    };
    await expect(createAdministrator(secondAdmin)).rejects.toThrow(
      "explicit confirmation is required",
    );
    const created = await createAdministrator(secondAdmin, {
      allowAdditionalAdmin: true,
    });
    expect(created.role).toBe("administrator");
    expect(created.venueId).toBe(1);
    const venueCount = await db.get<{ count: number }>(
      "SELECT COUNT(*) count FROM venues",
    );
    expect(Number(venueCount?.count)).toBe(1);
  });
});
