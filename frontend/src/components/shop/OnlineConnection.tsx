import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Field} from './Field';
import {onlineRequest} from '@/lib/online-api';
export function OnlineConnection(){
  const bridge=typeof window!=='undefined'?window.stockwiseDesktop:undefined;
  const [url,setUrl]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{if(bridge)void bridge.onlineConfig().then(setUrl).catch(e=>setMessage(e.message));},[bridge]);
  if(!bridge)return null;
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Online server settings</summary><div className="mt-4 space-y-3"><Field label="Server address"><Input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-shop.onrender.com" disabled={busy}/></Field><p className="text-xs text-muted-foreground">Use the same server address on each shop computer. Local testing: http://127.0.0.1:3003</p><Button type="button" disabled={busy||!url} variant="outline" onClick={async()=>{setBusy(true);setMessage('');try{setUrl(await bridge.onlineConfig(url.trim()));const health=await onlineRequest<{ok:boolean;service:string}>('/health',null);if(!health.ok||health.service!=='stockwise-online')throw Error('This address is not a StockWise server.');setMessage('Saved. StockWise server connected.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>{busy?'Checking…':'Save and test connection'}</Button><p role="status" className="text-sm">{message}</p></div></details>;
}
