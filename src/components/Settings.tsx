import React, { useState, useEffect } from 'react';
import { getProfile, saveProfile, defaultProfile } from '../store';
import { BusinessProfile, CloudBackup } from '../types';
import { Store, MapPin, Phone, FileText, Percent, Save, Image as ImageIcon, User, LogOut, Loader2, CreditCard, Users, Mail, Trash2, Cloud, DownloadCloud, FileSignature } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { useSubscribe } from '../hooks/useSubscribe';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { createCloudBackup, getRecentBackups, restoreFromBackup, downloadBackupFile, restoreFromLocalFile, BackupMetadata } from '../backup';
import { useRef } from 'react';
import { processImageUpload } from '../utils/image';

function BackupSettings() {
  const { appUser, currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [backupMsg, setBackupMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAutoBackupDate = localStorage.getItem('quickbill_last_backup_date');
  const uid = currentUser?.uid || appUser?.id;

  const fetchBackups = async () => {
    if (!uid) return;
    try {
      const data = await getRecentBackups(uid);
      setBackups(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, [uid]);

  const handleBackupNow = async () => {
    if (!uid) {
      downloadBackupFile();
      setBackupMsg('Downloaded local backup file.');
      setTimeout(() => setBackupMsg(''), 3000);
      return;
    }
    setLoading(true);
    setBackupMsg('');
    try {
      await createCloudBackup(uid);
      const today = new Date().toDateString();
      localStorage.setItem('quickbill_last_backup_date', today);
      setBackupMsg('Backup saved to Cloud successfully!');
      await fetchBackups();
    } catch (err: any) {
      console.error('Backup error:', err);
      // Fallback to downloading file if cloud fails
      downloadBackupFile();
      setBackupMsg('Cloud backup issue: downloaded local backup file as safety net.');
    } finally {
      setLoading(false);
      setTimeout(() => setBackupMsg(''), 4000);
    }
  };

  const handleRestore = async (backupId: string) => {
    if (!window.confirm('WARNING: Restoring will replace your current local records with the selected backup snapshot. Are you sure you want to proceed?')) return;
    setLoading(true);
    setBackupMsg('Restoring data...');
    try {
      await restoreFromBackup(backupId, uid || '');
      setBackupMsg('Restored successfully! Refreshing...');
    } catch (err: any) {
      console.error(err);
      setBackupMsg(err?.message || 'Restore failed.');
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('WARNING: Restoring from this file will overwrite your local business data. Proceed?')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setLoading(true);
    setBackupMsg('Importing file...');
    try {
      await restoreFromLocalFile(file);
      setBackupMsg('Restored successfully! Refreshing...');
    } catch (err: any) {
      console.error(err);
      setBackupMsg(err?.message || 'Failed to restore file.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-indigo-600" /> Cloud & Local Data Backup
          </h3>
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Auto-daily active
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Automatic cloud safety net for your bills, catalog, customers, purchases, and expenses.
          {lastAutoBackupDate ? ` (Last daily backup: ${lastAutoBackupDate})` : ''}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <button 
            onClick={handleBackupNow}
            disabled={loading}
            className="w-full bg-indigo-600 text-white rounded-xl py-2.5 font-bold hover:bg-indigo-700 transition-all text-xs disabled:opacity-75 flex items-center justify-center gap-2 shadow-sm"
          >
            {loading && backupMsg === '' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            Backup Now
          </button>

          <button
            onClick={downloadBackupFile}
            type="button"
            className="w-full bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl py-2.5 font-bold transition-all text-xs flex items-center justify-center gap-2"
          >
            <DownloadCloud className="w-4 h-4 text-slate-600" />
            Download JSON Export
          </button>
        </div>

        {backupMsg && (
          <div className={`p-2.5 rounded-xl text-xs font-bold text-center ${backupMsg.toLowerCase().includes('fail') ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            {backupMsg}
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Restore from Backup</h4>
            <div>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".json,application/json" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Upload JSON Backup
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {backups.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No cloud backups recorded yet. Click "Backup Now" to create your first safety snapshot.
              </p>
            ) : (
              backups.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/70 rounded-xl transition-colors">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-800">
                        {new Date(b.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {b.source === 'local' && (
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                          cached
                        </span>
                      )}
                    </div>
                    {b.summary && (
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {b.summary.invoices} bills • {b.summary.catalog} items • {b.summary.purchases} purchases • {b.summary.expenses} expenses
                      </p>
                    )}
                  </div>
                  <button 
                    onClick={() => handleRestore(b.id)}
                    disabled={loading}
                    className="shrink-0 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-700 text-slate-700 rounded-lg transition-all font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-indigo-600" /> Restore
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function TeamSettings() {
  const { appUser } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<{ id: string, email: string, type: 'active' | 'invited' }[]>([]);

  useEffect(() => {
    if (!appUser) return;
    const fetchTeam = async () => {
      // Fetch active users
      const usersQ = query(collection(db, 'users'), where('ownerId', '==', appUser.id));
      const usersSnap = await getDocs(usersQ);
      const activeMembers = usersSnap.docs.map(d => ({ id: d.id, email: d.data().email, type: 'active' as const }));

      // Fetch pending invitations
      const invitesQ = query(collection(db, 'invitations'), where('ownerId', '==', appUser.id));
      const invitesSnap = await getDocs(invitesQ);
      const pendingMembers = invitesSnap.docs.map(d => ({ id: d.id, email: d.data().email, type: 'invited' as const }));

      setMembers([...activeMembers, ...pendingMembers]);
    };
    fetchTeam();
  }, [appUser]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !appUser) return;
    setLoading(true);
    try {
      // Check if already invited or active
      if (members.some(m => m.email.toLowerCase() === email.toLowerCase())) {
        alert('User is already invited or active.');
        setLoading(false);
        return;
      }
      const docRef = await addDoc(collection(db, 'invitations'), {
        email: email.toLowerCase(),
        ownerId: appUser.id,
        createdAt: Date.now()
      });
      setMembers(prev => [...prev, { id: docRef.id, email: email.toLowerCase(), type: 'invited' }]);
      setEmail('');
    } catch (err) {
      console.error(err);
      alert('Failed to send invite.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (member: { id: string, email: string, type: 'active' | 'invited' }) => {
    if (!window.confirm(`Are you sure you want to remove ${member.email}?`)) return;
    setLoading(true);
    try {
      if (member.type === 'invited') {
        await deleteDoc(doc(db, 'invitations', member.id));
      } else {
        // Remove active user from team by clearing ownerId
        await updateDoc(doc(db, 'users', member.id), { ownerId: null, role: 'owner' });
      }
      setMembers(prev => prev.filter(m => m.id !== member.id));
    } catch (err) {
      console.error(err);
      alert('Failed to remove user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" /> Team Members
        </h3>
        <p className="text-xs text-slate-500 mb-4">Invite staff to create bills under your account. They will not see Settings or P&L.</p>
        
        <form onSubmit={handleInvite} className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="email" 
              required
              placeholder="Staff email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 font-bold hover:bg-indigo-700 transition-all text-sm disabled:opacity-75 flex shrink-0 items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
          </button>
        </form>

        <div className="space-y-2">
          {members.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl border border-slate-100">No team members yet.</p>
          ) : (
            members.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{m.email}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${m.type === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {m.type === 'active' ? 'Active' : 'Pending Invite'}
                  </p>
                </div>
                <button 
                  onClick={() => handleRemove(m)}
                  disabled={loading}
                  className="p-2 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsTab() {
  const [profile, setProfile] = useState<BusinessProfile>(defaultProfile);
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [signatureError, setSignatureError] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const { appUser } = useAuth();
  const { handleSubscribe, loading, loadingText } = useSubscribe();

  useEffect(() => {
    const refresh = () => setProfile(getProfile());
    refresh();
    window.addEventListener('quickbill-data-updated', refresh);
    return () => window.removeEventListener('quickbill-data-updated', refresh);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => ({
      ...prev,
      [name]: name === 'defaultGstRate' ? Number(value) : value,
    }));
    setSaved(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    try {
      setLogoLoading(true);
      const compressed = await processImageUpload(file, {
        maxWidth: 500,
        maxHeight: 500,
        maxSizeBytes: 1024 * 1024,
        nameForError: 'Logo'
      });
      setProfile((prev) => ({ ...prev, logoDataUrl: compressed }));
      setSaved(false);
    } catch (err: any) {
      setLogoError(err?.message || 'Could not process logo');
    } finally {
      setLogoLoading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureError('');
    try {
      setSignatureLoading(true);
      const compressed = await processImageUpload(file, {
        maxWidth: 600,
        maxHeight: 200,
        maxSizeBytes: 1024 * 1024,
        nameForError: 'Signature'
      });
      setProfile((prev) => ({ ...prev, signatureDataUrl: compressed }));
      setSaved(false);
    } catch (err: any) {
      setSignatureError(err?.message || 'Could not process signature');
    } finally {
      setSignatureLoading(false);
      if (signatureInputRef.current) signatureInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = () => {
    signOut(auth);
  };

  let isTrial = false;
  let isExpired = false;
  let isActive = false;
  let daysRemaining = 0;
  
  if (appUser?.role === 'staff') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center mt-12">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-500 text-sm">Staff members do not have permission to view Settings.</p>
      </div>
    );
  }
  
  if (appUser) {
    if (appUser.subscription_status === 'trial') isTrial = true;
    if (appUser.subscription_status === 'expired') isExpired = true;
    if (appUser.subscription_status === 'active') isActive = true;
    
    if (isTrial || isExpired) {
      const trialDays = 3;
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysSinceStart = (now - appUser.trial_start_date) / msPerDay;
      daysRemaining = Math.max(0, Math.ceil(trialDays - daysSinceStart));
      if (daysRemaining <= 0) {
        isTrial = false;
        isExpired = true;
      }
    }
  }

  return (
    <div className="pb-24 pt-6 px-4 max-w-lg lg:max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage store details, tax settings, security, and account</p>
        </div>
        <button 
          onClick={handleSave}
          className={`hidden sm:flex px-5 py-2.5 rounded-xl font-bold text-white shadow-sm transition-all items-center gap-2 text-sm ${
            saved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
          }`}
        >
          {saved ? <>Saved Successfully!</> : <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Account, Subscription & Security */}
        <div className="lg:col-span-5 space-y-6">
          {appUser && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 truncate max-w-[170px]">{appUser.email}</p>
                    <p className="text-xs text-slate-400 font-medium">Store Owner Account</p>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors font-bold text-xs flex items-center gap-1 border border-transparent hover:border-rose-100"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
              
              <div className="border-t border-slate-100 pt-4 mt-2">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Subscription Status</h3>
                </div>
                
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                    isActive ? 'bg-emerald-100 text-emerald-800' :
                    isTrial ? 'bg-amber-100 text-amber-800' :
                    'bg-rose-100 text-rose-800'
                  }`}>
                    {isActive ? 'Active Plan' : isTrial ? 'Free Trial' : 'Expired'}
                  </span>
                  <span className="text-xs text-slate-600 font-semibold">
                    {isActive ? '— Renews monthly' : isTrial ? `— ${daysRemaining} days remaining` : '— Subscription required'}
                  </span>
                </div>
                
                {isActive ? (
                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    You're subscribed. Please contact support to manage or cancel your subscription.
                  </p>
                ) : (
                  <button 
                    onClick={handleSubscribe} 
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold hover:bg-indigo-700 transition-all disabled:opacity-75 flex items-center justify-center gap-2 shadow-sm text-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {loadingText}
                      </>
                    ) : (
                      'Subscribe Now — ₹2000/month'
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Team Settings */}
          {appUser?.role === 'owner' && <TeamSettings />}

          {/* Security PIN */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Security Lock</h3>
            <p className="text-xs text-slate-500 mb-3">Set an optional 4-digit PIN to lock sensitive screens like Profit & Loss.</p>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">App PIN (Optional)</label>
            <input 
              type="password" 
              name="pinCode"
              inputMode="numeric"
              pattern="[0-9]*"
              value={profile.pinCode || ''} 
              onChange={handleChange}
              placeholder="e.g. 1234"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm font-bold tracking-widest"
            />
          </div>

          {/* Backup Settings */}
          {appUser?.role === 'owner' && <BackupSettings />}

          {/* Receipt Customization */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Receipt Customization</h3>
              <p className="text-xs text-slate-500 mb-3">Add a payment QR code and terms to printed/shared invoices.</p>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">UPI ID (For QR Code)</label>
                  <input 
                    type="text" 
                    name="upiId"
                    value={profile.upiId || ''} 
                    onChange={handleChange}
                    placeholder="e.g. shopname@upi"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Terms & Conditions</label>
                  <textarea 
                    name="termsText"
                    value={profile.termsText || ''} 
                    onChange={handleChange}
                    rows={2}
                    placeholder="e.g. Goods once sold will not be taken back."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Business & Shop Profile Details */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Business Profile</h3>

            {/* Shop Logo */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Shop Logo</label>
                <span className="text-[11px] text-slate-400">PNG or JPG, max 1 MB</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {profile.logoDataUrl ? (
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-white p-1 flex items-center justify-center shrink-0 shadow-xs">
                    <img src={profile.logoDataUrl} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-[10px] mt-1 font-medium">No Logo</span>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoLoading}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold active:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {logoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      {profile.logoDataUrl ? 'Replace' : 'Upload Logo'}
                    </button>
                    {profile.logoDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfile((p) => ({ ...p, logoDataUrl: undefined }));
                          setSaved(false);
                          setLogoError('');
                        }}
                        className="text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  {logoError && (
                    <p className="text-xs text-rose-600 font-semibold">{logoError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Authorized Signature */}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <FileSignature className="w-3.5 h-3.5 text-indigo-600" /> Authorized Signature
                </label>
                <span className="text-[11px] text-slate-400">PNG or JPG, max 1 MB</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Appears on your bills and receipts above the "Authorized Signatory" line.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {profile.signatureDataUrl ? (
                  <div className="relative w-48 h-20 rounded-xl overflow-hidden border border-slate-200 bg-white p-2 flex items-center justify-center shrink-0 shadow-xs">
                    <img
                      src={profile.signatureDataUrl}
                      alt="Signature Preview"
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-20 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 shrink-0">
                    <FileSignature className="w-6 h-6 text-slate-300" />
                    <span className="text-[10px] mt-1 font-medium text-slate-400">No Signature Added</span>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => signatureInputRef.current?.click()}
                      disabled={signatureLoading}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {signatureLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileSignature className="w-3.5 h-3.5" />
                      )}
                      {profile.signatureDataUrl ? 'Replace' : 'Upload Signature'}
                    </button>
                    {profile.signatureDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfile((p) => ({ ...p, signatureDataUrl: undefined }));
                          setSaved(false);
                          setSignatureError('');
                        }}
                        className="text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={handleSignatureUpload}
                  />
                  {signatureError && (
                    <p className="text-xs text-rose-600 font-semibold">{signatureError}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Store className="w-3.5 h-3.5" /> Shop Name</label>
                <input 
                  type="text" 
                  name="shopName" 
                  value={profile.shopName} 
                  onChange={handleChange}
                  placeholder="e.g. Sharma Electronics"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Address</label>
                <input 
                  type="text" 
                  name="address" 
                  value={profile.address} 
                  onChange={handleChange}
                  placeholder="e.g. 123 Main Market, New Delhi"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Phone Number</label>
                <input 
                  type="tel" 
                  name="phone" 
                  value={profile.phone} 
                  onChange={handleChange}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> GSTIN</label>
                <input 
                  type="text" 
                  name="gstin" 
                  value={profile.gstin} 
                  onChange={handleChange}
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Percent className="w-3.5 h-3.5" /> Default GST Rate (%)</label>
                <input 
                  type="number" 
                  name="defaultGstRate" 
                  value={profile.defaultGstRate} 
                  onChange={handleChange}
                  placeholder="18"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm font-bold"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            className={`w-full py-3.5 rounded-xl font-bold text-white shadow-sm transition-all flex items-center justify-center gap-2 text-sm ${
              saved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
            }`}
          >
            {saved ? (
              <>Saved Successfully!</>
            ) : (
              <><Save className="w-4 h-4" /> Save Profile Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
