const crypto=require("crypto");

class EnquiryError extends Error{
  constructor(message,category="validation",status=400){super(message);this.name="EnquiryError";this.category=category;this.status=status}
}

const limits=new Map();
const FIFTEEN_MINUTES=15*60*1000,DAY=24*60*60*1000;
let lastSweep=0;

function clientIp(req){
  // Azure App Service supplies X-Forwarded-For after its trusted front end. Do not
  // trust a caller-provided forwarding header when running directly elsewhere.
  const behindTrustedProxy=Boolean(process.env.WEBSITE_INSTANCE_ID)||process.env.TRUST_PROXY==="true";
  if(behindTrustedProxy){
    const first=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();
    if(first&&/^[0-9a-f:.]+$/i.test(first))return first.slice(0,64);
  }
  return String(req.socket?.remoteAddress||"unknown").slice(0,64);
}

function rateLimit(ip,now=Date.now()){
  if(now-lastSweep>FIFTEEN_MINUTES){
    for(const [key,times] of limits){const fresh=times.filter(t=>now-t<DAY);if(fresh.length)limits.set(key,fresh);else limits.delete(key)}
    lastSweep=now;
  }
  const times=(limits.get(ip)||[]).filter(t=>now-t<DAY);
  if(times.filter(t=>now-t<FIFTEEN_MINUTES).length>=5||times.length>=15)throw new EnquiryError("Too many enquiries have been submitted. Please try again later.","rate_limit",429);
  times.push(now);limits.set(ip,times);
}

function timingToken(secret,now=Date.now()){
  const value=`${now}.${crypto.randomBytes(12).toString("base64url")}`;
  const signature=crypto.createHmac("sha256",secret).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function verifyTiming(token,secret,now=Date.now()){
  const parts=String(token||"").split(".");
  if(parts.length!==3)throw new EnquiryError("Please refresh the page and try again.","timing");
  const value=`${parts[0]}.${parts[1]}`,expected=crypto.createHmac("sha256",secret).update(value).digest("base64url");
  const supplied=Buffer.from(parts[2]),wanted=Buffer.from(expected);
  if(supplied.length!==wanted.length||!crypto.timingSafeEqual(supplied,wanted))throw new EnquiryError("Please refresh the page and try again.","timing");
  const issued=Number(parts[0]),age=now-issued;
  if(!Number.isFinite(issued)||age<2000)throw new EnquiryError("Please wait a moment, then submit the form again.","timing");
  // Long enough for a genuine user to return to an open tab later the same day.
  if(age>24*60*60*1000)throw new EnquiryError("Please refresh the page and try again.","timing");
}

function readForm(req,max=64*1024){
  return new Promise((resolve,reject)=>{
    const type=String(req.headers["content-type"]||"").split(";",1)[0].trim().toLowerCase();
    if(type!=="application/x-www-form-urlencoded")return reject(new EnquiryError("This enquiry could not be processed. Please refresh and try again.","content_type",415));
    let body="",done=false;
    const fail=e=>{if(!done){done=true;reject(e)}};
    req.on("data",chunk=>{if(done)return;body+=chunk;if(Buffer.byteLength(body,"utf8")>max){fail(new EnquiryError("This enquiry is too large.","body_size",413));req.destroy()}});
    req.on("end",()=>{if(done)return;done=true;try{resolve(Object.fromEntries(new URLSearchParams(body)))}catch{reject(new EnquiryError("This enquiry could not be processed.","malformed"))}});
    req.on("error",()=>fail(new EnquiryError("This enquiry could not be processed.","malformed")));
  });
}

function text(value,max,label,required=false){
  const clean=String(value??"").trim().replace(/\r\n?/g,"\n");
  if(required&&!clean)throw new EnquiryError(`Please enter ${label}.`);
  if(clean.length>max)throw new EnquiryError(`${label[0].toUpperCase()+label.slice(1)} is too long.`);
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean))throw new EnquiryError(`Please check ${label}.`);
  return clean;
}

