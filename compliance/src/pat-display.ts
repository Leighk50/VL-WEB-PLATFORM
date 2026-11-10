function parseDate(value:string){
  const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(value||"");
  return match ? new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))) : null;
}

export function formatPatDate(value:string|null|undefined){
  const date=value?parseDate(value):null;
  return date ? new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(date) : "not recorded";
}

export function formatPatDueDate(value:string|null|undefined){
  const date=value?parseDate(value):null;
  return date ? new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}).format(date) : "not set";
}
