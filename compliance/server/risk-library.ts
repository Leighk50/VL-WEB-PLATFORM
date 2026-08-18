import type { DatabaseAdapter } from "./db.js";

export type RiskTemplate = {
  key: string;
  title: string;
  category: "General" | "Fire Safety";
  area: string;
  hazards: string[];
};

const general: Array<[string, string, string[]]> = [
  ["general-workplace", "General Workplace", ["Slips, trips and falls", "Work equipment and maintenance", "Workplace access and welfare", "Visitors and vulnerable people"]],
  ["general-fire-safety", "General Fire Safety", ["Ignition sources and combustible materials", "Detection, warning and emergency lighting", "Escape routes, exits and fire doors", "Evacuation, training and assembly"]],
  ["commercial-kitchen", "Commercial Kitchen", ["Burns, scalds and hot surfaces", "Knives and food preparation machinery", "Slips from water, grease and food", "Heat, ventilation and safe shutdown"]],
  ["coshh-cleaning", "COSHH / Cleaning Chemicals", ["Exposure to hazardous cleaning chemicals", "Incompatible chemical mixing", "Unlabelled or insecure storage", "Spill response and personal protective equipment"]],
  ["manual-handling", "Manual Handling", ["Lifting deliveries and stock", "Moving barrels, furniture and equipment", "Repetitive housekeeping tasks", "Restricted-space and team lifting"]],
  ["working-at-height", "Working at Height", ["Use of steps and ladders", "Changing lamps and decorations", "Cleaning high surfaces", "Falling objects and exclusion zones"]],
  ["lone-working", "Lone Working", ["Personal safety and violence", "Medical emergency while alone", "Fire or evacuation while alone", "Communication and escalation failure"]],
  ["front-of-house", "Food Service / Front of House", ["Hot food and drink service", "Broken glass and sharp objects", "Customer movement and spillages", "Allergens and emergency communication"]],
  ["cellar-bar", "Cellar & Bar", ["CO2 and gas-cylinder hazards", "Keg and cellar manual handling", "Wet floors and restricted access", "Glass handling and bar equipment"]],
  ["housekeeping-bedrooms", "Housekeeping & Guest Bedrooms", ["Guest-room electrical and fire hazards", "Cleaning chemicals and sharps", "Linen, laundry and manual handling", "Working alone and guest interaction"]],
  ["events-entertainment", "Events & Live Entertainment", ["Crowd capacity and movement", "Temporary electrical and stage equipment", "Noise, lighting and trip hazards", "Emergency access and performer controls"]],
  ["outdoor-car-park", "Outdoor Areas & Car Park", ["Vehicle and pedestrian conflict", "Uneven, wet or icy surfaces", "External lighting and security", "Waste, smoking and external fire spread"]],
];

