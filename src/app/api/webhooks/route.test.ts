import { POST } from "./route";
import { claimEvent, releaseEvent } from "@/lib/idempotency";

vi.mock("@/lib/idempotency");

describe("payment webhook", () => {
  it("acknowledges a duplicate without dispatching twice", async () => {
    vi.mocked(claimEvent).mockResolvedValue(false);
    const response = await POST(makeWebhookRequest("evt_123"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      duplicate: true,
    });
    expect(dispatchPaymentEvent).not.toHaveBeenCalled();
  });

  it("releases the claim when processing fails", async () => {
    vi.mocked(claimEvent).mockResolvedValue(true);
    dispatchPaymentEvent.mockRejectedValue(new Error("database offline"));
    await expect(POST(makeWebhookRequest("evt_456"))).rejects.toThrow();
    expect(releaseEvent).toHaveBeenCalledWith("evt_456");
  });
});
