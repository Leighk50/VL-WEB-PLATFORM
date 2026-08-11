import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, type DatabaseAdapter } from "./db.js";

export const INITIAL_VENUE_NAME = "Village Limits";
export const INITIAL_LOCATION_NAMES = [
  "Bar",
  "Restaurant",
  "Main Kitchen",
  "Cellar",
  "Reception",
  "Breakfast Room",
  "Bedroom 1",
  "Bedroom 2",
  "Bedroom 3",
  "Bedroom 4",
  "Bedroom 5",
  "Bedroom 6",
  "Laundry",
  "Office",
  "Outside",
  "Plant Room",
] as const;

const inputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    displayName: z.string().trim().min(2).max(250),
    password: z
      .string()
      .min(12, "Password must contain at least 12 characters")
      .max(200)
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number")
      .regex(/[^A-Za-z0-9]/, "Password must contain a symbol"),
    passwordConfirmation: z.string(),
  })
  .strict()
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });

export type AdminBootstrapInput = z.input<typeof inputSchema>;

export class AdminBootstrapError extends Error {}

export async function inspectAdminBootstrap(
  email: string,
  database: DatabaseAdapter = db,
) {
  const normalizedEmail = z
    .string()
    .trim()
    .email()
    .max(254)
    .parse(email)
    .toLowerCase();
  const duplicate = await database.get<{ id: number }>(
    "SELECT id FROM users WHERE lower(email)=?",
    [normalizedEmail],
  );
  const activeAdmin = await database.get<{ id: number }>(
    "SELECT id FROM users WHERE role=? AND active=1",
    ["administrator"],
  );
  return {
    normalizedEmail,
    duplicate: Boolean(duplicate),
    activeAdmin: Boolean(activeAdmin),
  };
}

export async function createAdministrator(
  input: AdminBootstrapInput,
  options: { allowAdditionalAdmin?: boolean; database?: DatabaseAdapter } = {},
) {
  const parsed = inputSchema.parse(input);
  const database = options.database ?? db;
  const status = await inspectAdminBootstrap(parsed.email, database);
  if (status.duplicate)
    throw new AdminBootstrapError("A user with that email already exists");
  if (status.activeAdmin && !options.allowAdditionalAdmin)
    throw new AdminBootstrapError(
      "An active administrator already exists; explicit confirmation is required",
    );

  let venue = await database.get<{ id: number }>(
    "SELECT id FROM venues WHERE lower(name)=? AND is_demo=0",
    [INITIAL_VENUE_NAME.toLowerCase()],
  );
  if (!venue) {
    venue = {
      id: (
        await database.run("INSERT INTO venues(name,is_demo) VALUES(?,0)", [
          INITIAL_VENUE_NAME,
        ])
      ).lastInsertRowid,
    };
  }

  for (const locationName of INITIAL_LOCATION_NAMES) {
    const existing = await database.get<{ id: number }>(
      "SELECT id FROM locations WHERE venue_id=? AND name=?",
      [venue.id, locationName],
    );
    if (!existing)
      await database.run("INSERT INTO locations(venue_id,name) VALUES(?,?)", [
        venue.id,
        locationName,
      ]);
  }

  const passwordHash = await bcrypt.hash(parsed.password, 12);
  const result = await database.run(
    "INSERT INTO users(email,password_hash,name,role,venue_id,active) VALUES(?,?,?,?,?,1)",
    [parsed.email, passwordHash, parsed.displayName, "administrator", venue.id],
  );
  await database.run(
    "INSERT INTO audit_events(entity_type,entity_id,action,before_json,after_json,user_id,ip_address) VALUES(?,?,?,?,?,?,?)",
    [
      "users",
      result.lastInsertRowid,
      "bootstrap_create",
      null,
      JSON.stringify({
        email: parsed.email,
        role: "administrator",
        venueId: venue.id,
      }),
      result.lastInsertRowid,
      null,
    ],
  );
  return {
    id: result.lastInsertRowid,
    email: parsed.email,
    role: "administrator" as const,
    venueId: venue.id,
  };
}