const fire: Array<[string, string, string, string[]]> = [
  ["deep-fat-fryers", "Deep Fat Fryers & Cooking Oil", "Kitchen", ["Overheating oil or thermostat/high-limit failure", "Ignition during unattended operation", "Grease accumulation and combustible materials nearby", "Unsafe oil changing, isolation or hot-oil disposal", "Unsuitable suppression, blanket or extinguisher arrangements", "Staff response, alarm and evacuation"]],
  ["gas-ovens-hobs", "Gas Ovens & Gas Hobs", "Kitchen", ["Gas leakage and failed flame supervision", "Ignition sources and combustible materials", "Inadequate ventilation or extraction", "Emergency isolation and shutdown procedure", "Servicing and suspected-gas-leak response"]],
  ["blow-torch", "Kitchen Blow Torch / Butane Torch", "Kitchen", ["Naked flame igniting grease, packaging or clothing", "Damaged or incorrectly fitted cartridge", "Unsafe cartridge changing or storage", "Hot equipment handled before cooling", "Use by untrained staff or in an unsuitable area"]],
  ["chargrill", "Chargrill / Open-Flame Cooking Equipment", "Kitchen", ["Open flame and flare-up", "Grease deposits and nearby combustibles", "Extraction failure or inadequate clearance", "Unattended operation and shutdown", "Emergency isolation and staff competence"]],
  ["extraction", "Kitchen Extraction & Grease Build-Up", "Kitchen", ["Grease ignition in filters or ductwork", "Cleaning frequency not based on use", "Inaccessible or uncleaned duct sections", "Missing cleaning/service evidence", "Fire spread through penetrations"]],
  ["unattended-cooking", "Cooking Equipment Left Unattended", "Kitchen", ["Unsupervised heat or flame", "Failure of timers or thermostats", "Poor shift handover", "No documented closing check"]],
  ["gas-isolation", "Gas Supply & Emergency Isolation", "Kitchen", ["Gas escape from pipework or appliance", "Isolation valve inaccessible or unidentified", "Staff unable to isolate safely", "Unsafe restart after emergency"]],
  ["lpg-butane", "LPG / Butane Cylinders & Cartridges", "Kitchen", ["Leaking or damaged cylinder/cartridge", "Heat exposure or excessive stock", "Incorrect connection or changeover", "Unsafe internal storage and disposal"]],
  ["electrical-kitchen", "Electrical Kitchen Equipment", "Kitchen", ["Damaged cables, plugs or equipment", "Overloaded supplies or unsuitable extensions", "Water ingress and poor isolation", "Unrecorded inspection, PAT or servicing"]],
  ["kitchen-combustibles", "Combustible Materials in Kitchen", "Kitchen", ["Packaging or cloths beside heat sources", "Excess stock obstructing routes", "Combustible wall or ceiling finishes", "Poor waste-removal routine"]],
  ["suppression-blankets", "Kitchen Fire Suppression & Fire Blankets", "Kitchen", ["Incorrect or inaccessible fire blanket", "Suppression coverage unsuitable for equipment", "Inspection or service overdue", "Staff unfamiliar with safe use and evacuation"]],
  ["kitchen-extinguishers", "Kitchen Fire Extinguisher Provision", "Kitchen", ["Incorrect extinguisher type for cooking risk", "Unit missing, obstructed or damaged", "Signage or servicing deficient", "Unsafe expectation that staff fight fire"]],
  ["hot-oil-waste", "Hot Oil Disposal & Waste Storage", "Kitchen", ["Oil transferred while dangerously hot", "Unsuitable or open waste container", "Waste stored near ignition source", "External waste supporting fire spread"]],
  ["oil-spills", "Grease / Oil Spill Fire Risk", "Kitchen", ["Oil contacting hot equipment", "Contaminated absorbents left near heat", "Slip delaying evacuation", "No safe spill-isolation procedure"]],
  ["kitchen-closing", "Kitchen Closing Fire-Safety Check", "Kitchen", ["Appliance left energised", "Gas or extraction not safely shut down", "Waste and combustibles left exposed", "Closing check not recorded or handed over"]],
  ["kitchen-evacuation", "Emergency Evacuation from Kitchen", "Kitchen", ["Exit route obstructed or compromised", "Alarm not heard above kitchen noise", "Staff delay to isolate or fight fire", "Assembly and accountability failure"]],
  ["fire-doors", "Fire Doors & Compartmentation", "General", ["Fire door wedged or unable to self-close", "Damaged seals, glazing or ironmongery", "Unsealed service penetrations", "Inspection findings not actioned"]],
  ["portable-heaters", "Portable Heaters", "General", ["Heater too close to combustibles", "Unapproved or damaged appliance", "Heater left unattended", "Overloaded electrical supply"]],
  ["candles", "Candles / Table Flames / Celebration Candles", "Restaurant", ["Flame contacts decorations, clothing or furnishings", "Unstable holder or unsuitable location", "Flame left unattended", "No safe lighting/extinguishing procedure"]],
  ["live-entertainment-fire", "Live Entertainment Electrical / Stage Equipment", "Events", ["Overloaded temporary electrical supply", "Hot lighting near combustible materials", "Cables obstructing escape routes", "Contractor equipment not checked", "Stage layout restricts evacuation"]],
  ["seasonal-decorations", "Seasonal Decorations", "General", ["Combustible decorations near heat or lighting", "Unverified flame-retardant properties", "Escape signage or detection obscured", "Unsafe temporary electrical lighting"]],
  ["laundry-fire", "Laundry Equipment", "Accommodation", ["Lint accumulation and overheating", "Equipment left running unattended", "Damaged electrical equipment", "Linen stored against heat sources"]],
  ["bedroom-electrical", "Bedroom Electrical Fire Risk", "Accommodation", ["Guest appliance or charger overheating", "Damaged sockets, leads or fixed equipment", "Overloaded adaptors and extensions", "Combustibles near lamps or heaters"]],
  ["smoking-area", "Smoking / Vaping & External Smoking Area", "External", ["Discarded smoking materials ignite waste", "Smoking too close to doors or combustibles", "Ash receptacle unsuitable or overflowing", "Vaping-device battery charging/storage"]],
  ["waste-bins", "Waste / Bin Storage Fire Risk", "External", ["Deliberate or accidental ignition", "Bins too close to building openings", "Combustible waste accumulated", "Access, locking and collection inadequate"]],
];

