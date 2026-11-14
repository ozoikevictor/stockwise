import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ register: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => mocks.navigate,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/store", () => ({ actions: { register: mocks.register }, isDesktop: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { Register } from "@/routes/register";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("desktop registration form", () => {
  it("shows progress, blocks duplicate submissions and restores the form after failure", async()=>{
    let fail!:(error:Error)=>void;
    mocks.register.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
    render(<Register/>);
    const values={"Full name":"Test Owner","Email":"owner@example.com","Phone number":"08012345678","Password":"TestPass123","Confirm password":"TestPass123"};
    for(const [label,value] of Object.entries(values))fireEvent.change(screen.getByLabelText(label),{target:{value}});
    const submit=screen.getByRole('button',{name:'Create account'});
    fireEvent.click(submit);
    expect(await screen.findByRole('button',{name:'Creating account…'})).toBeDisabled();
    await waitFor(()=>expect(mocks.register).toHaveBeenCalledTimes(1));
    fireEvent.submit(submit.closest('form')!);
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    fail(new Error('Could not save account'));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Create account'})).toBeEnabled());
    expect(screen.getByLabelText('Email')).toHaveValue('owner@example.com');
  });
  it("keeps invalid entries editable and shows validation without saving", () => {
    render(<Register />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(mocks.register).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your full name")).toBeVisible();
    const input = screen.getByLabelText("Full name");
    fireEvent.change(input, { target: { value: "Corrected Name" } });
    expect(input).toHaveValue("Corrected Name");
  });
  it("accepts typing in every field and submits the entered account", async () => {
    render(<Register />);
    const values = { "Full name": "Test Owner", "Email": "owner@example.com", "Phone number": "08012345678", "Password": "TestPass123", "Confirm password": "TestPass123" };
    for (const [label, value] of Object.entries(values)) {
      const input = screen.getByLabelText(label);
      expect(input).toBeEnabled();
      input.focus(); expect(input).toHaveFocus();
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
    }
    const button = screen.getByRole("button", { name: "Create account" });
    expect(button).toBeEnabled(); fireEvent.click(button);
    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ name: "Test Owner", email: "owner@example.com", password: "TestPass123" })));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/setup" });
    expect(screen.queryByText(/Offline desktop app:/)).not.toBeInTheDocument();
  });
});

