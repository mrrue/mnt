import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  ArrowLeft,
  Phone,
  User,
  MapPin,
  LifeBuoy,
  Clock,
  Send,
  Paperclip,
  CheckCircle,
  Wrench,
  Camera,
  History,
  Image as ImageIcon,
  AlertCircle,
  Mic,
  Square,
  Trash2,
  Save,
  Check
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { socket, sendWebSocketMessage, setActiveCall } = useNotifications();

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [users, setUsers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Chat message input
  const [newMessage, setNewMessage] = useState('');
  const [chatFile, setChatFile] = useState(null);
  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  // Voice Note Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Worklog Form State (Embedded inline, auto-saved)
  const [isSavingWorklog, setIsSavingWorklog] = useState(false);
  const [worklogSavedAlert, setWorklogSavedAlert] = useState(false);
  const [worklogData, setWorklogData] = useState({
    arrival_time: '',
    departure_time: '',
    fault_found: '',
    work_performed: '',
    parts_used: '',
    customer_comments: '',
    technician_notes: '',
    resolution: '',
    status: 'Resolved'
  });

  // Multiple Photos Upload State
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef(null);

  const fetchTicketDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/tickets/${id}`);
      setTicket(res.ticket);
      setMessages(res.messages || []);
      setAttachments(res.attachments || []);
      setCustomerHistory(res.customer_history || []);

      setWorklogData({
        arrival_time: res.ticket.arrival_time || '',
        departure_time: res.ticket.departure_time || '',
        fault_found: res.ticket.fault_found || '',
        work_performed: res.ticket.work_performed || '',
        parts_used: res.ticket.parts_used || '',
        customer_comments: res.ticket.customer_comments || '',
        technician_notes: res.ticket.technician_notes || '',
        resolution: res.ticket.resolution || '',
        status: res.ticket.status
      });
    } catch (err) {
      alert('Failed to load ticket.');
      navigate('/helpdesk/tickets');
    } finally {
      setLoading(false);
    }
  };

  const fetchMaster = async () => {
    try {
      const uRes = await api.get('/users', { is_active: true });
      setUsers(uRes || []);
      const sRes = await api.get('/settings');
      if (sRes.ticket_statuses) setStatuses(sRes.ticket_statuses);
    } catch (e) {}
  };

  useEffect(() => {
    fetchTicketDetails();
    fetchMaster();
  }, [id]);

  // Join ticket room on WebSocket for live chat & voice calling
  useEffect(() => {
    if (!socket || !ticket) return;

    sendWebSocketMessage({ type: 'join_ticket', ticket_id: ticket.id });

    const handleWsMessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'new_ticket_message' && msg.ticket_id === ticket.id) {
          setMessages(prev => [...prev, msg]);
          scrollToBottom();
        }
      } catch (e) {}
    };

    socket.addEventListener('message', handleWsMessage);

    return () => {
      sendWebSocketMessage({ type: 'leave_ticket', ticket_id: ticket.id });
      socket.removeEventListener('message', handleWsMessage);
    };
  }, [socket, ticket]);

  const scrollToBottom = () => {
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !chatFile) return;

    try {
      const formData = new FormData();
      formData.append('message', newMessage.trim());
      if (chatFile) {
        formData.append('attachment', chatFile);
      }

      const res = await api.post(`/tickets/${id}/messages`, formData);

      // Broadcast to socket room
      sendWebSocketMessage({
        type: 'ticket_message',
        ticket_id: ticket.id,
        message: newMessage.trim(),
        attachment_url: res.attachment_url,
        attachment_name: chatFile?.name || null
      });

      setNewMessage('');
      setChatFile(null);
      fetchTicketDetails();
      scrollToBottom();
    } catch (err) {
      alert('Failed to send message.');
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      await api.put(`/tickets/${id}`, { status: newStatus });
      setTicket(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  const handleAssignTechnician = async (techId) => {
    try {
      await api.put(`/tickets/${id}`, { assigned_to: techId || null, status: techId ? 'Assigned' : 'New' });
      fetchTicketDetails();
    } catch (err) {
      alert('Failed to reassign ticket.');
    }
  };

  const handleSaveWorklog = async (e) => {
    if (e) e.preventDefault();
    setIsSavingWorklog(true);
    try {
      await api.post(`/tickets/${id}/worklog`, worklogData);
      setWorklogSavedAlert(true);
      setTimeout(() => setWorklogSavedAlert(false), 3000);
      fetchTicketDetails();
    } catch (err) {
      alert('Failed to save work log.');
    } finally {
      setIsSavingWorklog(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete ticket ${ticket.ticket_number}? This cannot be undone.`)) return;
    try {
      await api.delete(`/tickets/${id}`);
      navigate('/helpdesk/tickets');
    } catch (err) {
      alert(err.message || 'Failed to delete ticket.');
    }
  };

  const handleUploadPhotos = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      await api.post(`/tickets/${id}/attachments`, formData);
      fetchTicketDetails();
    } catch (err) {
      alert('Failed to upload photos.');
    } finally {
      setUploadingPhotos(false);
    }
  };

  // Voice Note Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied or not available. Please allow microphone permissions.');
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
  };

  const sendVoiceNote = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });

        const formData = new FormData();
        formData.append('message', '🎤 Voice Message');
        formData.append('attachment', audioFile);

        const res = await api.post(`/tickets/${id}/messages`, formData);

        sendWebSocketMessage({
          type: 'ticket_message',
          ticket_id: ticket.id,
          message: '🎤 Voice Message',
          attachment_url: res.attachment_url,
          attachment_name: audioFile.name
        });

        fetchTicketDetails();
        scrollToBottom();
      } catch (err) {
        alert('Failed to send voice message.');
      } finally {
        audioChunksRef.current = [];
        setIsRecording(false);
        setRecordingTime(0);
      }
    };

    mediaRecorderRef.current.stop();
  };

  if (loading || !ticket) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading complaint ticket...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/helpdesk/tickets"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-mono text-slate-900">{ticket.ticket_number}</h1>
              <Badge>{ticket.status}</Badge>
              <Badge variant={ticket.priority === 'Urgent' || ticket.priority === 'High' ? 'danger' : 'default'} size="sm">
                {ticket.priority}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Logged on {new Date(ticket.created_at).toLocaleString()} by <span className="font-semibold text-slate-700">{ticket.created_by_name || 'Staff'}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('helpdesk_view') && (
            <button
              onClick={handleDeleteTicket}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-xl border border-rose-200 transition-colors"
              title="Delete this ticket"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Ticket
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Ticket Information, Photos & Chat */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Issue Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer Details</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{ticket.customer_name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold text-slate-700">{ticket.customer_phone}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{ticket.customer_address}</p>
              </div>

              {ticket.customer_id && (
                <Link
                  to={`/billing/customers/${ticket.customer_id}`}
                  className="text-xs font-semibold text-sky-600 hover:underline shrink-0"
                >
                  View Full Profile &rarr;
                </Link>
              )}
            </div>

            {/* Complaint Description */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Complaint Category</span>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{ticket.category}</p>
              <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed">
                {ticket.description}
              </div>
            </div>

            {/* Embedded Work Log & Resolution - Auto-saved */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-sky-600" /> Technician Work Log & Completion
                </p>
                <div className="flex items-center gap-2">
                  {worklogSavedAlert && (
                    <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                      <Check className="w-3.5 h-3.5" /> Saved to Ticket
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveWorklog}
                    disabled={isSavingWorklog}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" /> {isSavingWorklog ? 'Saving...' : 'Save Work Log'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Arrival Time</label>
                  <input
                    type="text"
                    value={worklogData.arrival_time}
                    onChange={(e) => setWorklogData({ ...worklogData, arrival_time: e.target.value })}
                    placeholder="e.g. 11:30 AM"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Departure Time</label>
                  <input
                    type="text"
                    value={worklogData.departure_time}
                    onChange={(e) => setWorklogData({ ...worklogData, departure_time: e.target.value })}
                    placeholder="e.g. 12:45 PM"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Fault Found</label>
                <input
                  type="text"
                  value={worklogData.fault_found}
                  onChange={(e) => setWorklogData({ ...worklogData, fault_found: e.target.value })}
                  placeholder="e.g. Core fiber cable cut outside gate, connector broken"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Work Performed</label>
                <textarea
                  rows="2"
                  value={worklogData.work_performed}
                  onChange={(e) => setWorklogData({ ...worklogData, work_performed: e.target.value })}
                  placeholder="e.g. Respliced fiber core with fusion splicer, tested optical power (-19.2 dBm)"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Parts / Materials Used</label>
                  <input
                    type="text"
                    value={worklogData.parts_used}
                    onChange={(e) => setWorklogData({ ...worklogData, parts_used: e.target.value })}
                    placeholder="e.g. 1 SC-APC Fast Connector, 20m drop wire"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Final Resolution Details</label>
                  <input
                    type="text"
                    value={worklogData.resolution}
                    onChange={(e) => setWorklogData({ ...worklogData, resolution: e.target.value })}
                    placeholder="e.g. Internet restored, speed verified"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Photo & File Attachments */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-600" /> Work Photos & Attachments ({attachments.length})
              </h3>
              <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-colors">
                <Camera className="w-3.5 h-3.5" />
                <span>Upload Photos</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  onChange={handleUploadPhotos}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No photos uploaded yet for this ticket.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {attachments.map(a => (
                  <div key={a.id} className="group relative bg-slate-100 rounded-xl overflow-hidden border border-slate-200 aspect-square">
                    {a.file_type && a.file_type.includes('image') ? (
                      <img src={a.file_path} alt={a.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-500">
                        <Paperclip className="w-6 h-6 mb-1" />
                        <span className="text-[10px] truncate max-w-full">{a.file_name}</span>
                      </div>
                    )}
                    <a
                      href={a.file_path}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold backdrop-blur-2xs transition-opacity"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* In-Ticket Messaging Chat */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-96">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Internal Ticket Messaging</h3>
              <span className="text-[10px] text-slate-400">Live communication with technician</span>
            </div>

            {/* Message Thread */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <p className="text-center py-10 text-xs text-slate-400">No messages yet. Send a note or photo update below.</p>
              ) : (
                messages.map((m, idx) => {
                  const isMe = m.sender_id === user.id;
                  return (
                    <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-bold text-slate-600">{m.sender_name}</span>
                        <span className="text-[9px] text-slate-400">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div
                        className={`p-3 rounded-2xl text-xs max-w-xs sm:max-w-md ${
                          isMe ? 'bg-sky-600 text-white rounded-tr-xs' : 'bg-slate-100 text-slate-800 rounded-tl-xs'
                        }`}
                      >
                        {m.message && <p className="whitespace-pre-line">{m.message}</p>}
                        {m.attachment_url && (
                          <div className="mt-2">
                            {m.attachment_url.match(/\.(webm|mp3|wav|ogg|m4a|aac)$/i) || m.attachment_name?.includes('voice_note') ? (
                              <div className="bg-black/10 rounded-xl p-2 flex flex-col gap-1">
                                <audio controls src={m.attachment_url} className="w-full max-w-[220px] sm:max-w-xs h-8" />
                                <span className="text-[9px] opacity-75 font-mono">{m.attachment_name || 'voice_message.webm'}</span>
                              </div>
                            ) : (
                              <a href={m.attachment_url} target="_blank" rel="noreferrer" className="underline font-semibold text-[11px] flex items-center gap-1">
                                <Paperclip className="w-3 h-3" /> {m.attachment_name || 'View Attachment'}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input Bar with Voice Note support */}
            <div className="p-3 border-t border-slate-200 bg-white">
              {isRecording ? (
                <div className="flex items-center justify-between px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                    <span>Recording Voice Message... {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-white rounded-lg border border-slate-200 text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={sendVoiceNote}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" /> Send Voice
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <label className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer rounded-lg hover:bg-slate-100" title="Attach file or photo">
                    <Paperclip className="w-4 h-4" />
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => setChatFile(e.target.files[0] || null)}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={startRecording}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Record voice message"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={chatFile ? `File attached: ${chatFile.name}` : "Type message or record voice note..."}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />

                  <button
                    type="submit"
                    className="p-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-xs transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Ticket Assignment, Status & Customer Previous History */}
        <div className="space-y-6">
          {/* Status & Assignment Box */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ticket Workflow</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={ticket.status}
                onChange={(e) => handleUpdateStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white"
              >
                {statuses.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Technician</label>
              <select
                value={ticket.assigned_to || ''}
                onChange={(e) => handleAssignTechnician(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
            </div>

            {ticket.technician_phone && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Tech Contact:</span>
                <span className="font-semibold text-slate-800">{ticket.technician_phone}</span>
              </div>
            )}
          </div>

          {/* Customer Previous History Box */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-sky-600" /> Previous Complaint History ({customerHistory.length})
            </h3>

            <div className="divide-y divide-slate-100 text-xs">
              {customerHistory.length === 0 ? (
                <p className="text-slate-400 py-2">No prior complaints on record.</p>
              ) : (
                customerHistory.map(h => (
                  <div key={h.id} className="py-2.5">
                    <div className="flex justify-between items-center">
                      <Link to={`/helpdesk/tickets/${h.id}`} className="font-mono font-bold text-sky-600 hover:underline">
                        {h.ticket_number}
                      </Link>
                      <Badge size="sm">{h.status}</Badge>
                    </div>
                    <p className="font-semibold text-slate-800 mt-1">{h.category}</p>
                    <p className="text-[11px] text-slate-500 truncate">{h.description}</p>
                    {h.resolution && (
                      <p className="text-[10px] text-emerald-700 mt-0.5 italic">Resolved: {h.resolution}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
