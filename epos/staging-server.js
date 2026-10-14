"use strict";
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const root=__dirname,files={"/":"index.html","/kitchen":"kitchen.html","/catalogue":"catalogue.html","/catalogue-data.json":"catalogue-data.json"};
http.createServer((req,res)=>{
 const route=(req.url||"/").split("?")[0];
 if(req.method!=="GET"||!Object.hasOwn(files,route)){res.writeHead(404,{"Content-Type":"text/plain","Cache-Control":"no-store"});return res.end("Not found")}
 const file=path.join(root,files[route]);
 fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(500);return res.end("Unavailable")}res.writeHead(200,{"Content-Type":route.endsWith(".json")?"application/json; charset=utf-8":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(bytes)})
}).listen(process.env.PORT||8080,"0.0.0.0");
