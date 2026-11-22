import React, { useState } from 'react';
import { Building2, ArrowRight, CheckCircle2, Mail } from 'lucide-react';

export const Footer = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!email) return;

    // Trigger Mailto client email prompt
    const subject = encodeURIComponent('Platform & Enterprise Solution Inquiry');
    const body = encodeURIComponent(
      `Hello JPTL Engineering & Operations Team,\n\n` +
      `I am reaching out regarding a platform inquiry or custom landlord deployment.\n\n` +
      `Contact Email: ${email}\n\n` +
      `Best regards,`
    );

    window.location.href = `mailto:inquiry@jptl.system?subject=${subject}&body=${body}`;

    setSubscribed(true);
    setTimeout(() => {
      setSubscribed(false);
      setEmail('');
    }, 4000);
  };

  return (
    <footer className="border-t border-slate-200 dark:border-white/10 pt-20 pb-12 font-sans relative overflow-hidden text-slate-700 dark:text-slate-300 transition-colors duration-300">

      {/* Background Ambient Glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Email Inquiry Banner (Replaced Systems Integration Project Banner) */}
        <div className="p-8 sm:p-10 rounded-3xl bg-white dark:bg-surface-sunken border border-slate-200 dark:border-white/10 shadow-xl mb-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center spotlight-card">

          <div className="lg:col-span-7 space-y-2">
            <h3 className="font-grotesk text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Have questions or need a custom solution?
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-normal max-w-lg">
              Send an inquiry directly to our systems & engineering team for custom landlord onboarding, firm deployment, or technical specifications.
            </p>
          </div>

          <div className="lg:col-span-5">
            {subscribed ? (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span>Inquiry email prepared! Our team will get back to you within 24 hours.</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your work email address..."
                    className="w-full bg-slate-50 dark:bg-surface-hover border border-slate-300 dark:border-slate-800 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary active:scale-[0.97] text-xs font-grotesk flex items-center justify-center gap-2 shrink-0"
                >
                  <span>Send Inquiry</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>

        </div>

        {/* Multi-Column Directory Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-16 border-b border-slate-200 dark:border-white/10">

          {/* Brand & Mission Column */}
          <div className="md:col-span-4 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-[var(--l-primary)] text-[var(--l-primary-ink)] flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
              <span className="font-grotesk font-semibold text-lg text-[var(--l-ink)] tracking-tight">JPTL</span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal max-w-sm">
              Rent, leases and maintenance for residential landlords and the people who live in their buildings.
            </p>

          </div>

          {/* Links Columns */}
          <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8 font-grotesk text-xs">

            <div>
              <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-widest text-xs mb-4">
                For
              </h4>
              <ul className="space-y-3 font-sans text-slate-600 dark:text-slate-400 text-xs">
                <li><a href="#roles" className="hover:text-slate-900 dark:hover:text-white transition-colors">Residents</a></li>
                <li><a href="#roles" className="hover:text-slate-900 dark:hover:text-white transition-colors">Landlords</a></li>
                <li><a href="#roles" className="hover:text-slate-900 dark:hover:text-white transition-colors">Property staff</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-widest text-xs mb-4">
                Product
              </h4>
              <ul className="space-y-3 font-sans text-slate-600 dark:text-slate-400 text-xs">
                <li><a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">Rent collection</a></li>
                <li><a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">Maintenance requests</a></li>
                <li><a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">Leases &amp; documents</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-widest text-xs mb-4">
                Quick Navigation
              </h4>
              <ul className="space-y-3 font-sans text-slate-600 dark:text-slate-400 text-xs">
                <li><a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">System Capabilities</a></li>
                <li><a href="#pricing" className="hover:text-slate-900 dark:hover:text-white transition-colors">Tiered Pricing</a></li>
                <li><a href="#testimonials" className="hover:text-slate-900 dark:hover:text-white transition-colors">Testimonials</a></li>
              </ul>
            </div>

          </div>

        </div>

        {/* Bottom Legal & Copyright Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
          <div>
            &copy; {new Date().getFullYear()} JPTL Living System &bull; All Rights Reserved
          </div>
          <div className="flex items-center gap-6 text-xs">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security Architecture</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
