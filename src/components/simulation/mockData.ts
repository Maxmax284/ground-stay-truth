/**
 * War Room Simulation — Mock Data Factory
 * Generates entirely client-side fake data for the simulation sandbox.
 */

import type { Database } from "@/integrations/supabase/types";

type BookingState = Database["public"]["Enums"]["booking_state"];

export interface MockUnit {
  id: string;
  name: string;
  capacity: number;
  base_price: number;
  weekend_price: number | null;
  cleaning_fee: number | null;
  min_nights: number;
  is_active: boolean;
  amenities: string[];
  description: string;
  photos: string[];
  reviews_enabled: boolean;
}

export interface MockBooking {
  id: string;
  unit_id: string;
  guest_id: string | null;
  guest_name: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  state: BookingState;
  total_price: number | null;
  notes: string | null;
  created_at: string;
  pre_arrival_status: string;
}

export interface MockMaintenanceRequest {
  id: string;
  booking_id: string;
  unit_id: string;
  category: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
}

export interface MockLaundryRequest {
  id: string;
  booking_id: string;
  unit_id: string;
  bag_count: number;
  status: string;
  note: string | null;
  created_at: string;
}

export interface MockMessage {
  id: string;
  booking_id: string;
  sender_id: string | null;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface MockTrainingPackage {
  id: string;
  name: string;
  description: string;
  duration_days: number;
  price: number;
  is_active: boolean;
}

export interface MockTrainingLink {
  id: string;
  booking_id: string;
  package_id: string;
  trainer_name: string | null;
  start_date: string | null;
}

export interface SimulationData {
  units: MockUnit[];
  bookings: MockBooking[];
  maintenanceRequests: MockMaintenanceRequest[];
  laundryRequests: MockLaundryRequest[];
  messages: MockMessage[];
  trainingPackages: MockTrainingPackage[];
  trainingLinks: MockTrainingLink[];
}

function daysFromNow(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

export function generateMockData(): SimulationData {
  const units: MockUnit[] = [
    {
      id: "sim-unit-1",
      name: "Ringside Suite",
      capacity: 2,
      base_price: 1800,
      weekend_price: 2200,
      cleaning_fee: 500,
      min_nights: 2,
      is_active: true,
      amenities: ["AC", "Wi-Fi", "Mini Fridge", "Ring View"],
      description: "Premium suite overlooking the training ring",
      photos: [],
      reviews_enabled: true,
    },
    {
      id: "sim-unit-2",
      name: "Fighter Bunk A",
      capacity: 4,
      base_price: 800,
      weekend_price: 1000,
      cleaning_fee: 300,
      min_nights: 3,
      is_active: true,
      amenities: ["AC", "Wi-Fi", "Shared Bath"],
      description: "Shared bunk room for fighters in training",
      photos: [],
      reviews_enabled: true,
    },
    {
      id: "sim-unit-3",
      name: "Garden Cottage",
      capacity: 3,
      base_price: 1500,
      weekend_price: 1800,
      cleaning_fee: 400,
      min_nights: 2,
      is_active: true,
      amenities: ["AC", "Wi-Fi", "Private Bath", "Garden"],
      description: "Quiet cottage surrounded by tropical gardens",
      photos: [],
      reviews_enabled: true,
    },
    {
      id: "sim-unit-4",
      name: "Trainer's Loft",
      capacity: 2,
      base_price: 2500,
      weekend_price: 3000,
      cleaning_fee: 600,
      min_nights: 1,
      is_active: true,
      amenities: ["AC", "Wi-Fi", "Kitchen", "Balcony", "Private Bath"],
      description: "Elevated loft with panoramic views of the camp",
      photos: [],
      reviews_enabled: false,
    },
  ];

  const bookings: MockBooking[] = [
    { id: "sim-bk-01", unit_id: "sim-unit-1", guest_id: "sim-guest-1", guest_name: "Alex Turner", check_in: daysFromNow(0), check_out: daysFromNow(5), num_guests: 2, state: "checked_in", total_price: 9500, notes: "VIP — returning fighter", created_at: daysFromNow(-3), pre_arrival_status: "complete" },
    { id: "sim-bk-02", unit_id: "sim-unit-2", guest_id: "sim-guest-2", guest_name: "Somchai P.", check_in: daysFromNow(1), check_out: daysFromNow(8), num_guests: 1, state: "confirmed", total_price: 5900, notes: null, created_at: daysFromNow(-5), pre_arrival_status: "complete" },
    { id: "sim-bk-03", unit_id: "sim-unit-3", guest_id: "sim-guest-3", guest_name: "Maria Santos", check_in: daysFromNow(3), check_out: daysFromNow(10), num_guests: 2, state: "pending_deposit", total_price: 10900, notes: "Needs airport pickup", created_at: daysFromNow(-1), pre_arrival_status: "pending" },
    { id: "sim-bk-04", unit_id: "sim-unit-4", guest_id: "sim-guest-4", guest_name: "Yuki Tanaka", check_in: daysFromNow(7), check_out: daysFromNow(14), num_guests: 1, state: "pending_approval", total_price: 18100, notes: "Long stay — trainer referral", created_at: daysFromNow(0), pre_arrival_status: "pending" },
    { id: "sim-bk-05", unit_id: "sim-unit-1", guest_id: "sim-guest-5", guest_name: "Jake Miller", check_in: daysFromNow(-7), check_out: daysFromNow(-2), num_guests: 1, state: "completed", total_price: 9500, notes: null, created_at: daysFromNow(-14), pre_arrival_status: "complete" },
    { id: "sim-bk-06", unit_id: "sim-unit-2", guest_id: "sim-guest-6", guest_name: "Lena Kova", check_in: daysFromNow(2), check_out: daysFromNow(5), num_guests: 3, state: "soft_hold", total_price: 2700, notes: "Group booking inquiry", created_at: daysFromNow(0), pre_arrival_status: "pending" },
    { id: "sim-bk-07", unit_id: "sim-unit-3", guest_id: null, guest_name: "Walk-in Guest", check_in: daysFromNow(0), check_out: daysFromNow(2), num_guests: 1, state: "inquiry", total_price: null, notes: "Phone inquiry", created_at: daysFromNow(0), pre_arrival_status: "pending" },
    { id: "sim-bk-08", unit_id: "sim-unit-4", guest_id: "sim-guest-7", guest_name: "Chris Wong", check_in: daysFromNow(-10), check_out: daysFromNow(-5), num_guests: 2, state: "completed", total_price: 15600, notes: null, created_at: daysFromNow(-20), pre_arrival_status: "complete" },
    { id: "sim-bk-09", unit_id: "sim-unit-1", guest_id: "sim-guest-8", guest_name: "Priya Sharma", check_in: daysFromNow(10), check_out: daysFromNow(15), num_guests: 2, state: "confirmed", total_price: 9500, notes: "Spectator — wants fight tickets", created_at: daysFromNow(-2), pre_arrival_status: "complete" },
    { id: "sim-bk-10", unit_id: "sim-unit-2", guest_id: "sim-guest-9", guest_name: "Tom Brady", check_in: daysFromNow(-3), check_out: daysFromNow(-1), num_guests: 1, state: "no_show", total_price: 2400, notes: "Did not arrive", created_at: daysFromNow(-10), pre_arrival_status: "pending" },
    { id: "sim-bk-11", unit_id: "sim-unit-3", guest_id: "sim-guest-10", guest_name: "Emma Stone", check_in: daysFromNow(5), check_out: daysFromNow(9), num_guests: 2, state: "cancelled", total_price: 6400, notes: "Cancelled due to schedule change", created_at: daysFromNow(-4), pre_arrival_status: "pending" },
    { id: "sim-bk-12", unit_id: "sim-unit-4", guest_id: "sim-guest-1", guest_name: "Alex Turner", check_in: daysFromNow(20), check_out: daysFromNow(27), num_guests: 1, state: "inquiry", total_price: null, notes: "Return visit — wants same unit", created_at: daysFromNow(0), pre_arrival_status: "pending" },
  ];

  const maintenanceRequests: MockMaintenanceRequest[] = [
    { id: "sim-mx-1", booking_id: "sim-bk-01", unit_id: "sim-unit-1", category: "plumbing", description: "Shower drain is clogged", priority: "high", status: "open", created_at: daysFromNow(0) },
    { id: "sim-mx-2", booking_id: "sim-bk-01", unit_id: "sim-unit-1", category: "electrical", description: "Bedside lamp flickers", priority: "low", status: "in_progress", created_at: daysFromNow(-1) },
    { id: "sim-mx-3", booking_id: "sim-bk-05", unit_id: "sim-unit-1", category: "cleanliness", description: "Deep clean after long stay", priority: "medium", status: "resolved", created_at: daysFromNow(-3) },
  ];

  const laundryRequests: MockLaundryRequest[] = [
    { id: "sim-lr-1", booking_id: "sim-bk-01", unit_id: "sim-unit-1", bag_count: 2, status: "received", note: "Separate whites", created_at: daysFromNow(0) },
    { id: "sim-lr-2", booking_id: "sim-bk-02", unit_id: "sim-unit-2", bag_count: 1, status: "ready_for_pickup", note: null, created_at: daysFromNow(-1) },
  ];

  const messages: MockMessage[] = [
    { id: "sim-msg-1", booking_id: "sim-bk-01", sender_id: "sim-guest-1", content: "Hi, what time can I use the ring tomorrow?", is_internal: false, created_at: daysFromNow(0) },
    { id: "sim-msg-2", booking_id: "sim-bk-01", sender_id: "sim-staff-1", content: "Morning session is 6–9 AM, afternoon is 3–6 PM. You're welcome anytime!", is_internal: false, created_at: daysFromNow(0) },
    { id: "sim-msg-3", booking_id: "sim-bk-01", sender_id: "sim-staff-1", content: "VIP guest — make sure ring-side towels are stocked", is_internal: true, created_at: daysFromNow(0) },
    { id: "sim-msg-4", booking_id: "sim-bk-03", sender_id: "sim-guest-3", content: "Can someone arrange a taxi from the airport?", is_internal: false, created_at: daysFromNow(-1) },
    { id: "sim-msg-5", booking_id: "sim-bk-04", sender_id: "sim-guest-4", content: "My trainer recommended this camp. Looking forward to it!", is_internal: false, created_at: daysFromNow(0) },
  ];

  const trainingPackages: MockTrainingPackage[] = [
    { id: "sim-tp-1", name: "Beginner Muay Thai", description: "Fundamentals: stance, basic strikes, clinch intro", duration_days: 7, price: 5000, is_active: true },
    { id: "sim-tp-2", name: "Advanced Fighter Camp", description: "Intensive sparring, conditioning, fight prep", duration_days: 14, price: 12000, is_active: true },
    { id: "sim-tp-3", name: "Private Sessions", description: "1-on-1 with senior Kru, custom program", duration_days: 5, price: 8000, is_active: true },
  ];

  const trainingLinks: MockTrainingLink[] = [
    { id: "sim-tl-1", booking_id: "sim-bk-01", package_id: "sim-tp-2", trainer_name: "Kru Nong", start_date: daysFromNow(0) },
    { id: "sim-tl-2", booking_id: "sim-bk-02", package_id: "sim-tp-1", trainer_name: "Kru Dam", start_date: daysFromNow(1) },
    { id: "sim-tl-3", booking_id: "sim-bk-04", package_id: "sim-tp-3", trainer_name: null, start_date: daysFromNow(7) },
  ];

  return { units, bookings, maintenanceRequests, laundryRequests, messages, trainingPackages, trainingLinks };
}
