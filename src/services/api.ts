import type { Patient, Insurance, Appointment, EncounterSummary } from '../types';
import { API_BASE } from '../config';

// Patients API
export const getPatients = async (): Promise<Patient[]> => {
  const res = await fetch(`${API_BASE}/patients`);
  if (!res.ok) {
    throw new Error(`Failed to fetch patients: ${res.statusText}`);
  }
  return res.json();
};

export const getPatient = async (id: number): Promise<Patient | null> => {
  try {
    const res = await fetch(`${API_BASE}/patients/${id}`);
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch patient: ${res.statusText}`);
    }
    return res.json();
  } catch (error) {
    console.error('Error fetching patient:', error);
    return null;
  }
};

// Insurances API
export const getInsurances = async (): Promise<Insurance[]> => {
  const res = await fetch(`${API_BASE}/insurances`);
  if (!res.ok) {
    throw new Error(`Failed to fetch insurances: ${res.statusText}`);
  }
  return res.json();
};

export const getInsurance = async (id: number): Promise<Insurance | null> => {
  try {
    const res = await fetch(`${API_BASE}/insurances/${id}`);
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch insurance: ${res.statusText}`);
    }
    return res.json();
  } catch (error) {
    console.error('Error fetching insurance:', error);
    return null;
  }
};

// Appointments API
export const getAppointments = async (): Promise<Appointment[]> => {
  const res = await fetch(`${API_BASE}/appointments`);
  if (!res.ok) {
    throw new Error(`Failed to fetch appointments: ${res.statusText}`);
  }
  return res.json();
};

export const getAppointment = async (id: number): Promise<Appointment | null> => {
  try {
    const res = await fetch(`${API_BASE}/appointments/${id}`);
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch appointment: ${res.statusText}`);
    }
    return res.json();
  } catch (error) {
    console.error('Error fetching appointment:', error);
    return null;
  }
};

export const getCurrentAppointment = async (patientId: number): Promise<Appointment | null> => {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/current-appointment`);
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch current appointment: ${res.statusText}`);
    }
    return res.json();
  } catch (error) {
    console.error('Error fetching current appointment:', error);
    return null;
  }
};

export const getActiveAppointment = async (): Promise<Appointment | null> => {
  try {
    const res = await fetch(`${API_BASE}/appointments/active`);
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch active appointment: ${res.statusText}`);
    }
    const data = await res.json();
    // Handle empty object response (backend returns {} when no active appointment)
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return null;
    }
    return data;
  } catch (error) {
    console.error('Error fetching active appointment:', error);
    return null;
  }
};

// Encounter Summary API
export const generateEncounterSummary = async (
  transcription: any,
  patientId: number,
  appointmentId?: number | null
): Promise<EncounterSummary> => {
  const res = await fetch(`${API_BASE}/encounter-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transcription,
      patient_id: patientId,
      appointment_id: appointmentId,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to generate encounter summary: ${res.statusText}`);
  }
  return res.json();
};

// Email API
export const sendEmail = async (toEmail: string, subject: string, body: string): Promise<any> => {
  const res = await fetch(`${API_BASE}/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to_email: toEmail,
      subject,
      body,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send email: ${res.statusText}`);
  }
  return res.json();
};

