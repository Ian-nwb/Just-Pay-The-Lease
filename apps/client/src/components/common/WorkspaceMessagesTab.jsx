import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Paperclip, Send } from 'lucide-react';
import { workspaceMessagesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const ROLE_LABEL = { landlord: 'Landlord', property_manager: 'Property manager', technician: 'Technician', tenant: 'Resident' };

export function WorkspaceMessagesTab() {
  const [contacts, setContacts] = useState([]); const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState(''); const [conversation, setConversation] = useState(null);
  const [contactKey, setContactKey] = useState(''); const [body, setBody] = useState(''); const [attachment, setAttachment] = useState(null); const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { user } = useAuth();
  const selectedContact = useMemo(() => contacts.find((contact) => `${contact.id}:${contact.propertyId}:${contact.unitId || ''}` === contactKey), [contacts, contactKey]);
  const refresh = async () => { const [contactResult, threadResult] = await Promise.all([workspaceMessagesApi.getContacts(), workspaceMessagesApi.getThreads()]); setContacts(contactResult.data || []); setThreads(threadResult.data || []); };
  useEffect(() => { refresh().catch((error) => toast.error(error.message || 'Could not load conversations')); }, []);
  const openThread = async (id) => { setSelectedId(id); try { const result = await workspaceMessagesApi.getThread(id); setConversation(result.data); } catch (error) { toast.error(error.message); } };
  const startConversation = async () => {
    if (!selectedContact) return;
    setBusy(true);
    try { const result = await workspaceMessagesApi.createThread({ participantId: selectedContact.id, propertyId: selectedContact.propertyId, ...(selectedContact.unitId ? { unitId: selectedContact.unitId } : {}) }); await refresh(); await openThread(result.data._id); }
    catch (error) { toast.error(error.message || 'Could not start conversation'); } finally { setBusy(false); }
  };
  const send = async (event) => {
    event.preventDefault(); if (!conversation) return; setBusy(true);
    try { const form = new FormData(); form.append('body', body); if (attachment) form.append('attachment', attachment); await workspaceMessagesApi.sendMessage(conversation._id, form); setBody(''); setAttachment(null); await openThread(conversation._id); await refresh(); }
    catch (error) { toast.error(error.message || 'Could not send message'); } finally { setBusy(false); }
  };
  const contactName = (thread) => { const currentUserId = String(user?.id || user?._id || ''); const partner = thread.participants?.find((participant) => String(participant._id) !== currentUserId); return partner ? `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || partner.role : 'Conversation'; };
  return <section className="space-y-4">
    <header><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Messages</h1><p className="mt-1 text-sm text-slate-500">Private conversations with people assigned to your property workspace.</p></header>
    <div className="grid min-h-[540px] overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-surface md:grid-cols-[280px_1fr]">
      <aside className="border-b border-slate-200 p-3 dark:border-slate-800 md:border-b-0 md:border-r"><label className="block text-xs font-semibold">Start a conversation<select value={contactKey} onChange={(event) => setContactKey(event.target.value)} className="mt-2 w-full rounded-xl border bg-transparent p-2.5 text-xs"><option value="">Choose who to message</option>{contacts.map((contact) => <option key={`${contact.id}:${contact.propertyId}:${contact.unitId || ''}`} value={`${contact.id}:${contact.propertyId}:${contact.unitId || ''}`}>{contact.name} — {ROLE_LABEL[contact.role] || contact.role} · {contact.propertyName}{contact.unitLabel ? ` · ${contact.unitLabel}` : ''}</option>)}</select></label><button disabled={!selectedContact || busy} onClick={startConversation} className="btn btn-brand mt-2 w-full text-xs">Open conversation</button><div className="mt-4 space-y-1">{threads.map((thread) => <button key={thread._id} onClick={() => openThread(thread._id)} className={`w-full rounded-xl p-3 text-left ${selectedId === thread._id ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}><span className="block truncate text-sm font-semibold">{contactName(thread)}</span><span className="mt-1 block truncate text-xs text-slate-500">{thread.property?.name}{thread.unit?.label ? ` · ${thread.unit.label}` : ''}</span></button>)}{!threads.length && <p className="p-3 text-xs text-slate-500">Your conversations will appear here.</p>}</div></aside>
      <div className="flex min-h-[500px] flex-col"><div className="border-b border-slate-200 p-4 font-semibold dark:border-slate-800">{conversation ? `${conversation.property?.name || 'Property'}${conversation.unit?.label ? ` · ${conversation.unit.label}` : ''}` : 'Select a conversation'}</div><div className="flex-1 space-y-3 overflow-y-auto p-4">{(conversation?.messages || []).map((message) => <article key={message._id} className="max-w-[85%] rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><p className="text-[11px] font-semibold text-indigo-600">{message.sender?.firstName} {message.sender?.lastName} · {message.sender?.role}</p>{message.body && <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>}{message.attachments?.map((file) => <a key={file.publicId} href={file.url} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-indigo-600">Attachment: {file.name}</a>)}<time className="mt-1 block text-[10px] text-slate-500">{new Date(message.createdAt).toLocaleString()}</time></article>)}{conversation && !conversation.messages?.length && <p className="py-12 text-center text-sm text-slate-500">This conversation is ready. Send the first message.</p>}{!conversation && <div className="grid h-full place-content-center text-center text-slate-500"><MessageCircle className="mx-auto mb-2"/><p className="text-sm">Choose a thread or start a conversation.</p></div>}</div><form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800"><label className="flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-xl border px-3 text-xs"><Paperclip size={15}/><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setAttachment(event.target.files?.[0] || null)} className="sr-only"/>{attachment ? '1 file' : 'Attach'}</label><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} disabled={!conversation} placeholder="Write a message…" className="min-h-11 flex-1 resize-y rounded-xl border bg-transparent p-3 text-sm" rows={1}/><button disabled={!conversation || (!body.trim() && !attachment) || busy} aria-label="Send message" className="btn btn-brand btn-icon flex h-11 w-11 shrink-0 items-center justify-center"><Send size={17}/></button></form></div>
    </div>
  </section>;
}
