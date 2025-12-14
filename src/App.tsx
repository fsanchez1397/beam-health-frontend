import { useState, useRef, useEffect } from 'react'
import type { Patient, Appointment, EncounterSummary } from './types'
import { getPatient, getCurrentAppointment, getActiveAppointment, generateEncounterSummary, sendEmail } from './services/api'
import { API_BASE_URL } from './config'
import './App.css'

function App() {
  const [isRecording, setIsRecording] = useState(false);
  //replace any with the type of the transcript
  const [transcript, setTranscript] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientId, setPatientId] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [currentAppointment, setCurrentAppointment] = useState<Appointment | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [encounterSummary, setEncounterSummary] = useState<EncounterSummary | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState<EncounterSummary | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);
  const activeAppointmentCheckRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef<number>(Date.now());
  const silenceCheckRef = useRef<number | null>(null);
  const isStoppingRef = useRef<boolean>(false);
  const processFinalChunksRef = useRef<(() => void) | null>(null);

  // Check for active appointment based on current time and fetch patient data
  useEffect(() => {
    let isMounted = true;
    
    const checkActiveAppointmentAndFetchPatient = async () => {
      try {
        // Fetch active appointment from backend
        const active = await getActiveAppointment();
        
        if (!isMounted) return;
        
        setActiveAppointment(active);
        
        // If there's an active appointment with a patient, fetch and display that patient
        if (active && active.patient_id) {
          const activePatientId = active.patient_id;
          
          // Only fetch if it's a different patient to avoid unnecessary API calls
          if (activePatientId !== patientId) {
            setLoading(true);
            try {
              // Fetch patient data directly from backend
              const patientData = await getPatient(activePatientId);
              
              if (!isMounted) return;
              
              if (patientData) {
                setPatient(patientData);
                setPatientId(activePatientId);
                setCurrentAppointment(active);
                setError(null);
              }
            } catch (err) {
              if (!isMounted) return;
              console.error('Error fetching patient for active appointment:', err);
              setError(err instanceof Error ? err.message : "Failed to fetch patient");
            } finally {
              if (isMounted) {
                setLoading(false);
              }
            }
          } else {
            // Same patient, just update the current appointment
            setCurrentAppointment(active);
          }
        } else {
          // No active appointment found - clear patient data
          if (isMounted) {
            setPatient(null);
            setPatientId(1); // Reset to default
            setCurrentAppointment(null);
            setError(null);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error checking active appointment:', err);
        }
      }
    };

    // Check immediately on mount
    checkActiveAppointmentAndFetchPatient();
    setCurrentTime(new Date());

    // Check every 30 seconds for active appointment (more frequent for better responsiveness)
    activeAppointmentCheckRef.current = window.setInterval(() => {
      checkActiveAppointmentAndFetchPatient();
    }, 30000);

    // Update current time every second for display
    const timeInterval = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (activeAppointmentCheckRef.current) {
        clearInterval(activeAppointmentCheckRef.current);
      }
      clearInterval(timeInterval);
    };
  }, []); // Only run once on mount

  // Fetch patient data when patientId changes (fallback for manual changes)
  useEffect(() => {
    // Skip if patient is already loaded and matches patientId
    if (patient && patient.id === patientId) {
      return;
    }
    
    const fetchPatientData = async () => {
      setLoading(true);
      try {
        const data = await getPatient(patientId);
        setPatient(data);
        if (!data) {
          setError(`Patient with ID ${patientId} not found`);
          setCurrentAppointment(null);
        } else {
          setError(null);
          // Fetch current appointment for this patient
          const appointment = await getCurrentAppointment(patientId);
          setCurrentAppointment(appointment);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch patient");
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [patientId, patient]);



  // Silence detection function
  const setupSilenceDetection = (stream: MediaStream) => {
    try {
      // Create audio context for analyzing audio levels
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3; // Lower for more responsive detection
      microphone.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const SILENCE_THRESHOLD = 15; // Adjust this value based on testing (0-255)
      const SILENCE_DURATION = 5000; 
      
      const checkSilence = () => {
        if (!analyserRef.current || !mediaRecorderRef.current) {
          return;
        }
        
        // Check if still recording
        if (mediaRecorderRef.current.state !== 'recording') {
          return;
        }
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        
        if (average > SILENCE_THRESHOLD) {
          // Sound detected - reset silence timer
          lastSoundTimeRef.current = Date.now();
        } else {
          // Silence detected - check silence duration
          const silenceDuration = Date.now() - lastSoundTimeRef.current;
          
          if (silenceDuration >= SILENCE_DURATION) {
            console.log('🔇 silence detected - stopping recording');
            if (silenceCheckRef.current) {
              cancelAnimationFrame(silenceCheckRef.current);
              silenceCheckRef.current = null;
            }
            stopRecording();
            return;
          }
        }
        
        // Continue checking
        silenceCheckRef.current = requestAnimationFrame(checkSilence);
      };
      
      // Start checking for silence
      silenceCheckRef.current = requestAnimationFrame(checkSilence);
    } catch (err) {
      console.error('Error setting up silence detection:', err);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported in this browser");
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      
      // Clear chunks at start of new recording
      chunksRef.current = [];
      isStoppingRef.current = false;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log(`📦 Data chunk received: ${event.data.size} bytes, total chunks: ${chunksRef.current.length}`);
        }
      };
      
      // Function to process and upload accumulated chunks
      const processFinalChunks = () => {
        console.log('🛑 Processing accumulated chunks...');
        if (chunksRef.current.length > 0) {
          const totalSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
          console.log(`✅ Found ${chunksRef.current.length} chunks (${totalSize} bytes total), uploading...`);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          chunksRef.current = []; // Clear after creating blob
          setIsTranscribing(true); // Immediately signal transcription started
          uploadChunk(blob);
        } else {
          console.log('⚠️ No chunks accumulated - nothing to upload');
        }
      };
      
      // Store the function reference so stopRecording can call it
      processFinalChunksRef.current = processFinalChunks;
      
      // Handle when recording stops - send all accumulated chunks
      mediaRecorder.onstop = () => {
        console.log('🛑 Recording stopped, processing accumulated chunks...');
        // Small delay to ensure any final ondataavailable events have fired
        setTimeout(() => {
          processFinalChunks();
          isStoppingRef.current = false;
        }, 150);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Start recording with a timeslice to get periodic chunks, but we'll accumulate them all
      // Using a timeslice ensures data is available periodically and chunks accumulate properly
      mediaRecorder.start(1000); // 1 second timeslice for reliable chunk accumulation
      setIsRecording(true);
      lastSoundTimeRef.current = Date.now(); // Initialize silence detection timer
      
      // Setup silence detection
      setupSilenceDetection(stream);
    } catch (err) {
      setIsRecording(false);
      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setError("Microphone permission denied. Please allow microphone access and try again.");
        } else if (err.name === "NotFoundError") {
          setError("No microphone found. Please connect a microphone and try again.");
        } else {
          setError(`Error accessing microphone: ${err.message}`);
        }
      } else {
        setError("An unknown error occurred while accessing the microphone.");
      }
    }
  };

  const generateSummaryFromTranscription = async (transcription: any) => {
    if (!patientId) return;
    
    setGeneratingSummary(true);
    try {
      const summary = await generateEncounterSummary(
        transcription,
        patientId,
        currentAppointment?.id || null
      );
      
      // Calculate follow-up date from duration
      if (summary.follow_up_duration) {
        const calculatedDate = calculateFollowUpDate(summary.follow_up_duration);
        summary.follow_up_date = calculatedDate.toISOString();
        console.log(`📅 Calculated follow-up date: ${calculatedDate.toLocaleDateString()} (from ${summary.follow_up_duration})`);
      }
      
      // Ensure follow_up_questions is an array
      if (!summary.follow_up_questions || !Array.isArray(summary.follow_up_questions)) {
        summary.follow_up_questions = [];
      }
      
      setEncounterSummary(summary);
      setEditedSummary({ ...summary }); // Initialize edited summary
      setIsEditingSummary(false);
      console.log("✅ Encounter summary generated:", summary);
    } catch (err) {
      console.error("❌ Error generating summary:", err);
      setError(err instanceof Error ? err.message : "Failed to generate encounter summary");
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Helper function to parse duration string and add to current date
  const calculateFollowUpDate = (duration: string): Date => {
    const now = new Date();
    const lowerDuration = duration.toLowerCase().trim();
    
    // Parse duration strings like "2 weeks", "1 month", "3 days", etc.
    const match = lowerDuration.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)/);
    
    if (!match) {
      // If can't parse, default to 2 weeks
      console.warn(`Could not parse duration "${duration}", defaulting to 2 weeks`);
      const result = new Date(now);
      result.setDate(result.getDate() + 14);
      return result;
    }
    
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const result = new Date(now);
    
    switch (unit) {
      case 'day':
      case 'days':
        result.setDate(result.getDate() + amount);
        break;
      case 'week':
      case 'weeks':
        result.setDate(result.getDate() + (amount * 7));
        break;
      case 'month':
      case 'months':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'year':
      case 'years':
        result.setFullYear(result.getFullYear() + amount);
        break;
      default:
        result.setDate(result.getDate() + 14); // Default to 2 weeks
    }
    
    return result;
  };

  // Helper function to format date safely
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) {
      return "Not specified";
    }
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString || "Not specified";
      }
      return date.toLocaleDateString();
    } catch {
      return dateString || "Not specified";
    }
  };

  // Get follow-up date from summary, calculating if needed
  const getFollowUpDate = (summary: EncounterSummary): string => {
    if (summary.follow_up_date) {
      return summary.follow_up_date;
    }
    // Calculate from duration if date not set
    if (summary.follow_up_duration) {
      const calculatedDate = calculateFollowUpDate(summary.follow_up_duration);
      return calculatedDate.toISOString();
    }
    return "";
  };

  const handleSendEmail = async () => {
    // Use edited summary if available, otherwise use original
    const summaryToSend = editedSummary || encounterSummary;
    if (!summaryToSend || !patient) return;
    
    setSendingEmail(true);
    try {
      const emailBody = `
Patient Instructions:
${summaryToSend.patient_instructions}

Follow-up Date: ${formatDate(getFollowUpDate(summaryToSend))}
Follow-up Reason: ${summaryToSend.follow_up_reason}

---
Visit Summary:
${summaryToSend.visit_summary}

Diagnostic Assessment:
${summaryToSend.diagnostic_assessment}

Treatment & Care Plan:
${summaryToSend.treatment_care_plan}
      `.trim();

      await sendEmail(
        patient.email,
        `Visit Summary - ${new Date().toLocaleDateString()}`,
        emailBody
      );
      
      alert("Email sent successfully!");
    } catch (err) {
      console.error("❌ Error sending email:", err);
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    // Stop speech synthesis if speaking
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // Stop silence detection animation frame
    if (silenceCheckRef.current) {
      cancelAnimationFrame(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }
    
    // Clear silence detection timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    
    // Clear interval (no longer needed since we're not sending chunks during recording)
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Stop MediaRecorder - this will trigger onstop handler which sends accumulated chunks
    if (mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current;
      if (recorder.state === 'recording') {
        isStoppingRef.current = true;
        // Request any remaining data before stopping
        recorder.requestData();
        // Small delay to ensure requestData() fires ondataavailable, then stop
        setTimeout(() => {
          recorder.stop();
        }, 100);
      } else {
        recorder.stop();
      }
      // Don't set to null yet - let onstop handler finish first
    }
    
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear mediaRecorderRef after a short delay to allow onstop to complete
    setTimeout(() => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current = null;
      }
    }, 100);
  };

  const uploadChunk = async (blob: Blob) => {
    try {
      console.log("📤 Uploading audio chunk:", {
        size: blob.size,
        type: blob.type,
      });
      
      const formData = new FormData();
      formData.append("file", blob, "chunk.webm");

      console.log(`🔄 Sending POST request to ${API_BASE_URL}/transcribe`);
      
      // Add patient_id and appointment_id as query parameters
      const url = new URL(`${API_BASE_URL}/transcribe`);
      if (patientId) {
        url.searchParams.append("patient_id", patientId.toString());
      }
      if (currentAppointment?.id) {
        url.searchParams.append("appointment_id", currentAppointment.id.toString());
      }
      
      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
      });

      console.log("📥 Response received:", {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: "Unknown error" }));
        console.error("❌ Server error:", errorData);
        throw new Error(errorData.detail || `HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log("✅ Transcription received:", data);
      
      // Map transcription to current patient
      const transcriptionWithPatient = {
        ...data,
        patient_id: patientId,
        appointment_id: currentAppointment?.id || null,
      };
      
      setTranscript((prev) => [...prev, transcriptionWithPatient]);
      setIsTranscribing(false); // Transcription complete
      
      // Auto-generate encounter summary if we have a patient
      if (patientId && data) {
        generateSummaryFromTranscription(data);
      }
    } catch (err) {
      console.error("❌ Upload error:", err);
      setError(err instanceof Error ? `Upload failed: ${err.message}` : "Failed to upload audio chunk");
      setIsTranscribing(false); // Transcription failed, clear status
    }
  };

  // Hardcoded clinic and doctor information
  const clinicName = "Beam Health Medical Center";
  const doctorName = "Dr. Sarah Martinez, MD";
  const doctorSpecialty = "Internal Medicine";

  return (
    <div className="dashboard-container">
      {/* Dashboard Header */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <div>
            <h1 className="clinic-name">{clinicName}</h1>
            <div className="doctor-info">
              {doctorName} • {doctorSpecialty}
            </div>
          </div>
        </div>
        <div className="dashboard-header-right">
          <div className="current-time-display">
            <div style={{ fontSize: "1.1rem", fontWeight: "600" }}>
              {currentTime.toLocaleTimeString()}
            </div>
            <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="dashboard-content">

   
      {/* Patient Information - Only show if there's an active appointment */}
      {activeAppointment && activeAppointment.patient_id ? (
        <>
          {/* Active Appointment Alert */}
          <div style={{ 
            marginBottom: 20, 
            padding: 15, 
            borderRadius: 8, 
            border: "2px solid #4caf50",
            background: "#e8f5e9"
          }}>
            <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: 5 }}>
              ✅ ACTIVE APPOINTMENT
            </div>
            <div>
              Appointment Time: {new Date(activeAppointment.start).toLocaleString()} | 
              Duration: {activeAppointment.slot_duration} minutes
            </div>
          </div>

          {/* Patient Information */}
          {loading ? (
            <div className="patient-info-section" style={{ textAlign: "center" }}>
              <div className="loading-spinner" style={{ margin: "0 auto 1rem" }}></div>
              <div>Loading patient data...</div>
            </div>
          ) : patient ? (
            <div className="patient-info-section">
              <h3>Patient Information</h3>
              <div className="patient-info-grid">
                <div className="patient-info-item">
                  <div className="patient-info-label">Full Name</div>
                  <div className="patient-info-value">{patient.first_name} {patient.last_name}</div>
                </div>
                <div className="patient-info-item">
                  <div className="patient-info-label">Date of Birth</div>
                  <div className="patient-info-value">{new Date(patient.dob).toLocaleDateString()}</div>
                </div>
                <div className="patient-info-item">
                  <div className="patient-info-label">Email</div>
                  <div className="patient-info-value">{patient.email}</div>
                </div>
                <div className="patient-info-item">
                  <div className="patient-info-label">Phone</div>
                  <div className="patient-info-value">{patient.phone}</div>
                </div>
                <div className="patient-info-item">
                  <div className="patient-info-label">Gender</div>
                  <div className="patient-info-value" style={{ textTransform: "capitalize" }}>{patient.gender}</div>
                </div>
                <div className="patient-info-item">
                  <div className="patient-info-label">Patient ID</div>
                  <div className="patient-info-value">#{patient.id}</div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        /* No Active Appointment Message */
        <div style={{ 
          marginBottom: 30, 
          padding: 40, 
          borderRadius: 8, 
          textAlign: "center",
          background: "#f5f5f5"
        }}>
          <div style={{ fontSize: "24px", marginBottom: 10 }}>
            ☕
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "#666" }}>
            No patients - enjoy your break!
          </div>
          <div style={{ fontSize: "14px", color: "#999", marginTop: 10 }}>
            Check back when there's an active appointment scheduled.
          </div>
        </div>
      )}

 
 

      {/* Recording Controls - Only show if there's an active appointment */}
      {activeAppointment && activeAppointment.patient_id && (
        <div style={{ marginBottom: 30 }}>
          {isRecording ? (
            <button onClick={stopRecording} style={{ background: "red", color: "#fff", padding: "10px 20px", borderRadius: 4, border: "none", cursor: "pointer" }}>
              Stop Recording
            </button>
          ) : (
            <button onClick={startRecording} style={{ background: "green", color: "#fff", padding: "10px 20px", borderRadius: 4, border: "none", cursor: "pointer" }}>
              Begin Appointment
            </button>
          )}
        </div>
      )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Encounter Summary - Always Visible */}
        <div className="encounter-summary-section">
          <div className="dashboard-card-header">
            <h2 className="dashboard-card-title">Encounter Summary</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              {isTranscribing && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#005faa" }}>
                  <div className="loading-spinner"></div>
                  Transcribing audio...
                </div>
              )}
              {generatingSummary && !isTranscribing && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#005faa" }}>
                  <div className="loading-spinner"></div>
                  Generating...
                </div>
              )}
              {encounterSummary && editedSummary && !isEditingSummary && (
                <button
                  onClick={() => setIsEditingSummary(true)}
                  style={{
                    background: "#005faa",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "0.875rem"
                  }}
                >
                  ✏️ Edit
                </button>
              )}
              {encounterSummary && editedSummary && isEditingSummary && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => {
                      setEncounterSummary({ ...editedSummary });
                      setIsEditingSummary(false);
                    }}
                    style={{
                      background: "#00a3ad",
                      color: "white",
                      border: "none",
                      padding: "0.5rem 1rem",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: "0.875rem"
                    }}
                  >
                    ✓ Save
                  </button>
                  <button
                    onClick={() => {
                      const resetSummary = { 
                        ...encounterSummary,
                        follow_up_questions: encounterSummary.follow_up_questions || []
                      };
                      setEditedSummary(resetSummary);
                      setIsEditingSummary(false);
                    }}
                    style={{
                      background: "#6b7280",
                      color: "white",
                      border: "none",
                      padding: "0.5rem 1rem",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: "600",
                      fontSize: "0.875rem"
                    }}
                  >
                    ✕ Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {!encounterSummary ? (
            <div style={{ textAlign: "center", padding: "3rem 2rem", color: "#333333" }}>
              <div style={{ fontSize: "2rem", marginBottom: "1rem", opacity: 0.5 }}>📋</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
                Encounter Summary Will Appear Here
              </div>
              <div style={{ fontSize: "0.9rem", opacity: 0.7 }}>
                The AI-generated summary will populate this section after recording is completed.
              </div>
            </div>
          ) : (
            <>
              <div className="encounter-summary-field">
                <h4>Visit Summary</h4>
                {isEditingSummary && editedSummary ? (
                  <textarea
                    value={editedSummary.visit_summary}
                    onChange={(e) => setEditedSummary({ ...editedSummary, visit_summary: e.target.value })}
                    className="encounter-summary-content"
                    style={{
                      width: "100%",
                      minHeight: "100px",
                      resize: "vertical",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      border: "2px solid #00a3ad",
                      padding: "1rem"
                    }}
                  />
                ) : (
                  <div className="encounter-summary-content">{encounterSummary.visit_summary}</div>
                )}
              </div>
              
              <div className="encounter-summary-field">
                <h4>Diagnostic Assessment</h4>
                {isEditingSummary && editedSummary ? (
                  <textarea
                    value={editedSummary.diagnostic_assessment}
                    onChange={(e) => setEditedSummary({ ...editedSummary, diagnostic_assessment: e.target.value })}
                    className="encounter-summary-content"
                    style={{
                      width: "100%",
                      minHeight: "100px",
                      resize: "vertical",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      border: "2px solid #00a3ad",
                      padding: "1rem"
                    }}
                  />
                ) : (
                  <div className="encounter-summary-content">{encounterSummary.diagnostic_assessment}</div>
                )}
              </div>
              
              <div className="encounter-summary-field">
                <h4>Treatment & Care Plan</h4>
                {isEditingSummary && editedSummary ? (
                  <textarea
                    value={editedSummary.treatment_care_plan}
                    onChange={(e) => setEditedSummary({ ...editedSummary, treatment_care_plan: e.target.value })}
                    className="encounter-summary-content"
                    style={{
                      width: "100%",
                      minHeight: "100px",
                      resize: "vertical",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      border: "2px solid #00a3ad",
                      padding: "1rem"
                    }}
                  />
                ) : (
                  <div className="encounter-summary-content">{encounterSummary.treatment_care_plan}</div>
                )}
              </div>
              
              <div className="encounter-summary-field">
                <h4>Follow-Up</h4>
                {isEditingSummary && editedSummary ? (
                  <div className="encounter-summary-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
                        Date:
                      </label>
                      <input
                        type="date"
                        value={editedSummary.follow_up_date ? new Date(editedSummary.follow_up_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            const date = new Date(e.target.value);
                            setEditedSummary({ ...editedSummary, follow_up_date: date.toISOString() });
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "6px",
                          border: "2px solid #00a3ad",
                          fontFamily: "inherit",
                          fontSize: "inherit"
                        }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
                        Reason:
                      </label>
                      <textarea
                        value={editedSummary.follow_up_reason}
                        onChange={(e) => setEditedSummary({ ...editedSummary, follow_up_reason: e.target.value })}
                        style={{
                          width: "100%",
                          minHeight: "60px",
                          resize: "vertical",
                          fontFamily: "inherit",
                          fontSize: "inherit",
                          border: "2px solid #00a3ad",
                          padding: "0.5rem",
                          borderRadius: "6px"
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="encounter-summary-content">
                    <div style={{ marginBottom: "0.5rem" }}>
                      <strong>Date:</strong> {formatDate(getFollowUpDate(encounterSummary))}
                    </div>
                    <div>
                      <strong>Reason:</strong> {encounterSummary.follow_up_reason}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="encounter-summary-field">
                <h4>Patient Instructions</h4>
                {isEditingSummary && editedSummary ? (
                  <textarea
                    value={editedSummary.patient_instructions}
                    onChange={(e) => setEditedSummary({ ...editedSummary, patient_instructions: e.target.value })}
                    className="encounter-summary-content"
                    style={{
                      width: "100%",
                      minHeight: "150px",
                      resize: "vertical",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      border: "2px solid #00a3ad",
                      padding: "1rem",
                      whiteSpace: "pre-wrap"
                    }}
                  />
                ) : (
                  <div className="encounter-summary-content" style={{ whiteSpace: "pre-wrap" }}>
                    {encounterSummary.patient_instructions}
                  </div>
                )}
              </div>
              
              <div className="encounter-summary-field">
                <h4>Follow-Up Questions</h4>
                {isEditingSummary && editedSummary ? (
                  <div className="encounter-summary-content" style={{ padding: "1rem" }}>
                    {(editedSummary.follow_up_questions || []).map((question, index) => (
                      <div key={index} style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                        <span style={{ color: "#005faa", fontWeight: "600", marginRight: "0.5rem" }}>{index + 1}.</span>
                        <textarea
                          value={question}
                          onChange={(e) => {
                            const updatedQuestions = [...(editedSummary.follow_up_questions || [])];
                            updatedQuestions[index] = e.target.value;
                            setEditedSummary({ ...editedSummary, follow_up_questions: updatedQuestions });
                          }}
                          style={{
                            flex: 1,
                            padding: "0.5rem",
                            borderRadius: "6px",
                            border: "2px solid #00a3ad",
                            fontFamily: "inherit",
                            fontSize: "inherit",
                            resize: "vertical",
                            minHeight: "40px"
                          }}
                        />
                        <button
                          onClick={() => {
                            const updatedQuestions = (editedSummary.follow_up_questions || []).filter((_, i) => i !== index);
                            setEditedSummary({ ...editedSummary, follow_up_questions: updatedQuestions });
                          }}
                          style={{
                            background: "#ef4444",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            padding: "0.25rem 0.5rem",
                            cursor: "pointer",
                            fontSize: "0.75rem"
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const updatedQuestions = [...(editedSummary.follow_up_questions || []), ""];
                        setEditedSummary({ ...editedSummary, follow_up_questions: updatedQuestions });
                      }}
                      style={{
                        background: "#00a3ad",
                        color: "white",
                        border: "none",
                        padding: "0.5rem 1rem",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "0.875rem",
                        marginTop: "0.5rem"
                      }}
                    >
                      + Add Question
                    </button>
                  </div>
                ) : (
                  <div className="encounter-summary-content">
                    {encounterSummary.follow_up_questions && encounterSummary.follow_up_questions.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: "1.5rem", listStyleType: "decimal" }}>
                        {encounterSummary.follow_up_questions.map((question, index) => (
                          <li key={index} style={{ marginBottom: "0.5rem", color: "#333333" }}>
                            {question}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "#333333", opacity: 0.7, fontStyle: "italic" }}>
                        No follow-up questions suggested.
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {patient && encounterSummary && (
                <button
                  onClick={handleSendEmail}
                  disabled={sendingEmail || isEditingSummary}
                  className="email-button"
                >
                  {sendingEmail ? (
                    <>
                      <span className="loading-spinner" style={{ display: "inline-block", marginRight: "0.5rem" }}></span>
                      Sending...
                    </>
                  ) : (
                    "📧 Send Summary to Patient"
                  )}
                </button>
              )}
            </>
          )}
        </div>

      
      </main>
    </div>
  );
}
export default App;