export const riskTemplates: RiskTemplate[] = [
  ...general.map(([key, title, hazards]) => ({ key, title, category: "General" as const, area: title.includes("Kitchen") ? "Kitchen" : "General", hazards })),
  ...fire.map(([key, title, area, hazards]) => ({ key: `fire-${key}`, title, category: "Fire Safety" as const, area, hazards })),
];

export const riskScore = (likelihood: number, severity: number) => likelihood * severity;
export const riskLevel = (score: number) => score >= 15 ? "Critical" : score >= 10 ? "High" : score >= 5 ? "Medium" : "Low";

export const RISK_CONTENT_REVIEW_DATE = "2026-07-07";
export const RISK_NEXT_REVIEW_DATE = "2027-07-07";
export const BOOTSTRAP_RISK_NOTE = "Working template for the responsible person to verify against actual site conditions. No control is confirmed merely because it appears here.";
export const REVIEWED_RISK_NOTE = "Content reviewed for practical hospitality use on 7 July 2026. Physical controls and site conditions still require confirmation by the responsible person.";

const peopleFor = (area: string) => {
  if (area === "Kitchen") return "Kitchen staff, other employees working nearby, contractors and visitors entering the kitchen";
  if (area === "Accommodation") return "Guests, housekeeping staff, maintenance staff and contractors";
  if (area === "Restaurant") return "Guests, front-of-house staff, performers and contractors";
  if (area === "Events") return "Guests, performers, event staff, contractors and other employees";
  if (area === "External") return "Guests, staff, contractors, delivery drivers and members of the public";
  return "Staff, guests, contractors and visitors who may encounter the hazard";
};

const harmFor = (hazard: string) => {
  const value = hazard.toLowerCase();
  if (/gas|co2|cylinder|cartridge/.test(value)) return "Fire, explosion, burns, asphyxiation or illness following a leak, damaged container or unsafe isolation";
  if (/oil|grease|fryer|flame|ignition|combust|candle|heater|smoking|fire spread/.test(value)) return "Burns, smoke inhalation, fire spread or delayed evacuation";
  if (/electrical|cable|plug|socket|charger|lighting/.test(value)) return "Electric shock, burns, fire or an obstructed evacuation route";
  if (/escape|exit|evacuation|alarm|warning|door|compartment/.test(value)) return "Smoke or fire exposure and delayed or failed evacuation";
  if (/slip|trip|surface|floor|movement|access/.test(value)) return "Slips, trips, falls, collision injuries or delayed evacuation";
  if (/lift|handling|barrel|keg|linen|repetitive/.test(value)) return "Musculoskeletal injury, crushing, strains or sprains";
  if (/chemical|spill|mixing|coshh/.test(value)) return "Skin or eye injury, breathing difficulty, poisoning or a slip-related injury";
  return `Injury, ill health or impaired evacuation arising from ${hazard.toLowerCase()}`;
};

