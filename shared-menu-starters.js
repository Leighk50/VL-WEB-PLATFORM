"use strict";

const isStarters = section => /^starters?$/i.test(String(section.name || "").trim());

// Main is the authoritative starter list; retain Sunday's other courses.
function syncSundayStarters(content) {
  const main = (content.menus || []).find(menu => menu.id === "main");
  const sunday = (content.menus || []).find(menu => menu.id === "sunday");
  if (!main || !sunday) return content;
  const starters = (main.sections || []).find(isStarters);
  const sections = sunday.sections || [];
  const index = sections.findIndex(isStarters);
  const otherCourses = sections.filter(section => !isStarters(section));
  if (starters) otherCourses.splice(index < 0 ? 0 : Math.min(index, otherCourses.length), 0, structuredClone(starters));
  sunday.sections = otherCourses;
  return content;
}

module.exports = syncSundayStarters;
