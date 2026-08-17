import type { Express, Response } from "express";
import { z } from "zod";
import { audit, db, rows } from "./db.js";
import { canAdmin, canWrite, type AuthedRequest } from "./auth.js";

const initialTemplates = [
  ["frozen-delivery", "Frozen Delivery Checks", "Deliveries", "delivery", "as-needed"],
  ["fridge-temperature", "Fridge Temperature Record", "Temperature Checks", "temperature", "daily"],
  ["freezer-temperature", "Freezer Temperature Record", "Temperature Checks", "temperature", "daily"],
  ["food-delivery", "Food Delivery Records", "Deliveries", "delivery", "as-needed"],
  ["cooking-temperature", "Cooking Temperature Record", "Temperature Checks", "temperature", "as-needed"],
  ["cooling-temperature", "Cooling Temperature Record", "Temperature Checks", "cooling", "as-needed"],
  ["daily-cleaning", "Daily Cleaning Checklist", "Cleaning", "cleaning_checklist", "daily"],
  ["opening-bar", "Opening Checklist Bar Area", "Opening / Closing", "checklist", "daily"],
  ["probe-calibration", "Calibration Record", "Probe Calibration", "calibration", "monthly"],
  ["deep-cleaning", "Deep Cleaning Checklist", "Cleaning", "cleaning_checklist", "weekly"],
] as const;

const initialCleaning = [
  ["combi-oven", "Combi oven", "Clean according to appliance instructions"],
  ["floors", "Floors", "Sweep and mop"],
  ["rubbish-bins", "Rubbish bins", "Clean and disinfect"],
  ["tables", "Tables", "Clean, disinfect and wipe"],
  ["sinks", "Sinks", "Clean, disinfect and wipe"],
  ["chopping-boards", "Chopping boards", "Clean using hot soapy water and dishwasher"],
  ["door-handles", "Door handles", "Clean, disinfect and wipe"],
  ["switches", "Switches", "Clean, disinfect and wipe"],
  ["counter-tops", "Counter tops", "Clean and wipe"],
] as const;

export async function bootstrapFoodHygiene() {
  const venues = await rows<{ id: number }>("SELECT id FROM venues WHERE is_demo=0");
  const today = new Date().toISOString().slice(0, 10);
  for (const venue of venues) {
    for (const [key, title, category, type, frequency] of initialTemplates)
      await db.run(
        "INSERT INTO food_task_templates(venue_id,template_key,title,category,task_type,frequency,instructions,effective_start_date) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM food_task_templates WHERE venue_id=? AND template_key=?)",
        [venue.id, key, title, category, type, frequency, title, today, venue.id, key],
      );
    const daily = await db.get<{ id: number }>(
      "SELECT id FROM food_task_templates WHERE venue_id=? AND template_key='daily-cleaning'",
      [venue.id],
    );
    if (daily)
      for (let index = 0; index < initialCleaning.length; index++) {
        const [key, label, instruction] = initialCleaning[index];
        await db.run(
          "INSERT INTO food_checklist_items(template_id,item_key,label,instruction,frequency,sort_order) SELECT ?,?,?,?,'daily',? WHERE NOT EXISTS(SELECT 1 FROM food_checklist_items WHERE template_id=? AND item_key=?)",
          [daily.id, key, label, instruction, index, daily.id, key],
        );
      }
    await db.run(
      "INSERT INTO food_equipment(venue_id,name,equipment_type,active) SELECT ?,'Marble Counter Fridge','fridge',1 WHERE NOT EXISTS(SELECT 1 FROM food_equipment WHERE venue_id=? AND name='Marble Counter Fridge')",
      [venue.id, venue.id],
    );
  }
}

