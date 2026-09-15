import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Send, Scale, Loader2, PhoneCall, AlertCircle } from 'lucide-react';

/**
 * DevSecOps Structured Logging Interface & Utility
 * Outputs machine-parsable JSON logs to console for telemetry, performance, and security audits
 */
export interface DevSecOpsLogPayload {
  timestamp: string;
  eventType: 'API_ERROR' | 'WEBSOCKET_ERROR' | 'UNHANDLED_REJECTION' | 'NETWORK_LATENCY' | 'CONSULTATION_SUBMISSION';
  service: string;
  endpoint?: string;
  status?: number | string;
  errorMessage?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export interface DevSecOpsConsultationLog {
  timestamp: string;
  eventType: 'CONSULTATION_SUBMIT_ATTEMPT' | 'CONSULTATION_SUBMIT_SUCCESS' | 'CONSULTATION_SUBMIT_FAILURE' | 'CONSULTATION_SUBMIT_FALLBACK';
  service: string;
  endpoint: string;
  category: string;
  clientNameMasked?: string;
  contactMasked?: string;
  messageLength?: number;
  ticketId?: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'FALLBACK';
  latencyMs?: number;
  httpStatus?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export const logDevSecOpsError = (payload: Omit<DevSecOpsLogPayload, 'timestamp' | 'service'>) => {
  const structuredLog: DevSecOpsLogPayload = {
    timestamp: new Date().toISOString(),
    service: 'HTS-Frontend-Client',
    ...payload,
  };
  // Log strictly formatted JSON for DevSecOps log collectors (e.g., Datadog, CloudWatch, GCP Logging)
  console.error(`[DevSecOps Telemetry Audit] ${JSON.stringify(structuredLog)}`);
};

/**
 * DevSecOps Middleware Logger for Consultation Form Submissions
 * Logs structured JSON to console for audit trail, security monitoring, and incident analytics.
 */
export const logDevSecOpsConsultation = (payload: Omit<DevSecOpsConsultationLog, 'timestamp' | 'service'>) => {
  const structuredLog: DevSecOpsConsultationLog = {
    timestamp: new Date().toISOString(),
    service: 'HTS-Frontend-Client',
    ...payload,
  };
  console.log(`[DevSecOps Consultation Audit] ${JSON.stringify(structuredLog, null, 2)}`);
};

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
  hasWaHelp?: boolean;
}

interface QuickReply {
  id: string;
  icon: string;
  label: string;
  query: string;
}

const QUICK_REPLIES: QuickReply[] = [
  {
    id: 'pidana',
    icon: '⚖️',
    label: 'Perkara Pidana',
    query: 'Apa saja cakupan layanan pendampingan Perkara Pidana di Kantor Hukum HTS & Partners?'
  },
  {
    id: 'tanah-waris',
    icon: '📜',
    label: 'Sengketa Tanah & Waris',
    query: 'Bagaimana prosedur penanganan sengketa tanah, waris, dan perdata di HTS & Partners?'
  },
  {
    id: 'phk-ketenagakerjaan',
    icon: '💼',
    label: 'PHK & Hubungan Kerja',
    query: 'Bagaimana pendampingan hukum untuk perselisihan ketenagakerjaan, hak pesangon, dan PHK?'
  },
  {
    id: 'tun',
    icon: '🏛️',
    label: 'Tata Usaha Negara (TUN)',
    query: 'Bagaimana alur pengajuan gugatan dan konsultasi perkara Tata Usaha Negara (TUN)?'
  },
  {
    id: 'prosedur-konsultasi',
    icon: '📞',
    label: 'Tahapan Konsultasi',
    query: 'Bagaimana prosedur dan jadwal konsultasi langsung dengan Tim Advokat HTS & Partners?'
  }
];

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: 'Halo! Saya asisten virtual Kantor Hukum HTS & Partners. Ada yang bisa saya bantu seputar layanan hukum kami (perkara pidana, perdata, atau tata usaha negara)?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const messagesRef = useRef<Message[]>(messages);
  const messageCountRef = useRef(messageCount);
  
