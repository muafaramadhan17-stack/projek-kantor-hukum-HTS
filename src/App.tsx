import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Send, Scale, Loader2, PhoneCall, AlertCircle } from 'lucide-react';

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
  console.error(`[DevSecOps Telemetry Audit] ${JSON.stringify(structuredLog)}`);
};

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

  const maskPII = (val: string): string => {
    if (!val) return '';
    if (val.length <= 4) return '***';
    return val.slice(0, 2) + '***' + val.slice(-2);
  };

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

    const fabBtn = document.getElementById('fab-chatbot');
    if (fabBtn) {
      fabBtn.addEventListener('click', handleToggleChat);
    }

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

  const triggerAIResponse = async (queryText: string, currentHistory: Message[]) => {
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

    const updatedHistory = [...messagesRef.current, userMessage];
    setMessages(updatedHistory);
    messagesRef.current = updatedHistory;

    const nextCount = messageCountRef.current + 1;
    setMessageCount(nextCount);
    messageCountRef.current = nextCount;

    setIsLoading(true);

    try {
      await triggerAIResponse(nextQuery, updatedHistory);
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;
      
      if (queueRef.current.length > 0 && messageCountRef.current < MAX_MESSAGES) {
        setTimeout(processQueue, 250);
      }
    }
  };

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
      {isOpen && (
        <div className="fixed bottom-28 right-7 w-[385px] max-w-[calc(100vw-32px)] h-[530px] max-h-[calc(100vh-155px)] bg-white border border-slate-300 rounded-xl shadow-2xl flex flex-col z-[99999] overflow-hidden font-sans">
          <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <img src="/assets/hts_logo_transparent_512.png" alt="Logo" className="w-7 h-7 rounded bg-white p-0.5 object-contain" />
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">Asisten Virtual HTS</h3>
                <span className="text-[10px] text-slate-400">Kantor Hukum HTS & Partners</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center gap-1.5 text-xs text-slate-700">
            <Scale size={14} className="text-slate-500 flex-shrink-0" />
            <span>Asisten ini memberi informasi umum, bukan konsultasi resmi.</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50">
            {messages.map((m) => (
              <div 
                key={m.id} 
                className={`max-w-[84%] p-3 rounded-lg text-xs leading-relaxed shadow-sm break-words ${
                  m.sender === 'user' 
                    ? 'bg-slate-900 text-white ml-auto rounded-br-none' 
                    : 'bg-white text-slate-900 border border-slate-200 mr-auto rounded-bl-none'
                } ${m.isError ? 'bg-red-50 border-red-200 text-red-900' : ''}`}
              >
                {m.isError && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-red-600 font-semibold">
                    <AlertCircle size={14} />
                    <span>Informasi Kendala Sistem</span>
                  </div>
                )}
                <div>{m.content}</div>
                {m.id === 'welcome' && (
                  <div className="mt-1">
                    <a href="https://wa.me/6287773115795" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold underline hover:text-blue-800">
                      Konsultasi langsung via WhatsApp →
                    </a>
                  </div>
                )}
                {m.hasWaHelp && (
                  <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-col gap-1.5">
                    <span className="text-emerald-800 font-medium text-[11px]">Hubungi Tim Advokat HTS & Partners:</span>
                    <a href="https://wa.me/6287773115795" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 bg-emerald-600 text-white font-semibold text-[11px] px-2.5 py-1 rounded hover:bg-emerald-700 transition-colors w-fit">
                      <PhoneCall size={12} />
                      <span>Chat WhatsApp: 0877-7311-5795</span>
                    </a>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex items-center gap-2 bg-white text-slate-700 p-2.5 rounded-lg border border-slate-200 w-fit text-xs font-medium shadow-sm">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center">
                  <Scale size={11} />
                </div>
                <span>Menelaah analisis hukum...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messageCount < MAX_MESSAGES && (
            <div className="p-2 bg-slate-50 border-t border-slate-200 flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide px-1">Topik Cepat:</span>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply.id}
                    onClick={() => handleQuickReply(reply.query)}
                    disabled={isLoading}
                    className="bg-white text-slate-800 border border-slate-200 rounded-full px-2.5 py-1 text-[11px] font-medium hover:bg-slate-900 hover:text-white transition-colors flex-shrink-0 flex items-center gap-1"
                  >
                    <span>{reply.icon}</span>
                    <span>{reply.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 bg-white border-t border-slate-200">
            {messageCount >= MAX_MESSAGES ? (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-center text-[11px] text-red-900 font-medium">
                Batas sesi tercapai. Hubungi kami via 
                <a href="https://wa.me/6287773115795" target="_blank" rel="noopener noreferrer" className="underline font-bold block mt-0.5">WhatsApp: 0877-7311-5795</a>
              </div>
            ) : (
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/20"
                  placeholder="Ketik pertanyaan hukum..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isLoading}
                  maxLength={500}
                />
                <button 
                  type="submit" 
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-slate-900 text-white rounded-lg px-3 py-2 flex items-center justify-center hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  <Send size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="fixed bottom-7 right-7 z-40 flex flex-col items-end gap-3 pointer-events-auto">
        <a
          href="https://wa.me/6287773115795?text=Halo%20Kantor%20Hukum%20HTS"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-full shadow-lg font-semibold text-xs hover:bg-emerald-700 transition-all transform hover:-translate-y-0.5"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
          <span>WhatsApp</span>
        </a>

        <button
          onClick={() => setIsOpen(!isOpen)}
          id="fab-chatbot"
          className="inline-flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-full shadow-lg font-semibold text-xs hover:bg-slate-800 transition-all transform hover:-translate-y-0.5"
        >
          <Scale size={16} className="text-amber-400" />
          <span>{isOpen ? 'Tutup Asisten ✕' : 'Asisten AI'}</span>
          <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">AI</span>
        </button>
      </div>
    </>
  );
}