const templateSchema = z.object({
  venue_id: z.coerce.number().int().positive(), title: z.string().min(1).max(300),
  category: z.string().min(1).max(100), task_type: z.enum(["checklist", "temperature", "delivery", "cleaning_checklist", "calibration", "yes_no", "numeric", "free_text", "cooling"]),
  frequency: z.enum(["daily", "weekly", "monthly", "custom", "as-needed"]),
  template_key: z.string().regex(/^[a-z0-9-]+$/).max(150), location_id: z.coerce.number().int().positive().nullable().optional(),
  instructions: z.string().max(5000).optional(), active: z.coerce.number().int().min(0).max(1).default(1),
  lower_limit: z.coerce.number().nullable().optional(), upper_limit: z.coerce.number().nullable().optional(), target_minutes: z.coerce.number().int().positive().nullable().optional(),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), days_of_week: z.string().max(100).nullable().optional(), evidence_required: z.coerce.number().int().min(0).max(1).default(0),
});
const readingSchema = z.object({
  task_instance_id: z.coerce.number().int().positive().nullable().optional(), equipment_id: z.coerce.number().int().positive().nullable().optional(),
  reading_type: z.enum(["fridge", "freezer", "cooking", "delivery", "other"]), product: z.string().max(500).optional(), station: z.string().max(300).optional(),
  temperature: z.coerce.number().min(-100).max(300), notes: z.string().max(5000).optional(), corrective_action: z.string().max(5000).optional(), create_action: z.boolean().optional(),
});
const completionSchema = z.object({ status: z.enum(["completed", "skipped", "not_applicable"]), reason: z.string().max(1000).optional(), notes: z.string().max(5000).optional() });

function venueId(req: AuthedRequest) {
  return req.user!.role === "administrator" ? Number(req.query.venue_id || req.body?.venue_id || 0) : Number(req.user!.venueId);
}
async function allowed(req: AuthedRequest, res: Response, id: number) {
  if (!id || (req.user!.role !== "administrator" && req.user!.venueId !== id)) {
    res.status(403).json({ error: "Venue access denied" }); return false;
  }
  return Boolean(await db.get("SELECT id FROM venues WHERE id=?", [id]));
}
export function scheduled(frequency: string, date: string, days?: string | null) {
  const d = new Date(`${date}T12:00:00Z`);
  if (frequency === "daily") return !days || days.split(",").includes(String(d.getUTCDay()));
  if (frequency === "weekly") return d.getUTCDay() === 1;
  if (frequency === "monthly") return d.getUTCDate() === 1;
  return false;
}
export function readingIsCompliant(value: number, lower: number | null, upper: number | null) {
  return (lower == null || value >= lower) && (upper == null || value <= upper);
}
async function generate(venue: number, date: string) {
  const templates = await rows<any>("SELECT * FROM food_task_templates WHERE venue_id=? AND active=1 AND archived_at IS NULL AND effective_start_date<=?", venue, date);
  for (const t of templates) if (scheduled(t.frequency, date, t.days_of_week))
    await db.run("INSERT INTO food_task_instances(venue_id,template_id,due_date,due_at,title_snapshot,category_snapshot,task_type_snapshot,instructions_snapshot,lower_limit_snapshot,upper_limit_snapshot,target_minutes_snapshot) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM food_task_instances WHERE template_id=? AND due_date=?)", [venue,t.id,date,t.scheduled_time ? `${date}T${t.scheduled_time}:00` : null,t.title,t.category,t.task_type,t.instructions,t.lower_limit,t.upper_limit,t.target_minutes,t.id,date]);
}

