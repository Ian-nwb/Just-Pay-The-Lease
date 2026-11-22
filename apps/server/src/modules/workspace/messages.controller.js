import * as messaging from '../../shared/services/workspaceMessaging.service.js';

const run = (fn, status = 200) => async (req, res) => {
  try { return res.status(status).json({ success: true, data: await fn(req) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Message request failed' }); }
};
export const listThreads = run((req) => messaging.listThreads(req.user));
export const listContacts = run((req) => messaging.listContacts(req.user));
export const createThread = run((req) => messaging.createThread(req.user, req.body), 201);
export const getThread = run((req) => messaging.getThread(req.user, req.params.id));
export const sendMessage = run((req) => messaging.sendMessage(req.user, req.params.id, req.body, req.file), 201);
