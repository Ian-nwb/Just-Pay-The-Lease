import mongoose from 'mongoose';

const workspaceMessageSchema = new mongoose.Schema({
  thread: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageThread', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, trim: true, maxlength: 5000, default: '' },
  attachments: [{ publicId: String, name: String, format: String, bytes: Number }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

workspaceMessageSchema.index({ thread: 1, createdAt: 1 });
export default mongoose.model('WorkspaceMessage', workspaceMessageSchema);
