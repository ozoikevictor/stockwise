import {useRef,useState,type FormEvent} from 'react';
import {AuthLayout} from './AuthLayout';
import {AuthProgress} from './AuthProgress';
import {Field} from './Field';
import {PasswordInput} from './PasswordInput';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {onlineRequest} from '@/lib/online-api';

export function takeResetToken(){
  if(typeof window==='undefined')return '';
  const match=window.location.hash.match(/^#reset=([a-f0-9]{64})$/);
  if(!match)return '';
  window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
  return match[1]!;
}
export function PasswordRecovery({token,onBack,onDone}:{token:string;onBack:()=>void;onDone:()=>void}){
  const guard=useRef(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(guard.current)return;const form=e.currentTarget;const data=new FormData(form);
    if(token&&data.get('password')!==data.get('confirm')){setError('Passwords do not match.');return;}
    guard.current=true;setBusy(true);setError('');setMessage('');
    try{
      if(token){await onlineRequest('/auth/reset-password',null,'POST',{token,password:String(data.get('password'))});form.reset();setMessage('Password updated. You can now sign in.');}
      else {const result=await onlineRequest<{message:string}>('/auth/forgot-password',null,'POST',{email:String(data.get('email'))});setMessage(result.message);}
    }catch(e){setError((e as Error).message);}finally{guard.current=false;setBusy(false);}
  }
  return <AuthLayout title={token?'Reset your password':'Forgot password?'} subtitle={token?'Choose a new password.':'Enter your account email.'}>
    {token&&message?<div className="space-y-4"><p role="status">{message}</p><Button className="w-full" onClick={onDone}>Back to sign in</Button></div>:<form onSubmit={submit} aria-busy={busy} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      {token?<><Field label="New password" htmlFor="recovery-password"><PasswordInput id="recovery-password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required/></Field><Field label="Confirm password" htmlFor="recovery-confirm"><PasswordInput id="recovery-confirm" name="confirm" autoComplete="new-password" minLength={8} maxLength={128} required/></Field></>:<Field label="Email" htmlFor="recovery-email"><Input id="recovery-email" name="email" type="email" autoComplete="email" required/></Field>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
      <Button disabled={busy} className="w-full">{busy?<AuthProgress label={token?'Updating password…':'Sending link…'}/>:token?'Update password':'Send recovery link'}</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>Back to sign in</Button>
    </fieldset></form>}
  </AuthLayout>;
}
