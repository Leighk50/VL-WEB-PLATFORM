"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { parsePrice, catalogueFromMenus } = require("./catalogue");

test("price parsing is precise and rejects composite prices", () => {
  assert.equal(parsePrice("£12.00"), 1200);
  assert.equal(parsePrice("£8.50"), 850);
  assert.equal(parsePrice("Rib Eye £30 · Fillet £38"), null);
});
test("camembert maps to the agreed initial channels", () => {
  const menus = [{id:"main", visible:true, sections:[{name:"Starters",items:[{
    id:"main-camembert",name:"Baked Camembert",description:"Hot honey",
    price:"£12.00",visible:true,allergens:"Milk, Gluten",showOnEpos:true,
    includeOnSunday:false
  }]}]}];
  const [item] = catalogueFromMenus(menus);
  assert.equal(item.pricePence,1200);
  assert.equal(item.description,"Hot honey");
  assert.equal(item.visibility.main,true);
  assert.equal(item.visibility.website,true);
  assert.equal(item.visibility.epos,true);
  assert.equal(item.visibility.sunday,false);
});
test("existing items are not enabled for EPOS implicitly",()=>{
  const [item] = catalogueFromMenus([{id:"main",sections:[{name:"Mains",items:[{id:"a",name:"Dish",price:"£10"}]}]}]}]);
  assert.equal(item.visibility.epos,false);
});
