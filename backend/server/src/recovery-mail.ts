export type RecoveryMail={to:string;url:string};
export type RecoveryOptions={origin:string;send:(mail:RecoveryMail)=>Promise<void>};
export function recoveryFromEnvironment():RecoveryOptions|undefined{
  const key=process.env.RESEND_API_KEY;const from=process.env.MAIL_FROM;
  const raw=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL;
  if(!key||!from||!raw)return undefined;
  const origin=new URL(raw);if(origin.protocol!=='https:')throw Error('Password recovery requires an HTTPS public origin.');
  return {origin:origin.origin,async send(mail){
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:[mail.to],subject:'Reset your StockWise password',text:'A password reset was requested for your StockWise account. Open this link within 15 minutes:\n\n'+mail.url+'\n\nThis link works once. If you did not request it, ignore this email.'}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Recovery email delivery failed.');
  }};
}
