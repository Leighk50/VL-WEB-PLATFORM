"use strict";

const crypto = require("crypto");

module.exports = content => `"${crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex")}"`;
