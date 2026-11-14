import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {PasswordInput} from './PasswordInput';
import {Field} from './Field';
import {AuthProgress} from './AuthProgress';
import {onlineRequest} from '@/lib/online-api';
export function StaffPasswordReset({token}:{token:string}){
  const [people,setPeople]=useState<{id:string;name:string;role:string}[]>([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');const guard=useRef(false);
  useEffect(()=>{let active=true;void onlineRequest<typeof people>('/auth/accounts',token).then(v=>{if(active)setPeople(v.filter(p=>p.role==='cashier'));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[token]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(guard.current)return;const form=e.currentTarget;const f=new FormData(form);
    if(f.get('password')!==f.get('confirm')){setError('Passwords do not match.');return;}
    guard.current=true;setBusy(true);setError('');setMessage('');
    try{await onlineRequest('/staff/'+String(f.get('userId'))+'/password',token,'POST',{ownerPassword:String(f.get('ownerPassword')),password:String(f.get('password'))});form.reset();setMessage('Password updated. The cashier must sign in again.');}catch(e){setError((e as Error).message);}finally{guard.current=false;setBusy(false);}
  }
  return <form onSubmit={submit} className="max-w-2xl space-y-4 rounded-2xl border bg-card p-6 shadow-card"><h2 className="font-semibold">Reset cashier password</h2><fieldset disabled={busy} className="space-y-4"><Field label="Cashier" htmlFor="reset-cashier"><select id="reset-cashier" name="userId" className="h-11 w-full rounded-md border bg-background px-3" required><option value="">Choose cashier</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Your owner password" htmlFor="reset-owner-password"><PasswordInput id="reset-owner-password" name="ownerPassword" autoComplete="current-password" required/></Field><Field label="New cashier password" htmlFor="reset-staff-password"><PasswordInput id="reset-staff-password" name="password" minLength={8} maxLength={128} autoComplete="new-password" required/></Field><Field label="Confirm new password" htmlFor="reset-staff-confirm"><PasswordInput id="reset-staff-confirm" name="confirm" minLength={8} maxLength={128} autoComplete="new-password" required/></Field>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}<Button disabled={busy||!people.length}>{busy?<AuthProgress label="Updating password…"/>:'Reset password'}</Button></fieldset></form>;
}
