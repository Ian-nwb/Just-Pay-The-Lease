import React, { useState } from 'react';
import { PaymentsTab } from './PaymentsTab';
import { PaymentOptionsTab } from './PaymentOptionsTab';
import { UtilityBillsTab } from './UtilityBillsTab';

const VIEWS = [
  { key: 'rent', label: 'Rent roll & review' },
  { key: 'utilities', label: 'Utility bills' },
  { key: 'options', label: 'Payment options' },
];

export const LandlordPaymentsPage = ({ payments, searchQuery }) => {
  const [view, setView] = useState('rent');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === v.key ? 'bg-brand text-brand-ink' : 'border border-slate-200 dark:border-slate-800'}`}>{v.label}</button>
        ))}
      </div>
      {view === 'rent' && <PaymentsTab payments={payments} searchQuery={searchQuery} />}
      {view === 'utilities' && <UtilityBillsTab />}
      {view === 'options' && <PaymentOptionsTab />}
    </div>
  );
};
