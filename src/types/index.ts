export interface Patient {
  id: number;
  first_name: string;
  last_name: string;
  dob: string;
  email: string;
  phone: string;
  gender: "male" | "female";
}

export interface Insurance {
  id: number;
  payer: string;
  plan: string;
  eligible: boolean;
  coPay?: number;
  reason?: string;
}

export interface Appointment {
  id: number;
  status: "available" | "booked";
  start: string;
  slot_duration: number;
  patient_id: number | null;
}

export interface EncounterSummary {
  visit_summary: string;
  diagnostic_assessment: string;
  treatment_care_plan: string;
  follow_up_duration: string; // e.g., "2 weeks", "1 month", "3 days"
  follow_up_reason: string;
  patient_instructions: string;
  follow_up_questions: string[]; // Suggested questions for follow-up visits
  patient_id: number;
  appointment_id?: number | null;
  generated_at: string;
  // Calculated field (not from API)
  follow_up_date?: string; // Calculated from current date + follow_up_duration
}

