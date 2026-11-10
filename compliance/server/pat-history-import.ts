import type { DatabaseAdapter } from "./db.js";

export const HISTORIC_PAT_TEST_DATE = "2026-06-01";
export const HISTORIC_PAT_NEXT_DATE = "2027-05-31";
export const HISTORIC_PAT_NOTES = "Imported from historic Village Limits PAT register.";

const source = `0013|Extension lead in bar centre cabinet|Bar
0014|White feather lamp in bar|Bar
0015|Twinkling lights in drum in bar|Bar
0016|Hair dryer lamp in display cabinet|Bar
0017|LED strip lights in display cabinet|Bar
0018|Red and white lighthouse in bar cabinet|Bar
0019|Small extension under cabinet in bar|Bar
0020|Crystal chandelier in bar on cabinet|Bar
0021|Standard lamp gold shade in bar|Bar
0022|Tiffany swan lamp on drum in bar|Bar
0023|Gold feather lamp in bar|Bar
0024|Radio lamp, Annex display cabinet|Annex
0025|3 bulb glass dome lamp, Annex display cabinet|Annex
0026|Tiffany lamp in Annex display cabinet|Annex
0027|Extension lead, Annex cabinet|Annex
0028|Table lamp, Annex table one|Annex
0029|Bar beam twinkling lights|Bar
0030|Bar/lounge/Annex twinkling lights|
0031|Bar jukebox|Bar
0032|Extension lead behind jukebox, Annex|Annex
0033|Sonos speaker in jukebox bar|Bar
0034|Extension lead bar to jukebox|Bar
0035|Fireplace silver lamp|Bar
0036|Socket in bar near shoe|Bar
0037|Black shoe in bar|Bar
0038|Gold oil-looking lamp on bar|Bar
0039|Glass crystal lamp next to gold oil lamp|Bar
0040|Bell to let bar know food ready|Bar
0041|Twinkling garland above bar|Bar
0042|Bar extension lead for lamps on bar|Bar
0043|Bar pump lights|Bar
0044|PC monitor touch screen, bar|Bar
0045|Bar printer, tickets for drinks|Bar
0046|Ice machine in bar|Bar
0047|Glass wash machine in bar|Bar
0048|Crystal glass lamp on bar|Bar
0049|Back bar extension lead|Bar
0050|Netgear, back bar|Bar
0051|Back bar strip lights on gold bottle rack|Bar
0052|Back bar strip lights on gold rack|Bar
0053|Netgear asset box, shelf near card machine|Bar
0054|Extension lead for gold rack, bar|Bar
0055|Wine bottle cooler behind bar|Bar
0056|Bottle fridge with selection drinks, bar area|Bar
0057|Coffee machine near bar|Bar
0058|Extension lead near coffee machine|Bar
0059|Monitor for kitchen food display|Kitchen
0060|Sonos speaker, coffee area|Bar
0061|Netgear, coffee area|Bar
0062|Tall gold round white globe, coffee area|Bar
0063|Power adapter, coffee area|Bar
0064|Power supply|
0065|TV in bar|Bar
0066|Orange lamp on demijohn near door|Entrance
0067|Display cabinet near front door|Entrance
0068|Silver chain crystal standard lamp|Entrance
0069|Extension lead for pole near front door|Entrance
0070|Pac-Man game machine, entrance|Entrance
0071|Extension lead for Pac-Man machine|Entrance
0072|Extension lead for blossom tree / clock|Entrance
0073|Bar beam twinkling lights near blossom tree|Entrance
0074|Clock light near entrance|Entrance
0075|Red tulip lamp on cabinet|Entrance
0076|Small pink Tiffany lamp, welcome desk|Entrance
0077|Small crystal light in display cabinet|Entrance
0078|Small gold colour-changing pearl light|Entrance
0079|Blossom tree lights on welcome stand|Entrance
0080|Small lamp in lounge area|Lounge
0081|Pac-Man top slide machine|Entrance
0082|Standard lamp next to Pac-Man|Entrance
0083|Extension lead for lamp / Pac-Man|Entrance
0084|Brass train lamp, 2 bulbs|Lounge
0085|Tiffany dog lamp in lounge window|Lounge
0086|Extension lead, lamps lounge window|Lounge
0087|Black beaded lamp on side table|Lounge
0088|Tall round globe lamp in window, lounge|Lounge
0089|Old oil lamp, two bulbs, in window|Lounge
0090|Sonos speaker in lounge|Lounge
0091|Tiffany lighthouse lamp on old TV|Lounge
0092|Cream base standard lamp, pink shade|Lounge
0093|Extra sockets/plugs in Annex|Annex
0094|Tall standard lamp, hot pink shade, Annex|Annex
0095|Sonos speaker in Annex|Annex
0096|Lamp in Annex bow window|Annex
0097|Restaurant entrance light|Restaurant
0098|Restaurant entrance rope LED light|Restaurant
0099|Twinkling lights around mirrors in restaurant|Restaurant
0100|Very large Tiffany lamp|Restaurant
0101|Coloured lights on tree in restaurant|Restaurant
0102|Coloured lights on tree in restaurant|Restaurant
0103|Green coloured light in tree, restaurant|Restaurant
0104|Extension lead restaurant for tree lights|Restaurant
0105|Speaker in restaurant near tree|Restaurant
0106|Colour-changing spot light for horse|Restaurant
0107|Swan light next to horse|Restaurant
0108|Extension lead for lights near horse|Restaurant
0109|Red lamp on table three|Restaurant
0110|Garland LED light around windows|Restaurant
0111|Marble fridge counter, kitchen|Kitchen
0112|Extension lead for power to fridge|Kitchen
0113|Microwave, kitchen|Kitchen
0114|Buffalo grill, kitchen|Kitchen
0115|Food ticket printer, kitchen|Kitchen
0116|Igenix single small fryer|Kitchen
0117|Main large fryer|Kitchen
0118|Kettle in kitchen|Kitchen
0119|Phone charger near kettle, kitchen|Kitchen
0120|Phone charger near kettle, kitchen|Kitchen
0121|Alpha Fly Blue light catcher, kitchen|Kitchen
0122|Extension lead for counter food light/fridge|Kitchen
0123|Counter pass hot lamp|Kitchen
0124|Counter pass hot lamps|Kitchen
0125|Counter pass hot lamps|Kitchen
0126|Beldray large black fan, kitchen|Kitchen
0127|Under-counter hot lamp/fridge|Kitchen
0128|White GTEC Hoover, passageway|Passageway
0129|Work printer, passageway|Passageway
0130|Toaster, dessert room|Dessert Room
0131|Alpha Fly lamp, dessert room|Dessert Room
0132|Food mixer, kitchen/dessert room|Dessert Room
0133|Microwave, dessert area|Dessert Room
0134|Tassimo coffee machine, breakfast room|Breakfast Room
0135|Small white portable heater|Breakfast Room
0136|Welcome Village Limits sign, breakfast area|Breakfast Room
0137|Breakfast room sign|Breakfast Room
0138|Box white fancy lamp, breakfast room|Breakfast Room
0139|Red chunky retro TV lamp, breakfast room|Breakfast Room
0140|Peaches studio lamp, breakfast room corner|Breakfast Room
0141|White feather lamp, breakfast room|Breakfast Room
0142|Radiator heater, breakfast room|Breakfast Room
0143|PC monitor, dessert area|Dessert Room
0144|Power supply, dessert area|Dessert Room
0145|Ice cream machine|Dessert Room
0146|Ladies toilet oil radiator|Ladies Toilet`;

