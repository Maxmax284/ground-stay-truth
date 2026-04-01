import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GuestPickupCard } from "../GuestPickupCard";

// Mock hooks
const mockPickup: any = {
  id: "pickup-1",
  booking_id: "booking-1",
  status: "requested",
  fee: 500,
  fee_override: false,
  flight_number: null,
  international_flight_number: null,
  final_flight_confirmed: false,
  confirmed_airport: null,
  guest_landed_at: null,
  arrival_datetime: null,
  passenger_count: 1,
  drivers: null,
  luggage_notes: null,
  special_instructions: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

vi.mock("@/hooks/useAirportPickups", () => ({
  useAirportPickup: vi.fn(() => ({ data: mockPickup, isLoading: false })),
}));

vi.mock("@/hooks/usePolicySettings", () => ({
  usePolicySettings: vi.fn(() => ({ data: null })),
}));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GuestPickupCard bookingId="booking-1" guestName="Test Guest" />
    </QueryClientProvider>
  );
}

describe("GuestPickupCard — Travel State Guidance", () => {
  beforeEach(() => {
    // Reset to base state
    Object.assign(mockPickup, {
      status: "requested",
      flight_number: null,
      international_flight_number: null,
      final_flight_confirmed: false,
      confirmed_airport: null,
      guest_landed_at: null,
      arrival_datetime: null,
      passenger_count: 1,
      drivers: null,
    });
  });

  it("pre_departure: shows guidance to provide flight details", () => {
    renderCard();
    expect(screen.getByText(/provide your flight details/i)).toBeInTheDocument();
    expect(screen.getByText(/connecting flight to Koh Samui/i)).toBeInTheDocument();
  });

  it("missing_final_flight: warns about Bangkok landing, asks for domestic", () => {
    mockPickup.international_flight_number = "TG925";
    renderCard();
    expect(screen.getByText(/arrives in Bangkok, not Koh Samui/i)).toBeInTheDocument();
    expect(screen.getByText(/connecting domestic flight/i)).toBeInTheDocument();
    expect(screen.getByText(/TG925/)).toBeInTheDocument();
  });

  it("awaiting_departure (direct): confirms pickup for final flight", () => {
    mockPickup.flight_number = "PG157";
    renderCard();
    expect(screen.getByText(/pickup is confirmed for flight PG157/i)).toBeInTheDocument();
  });

  it("awaiting_departure (connecting): shows route context", () => {
    mockPickup.international_flight_number = "TG925";
    mockPickup.flight_number = "PG157";
    renderCard();
    expect(screen.getByText(/final flight PG157 to Koh Samui/i)).toBeInTheDocument();
    // Route display should show connecting badge
    expect(screen.getByText("Connecting")).toBeInTheDocument();
  });

  it("in_transit_bkk (with domestic): shows transit guidance", () => {
    mockPickup.international_flight_number = "TG925";
    mockPickup.flight_number = "PG157";
    mockPickup.confirmed_airport = "BKK";
    mockPickup.guest_landed_at = new Date().toISOString();
    renderCard();
    expect(screen.getByText(/landed in Bangkok/i)).toBeInTheDocument();
    expect(screen.getByText(/connecting flight PG157/i)).toBeInTheDocument();
    expect(screen.getByText(/driver will meet you at Samui/i)).toBeInTheDocument();
  });

  it("in_transit_bkk (without domestic): prompts for connecting flight", () => {
    mockPickup.international_flight_number = "TG925";
    mockPickup.confirmed_airport = "BKK";
    mockPickup.guest_landed_at = new Date().toISOString();
    renderCard();
    expect(screen.getByText(/landed in Bangkok/i)).toBeInTheDocument();
    expect(screen.getByText(/provide your connecting flight/i)).toBeInTheDocument();
  });

  it("arriving: shows arrival confirmation", () => {
    mockPickup.flight_number = "PG157";
    mockPickup.confirmed_airport = "USM";
    mockPickup.guest_landed_at = new Date().toISOString();
    renderCard();
    expect(screen.getByText(/driver is on the way/i)).toBeInTheDocument();
  });

  it("completed: shows completed badge, no guidance message", () => {
    mockPickup.status = "completed";
    renderCard();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    // Guidance is suppressed for arrived/completed state
    expect(screen.queryByText(/driver is on the way/i)).not.toBeInTheDocument();
  });

  it("cancelled: does not render (card hidden)", () => {
    mockPickup.status = "cancelled";
    const { container } = renderCard();
    expect(container.innerHTML).toBe("");
  });
});
