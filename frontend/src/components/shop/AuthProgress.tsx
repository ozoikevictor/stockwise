import { LoaderCircle } from 'lucide-react';
export function AuthProgress({label}:{label:string}){
  return <span role="status" className="inline-flex items-center justify-center gap-2"><LoaderCircle className="size-4 animate-spin" aria-hidden="true"/><span>{label}</span></span>;
}
export async function waitForAuthPaint(){
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
}
