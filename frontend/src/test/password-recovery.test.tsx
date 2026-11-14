import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/lib/online-api',()=>({onlineRequest:mocks.api}));
vi.mock('@/components/shop/AuthLayout',()=>({AuthLayout:({children}:{children:ReactNode})=><div>{children}</div>}));
import {PasswordRecovery,takeResetToken} from '@/components/shop/PasswordRecovery';
afterEach(()=>{cleanup();vi.resetAllMocks();window.history.replaceState(null,'','/');});
describe('password recovery',()=>{
  it('blocks duplicate requests while pending',async()=>{
    let resolve!:(value:unknown)=>void;mocks.api.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    render(<PasswordRecovery token="" onBack={()=>{}} onDone={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('Email'),{target:{value:'owner@example.com'}});
    const button=screen.getByRole('button',{name:'Send recovery link'});fireEvent.click(button);
    expect(await screen.findByRole('button',{name:'Sending link…'})).toBeDisabled();fireEvent.submit(button.closest('form')!);
    expect(mocks.api).toHaveBeenCalledTimes(1);resolve({message:'If an account exists, a link will be sent.'});
    expect(await screen.findByText('If an account exists, a link will be sent.')).toBeVisible();
  });
  it('rejects mismatched passwords and completes a valid reset',async()=>{
    const done=vi.fn();mocks.api.mockResolvedValue({});render(<PasswordRecovery token={'a'.repeat(64)} onBack={()=>{}} onDone={done}/>);
    fireEvent.change(screen.getByLabelText('New password'),{target:{value:'NewPassword123'}});fireEvent.change(screen.getByLabelText('Confirm password'),{target:{value:'Mismatch123'}});
    fireEvent.click(screen.getByRole('button',{name:'Update password'}));expect(mocks.api).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    fireEvent.change(screen.getByLabelText('Confirm password'),{target:{value:'NewPassword123'}});fireEvent.click(screen.getByRole('button',{name:'Update password'}));
    await waitFor(()=>expect(screen.getByText('Password updated. You can now sign in.')).toBeVisible());
    expect(mocks.api).toHaveBeenCalledWith('/auth/reset-password',null,'POST',{token:'a'.repeat(64),password:'NewPassword123'});fireEvent.click(screen.getByRole('button',{name:'Back to sign in'}));expect(done).toHaveBeenCalledTimes(1);
  });
  it('removes recovery secrets from browser history',()=>{
    window.history.replaceState(null,'','/online#reset='+'b'.repeat(64));expect(takeResetToken()).toBe('b'.repeat(64));expect(window.location.hash).toBe('');expect(takeResetToken()).toBe('');
  });
});
