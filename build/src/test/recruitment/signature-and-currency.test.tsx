import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
}));
vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: { hasPermission: () => boolean }) => unknown) => selector({ hasPermission: () => true }),
}));
vi.mock("@/components/notifications/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const service = vi.hoisted(() => ({
  verifyOfferSignature: vi.fn(),
  getCurrencySettings: vi.fn(),
  saveCurrencySettings: vi.fn(),
}));

vi.mock("@/services/recruitment-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/recruitment-service")>()),
  ...service,
}));

import { SignatureVerifier } from "@/modules/recruitment/offer-components";
import { CurrencyRatesForm } from "@/modules/recruitment/job-extras";

vi.setConfig({ testTimeout: 20000 });

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => Object.values(service).forEach((mock) => mock.mockReset()));

describe("signature verification", () => {
  it("confirms an untouched signed offer", async () => {
    service.verifyOfferSignature.mockResolvedValue({ signed: true, valid: true, seal_valid: true, terms_unchanged: true, letter_intact: true, problems: [] });
    renderWithClient(<SignatureVerifier offerId={7} />);

    await userEvent.click(screen.getByRole("button", { name: "Verify signature" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Verified: the terms, the signature record and the stored letter are exactly as they were/);
    expect(service.verifyOfferSignature).toHaveBeenCalledWith(7);
  });

  it("spells out what was tampered with", async () => {
    service.verifyOfferSignature.mockResolvedValue({
      signed: true,
      valid: false,
      seal_valid: true,
      terms_unchanged: false,
      letter_intact: false,
      problems: ["The offer terms differ from what was signed.", "The stored signed letter is missing or was changed."],
    });
    renderWithClient(<SignatureVerifier offerId={7} />);

    await userEvent.click(screen.getByRole("button", { name: "Verify signature" }));

    const message = await screen.findByRole("status");
    expect(message).toHaveTextContent(/Not verified/);
    expect(message).toHaveTextContent(/terms differ from what was signed/);
    expect(message).toHaveTextContent(/stored signed letter is missing/);
  });
});

describe("currency rates form", () => {
  it("shows the base currency and saves edited rates", async () => {
    service.getCurrencySettings.mockResolvedValue({ base_currency: "PKR", rates: [{ currency: "USD", rate: 280 }] });
    service.saveCurrencySettings.mockResolvedValue({ base_currency: "PKR", rates: [] });
    renderWithClient(<CurrencyRatesForm canManage />);

    expect(await screen.findByLabelText("Base currency")).toHaveValue("PKR");
    expect(screen.getByLabelText("Currency 1")).toHaveValue("USD");

    await userEvent.click(screen.getByRole("button", { name: "Add a currency" }));
    await userEvent.type(screen.getByLabelText("Currency 2"), "eur");
    await userEvent.type(screen.getByLabelText("Rate 2"), "305.5");
    await userEvent.click(screen.getByRole("button", { name: "Save currency settings" }));

    await waitFor(() =>
      expect(service.saveCurrencySettings).toHaveBeenCalledWith({
        base_currency: "PKR",
        rates: [
          { currency: "USD", rate: 280 },
          { currency: "EUR", rate: 305.5 },
        ],
      }),
    );
  });

  it("refuses a rate that is not above zero", async () => {
    service.getCurrencySettings.mockResolvedValue({ base_currency: "PKR", rates: [] });
    renderWithClient(<CurrencyRatesForm canManage />);

    await userEvent.click(await screen.findByRole("button", { name: "Add a currency" }));
    await userEvent.type(screen.getByLabelText("Currency 1"), "USD");
    await userEvent.type(screen.getByLabelText("Rate 1"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save currency settings" }));

    expect(await screen.findByText("Each rate needs a currency code and a rate above zero.")).toBeInTheDocument();
    expect(service.saveCurrencySettings).not.toHaveBeenCalled();
  });

  it("is read-only for people who cannot manage settings", async () => {
    service.getCurrencySettings.mockResolvedValue({ base_currency: "PKR", rates: [{ currency: "USD", rate: 280 }] });
    renderWithClient(<CurrencyRatesForm canManage={false} />);

    expect(await screen.findByLabelText("Base currency")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save currency settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a currency" })).not.toBeInTheDocument();
  });
});
