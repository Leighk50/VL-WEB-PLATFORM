import { z } from "zod";

const id = z.coerce.number().int().positive();
const text = z.string().trim().max(500);
const longText = z.string().trim().max(10000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTime = z
  .string()
  .datetime({ local: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/));
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  schema.optional().nullable();
const venueLocation = { venue_id: id, location_id: optional(id) };
const booleanFlag = z.coerce.number().int().min(0).max(1);

export const resourceSchemas = {
  assets: z
    .object({
      barcode: text.min(1),
      description: text.min(1),
      category: optional(text),
      manufacturer: optional(text),
      model: optional(text),
      serial_number: optional(text),
      ...venueLocation,
      purchase_date: optional(date),
      status: z
        .enum(["Active", "Repair", "Missing", "Retired", "Replaced"])
        .default("Active"),
      notes: optional(longText),
      pat_status: z
        .enum(["PAT Required", "PAT Not Required", "Assessment Required"])
        .default("Assessment Required"),
    })
    .strict(),
  extinguishers: z
    .object({
      barcode: text.min(1),
      type: z.enum(["Water", "Foam", "CO2", "Powder", "Wet Chemical", "Other"]),
      capacity: optional(text),
      manufacturer: optional(text),
      model: optional(text),
      serial_number: optional(text),
      ...venueLocation,
      manufacture_date: optional(date),
      commissioned_date: optional(date),
      status: z
        .enum(["In Service", "Removed", "Replaced", "Missing"])
        .default("In Service"),
      last_service_date: optional(date),
      next_service_date: optional(date),
      pressure_condition: optional(text),
      pin_seal_ok: optional(z.coerce.number().int().min(0).max(1)),
      hose_ok: optional(z.coerce.number().int().min(0).max(1)),
      signage_present: optional(z.coerce.number().int().min(0).max(1)),
      positioned_ok: optional(z.coerce.number().int().min(0).max(1)),
      accessible: optional(z.coerce.number().int().min(0).max(1)),
      damage_corrosion: optional(longText),
      contractor: optional(text),
      document_id: optional(id),
      notes: optional(longText),
    })
    .strict(),
  "fire-alarm-tests": z
    .object({
      venue_id: id,
      test_datetime: dateTime,
      call_point_id: id,
      zone: optional(text),
      alarm_operated: booleanFlag,
      sounders_activated: optional(booleanFlag),
      panel_indication_correct: optional(booleanFlag),
      reset_successful: booleanFlag,
      result: z.enum(["Pass", "Fail"]),
      faults: optional(longText),
      notes: optional(longText),
    })
    .strict(),
  "fire-alarm-services": z
    .object({
      venue_id: id,
      contractor: optional(text),
      service_date: date,
      next_service_date: optional(date),
      interval_months: optional(z.coerce.number().int().min(1).max(120)),
      document_id: optional(id),
      defects: optional(longText),
      remedial_actions: optional(longText),
    })
    .strict(),
  "risk-assessments": z
    .object({
      venue_id: id,
      assessment_date: date,
      assessor: optional(text),
      review_date: optional(date),
      document_id: optional(id),
      hazards: optional(longText),
      people_at_risk: optional(longText),
      escape_routes: optional(longText),
      detection_warning: optional(longText),
      doors_compartmentation: optional(longText),
      emergency_lighting: optional(longText),
      extinguishers: optional(longText),
      training: optional(longText),
      evacuation: optional(longText),
      notes: optional(longText),
    })
    .strict(),
  furnishings: z
    .object({
      description: text.min(1),
      quantity: z.coerce.number().int().min(1).max(10000).default(1),
      category: z.enum([
        "Chair",
        "Sofa",
        "Curtain",
        "Carpet",
        "Mattress",
        "Headboard",
        "Other",
      ]),
      ...venueLocation,
      supplier: optional(text),
      purchase_date: optional(date),
      fire_status: z.enum([
        "Fire regulated/compliant",
        "Fire-retardant treated",
        "Not applicable",
        "Evidence required",
        "Requires assessment",
      ]),
      treatment_product: optional(text),
      treatment_date: optional(date),
      treatment_provider: optional(text),
      batch_reference: optional(text),
      document_id: optional(id),
      next_review_date: optional(date),
      notes: optional(longText),
    })
    .strict(),
  documents: z
    .object({
      venue_id: id,
      location_id: optional(id),
      type: text.min(1),
      title: text.min(1),
      reference: optional(text),
      issue_date: optional(date),
      review_date: optional(date),
      issuer: optional(text),
      notes: optional(longText),
      version: z.coerce.number().int().min(1).optional(),
      previous_version_id: optional(id),
    })
    .strict(),
  actions: z
    .object({
      description: text.min(1),
      ...venueLocation,
      related_type: optional(
        z.enum([
          "asset",
          "extinguisher",
          "risk_assessment",
          "fire_alarm_test",
          "furnishing",
          "pat_test",
        ]),
      ),
      related_id: optional(id),
      priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
      responsible_person: optional(text),
      created_date: optional(date),
      due_date: optional(date),
      status: z
        .enum(["Open", "In Progress", "Complete", "Closed"])
        .default("Open"),
      completion_notes: optional(longText),
      completion_document_id: optional(id),
      closed_date: optional(date),
    })
    .strict(),
} as const;

export const callPointSchema = z
  .object({
    venue_id: id,
    code: z.string().trim().min(1).max(100),
    description: text.min(1),
    location_id: id,
    panel_zone: optional(text),
    active: booleanFlag.default(1),
    notes: optional(longText),
  })
  .strict();

export const venueSettingsSchema = z
  .object({ call_point_warning_days: z.coerce.number().int().min(1).max(365) })
  .strict();

export const documentTypeSchema = z
  .object({
    venue_id: id,
    name: z.string().trim().min(1).max(250),
    active: booleanFlag.default(1),
  })
  .strict();

export const patSchema = z
  .object({
    result: z.enum(["Pass", "Fail"]),
    test_date: date,
    next_date: optional(date),
    visual_result: optional(text),
    tester: optional(text),
    readings: optional(longText),
    notes: optional(longText),
    document_id: optional(id),
    action_required: optional(longText),
  })
  .strict();

export const extinguisherCheckSchema = z
  .object({
    check_date: date,
    result: z.enum(["Pass", "Fail"]),
    pressure_condition: optional(text),
    pin_seal_ok: z.coerce.number().int().min(0).max(1),
    hose_ok: z.coerce.number().int().min(0).max(1),
    signage_present: z.coerce.number().int().min(0).max(1),
    positioned_ok: z.coerce.number().int().min(0).max(1),
    accessible: z.coerce.number().int().min(0).max(1),
    damage_corrosion: optional(longText),
    notes: optional(longText),
  })
  .strict();

export const photoMetadataSchema = z
  .object({
    is_main: z.coerce.number().int().min(0).max(1).default(0),
    caption: optional(text),
    captured_at: optional(dateTime),
  })
  .strict();

export const documentLinkSchema = z
  .object({
    entity_type: z.enum([
      "asset",
      "extinguisher",
      "furnishing",
      "pat_test",
      "extinguisher_check",
      "risk_assessment",
      "fire_alarm_test",
      "fire_alarm_call_point",
    ]),
    entity_id: id,
  })
  .strict();