const controlsFor = (hazard: string) => {
  const value = hazard.toLowerCase();
  if (/gas|cylinder|cartridge/.test(value)) return "Site verification must confirm sound equipment and connections, suitable ventilation and storage, a clearly identified accessible isolation point, competent users and an understood leak/emergency procedure. Maintenance or inspection evidence should be linked where available.";
  if (/fryer|hot oil|oil changing/.test(value)) return "Site verification must confirm temperature and high-limit controls, safe operating and shutdown arrangements, separation from combustibles, safe cooled-oil handling, appropriate fire-fighting equipment and trained staff who prioritise raising the alarm and evacuation.";
  if (/extraction|grease|duct|filter/.test(value)) return "Site verification must confirm filters and accessible surfaces are clean, duct cleaning frequency reflects use, inaccessible sections are included, penetrations are protected and dated cleaning/service evidence is retained.";
  if (/extinguisher|fire blanket|suppression/.test(value)) return "Site verification must confirm the provision suits the identified hazard, equipment is visible, accessible, undamaged, signed and within service, and staff understand that evacuation takes priority over attempting to fight a fire.";
  if (/fire door|self-close|compartment|penetration/.test(value)) return "Site verification must confirm doors close fully and are not wedged, seals, glazing and ironmongery are sound, service penetrations are sealed and inspection defects are recorded and tracked to completion.";
  if (/electrical|cable|plug|socket|charger|lighting/.test(value)) return "Site verification must confirm equipment and supplies are suitable, visually sound and not overloaded, cables are routed safely, defective items are removed from use and relevant inspection or maintenance records are retained.";
  if (/escape|exit|evacuation|alarm|warning|assembly/.test(value)) return "Site verification must confirm routes and exits are clear, warning can be heard or seen in the area, staff know the immediate evacuation procedure and assembly/accountability arrangements are workable.";
  if (/waste|bin|combustible|packaging|decoration|linen stored/.test(value)) return "Site verification must confirm combustible material is controlled, separated from heat and building openings, removed at a suitable frequency and does not obstruct escape routes, signs or detection.";
  if (/slip|trip|floor|surface|movement/.test(value)) return "Site verification must confirm routine inspection and prompt spill/defect response, suitable lighting and housekeeping, clear walking routes and warning or exclusion controls where a hazard cannot be removed immediately.";
  if (/lift|handling|barrel|keg|linen|repetitive/.test(value)) return "Site verification must confirm loads and routes have been assessed, handling aids or team lifting are used where appropriate, storage reduces awkward handling and staff know when not to attempt a lift alone.";
  if (/chemical|coshh|mixing|spill response/.test(value)) return "Site verification must confirm labelled products, current safety information, secure segregated storage, correct dilution and PPE, staff instruction and a suitable spill/exposure response.";
  return `Site verification must confirm practical controls, staff instructions, inspection records and defect reporting are suitable for ${hazard.toLowerCase()}.`;
};

export function reviewedHazardContent(template: RiskTemplate, hazard: string) {
  return {
    whoMayBeHarmed: peopleFor(template.area),
    howHarmed: harmFor(hazard),
    existingControls: controlsFor(hazard),
    furtherAction: "Responsible person to confirm these arrangements on site, record any shortfall as a linked Action / Defect and attach supporting evidence where available.",
  };
}

export async function reviewBootstrappedRiskContent(database: DatabaseAdapter) {
  let assessmentsReviewed = 0, hazardsReviewed = 0, historicalDatesPreserved = 0;
  for (const template of riskTemplates) {
    const records = await database.all<any>("SELECT r.* FROM risk_assessments r JOIN venues v ON v.id=r.venue_id WHERE v.is_demo=0 AND r.template_key=? AND r.status<>'Archived'", [template.key]);
    for (const assessment of records) {
      const untouched = assessment.created_by == null && assessment.updated_by == null && assessment.assessor == null && assessment.signed_by == null && assessment.signed_at == null && Number(assessment.version || 1) === 1 && assessment.notes === BOOTSTRAP_RISK_NOTE;
      const hazards = await database.all<any>("SELECT * FROM risk_hazards WHERE assessment_id=?", [assessment.id]);
      for (const row of hazards) {
        const oldFurtherAction = `Verify site-specific arrangements, records, staff competence and condition for: ${row.hazard}.`;
        if (row.created_by != null || row.existing_controls !== "Requires site verification" || row.further_action !== oldFurtherAction) continue;
        const content = reviewedHazardContent(template, row.hazard);
        await database.run("UPDATE risk_hazards SET who_may_be_harmed=?,how_harmed=?,existing_controls=?,further_action=?,status='Requires site verification',site_verification_required=1 WHERE id=?", [content.whoMayBeHarmed, content.howHarmed, content.existingControls, content.furtherAction, row.id]);
        hazardsReviewed++;
      }
      if (untouched) {
        await database.run("UPDATE risk_assessments SET assessment_date=?,signed_at=?,review_date=?,content_reviewed_at=?,content_review_note=?,notes=?,status='Requires Site Verification',site_verification_required=1 WHERE id=?", [RISK_CONTENT_REVIEW_DATE, `${RISK_CONTENT_REVIEW_DATE}T00:00:00`, RISK_NEXT_REVIEW_DATE, RISK_CONTENT_REVIEW_DATE, REVIEWED_RISK_NOTE, REVIEWED_RISK_NOTE, assessment.id]);
        assessmentsReviewed++;
      } else if (assessment.content_reviewed_at == null) {
        historicalDatesPreserved++;
      }
    }
  }
  return { assessmentsReviewed, hazardsReviewed, historicalDatesPreserved };
}

