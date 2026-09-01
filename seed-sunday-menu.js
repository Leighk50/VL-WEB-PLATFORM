const fs = require("fs");
const path = require("path");

const SEED = "2026-09-01-sunday-menu-v2";
const DATA_DIR = process.env.CONTENT_DATA_DIR || (process.env.HOME ? path.join(process.env.HOME, "site", "data") : path.join(__dirname, "data"));
const CONTENT = path.join(DATA_DIR, "content.json");
const DEFAULT = path.join(__dirname, "data", "default-content.json");
const MENU = path.join(__dirname, "sunday-menu.json");

function seedSundayMenu() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT)) fs.copyFileSync(DEFAULT, CONTENT);

  const content = JSON.parse(fs.readFileSync(CONTENT, "utf8").replace(/^\uFEFF/, ""));
  if (content.sundayMenuSeed === SEED) return false;

  const sunday = JSON.parse(fs.readFileSync(MENU, "utf8").replace(/^\uFEFF/, ""));
  content.menus = Array.isArray(content.menus) ? content.menus : [];
  const index = content.menus.findIndex(menu => menu.id === "sunday");
  if (index >= 0) content.menus[index] = sunday;
  else content.menus.push(sunday);

  content.sundayMenuSeed = SEED;
  const temp = CONTENT + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(content, null, 2), "utf8");
  fs.renameSync(temp, CONTENT);
  console.log("Sunday lunch menu seeded.");
  return true;
}

seedSundayMenu();
module.exports = seedSundayMenu;