  const MAX_MESSAGES = 5;

  // Keep refs in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    messageCountRef.current = messageCount;
  }, [messageCount]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // DevSecOps telemetry listener for global unhandled errors and WebSocket issues
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const errorMsg = (reason && (reason.message || reason.stack || String(reason))) || 'Unknown Promise Rejection';
      
      const isWsError = 
        errorMsg.includes('WebSocket') || 
        errorMsg.includes('websocket') || 
        errorMsg.includes('closed without opened');

      logDevSecOpsError({
        eventType: isWsError ? 'WEBSOCKET_ERROR' : 'UNHANDLED_REJECTION',
        endpoint: isWsError ? 'ws://vite-hmr' : undefined,
        errorMessage: errorMsg,
        metadata: {
          suppressedFromUI: true,
          auditScope: 'DevSecOps-Performance-Audit'
        }
      });
    };

    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // Helper to mask PII for DevSecOps compliant telemetry
  const maskPII = (val: string): string => {
    if (!val) return '';
    if (val.length <= 4) return '***';
    return val.slice(0, 2) + '***' + val.slice(-2);
  };

  /**
   * Middleware handler untuk form submission konsultasi hukum (#consultation-form)
   * Menyediakan logging JSON terstruktur untuk observabilitas DevSecOps dan auditing telemetri.
   */
  const handleConsultationSubmit = useCallback(async (event: Event | React.FormEvent) => {
    if (event && event.preventDefault) {
      event.preventDefault();
    }

    const nameInput = document.getElementById('consult-name') as HTMLInputElement | null;
    const contactInput = document.getElementById('consult-contact') as HTMLInputElement | null;
    const categoryInput = document.getElementById('consult-category') as HTMLSelectElement | null;
    const messageInput = document.getElementById('consult-message') as HTMLTextAreaElement | null;
    const submitBtn = document.getElementById('btn-submit-consult') as HTMLButtonElement | null;

    const formData = {
      name: nameInput ? nameInput.value.trim() : '',
      contact: contactInput ? contactInput.value.trim() : '',
      category: categoryInput ? categoryInput.value : '',
      message: messageInput ? messageInput.value.trim() : ''
    };

    if (!formData.name || !formData.contact || !formData.category || !formData.message) {
      alert('Mohon lengkapi seluruh kolom formulir konsultasi.');
      return;
    }

    const maskedName = maskPII(formData.name);
    const maskedContact = maskPII(formData.contact);
    const startTime = performance.now();

    // 1. DevSecOps Logging: Log Attempt
    logDevSecOpsConsultation({
      eventType: 'CONSULTATION_SUBMIT_ATTEMPT',
      endpoint: '/api/consultation',
      category: formData.category,
      clientNameMasked: maskedName,
      contactMasked: maskedContact,
      messageLength: formData.message.length,
      status: 'PENDING',
      metadata: {
        action: 'SUBMIT_FORM_CONSULTATION',
        environment: 'production-ready',
        browserAgent: navigator.userAgent
      }
    });

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Mengirim Permohonan... ⏳</span>';
    }

    try {
      const response = await fetch('/api/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.success) {
        // 2. DevSecOps Logging: Log Success
        logDevSecOpsConsultation({
          eventType: 'CONSULTATION_SUBMIT_SUCCESS',
          endpoint: '/api/consultation',
          category: formData.category,
          clientNameMasked: maskedName,
          contactMasked: maskedContact,
          ticketId: result.ticketId,
          status: 'SUCCESS',
          httpStatus: response.status,
          latencyMs,
          metadata: {
            messageLength: formData.message.length,
            ticketConfirmed: true
          }
        });

        // Update UI Display
        const formEl = document.getElementById('consultation-form');
        const successBox = document.getElementById('consult-success-box');
        const ticketDisplay = document.getElementById('consult-ticket-display');
        const clientNameDisplay = document.getElementById('consult-client-name');
        const waForwardBtn = document.getElementById('btn-wa-forward-ticket') as HTMLAnchorElement | null;

        if (formEl) formEl.style.display = 'none';
        if (successBox) successBox.classList.add('show');
        if (ticketDisplay) ticketDisplay.textContent = `No. Tiket: ${result.ticketId}`;
        if (clientNameDisplay) clientNameDisplay.textContent = formData.name;

        if (waForwardBtn) {
          const waText = encodeURIComponent(
            `Halo Kantor Hukum HTS & Partners,\n\nSaya telah mengisi Formulir Konsultasi di website dengan rincian:\n` +
            `• No. Tiket: ${result.ticketId}\n` +
            `• Nama: ${formData.name}\n` +
            `• Kategori: ${formData.category}\n` +
            `• Kontak: ${formData.contact}\n\n` +
            `Mohon konfirmasi dan informasi jadwal konsultasi selanjutnya. Terima kasih.`
          );
          waForwardBtn.href = `https://wa.me/6287773115795?text=${waText}`;
        }
      } else {
        const errorText = result.message || `HTTP ${response.status}: Failed to submit consultation ticket`;
        // 3. DevSecOps Logging: Log Non-200 / Failure
        logDevSecOpsConsultation({
          eventType: 'CONSULTATION_SUBMIT_FAILURE',
          endpoint: '/api/consultation',
          category: formData.category,
          clientNameMasked: maskedName,
          contactMasked: maskedContact,
          status: 'ERROR',
          httpStatus: response.status,
          latencyMs,
          errorMessage: errorText,
          metadata: {
            serverErrorResponse: result
          }
        });

        alert('Gagal mengirim permohonan: ' + (result.message || 'Terjadi kesalahan sistem.'));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Kirim Permohonan Konsultasi ✉️</span>';
        }
      }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      const fallbackTicket = 'HTS-' + Date.now().toString().slice(-4);
      const errorMsg = err?.message || String(err);

      // 4. DevSecOps Logging: Log Catch Error & Fallback Triggered
      logDevSecOpsConsultation({
        eventType: 'CONSULTATION_SUBMIT_FALLBACK',
        endpoint: '/api/consultation',
        category: formData.category,
        clientNameMasked: maskedName,
        contactMasked: maskedContact,
        ticketId: fallbackTicket,
        status: 'FALLBACK',
        latencyMs,
        errorMessage: errorMsg,
        metadata: {
          fallbackReason: 'Network/Fetch exception',
          routedTo: 'Direct WhatsApp Gateway'
        }
      });

      const formEl = document.getElementById('consultation-form');
      const successBox = document.getElementById('consult-success-box');
      const ticketDisplay = document.getElementById('consult-ticket-display');
      const clientNameDisplay = document.getElementById('consult-client-name');
      const waForwardBtn = document.getElementById('btn-wa-forward-ticket') as HTMLAnchorElement | null;

      if (formEl) formEl.style.display = 'none';
      if (successBox) successBox.classList.add('show');
      if (ticketDisplay) ticketDisplay.textContent = `No. Tiket: ${fallbackTicket}`;
      if (clientNameDisplay) clientNameDisplay.textContent = formData.name;

      if (waForwardBtn) {
        const waText = encodeURIComponent(
          `Halo Kantor Hukum HTS & Partners,\n\nSaya ingin berkonsultasi mengenai:\n` +
          `• No. Tiket: ${fallbackTicket}\n` +
          `• Nama: ${formData.name}\n` +
          `• Kategori: ${formData.category}\n` +
          `• Ringkasan Kasus: ${formData.message}\n\n` +
          `Terima kasih.`
        );
        waForwardBtn.href = `https://wa.me/6287773115795?text=${waText}`;
      }
    }
  }, []);

  // Listen to clicks on any floating button / triggers & bind consultation form in index.html
  useEffect(() => {
    const handleToggleChat = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(prev => !prev);
    };

    (window as any).toggleChatbot = () => {
      setIsOpen(prev => !prev);
    };

    (window as any).openHTSChat = () => {
      setIsOpen(true);
    };

    (window as any).closeHTSChat = () => {
      setIsOpen(false);
    };

    // Attach click listeners to all possible triggers in the DOM
    const fabBtn = document.getElementById('fab-chatbot');
    if (fabBtn) {
      fabBtn.addEventListener('click', handleToggleChat);
    }

    // Expose handleConsultationSubmit globally for window & form attachments
    (window as any).handleConsultationSubmit = handleConsultationSubmit;

    const consultForm = document.getElementById('consultation-form');
    if (consultForm) {
      consultForm.addEventListener('submit', handleConsultationSubmit);
    }

    return () => {
      if (fabBtn) {
        fabBtn.removeEventListener('click', handleToggleChat);
      }
      if (consultForm) {
        consultForm.removeEventListener('submit', handleConsultationSubmit);
      }
    };
  }, [handleConsultationSubmit]);

  /**
   * Fungsi triggerAIResponse untuk mengirim permintaan ke API dengan delay natural
   * serta mencatat telemetri performa DevSecOps dan menangani kegagalan API secara graceful.
   */
  const triggerAIResponse = async (queryText: string, currentHistory: Message[]) => {
    // 1. Simulasi ritme mengetik natural
    await new Promise((resolve) => setTimeout(resolve, 550));

    const startTime = performance.now();
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: currentHistory.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            content: m.content
          }))
        })
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        logDevSecOpsError({
          eventType: 'API_ERROR',
          endpoint: '/api/chat',
          status: response.status,
          latencyMs,
          errorMessage: `HTTP ${response.status}: ${errText || response.statusText}`,
          metadata: {
            queryLength: queryText.length,
            historyLength: currentHistory.length
          }
        });
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        content: data.response || 'Terima kasih atas pertanyaan Anda. Untuk konsultasi lebih lanjut silakan hubungi tim kami.',
        timestamp: new Date(),
        isError: false,
        hasWaHelp: false
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      
      // Catat ke Structured JSON Logger untuk DevSecOps Audit
      logDevSecOpsError({
        eventType: 'API_ERROR',
        endpoint: '/api/chat',
        status: error?.status || 'FETCH_FAILED',
        latencyMs,
        errorMessage: error?.message || String(error),
        metadata: {
          queryTextSnippet: queryText.slice(0, 50),
          action: 'Fallback to WhatsApp Direct Support'
        }
      });

      // Graceful error handling dengan tautan WhatsApp darurat / konsultasi langsung
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        content: 'Mohon maaf, saat ini sistem analisis AI sedang mengalami kendala koneksi ke server. Agar konsultasi dan telaah dokumen hukum Anda tidak terhambat, Anda dapat langsung menghubungi Tim Advokat HTS & Partners melalui WhatsApp.',
        timestamp: new Date(),
        isError: true,
        hasWaHelp: true
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  /**
   * Pemrosesan antrean pesan (Message Queue Processing)
   */
  const processQueue = async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) {
      return;
    }

    if (messageCountRef.current >= MAX_MESSAGES) {
      queueRef.current = [];
      return;
    }

    isProcessingRef.current = true;
    const nextQuery = queueRef.current.shift();

    if (!nextQuery) {
      isProcessingRef.current = false;
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: nextQuery,
      timestamp: new Date()
    };

    // Tambahkan pesan user ke UI
    const updatedHistory = [...messagesRef.current, userMessage];
    setMessages(updatedHistory);
    messagesRef.current = updatedHistory;

    // Tingkatkan counter pesan
    const nextCount = messageCountRef.current + 1;
    setMessageCount(nextCount);
    messageCountRef.current = nextCount;

    setIsLoading(true);

    try {
      await triggerAIResponse(nextQuery, updatedHistory);
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;
      
      // Jika masih ada antrean pesan dan belum mencapai batas kuota
      if (queueRef.current.length > 0 && messageCountRef.current < MAX_MESSAGES) {
        setTimeout(processQueue, 250);
      }
    }
  };

  /**
   * Menambahkan pesan ke dalam antrean (Enqueue Query)
   */
  const enqueueQuery = (queryText: string) => {
    if (!queryText.trim()) return;
    if (messageCountRef.current >= MAX_MESSAGES) return;

    queueRef.current.push(queryText.trim());
    processQueue();
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    const text = inputValue;
    setInputValue('');
    enqueueQuery(text);
  };

  const handleQuickReply = (query: string) => {
    if (isLoading || messageCount >= MAX_MESSAGES) return;
    enqueueQuery(query);
  };

  return (
    <>
      {/* SCOPED STYLES TO PREVENT TAILWIND PREFLIGHT RESET COLLISION */}
      <style>{`
        .hts-chat-container {
          position: fixed;
          bottom: 110px;
          right: 28px;
          width: 385px;
          height: 530px;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 140px);
          background-color: #FFFFFF;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04);
          border: 1px solid #E2E8F0;
          display: flex;
          flex-direction: column;
          z-index: 99999;
          overflow: hidden;
          font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
          animation: htsChatFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes htsChatFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* FLOATING ACTION BUTTONS (DIRECT REACT INTERACTION) */
        .hts-fab-group {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 99998;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          pointer-events: auto;
        }
        .hts-fab-wa {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          background: #16A34A;
          color: #FFFFFF !important;
          padding: 0.7rem 1.25rem;
          border-radius: 9999px;
          border: 1px solid #15803D;
          box-shadow: 0 4px 14px 0 rgba(15, 23, 42, 0.08);
          text-decoration: none !important;
          font-weight: 600;
          font-size: 0.88rem;
          line-height: 1;
          transition: transform 0.2s ease, background-color 0.2s ease;
          white-space: nowrap;
          user-select: none;
          cursor: pointer;
        }
        .hts-fab-wa:hover {
          background: #15803D;
          transform: translateY(-2px);
        }
        .hts-fab-wa-icon {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .hts-fab-ai {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          background: #0F172A;
          color: #FFFFFF !important;
          padding: 0.7rem 1.25rem;
          border-radius: 9999px;
          border: 1px solid #0F172A;
          box-shadow: 0 4px 14px 0 rgba(15, 23, 42, 0.08);
          cursor: pointer;
          font-weight: 600;
          font-size: 0.88rem;
          line-height: 1;
          transition: transform 0.2s ease, background-color 0.2s ease;
          white-space: nowrap;
          user-select: none;
          position: relative;
        }
        .hts-fab-ai:hover {
          background: #1E293B;
          transform: translateY(-2px);
        }
        .hts-fab-ai-active {
          background: #0F172A !important;
          border-color: #0F172A !important;
        }
        .hts-fab-ai-badge {
          background: #F1F5F9;
          color: #0F172A;
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.15rem 0.45rem;
          border-radius: 9999px;
          letter-spacing: 0.04em;
        }
        .hts-fab-ai-dot {
          width: 7px;
          height: 7px;
          background: #22C55E;
          border-radius: 50%;
        }

        .hts-chat-header {
          background-color: #0F172A;
          color: #FFFFFF;
          padding: 0.9rem 1.2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1E293B;
        }
        .hts-chat-brand {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }
        .hts-chat-brand-img {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          object-fit: contain;
          background-color: #FFFFFF;
          padding: 2px;
          border: 1px solid #334155;
        }
        .hts-chat-brand-title {
          font-size: 0.92rem;
          font-weight: 700;
          color: #FFFFFF;
          letter-spacing: -0.01em;
        }
        .hts-chat-brand-subtitle {
          font-size: 0.7rem;
          color: #94A3B8;
          display: block;
          line-height: 1.2;
        }
        .hts-chat-close-btn {
          color: #94A3B8;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: color 0.2s;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }
        .hts-chat-close-btn:hover {
          color: #FFFFFF;
        }
        .hts-chat-disclaimer {
          background-color: #F8FAFC;
          border-bottom: 1px solid #E2E8F0;
          padding: 0.6rem 1rem;
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .hts-chat-disclaimer-text {
          font-size: 0.72rem;
          color: #475569;
          line-height: 1.45;
          font-weight: 400;
        }
        .hts-chat-disclaimer-icon {
          color: #64748B;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .hts-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          background-color: #F8FAFC;
        }
        .hts-msg-bubble {
          max-width: 84%;
          padding: 0.75rem 0.95rem;
          border-radius: 8px;
          font-size: 0.84rem;
          line-height: 1.55;
          word-wrap: break-word;
          box-shadow: 0 1px 2px 0 rgba(15, 23, 42, 0.04);
        }
        .hts-msg-assistant {
          align-self: flex-start;
          background-color: #FFFFFF;
          color: #0F172A;
          border: 1px solid #E2E8F0;
        }
        .hts-msg-user {
          align-self: flex-end;
          background-color: #0F172A;
          color: #FFFFFF;
          border: 1px solid #0F172A;
        }
        .hts-chat-input-area {
          border-top: 1px solid #E2E8F0;
          padding: 0.8rem 1rem;
          background-color: #FFFFFF;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .hts-chat-form {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .hts-chat-input {
          flex: 1;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 0.65rem 0.85rem;
          font-size: 0.84rem;
          font-family: inherit;
          color: #0F172A;
          outline: none;
          background-color: #FFFFFF;
          transition: border-color 0.2s;
        }
        .hts-chat-input:focus {
          border-color: #0F172A;
          outline: 2px solid rgba(15, 23, 42, 0.08);
        }
        .hts-chat-input:disabled {
          background-color: #F1F5F9;
          color: #94A3B8;
          border-color: #E2E8F0;
          cursor: not-allowed;
        }
        .hts-chat-submit {
          background-color: #0F172A;
          color: #FFFFFF;
          border: none;
          border-radius: 8px;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .hts-chat-submit:hover:not(:disabled) {
          background-color: #1E293B;
        }
        .hts-chat-submit:disabled {
          background-color: #CBD5E1;
          color: #94A3B8;
          cursor: not-allowed;
        }
        .hts-rate-limit-warning {
          background-color: #FEF2F2;
          border: 1px solid #FECACA;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          font-size: 0.72rem;
          color: #991B1B;
          line-height: 1.4;
          text-align: center;
          font-weight: 500;
        }
        .hts-quick-replies-area {
          padding: 0.5rem 0.85rem;
          background-color: #F8FAFC;
          border-top: 1px solid #E2E8F0;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .hts-quick-replies-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hts-quick-replies-title {
          font-size: 0.65rem;
          font-weight: 600;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .hts-quick-replies-list {
          display: flex;
          gap: 0.4rem;
          overflow-x: auto;
          padding-bottom: 2px;
          scrollbar-width: thin;
        }
        .hts-quick-replies-list::-webkit-scrollbar {
          height: 3px;
        }
        .hts-quick-replies-list::-webkit-scrollbar-thumb {
          background-color: #CBD5E1;
          border-radius: 3px;
        }
        .hts-quick-chip {
          background-color: #FFFFFF;
          color: #0F172A;
          border: 1px solid #E2E8F0;
          border-radius: 9999px;
          padding: 0.3rem 0.7rem;
          font-size: 0.74rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          flex-shrink: 0;
        }
        .hts-quick-chip:hover:not(:disabled) {
          background-color: #0F172A;
          color: #FFFFFF;
          border-color: #0F172A;
          transform: translateY(-1px);
        }
        .hts-quick-chip:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background-color: #F1F5F9;
        }
        .hts-typing-indicator {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          align-self: flex-start;
          background-color: #FFFFFF;
          color: #475569;
          padding: 0.55rem 0.95rem;
          border-radius: 8px;
          border: 1px solid #E2E8F0;
          font-size: 0.76rem;
          font-weight: 500;
        }
        .hts-typing-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background-color: #0F172A;
          color: #FFFFFF;
        }
        .hts-typing-content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .hts-typing-text {
          color: #475569;
          font-size: 0.74rem;
        }
        .hts-typing-dots {
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .hts-typing-dot {
          width: 5px;
          height: 5px;
          background-color: #0F172A;
          border-radius: 50%;
          display: inline-block;
          animation: htsDotWave 1.4s infinite ease-in-out both;
        }
        .hts-typing-dot:nth-child(1) {
          animation-delay: -0.32s;
        }
        .hts-typing-dot:nth-child(2) {
          animation-delay: -0.16s;
        }
        .hts-typing-dot:nth-child(3) {
          animation-delay: 0s;
        }
        @keyframes htsDotWave {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.35;
          }
          40% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
        .hts-whatsapp-direct {
          display: inline-block;
          margin-top: 4px;
          color: #0F172A;
          font-weight: 600;
          text-decoration: underline !important;
        }
        .hts-whatsapp-direct:hover {
          color: #1E293B;
        }
        .hts-msg-bubble-error {
          border-color: #FECACA !important;
          background-color: #FFF5F5 !important;
        }
        .hts-wa-help-card {
          margin-top: 0.65rem;
          padding: 0.65rem 0.8rem;
          background-color: #F0FDF4;
          border: 1px solid #BBF7D0;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .hts-wa-help-text {
          font-size: 0.72rem;
          color: #166534;
          font-weight: 500;
          line-height: 1.35;
        }
        .hts-wa-help-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background-color: #16A34A;
          color: #FFFFFF !important;
          font-weight: 600;
          font-size: 0.74rem;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          text-decoration: none !important;
          transition: background-color 0.2s;
          width: fit-content;
        }
        .hts-wa-help-btn:hover {
          background-color: #15803D;
        }
        @media (max-width: 900px) {
          .hts-chat-container {
            bottom: 120px;
            right: 16px;
            width: calc(100vw - 32px);
            height: 480px;
            max-height: calc(100vh - 140px);
            border-radius: 12px;
          }
        }
      `}</style>

      {/* CHATBOX PANEL (TRIGGERED BY UNIFIED FLOATING BUTTON) */}
      {isOpen && (
        <div className="hts-chat-container" id="hts-chat-box">
          {/* HEADER */}
          <div className="hts-chat-header">
            <div className="hts-chat-brand">
              <img 
                src="/assets/law_firm_logo.jpg" 
                alt="Logo HTS" 
                className="hts-chat-brand-img"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/law_firm_logo.jpg'; }}
              />
              <div>
                <span className="hts-chat-brand-title">Asisten Virtual HTS</span>
                <span className="hts-chat-brand-subtitle">Kantor Hukum HTS & Partners</span>
              </div>
            </div>
            <button className="hts-chat-close-btn" onClick={() => setIsOpen(false)} title="Tutup Chat">
              <X size={20} />
            </button>
          </div>

          {/* PERMANENT LEGAL DISCLAIMER */}
          <div className="hts-chat-disclaimer">
            <Scale size={15} className="hts-chat-disclaimer-icon" />
            <span className="hts-chat-disclaimer-text">
              Asisten ini memberi informasi umum, bukan pengganti konsultasi hukum resmi.
            </span>
          </div>

          {/* MESSAGES VIEW */}
          <div className="hts-chat-messages">
            {messages.map((m) => (
              <div 
                key={m.id} 
                className={`hts-msg-bubble ${m.sender === 'user' ? 'hts-msg-user' : 'hts-msg-assistant'} ${m.isError ? 'hts-msg-bubble-error' : ''}`}
              >
                {m.isError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem', color: '#DC2626', fontWeight: 600, fontSize: '0.75rem' }}>
                    <AlertCircle size={14} />
                    <span>Informasi Kendala Sistem</span>
                  </div>
                )}
                <div>{m.content}</div>
                {m.id === 'welcome' && (
                  <div>
                    <a 
                      href="https://wa.me/6287773115795" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="hts-whatsapp-direct"
                    >
                      Konsultasi langsung via WhatsApp →
                    </a>
                  </div>
                )}
                {m.hasWaHelp && (
                  <div className="hts-wa-help-card">
                    <span className="hts-wa-help-text">
                      Hubungi Tim Advokat HTS & Partners (PERADI) untuk bantuan dan konsultasi langsung:
                    </span>
                    <a 
                      href="https://wa.me/6287773115795?text=Halo%20Kantor%20Hukum%20HTS%20%26%20Partners,%20saya%20ingin%20konsultasi%20hukum" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="hts-wa-help-btn"
                    >
                      <PhoneCall size={13} />
                      <span>Chat WhatsApp: 0877-7311-5795</span>
                    </a>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="hts-typing-indicator" role="status" aria-label="Asisten sedang menganalisis">
                <div className="hts-typing-avatar">
                  <Scale size={12} />
                </div>
                <div className="hts-typing-content">
                  <span className="hts-typing-text">Menelaah analisis hukum</span>
                  <div className="hts-typing-dots">
                    <span className="hts-typing-dot" />
                    <span className="hts-typing-dot" />
                    <span className="hts-typing-dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* PREDEFINED QUICK-REPLIES */}
          {messageCount < MAX_MESSAGES && (
            <div className="hts-quick-replies-area">
              <div className="hts-quick-replies-header">
                <span className="hts-quick-replies-title">Pilih Topik Konsultasi Cepat:</span>
              </div>
              <div className="hts-quick-replies-list">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    className="hts-quick-chip"
                    onClick={() => handleQuickReply(reply.query)}
                    disabled={isLoading}
                    title={reply.query}
                  >
                    <span>{reply.icon}</span>
                    <span>{reply.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* INPUT FORM & RATE LIMIT CHECK */}
          <div className="hts-chat-input-area">
            {messageCount >= MAX_MESSAGES ? (
              <div className="hts-rate-limit-warning">
                Anda telah mencapai batas {MAX_MESSAGES} pesan sesi ini. Silakan konsultasi lebih mendalam langsung melalui WhatsApp kami di 
                <a 
                  href="https://wa.me/6287773115795" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hts-whatsapp-direct"
                  style={{ display: 'block', marginTop: '4px' }}
                >
                  WhatsApp HTS: 0877-7311-5795
                </a>
              </div>
            ) : (
              <form className="hts-chat-form" onSubmit={handleSend}>
                <input
                  type="text"
                  className="hts-chat-input"
                  placeholder="Ketik pertanyaan hukum umum Anda..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isLoading}
                  maxLength={500}
                />
                <button 
                  type="submit" 
                  className="hts-chat-submit" 
                  disabled={!inputValue.trim() || isLoading}
                  title="Kirim pesan"
                >
                  <Send size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* FLOATING ACTION BUTTONS (ALWAYS VISIBLE & HIGH-PRIORITY INTERACTION) */}
      <div className="hts-fab-group" id="hts-floating-group">
        {/* Tombol 1: WhatsApp Resmi (Warna Hijau WhatsApp) */}
        <a
          href="https://wa.me/6287773115795?text=Halo%20Kantor%20Hukum%20HTS%20%26%20Partners,%20saya%20ingin%20berkonsultasi%20mengenai%20permasalahan%20hukum"
          target="_blank"
          rel="noopener noreferrer"
          className="hts-fab-wa"
          id="fab-whatsapp"
          title="Chat WhatsApp Resmi HTS (0877-7311-5795)"
          aria-label="Chat WhatsApp Resmi HTS"
        >
          <span className="hts-fab-wa-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
          </span>
          <span>Chat WhatsApp</span>
        </a>

        {/* Tombol 2: Asisten AI HTS (Warna Navy Khas HTS & Badge AI) */}
        <button
          type="button"
          className={`hts-fab-ai ${isOpen ? 'hts-fab-ai-active' : ''}`}
          id="fab-chatbot"
          onClick={() => setIsOpen(prev => !prev)}
          title={isOpen ? "Tutup Asisten AI" : "Buka Asisten AI HTS"}
          aria-label={isOpen ? "Tutup Asisten AI" : "Buka Asisten AI HTS"}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', color: '#C5A880' }}>
            <Scale size={18} />
          </span>
          <span>{isOpen ? 'Tutup Asisten ✕' : 'Asisten AI HTS'}</span>
          <span className="hts-fab-ai-badge">AI</span>
          <span className="hts-fab-ai-dot" />
        </button>
      </div>
    </>
  );
}
