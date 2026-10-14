"use strict";

/**
 * EPOS catalogue v0.1: compatibility adapter for existing website menu items.
 * Read-only: does not alter live menu data, seed files or publishing behaviour.
 * The source menu remains authoritative until a migration is explicitly approved.
 */
const CHANNELS = Object.freeze(["main", "sunday", "specials", "desserts", "drinks", "wine", "website", "epos"]);

function parsePrice(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value * 100);
  if (typeof value !== "string" || !/^£?\s*\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  return Math.round(Number(value.replace(/[£\s]/g, "")) * 100);
}

function catalogueFromMenus(menus) {
  if (!Array.isArray(menus)) throw new TypeError("menus must be an array");
  return menus.flatMap(menu => (menu.sections || []).flatMap(section => (section.items || []).map(item => {
    const id = String(item.id || "").trim();
    if (!id) throw new Error("Menu item requires a stable ID");
    const visibility = Object.fromEntries(CHANNELS.map(channel => [channel, false]));
    visibility[menu.id] = item.visible !== false && menu.visible !== false;
    visibility.website = item.visible !== false && menu.visible !== false;
    // EPOS requires explicit approval, never automatically expose imported items.
    visibility.epos = item.showOnEpos === true;
    // Existing Sunday selection is separate from the main-menu flag.
    visibility.sunday = menu.id === "sunday" ? item.visible !== false : item.includeOnSunday === true;
    return {
      id, name: String(item.name || ""), description: String(item.description || ""),
      category: String(section.name || ""), menuId: String(menu.id || ""),
      pricePence: parsePrice(item.price), priceDisplay: String(item.price || ""),
      allergens: item.allergens || "", visibility,
      servingSizes: [], tastingNotes: "", available: true
    };
  })));
}

module.exports = { CHANNELS, parsePrice, catalogueFromMenus };
