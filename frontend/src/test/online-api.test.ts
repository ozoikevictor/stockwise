import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineRequest, OnlineError } from "../lib/online-api";

afterEach(()=>vi.unstubAllGlobals());
describe("Online API boundary",()=>{
  it("uses the same-origin proxy and sends the selected session token",async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>[]});
    vi.stubGlobal("fetch",fetch);
    await onlineRequest("/products","cashier-token");
    const [url,options]=fetch.mock.calls[0]!;
    expect(url).toBe("/online-api/products");
    expect(options.headers.Authorization).toBe("Bearer cashier-token");
    expect(options.signal).toBeDefined();
  });
  it("preserves the idempotency key when a caller retries an uncertain sale",async()=>{
    const fetch=vi.fn().mockRejectedValueOnce(new TypeError("Network error")).mockResolvedValueOnce({ok:true,status:200,json:async()=>({id:"sale-1"})});
    vi.stubGlobal("fetch",fetch);
    const sale={idempotencyKey:"same-key",lines:[{productId:"one",quantity:1}],payment:"Cash"};
    await expect(onlineRequest("/sales","token","POST",sale)).rejects.toThrow("Network error");
    await onlineRequest("/sales","token","POST",sale);
    expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body);
  });
  it("keeps authorization failures distinguishable from uncertain network failures",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:"Session expired"})}));
    const error=await onlineRequest("/me","old-token").catch(e=>e);
    expect(error).toBeInstanceOf(OnlineError);
    if (!(error instanceof OnlineError)) throw new Error("Expected OnlineError");
    expect(error.status).toBe(401);
  });
});