function name(value){
  const clean=text(value,100,"your name",true).replace(/\s+/g," ");
  if(clean.length<2||!/\p{L}/u.test(clean)||!/^[\p{L}\p{M} .'-]+$/u.test(clean)||/(.)\1{4,}/iu.test(clean))throw new EnquiryError("Please enter a valid name.");
  return clean;
}
function email(value){
  const clean=text(value,160,"a valid email address",true).toLowerCase();
  if(!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(clean)||clean.includes(".."))throw new EnquiryError("Please enter a valid email address.");
  return clean;
}
function phone(value,required=true){
  const clean=text(value,40,"a valid telephone number",required);
  if(!clean)return "";
  if(!/^\+?[\d\s().-]+$/.test(clean)||/\+/.test(clean.slice(1)))throw new EnquiryError("Please enter a valid telephone number.");
  const digits=clean.replace(/\D/g,"");
  if(digits.length<7||digits.length>15)throw new EnquiryError("Please enter a valid telephone number.");
  return clean.replace(/\s+/g," ");
}
function integer(value,min,max,label){
  if(!/^-?\d+$/.test(String(value??"").trim()))throw new EnquiryError(`Please enter a valid ${label}.`);
  const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw new EnquiryError(`Please enter a ${label} between ${min} and ${max}.`);return n;
}
function futureDate(value){
  const clean=String(value??"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(clean))throw new EnquiryError("Please choose a valid preferred date.");
  const [y,m,d]=clean.split("-").map(Number),date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new EnquiryError("Please choose a valid preferred date.");
  const now=new Date(),today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  if(date.getTime()<today)throw new EnquiryError("Please choose a future date.");
  return clean;
}
function oneOf(value,allowed,label){const clean=text(value,100,label,true);if(!allowed.includes(clean))throw new EnquiryError(`Please choose a valid ${label}.`);return clean}

function spamCheck(values){
  const content=Object.values(values).filter(v=>typeof v==="string").join(" ").toLowerCase();
  const urls=content.match(/(?:https?:\/\/|www\.)\S+/g)||[];
  let score=0;
  if(urls.length>2)score+=3;
  if(urls.length>1&&new Set(urls.map(x=>x.replace(/^https?:\/\//,"" ).split("/")[0])).size<urls.length)score+=2;
  if(/\b(?:crypto(?:currency)?|bitcoin|forex|investment returns?|casino|online gambling)\b/.test(content))score+=2;
  if(/\b(?:seo services?|backlinks?|domain authority|web design services?|rank (?:your|on) google)\b/.test(content))score+=3;
  if(/(.)\1{8,}/iu.test(content)||/(?:\b\w{1,2}\b\s*){18,}/u.test(content))score+=2;
  const plain=content.replace(/(?:https?:\/\/|www\.)\S+/g,"").trim();if(urls.length&&plain.length<urls.join("").length)score+=2;
  if(score>=3)throw new EnquiryError("We could not accept this enquiry. Please contact us by phone if you need assistance.","spam");
}

const enquiryTypes=["General enquiry","Restaurant","Accommodation","Events / Entertainment","Afternoon Tea","Christmas","Private Event","Other"];
const eventTypes=["Birthday","Anniversary","Wedding / Reception","Celebration of Life","Corporate Event","Christmas Party","Private Dining","Other"];
const packages=["Classic Afternoon Tea - £27.50","G&T Afternoon Tea - £33.50","Prosecco Afternoon Tea - £33.50","Champagne Afternoon Tea - £39.50"];
function validate(type,q){
  const common={name:name(q.name),email:email(q.email),phone:phone(q.phone)};
  let result;
  if(type==="contact")result={...common,enquiryType:oneOf(q.enquiryType,enquiryTypes,"enquiry type"),contactMethod:oneOf(q.contactMethod,["Email","Phone"],"preferred contact method"),message:text(q.message,4000,"a message",true)};
  else if(type==="christmas")result={...common,preferredDate:futureDate(q.preferredDate),partySize:integer(q.partySize,2,250,"party size"),message:text(q.message,4000,"additional information")};
  else if(type==="afternoon-tea"){
    const partySize=integer(q.partySize,2,40,"party size"),canapes=q.canapes==="yes";
    if(canapes&&partySize<8)throw new EnquiryError("The Premium Canapé Selection is available for parties of 8 or more.");
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(q.preferredTime||"")))throw new EnquiryError("Please choose a valid preferred time.");
    result={...common,preferredDate:futureDate(q.preferredDate),preferredTime:String(q.preferredTime),partySize,packageName:oneOf(q.packageName,packages,"Afternoon Tea package"),canapes,dietary:text(q.dietary,2000,"dietary requirements"),message:text(q.message,4000,"additional information")};
  }else if(type==="private-events")result={...common,preferredDate:futureDate(q.preferredDate),eventType:oneOf(q.eventType,eventTypes,"event type"),guestCount:integer(q.guestCount,1,500,"number of guests"),cateringNotes:text(q.cateringNotes,2000,"catering notes"),entertainmentRequirements:text(q.entertainmentRequirements,2000,"entertainment requirements"),dietaryRequirements:text(q.dietaryRequirements,2000,"dietary requirements"),additionalInformation:text(q.additionalInformation,4000,"additional information")};
  else throw new EnquiryError("Unknown enquiry form.","configuration",500);
  spamCheck(result);return result;
}

function log(form,outcome,category){console.log(JSON.stringify({event:"public_enquiry",form,timestamp:new Date().toISOString(),outcome,category}))}
async function processEnquiry(req,type,secret,send){
  const ip=clientIp(req);rateLimit(ip);
  let q;
  try{
    q=await readForm(req);
    if(String(q.contact_reference||"").trim())throw new EnquiryError("We could not accept this enquiry. Please contact us by phone if you need assistance.","honeypot");
    verifyTiming(q.form_token,secret);
    const clean=validate(type,q);
    await send(clean);
    log(type,"graph_success","sent");
    return clean;
  }catch(error){
    if(q&&error&&typeof error==="object"){
      error.formValues=Object.fromEntries(Object.entries(q)
        .filter(([key,value])=>!["form_token","contact_reference"].includes(key)&&typeof value==="string")
        .map(([key,value])=>[key,value.slice(0,4000)]));
    }
    throw error;
  }
}

module.exports={EnquiryError,clientIp,rateLimit,timingToken,verifyTiming,readForm,validate,spamCheck,processEnquiry,log,_limits:limits};