export function registerFoodHygiene(app: Express) {
  app.get("/api/food-hygiene/today", async (req: AuthedRequest, res) => {
    const venue = venueId(req), date = String(req.query.date || new Date().toISOString().slice(0,10));
    if (!(await allowed(req,res,venue))) return; await generate(venue,date);
    const tasks = await rows<any>("SELECT i.*,t.location_id,u.name completed_by_name FROM food_task_instances i JOIN food_task_templates t ON t.id=i.template_id LEFT JOIN users u ON u.id=i.completed_by WHERE i.venue_id=? AND i.due_date=? ORDER BY COALESCE(i.due_at,i.created_at),i.id",venue,date);
    const openActions = Number((await db.get<any>("SELECT count(*) n FROM actions WHERE venue_id=? AND related_type LIKE 'food_%' AND status NOT IN ('Closed','Complete')",[venue]))?.n || 0);
    const counts = { due: tasks.length, completed: tasks.filter(x=>x.status==="completed").length, outstanding: tasks.filter(x=>x.status==="outstanding").length, overdue: tasks.filter(x=>x.status==="outstanding" && x.due_at && new Date(x.due_at)<new Date()).length, exceptions: tasks.filter(x=>x.exception).length, openActions };
    res.json({date,counts,tasks});
  });
  app.get("/api/food-hygiene/records", async (req: AuthedRequest,res)=>{
    const venue=venueId(req), from=String(req.query.from||new Date().toISOString().slice(0,10)), to=String(req.query.to||from); if(!(await allowed(req,res,venue)))return;
    res.json(await rows("SELECT i.*,u.name completed_by_name FROM food_task_instances i LEFT JOIN users u ON u.id=i.completed_by WHERE i.venue_id=? AND i.due_date BETWEEN ? AND ? ORDER BY i.due_date DESC,i.id",venue,from,to));
  });
  app.post("/api/food-hygiene/tasks/:id/complete",canWrite,async(req:AuthedRequest,res)=>{
    const parsed=completionSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:"Invalid completion",issues:parsed.error.flatten()});
    const id=Number(req.params.id),before=await db.get<any>("SELECT * FROM food_task_instances WHERE id=?",[id]); if(!before||!(await allowed(req,res,Number(before.venue_id))))return;
    if(parsed.data.status!=="completed"&&!parsed.data.reason?.trim())return res.status(400).json({error:"A reason is required for skipped or not-applicable tasks"});
    await db.run("UPDATE food_task_instances SET status=?,completed_at=CURRENT_TIMESTAMP,completed_by=?,skip_reason=?,notes=? WHERE id=? AND status='outstanding'",[parsed.data.status,req.user!.id,parsed.data.reason||null,parsed.data.notes||null,id]);
    const after=await db.get("SELECT * FROM food_task_instances WHERE id=?",[id]); await audit("food_task_instance",id,parsed.data.status,before,after,req.user!.id,req.ip); res.json(after);
  });
  app.get("/api/food-hygiene/equipment",async(req:AuthedRequest,res)=>{const v=venueId(req);if(!(await allowed(req,res,v)))return;res.json(await rows("SELECT e.*,l.name location_name FROM food_equipment e LEFT JOIN locations l ON l.id=e.location_id WHERE e.venue_id=? ORDER BY e.active DESC,e.name",v));});
  app.post("/api/food-hygiene/readings",canWrite,async(req:AuthedRequest,res)=>{
    const p=readingSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid temperature reading",issues:p.error.flatten()}); const v=venueId(req);if(!(await allowed(req,res,v)))return;
    let lower:null|number=null,upper:null|number=null; if(p.data.equipment_id){const e=await db.get<any>("SELECT * FROM food_equipment WHERE id=? AND venue_id=? AND active=1",[p.data.equipment_id,v]);if(!e)return res.status(400).json({error:"Equipment is inactive or outside this venue"});lower=e.lower_limit;upper=e.upper_limit;}
    if(p.data.task_instance_id){const t=await db.get<any>("SELECT * FROM food_task_instances WHERE id=? AND venue_id=?",[p.data.task_instance_id,v]);if(!t)return res.status(400).json({error:"Task is outside this venue"});lower=lower??t.lower_limit_snapshot;upper=upper??t.upper_limit_snapshot;}
    const compliant=readingIsCompliant(p.data.temperature,lower,upper); if(!compliant&&!p.data.corrective_action?.trim())return res.status(400).json({error:"Corrective-action information is required for an out-of-range reading",code:"CORRECTIVE_ACTION_REQUIRED"});
    let actionId:null|number=null;if(!compliant&&p.data.create_action){actionId=(await db.run("INSERT INTO actions(description,venue_id,related_type,priority,status,created_by) VALUES(?,?,'food_temperature_reading','High','Open',?)",[`Temperature exception: ${p.data.temperature} °C. ${p.data.corrective_action}`,v,req.user!.id])).lastInsertRowid;}
    const result=await db.run("INSERT INTO food_temperature_readings(venue_id,task_instance_id,equipment_id,reading_type,product,station,temperature,lower_limit_snapshot,upper_limit_snapshot,compliant,recorded_by,notes,action_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[v,p.data.task_instance_id||null,p.data.equipment_id||null,p.data.reading_type,p.data.product||null,p.data.station||null,p.data.temperature,lower,upper,compliant?1:0,req.user!.id,p.data.notes||p.data.corrective_action||null,actionId]);
    if(actionId)await db.run("UPDATE actions SET related_id=? WHERE id=?",[result.lastInsertRowid,actionId]); if(p.data.task_instance_id)await db.run("UPDATE food_task_instances SET status='completed',completed_at=CURRENT_TIMESTAMP,completed_by=?,exception=?,corrective_action=?,action_id=? WHERE id=?",[req.user!.id,compliant?0:1,p.data.corrective_action||null,actionId,p.data.task_instance_id]);
    const row=await db.get("SELECT * FROM food_temperature_readings WHERE id=?",[result.lastInsertRowid]);await audit("food_temperature_reading",result.lastInsertRowid,"create",null,row,req.user!.id,req.ip);res.status(201).json(row);
  });
  app.get("/api/food-hygiene/settings",canAdmin,async(req:AuthedRequest,res)=>{const v=venueId(req);if(!(await allowed(req,res,v)))return;res.json({templates:await rows("SELECT * FROM food_task_templates WHERE venue_id=? ORDER BY active DESC,category,title",v),equipment:await rows("SELECT * FROM food_equipment WHERE venue_id=? ORDER BY active DESC,name",v),probes:await rows("SELECT * FROM food_probes WHERE venue_id=? ORDER BY active DESC,name",v),suppliers:await rows("SELECT * FROM food_suppliers WHERE venue_id=? ORDER BY active DESC,name",v)});});
  app.post("/api/food-hygiene/templates",canAdmin,async(req:AuthedRequest,res)=>{const p=templateSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:"Invalid task template",issues:p.error.flatten()});if(!(await allowed(req,res,p.data.venue_id)))return;const d=p.data,r=await db.run("INSERT INTO food_task_templates(venue_id,template_key,title,category,task_type,location_id,active,frequency,days_of_week,scheduled_time,instructions,evidence_required,lower_limit,upper_limit,target_minutes,effective_start_date,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[d.venue_id,d.template_key,d.title,d.category,d.task_type,d.location_id||null,d.active,d.frequency,d.days_of_week||null,d.scheduled_time||null,d.instructions||null,d.evidence_required,d.lower_limit??null,d.upper_limit??null,d.target_minutes??null,new Date().toISOString().slice(0,10),req.user!.id]);res.status(201).json(await db.get("SELECT * FROM food_task_templates WHERE id=?",[r.lastInsertRowid]));});
  app.patch("/api/food-hygiene/templates/:id",canAdmin,async(req:AuthedRequest,res)=>{const id=Number(req.params.id),before=await db.get<any>("SELECT * FROM food_task_templates WHERE id=?",[id]);if(!before||!(await allowed(req,res,Number(before.venue_id))))return;const p=templateSchema.omit({venue_id:true,template_key:true}).partial().safeParse(req.body);if(!p.success||!Object.keys(p.data).length)return res.status(400).json({error:"Invalid template update"});const keys=Object.keys(p.data),values=Object.values(p.data);await db.run(`UPDATE food_task_templates SET ${keys.map(k=>`${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?`,[...values,req.user!.id,id]);const after=await db.get("SELECT * FROM food_task_templates WHERE id=?",[id]);await audit("food_task_template",id,"update",before,after,req.user!.id,req.ip);res.json(after);});
}
