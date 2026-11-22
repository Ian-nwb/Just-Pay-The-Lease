import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../../../app.js';
import User from '../../shared/models/user.model.js';
import Property from '../../shared/models/property.model.js';
import Unit from '../../shared/models/unit.model.js';
import Lease from '../../shared/models/lease.model.js';
import Payment from '../../shared/models/payment.model.js';
import InventoryItem from '../../shared/models/inventoryItem.model.js';
import WorkspaceMessage from '../../shared/models/workspaceMessage.model.js';
import MessageThread from '../../shared/models/messageThread.model.js';

let memoryServer;
let landlord;
let tenant;
let unrelatedTenant;
let property;
let unit;
let payment;
let landlordToken;
let tenantToken;
let unrelatedToken;

function tokenFor(user) {
  return jwt.sign({ id: user._id, _id: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase3-4-isolated-test-secret';
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  landlord = await User.create({ firstName: 'Lana', lastName: 'Owner', email: 'phase34-landlord@example.test', password: 'Password123!', role: 'landlord', status: 'active' });
  tenant = await User.create({ firstName: 'Tess', lastName: 'Resident', email: 'phase34-tenant@example.test', password: 'Password123!', role: 'tenant', status: 'active' });
  unrelatedTenant = await User.create({ firstName: 'Una', lastName: 'Other', email: 'phase34-other@example.test', password: 'Password123!', role: 'tenant', status: 'active' });
  landlordToken = tokenFor(landlord); tenantToken = tokenFor(tenant); unrelatedToken = tokenFor(unrelatedTenant);
  property = await Property.create({ name: 'Phase 3-4 House', address: '1 Test Street', city: 'Manila', landlord: landlord._id });
  unit = await Unit.create({ label: 'Unit Test 1', property: property._id, tenant: tenant._id, monthlyRent: 1000, sqft: 400, status: 'occupied', utilityBilling: [{ utilityType: 'water', billingMode: 'shared_meter', monthlyShare: 100 }] });
  await Lease.create({ tenant: tenant._id, landlord: landlord._id, property: property._id, unit: unit._id, leaseStart: new Date(Date.now() - 86400000), leaseEnd: new Date(Date.now() + 180 * 86400000), monthlyRent: 1000, status: 'active' });
  payment = await Payment.create({ tenant: tenant._id, unit: unit._id, property: property._id, amount: 1100, dueDate: new Date(Date.now() + 86400000), status: 'pending', period: 'Phase 3-4 test rent' });
});

afterAll(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe('Phase 3-4: balances, IOUs, workspace messages, and unit inventory', () => {
  it('allocates a partial payment and keeps the remainder due after approval', async () => {
    const submit = await request(app).post(`/api/tenant/payments/${payment._id}/pay-onsite`).set('Authorization', `Bearer ${tenantToken}`).send({ amount: 400, note: 'Partial amount' });
    expect(submit.status).toBe(201);
    const review = await request(app).patch(`/api/landlord/rentroll/${payment._id}/review`).set('Authorization', `Bearer ${landlordToken}`).send({ action: 'approve' });
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe('partially_paid');
    expect(review.body.data.paidAmount).toBe(400);
    expect(review.body.data.outstandingBalance).toBe(700);
  });

  it('approves an IOU as a promise without marking the invoice paid', async () => {
    const create = await request(app).post(`/api/tenant/payments/${payment._id}/ious`).set('Authorization', `Bearer ${tenantToken}`).send({ amount: 700, reason: 'Salary is delayed this week', proposedDueDate: new Date(Date.now() + 7 * 86400000).toISOString() });
    expect(create.status).toBe(201);
    const review = await request(app).patch(`/api/landlord/rentroll/ious/${create.body.data._id}/review`).set('Authorization', `Bearer ${landlordToken}`).send({ action: 'approve' });
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe('approved');
    expect((await Payment.findById(payment._id)).status).toBe('partially_paid');
  });

  it('restricts conversation creation to people connected to the same property', async () => {
    const opened = await request(app).post('/api/workspace/messages/threads').set('Authorization', `Bearer ${tenantToken}`).send({ participantId: landlord._id, propertyId: property._id, unitId: unit._id });
    expect(opened.status).toBe(201);
    const readByParticipant = await request(app).get(`/api/workspace/messages/threads/${opened.body.data._id}`).set('Authorization', `Bearer ${landlordToken}`);
    expect(readByParticipant.status).toBe(200);
    const denied = await request(app).get(`/api/workspace/messages/threads/${opened.body.data._id}`).set('Authorization', `Bearer ${unrelatedToken}`);
    expect(denied.status).toBe(404);
    expect(await WorkspaceMessage.countDocuments({ thread: opened.body.data._id })).toBe(0);
  });

  it('lets the owning landlord retain read access to message history after a staff member is removed', async () => {
    const formerManager = await User.create({ firstName: 'Maya', lastName: 'Manager', email: 'phase34-former-manager@example.test', password: 'Password123!', role: 'staff', staffType: 'property_manager', landlord: landlord._id, propertyAssignments: [property._id], status: 'suspended' });
    const thread = await MessageThread.create({ property: property._id, unit: unit._id, participants: [tenant._id, formerManager._id], participantKey: `${property._id}:${unit._id}:${tenant._id}:${formerManager._id}` });
    await WorkspaceMessage.create({ thread: thread._id, sender: tenant._id, body: 'Move-in inventory question', readBy: [tenant._id] });
    const ownerRead = await request(app).get(`/api/workspace/messages/threads/${thread._id}`).set('Authorization', `Bearer ${landlordToken}`);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.data.messages[0].body).toBe('Move-in inventory question');
    const formerManagerToken = tokenFor(formerManager);
    const formerManagerRead = await request(app).get(`/api/workspace/messages/threads/${thread._id}`).set('Authorization', `Bearer ${formerManagerToken}`);
    expect(formerManagerRead.status).toBe(401);
  });

  it('lets the current tenant dispute a recorded item while preserving it for landlord review', async () => {
    const item = await InventoryItem.create({ property: property._id, unit: unit._id, lease: await Lease.findOne({ tenant: tenant._id }).then((lease) => lease._id), label: 'Bedroom cabinet', condition: 'good', createdBy: landlord._id });
    const list = await request(app).get('/api/tenant/inventory').set('Authorization', `Bearer ${tenantToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((row) => String(row._id) === String(item._id))).toBe(true);
    const response = await request(app).patch(`/api/tenant/inventory/${item._id}/response`).set('Authorization', `Bearer ${tenantToken}`).send({ response: 'disputed', note: 'Door hinge was already loose' });
    expect(response.status).toBe(200);
    expect(response.body.data.tenantResponse).toBe('disputed');
  });
});
