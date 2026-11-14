export type OnlineUser = {id:string;shopId:string;name:string;role:'owner'|'cashier'};
export type OnlineProduct = {id:string;name:string;sku:string;quantity:number;priceMinor:number;costMinor?:number};
export type OnlineSale = {id:string;cashierId:string;totalMinor:number;costMinor?:number;profitMinor?:number;createdAt:string;payment:string;items:{productId:string;productName:string;quantity:number;unitPriceMinor:number}[]};
export class OnlineError extends Error { constructor(message:string, public status:number){super(message);} }
export async function onlineRequest<T>(path:string, token:string|null, method='GET', body?:unknown):Promise<T> {
  const response=await fetch('/online-api'+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):null,signal:AbortSignal.timeout(15000)});
  const data=response.status===204?null:await response.json().catch(()=>({error:'Could not reach the online server. Keep the backend running.'}));
  if(!response.ok)throw new OnlineError(data?.error ?? 'Request failed',response.status);return data as T;
}

