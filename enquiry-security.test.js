const test=require("node:test");
const assert=require("node:assert/strict");
const {Readable}=require("node:stream");
const {validate,spamCheck,timingToken,verifyTiming,rateLimit,processEnquiry,_limits}=require("./enquiry-security");

const tomorrow=()=>{const d=new Date(Date.now()+86400000);return d.toISOString().slice(0,10)};
const common={name:"Anne-Marie O'Neill",email:"Customer@Example.com",phone:"+44 7700 900123"};

test("accepts valid UK, +44 and international telephone formats",()=>{
  for(const phone of ["01526 123456","07700 900123","+44 7700 900123","+1 (212) 555-0198"]){
    const q=validate("contact",{...common,phone,enquiryType:"General enquiry",contactMethod:"Email",message:"Please call me about a booking."});
    assert.equal(q.phone,phone);assert.equal(q.email,"customer@example.com");
  }
});

test("validates every public enquiry type",()=>{
  assert.equal(validate("christmas",{...common,preferredDate:tomorrow(),partySize:"8",message:"Office dinner"}).partySize,8);
  assert.equal(validate("afternoon-tea",{...common,preferredDate:tomorrow(),preferredTime:"14:30",partySize:"8",packageName:"Classic Afternoon Tea - £27.50",canapes:"yes",dietary:"None",message:"Birthday"}).canapes,true);
  assert.equal(validate("private-events",{...common,preferredDate:tomorrow(),eventType:"Birthday",guestCount:"60",cateringNotes:"Buffet",entertainmentRequirements:"DJ",dietaryRequirements:"One vegan",additionalInformation:"Evening event"}).guestCount,60);
});

test("rejects invalid names, email, phone and impossible or past dates",()=>{
  const contact={...common,enquiryType:"General enquiry",contactMethod:"Email",message:"Hello"};
  for(const name of ["","x","aaaaaa","<script>"])assert.throws(()=>validate("contact",{...contact,name}));
  assert.throws(()=>validate("contact",{...contact,email:"bad@address"}),/valid email/);
  assert.throws(()=>validate("contact",{...contact,phone:"123"}),/telephone/);
  assert.throws(()=>validate("christmas",{...common,preferredDate:"2026-02-30",partySize:"8",message:""}),/date/);
  assert.throws(()=>validate("christmas",{...common,preferredDate:"2020-01-01",partySize:"8",message:""}),/future date/);
});

test("enforces party ranges, canapé minimum and text limits",()=>{
  assert.throws(()=>validate("christmas",{...common,preferredDate:tomorrow(),partySize:"251",message:""}),/between 2 and 250/);
  assert.throws(()=>validate("afternoon-tea",{...common,preferredDate:tomorrow(),preferredTime:"14:30",partySize:"7",packageName:"Classic Afternoon Tea - £27.50",canapes:"yes"}),/8 or more/);
  assert.throws(()=>validate("contact",{...common,enquiryType:"General enquiry",contactMethod:"Email",message:"x".repeat(4001)}),/too long/);
});

test("rejects obvious multi-link marketing spam but allows one customer link",()=>{
  assert.doesNotThrow(()=>spamCheck({message:"Our event details are at https://example.com/event"}));
  assert.throws(()=>spamCheck({message:"SEO backlinks web design services https://spam.test/a https://spam.test/b https://spam.test/c"}));
});

test("signed timing token cannot be forged or submitted too quickly",()=>{
  const secret="test-secret",issued=Date.now(),token=timingToken(secret,issued);
  assert.throws(()=>verifyTiming(token,secret,issued+1000),/wait a moment/);
  assert.doesNotThrow(()=>verifyTiming(token,secret,issued+2500));
  assert.throws(()=>verifyTiming(token+"x",secret,issued+2500));
});

test("rate limiter returns 429 after five submissions in fifteen minutes",()=>{
  _limits.clear();const now=Date.now();
  for(let i=0;i<5;i++)rateLimit("test-ip",now+i);
  assert.throws(()=>rateLimit("test-ip",now+10),e=>e.status===429);
});

test("Graph send is awaited and a send failure cannot become success",async()=>{
  _limits.clear();const secret="test-secret",token=timingToken(secret,Date.now()-3000);
  const body=new URLSearchParams({...common,enquiryType:"General enquiry",contactMethod:"Email",message:"Please contact me.",form_token:token}).toString();
  const request=Readable.from([body]);request.headers={"content-type":"application/x-www-form-urlencoded"};request.socket={remoteAddress:"127.0.0.2"};
  await assert.rejects(()=>processEnquiry(request,"contact",secret,async()=>{throw new Error("Graph rejected sendMail")}),/Graph rejected/);
});

test("validation failures retain safe form values but never security fields",async()=>{
  _limits.clear();const secret="test-secret",token=timingToken(secret,Date.now()-3000);
  const submitted={...common,email:"mistake@example",enquiryType:"Restaurant",contactMethod:"Phone",message:"A genuine detailed enquiry",form_token:token,contact_reference:""};
  const request=Readable.from([new URLSearchParams(submitted).toString()]);request.headers={"content-type":"application/x-www-form-urlencoded"};request.socket={remoteAddress:"127.0.0.3"};
  await assert.rejects(()=>processEnquiry(request,"contact",secret,async()=>{}),error=>{
    assert.equal(error.formValues.name,submitted.name);
    assert.equal(error.formValues.email,submitted.email);
    assert.equal(error.formValues.message,submitted.message);
    assert.equal(error.formValues.form_token,undefined);
    assert.equal(error.formValues.contact_reference,undefined);
    return true;
  });
});