export type HistoricPatRow = { barcode: string; description: string; location: string | null; testDate: string; result: "Pass"; nextDate: string };
export const HISTORIC_PAT_ROWS: readonly HistoricPatRow[] = source.split("\n").map(line => { const [barcode,description,location] = line.split("|"); return { barcode,description,location:location||null,testDate:HISTORIC_PAT_TEST_DATE,result:"Pass",nextDate:HISTORIC_PAT_NEXT_DATE }; });

const aliases: Record<string,string[]> = {
  Bar:["bar"], Annex:["annex"], Lounge:["lounge"], Restaurant:["restaurant"],
  Kitchen:["kitchen","main kitchen"], "Dessert Room":["dessert room","dessert area","dessert"],
  "Breakfast Room":["breakfast room","breakfast area"], "Ladies Toilet":["ladies toilet","ladies toilets","female toilet","female toilets"],
  Entrance:["entrance","reception","welcome desk","front entrance"], Passageway:["passageway","corridor"]
};
export type PatImportSummary = { assetsSupplied:number;newAssets:number;existingAssetsMatched:number;patTestsInserted:number;patTestsAlreadyPresent:number;locationMatches:number;unresolvedLocations:Array<{barcode:string;requested:string|null}>;errors:number;dryRun:boolean };

export async function importPatHistory(database:DatabaseAdapter,options:{dryRun?:boolean}={}):Promise<PatImportSummary>{
  const dryRun=Boolean(options.dryRun), seen=new Set<string>();
  if(HISTORIC_PAT_ROWS.length!==134)throw new Error(`Invalid source count: ${HISTORIC_PAT_ROWS.length}`);
  for(const row of HISTORIC_PAT_ROWS){if(!/^\d{4}$/.test(row.barcode))throw new Error(`Invalid four-digit barcode: ${row.barcode}`);if(seen.has(row.barcode))throw new Error(`Duplicate source barcode: ${row.barcode}`);seen.add(row.barcode);}
  try{await database.all("SELECT id,barcode,description,venue_id,location_id,pat_status,is_demo FROM assets WHERE 1=0");await database.all("SELECT id,asset_id,result,test_date,next_date,notes FROM pat_tests WHERE 1=0");await database.all("SELECT id,name,venue_id FROM locations WHERE 1=0");await database.all("SELECT id FROM audit_events WHERE 1=0");}catch{throw new Error("Required PAT import schema is missing");}
  const venues=await database.all<{id:number}>("SELECT id FROM venues WHERE lower(name)=lower(?) AND is_demo=0",["Village Limits"]);
  if(venues.length!==1)throw new Error(`Expected exactly one non-demo Village Limits venue; found ${venues.length}`);
  const venueId=Number(venues[0].id);
  const ambiguous=await database.all<{barcode:string;n:number}>("SELECT barcode,count(*) n FROM assets WHERE venue_id=? AND barcode IN ("+HISTORIC_PAT_ROWS.map(()=>"?").join(",")+") GROUP BY barcode HAVING count(*)>1",[venueId,...HISTORIC_PAT_ROWS.map(r=>r.barcode)]);
  if(ambiguous.length)throw new Error(`Ambiguous duplicate asset barcode(s): ${ambiguous.map(r=>r.barcode).join(", ")}`);
  const locations=await database.all<{id:number;name:string}>("SELECT id,name FROM locations WHERE venue_id=? AND active=1",[venueId]);
  const normalize=(v:string)=>v.trim().toLowerCase();
  const locationIds=new Map<string,number>();
  for(const [logical,names] of Object.entries(aliases)){const hits=locations.filter(l=>names.includes(normalize(l.name)));if(hits.length===1)locationIds.set(logical,Number(hits[0].id));}
  const existingByBarcode=new Map((await database.all<any>("SELECT * FROM assets WHERE venue_id=? AND barcode IN ("+HISTORIC_PAT_ROWS.map(()=>"?").join(",")+")",[venueId,...HISTORIC_PAT_ROWS.map(r=>r.barcode)])).map(a=>[a.barcode,a]));
  const plan=[] as Array<{row:HistoricPatRow;asset:any;locationId:number|null;create:boolean;updateLocation:boolean;hasPat:boolean}>;
  for(const row of HISTORIC_PAT_ROWS){const asset=existingByBarcode.get(row.barcode),locationId=row.location?(locationIds.get(row.location)??null):null;const hasPat=asset?Boolean(await database.get("SELECT id FROM pat_tests WHERE asset_id=? AND test_date=?",[asset.id,HISTORIC_PAT_TEST_DATE])):false;plan.push({row,asset,locationId,create:!asset,updateLocation:Boolean(asset&&!asset.location_id&&locationId),hasPat});}
  const unresolved=plan.filter(p=>!p.locationId).map(p=>({barcode:p.row.barcode,requested:p.row.location}));
  if(!dryRun){
    for(const item of plan){let assetId=item.asset?.id;if(item.create){assetId=(await database.run("INSERT INTO assets(barcode,description,venue_id,location_id,pat_status,status,notes,is_demo) VALUES(?,?,?,?,?,'Active',?,0)",[item.row.barcode,item.row.description,venueId,item.locationId,"PAT Required",HISTORIC_PAT_NOTES])).lastInsertRowid;}else if(item.updateLocation)await database.run("UPDATE assets SET location_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND location_id IS NULL",[item.locationId,assetId]);if(!item.hasPat)await database.run("INSERT INTO pat_tests(asset_id,result,test_date,next_date,notes,created_by) VALUES(?,?,?,?,?,?)",[assetId,"Pass",HISTORIC_PAT_TEST_DATE,HISTORIC_PAT_NEXT_DATE,HISTORIC_PAT_NOTES,null]);}
    if(plan.some(item=>item.create||item.updateLocation||!item.hasPat))await database.run("INSERT INTO audit_events(entity_type,entity_id,action,before_json,after_json,user_id,ip_address) VALUES(?,?,?,?,?,?,?)",["pat_tests",null,"historical_pat_import",null,JSON.stringify({source:"Village Limits historic PAT register",testDate:HISTORIC_PAT_TEST_DATE,assets:HISTORIC_PAT_ROWS.length}),null,null]);
  }
  const newAssets=plan.filter(p=>p.create).length,patMissing=plan.filter(p=>!p.hasPat).length;
  return {assetsSupplied:HISTORIC_PAT_ROWS.length,newAssets:dryRun?newAssets:newAssets,existingAssetsMatched:plan.length-newAssets,patTestsInserted:dryRun?0:patMissing,patTestsAlreadyPresent:plan.length-patMissing,locationMatches:plan.length-unresolved.length,unresolvedLocations:unresolved,errors:0,dryRun};
}
