"use strict";

function formatSpecialsTitle(value) {
  const small = new Set(["a", "an", "and", "as", "at", "by", "de", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  let index = 0;
  return String(value || "").trim().replace(/\s+/g, " ").replace(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu, word => {
    const first = index++ === 0;
    if (/^[A-Z0-9]{2,}$/.test(word)) return word;
    const lower = word.toLocaleLowerCase("en-GB");
    return !first && small.has(lower) ? lower : lower.charAt(0).toLocaleUpperCase("en-GB") + lower.slice(1);
  });
}

module.exports = formatSpecialsTitle;