export async function bootstrapRiskLibrary(database: DatabaseAdapter) {
  const venues = await database.all<{ id: number }>("SELECT id FROM venues WHERE lower(name)=lower(?) AND is_demo=0", ["Village Limits"]);
  let assessments = 0, hazards = 0, callPoints = 0;
  for (const venue of venues) {
    for (const template of riskTemplates) {
      const marker = await database.get<{ assessment_id: number | null }>("SELECT assessment_id FROM risk_template_registry WHERE venue_id=? AND template_key=?", [venue.id, template.key]);
      if (marker) continue;
      let result;
      try {
        result = await database.run("INSERT INTO risk_assessments(venue_id,title,category,area,assessment_date,signed_at,review_date,status,overall_risk_rating,version,template_key,site_verification_required,content_reviewed_at,content_review_note,notes) VALUES(?,?,?,?,?,?,?,'Requires Site Verification','Requires site verification',1,?,1,?,?,?)", [venue.id, template.title, template.category, template.area, RISK_CONTENT_REVIEW_DATE, `${RISK_CONTENT_REVIEW_DATE}T00:00:00`, RISK_NEXT_REVIEW_DATE, template.key, RISK_CONTENT_REVIEW_DATE, REVIEWED_RISK_NOTE, REVIEWED_RISK_NOTE]);
      } catch (error) {
        if (await database.get("SELECT id FROM risk_assessments WHERE venue_id=? AND template_key=?", [venue.id, template.key])) continue;
        throw error;
      }
      const assessmentId = Number(result.lastInsertRowid);
      for (const hazard of template.hazards) {
        const content = reviewedHazardContent(template, hazard);
        await database.run("INSERT INTO risk_hazards(assessment_id,hazard,who_may_be_harmed,how_harmed,existing_controls,initial_likelihood,initial_severity,initial_score,further_action,residual_likelihood,residual_severity,residual_score,status,site_verification_required) VALUES(?,?,?,?,?,3,4,12,?,2,4,8,'Requires site verification',1)", [assessmentId, hazard, content.whoMayBeHarmed, content.howHarmed, content.existingControls, content.furtherAction]);
        hazards++;
      }
      await database.run("INSERT INTO risk_template_registry(venue_id,template_key,assessment_id) VALUES(?,?,?)", [venue.id, template.key, assessmentId]);
      assessments++;
    }
    const pointNames: Array<[string, string]> = [["CP01", "Toilet Fire Exit"], ["CP02", "Front Door"], ["CP03", "Annex"], ["CP04", "Restaurant Single Door"], ["CP05", "Restaurant Double Doors"]];
    for (const [code, description] of pointNames) {
      if (await database.get("SELECT id FROM fire_alarm_call_points WHERE venue_id=? AND code=?", [venue.id, code])) continue;
      let location = await database.get<{ id: number }>("SELECT id FROM locations WHERE venue_id=? AND lower(name)=lower(?)", [venue.id, description]);
      if (!location) location = { id: Number((await database.run("INSERT INTO locations(venue_id,name) VALUES(?,?)", [venue.id, description])).lastInsertRowid) };
      try {
        await database.run("INSERT INTO fire_alarm_call_points(venue_id,code,description,location_id,active,notes) VALUES(?,?,?,?,1,?)", [venue.id, code, description, location.id, "Initial Village Limits call point; verify panel zone and details on site."]);
      } catch (error) {
        if (await database.get("SELECT id FROM fire_alarm_call_points WHERE venue_id=? AND code=?", [venue.id, code])) continue;
        throw error;
      }
      callPoints++;
    }
  }
  return { assessments, hazards, callPoints };
}
