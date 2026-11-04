import { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Cpu, 
  TrendingUp, 
  ArrowRight, 
  ExternalLink, 
  Lock, 
  Sparkles, 
  CheckCircle2, 
  Activity, 
  Terminal, 
  RefreshCw, 
  Wallet, 
  Plus, 
  Filter, 
  Search, 
  Clock, 
  Check, 
  Copy, 
  ChevronDown, 
  Globe, 
  Zap, 
  Server, 
  Radio, 
  X,
  AlertCircle
} from 'lucide-react';
import type { 
  OracleRequestItem, 
  EnclaveNodeItem, 
  AccountOption, 
  Market, 
  OracleResolutionData, 
  RequestStatus 
} from './types';
import { 
  INITIAL_ACCOUNTS, 
  INITIAL_ENCLAVES, 
  INITIAL_ORACLE_REQUESTS, 
  FALLBACK_MARKETS_DATA 
} from './mockData';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

export default function App() {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'oracle' | 'markets' | 'hardware'>('oracle');
  const [activeNetwork, setActiveNetwork] = useState<'mainnet' | 'testnet'>('mainnet');

  // Accounts state
  const [accounts, setAccounts] = useState<AccountOption[]>(INITIAL_ACCOUNTS);
  const [currentAccount, setCurrentAccount] = useState<AccountOption>(INITIAL_ACCOUNTS[0]);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  // Helper to dynamically deduct balance on bets and oracle bounties
  const deductBalance = (nearAmount: number) => {
    setCurrentAccount(prev => {
      const match = prev.nearBalance.match(/([0-9.]+)/);
      const currentVal = match ? parseFloat(match[1]) : 42.5;
      const newVal = Math.max(0, currentVal - nearAmount).toFixed(2);
      const updated = { ...prev, nearBalance: `${newVal} NEAR` };
      setAccounts(accList => accList.map(a => a.accountId === prev.accountId ? updated : a));
      return updated;
    });
  };

  // Oracle Requests state
  const [requests, setRequests] = useState<OracleRequestItem[]>(INITIAL_ORACLE_REQUESTS);
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

  // Hardware Enclaves state
  const [enclaves, setEnclaves] = useState<EnclaveNodeItem[]>(INITIAL_ENCLAVES);

  // Markets state (Tab 2)
  const [markets, setMarkets] = useState<Market[]>(FALLBACK_MARKETS_DATA);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

  // Modals
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [showTEEInspectorModal, setShowTEEInspectorModal] = useState(false);
  const [activeAttestationData, setActiveAttestationData] = useState<{
    title: string;
    targetId: string;
    resolution?: OracleResolutionData | null;
    marketAnalysis?: Market['ai_analysis'];
  } | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [betSide, setBetSide] = useState<'BUY_YES' | 'BUY_NO'>('BUY_YES');
  const [betAmount, setBetAmount] = useState<number>(50);
  const [isExecutingBet, setIsExecutingBet] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    intent_id: string;
    status: string;
    execution_mode?: string;
    derived_polygon_address?: string;
    polygon_tx_hash?: string | null;
    clob_order_hash?: string;
    explorer_url: string;
    near_mpc_explorer_url?: string;
    eip712_digest?: string;
    mpc_sign_request?: Record<string, unknown>;
    mpc_signature?: { r: string; s: string; v: number; sandbox_signer_address?: string };
  } | null>(null);

  // New Request Form State
  const [newQueryText, setNewQueryText] = useState('');
  const [newCategory, setNewCategory] = useState('Macro & Fed');
  const [newBountyNear, setNewBountyNear] = useState(2.5);
  const [newCallbackContract, setNewCallbackContract] = useState('');
  const [newCallbackMethod, setNewCallbackMethod] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // UI Toast Banner
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const syncOracleBackendState = async () => {
    try {
      const [reqRes, encRes, accRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/oracle/requests`),
        fetch(`${API_BASE_URL}/api/oracle/enclaves`),
        fetch(`${API_BASE_URL}/api/accounts`)
      ]);

      if (reqRes.ok) {
        const reqData = await reqRes.json();
        if (Array.isArray(reqData.requests) && reqData.requests.length > 0) {
          setRequests(reqData.requests);
        }
      }
      if (encRes.ok) {
        const encData = await encRes.json();
        if (Array.isArray(encData.enclaves) && encData.enclaves.length > 0) {
          setEnclaves(encData.enclaves);
        }
      }
      if (accRes.ok) {
        const accData = await accRes.json();
        if (Array.isArray(accData.accounts) && accData.accounts.length > 0) {
          setAccounts(accData.accounts);
          setCurrentAccount(prev => accData.accounts.find((a: AccountOption) => a.accountId === prev.accountId) || accData.accounts[0]);
        }
      }
    } catch {
      // Backend offline fallback
    }
  };

  const handleManualRefreshMarkets = async () => {
    setLoadingMarkets(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/markets`);
      if (res.ok) {
        const data = await res.json();
        if (data.markets && data.markets.length > 0) {
          setMarkets(data.markets);
        }
      }
    } catch {
      // Keep fallback
    } finally {
      setLoadingMarkets(false);
    }
  };

  // Fetch live Oracle requests, Enclaves, Accounts, and Polymarket events on mount
  useEffect(() => {
    let active = true;
    const loadAllData = async () => {
      await syncOracleBackendState();
      try {
        const res = await fetch(`${API_BASE_URL}/api/markets`);
        if (res.ok && active) {
          const data = await res.json();
          if (data.markets && data.markets.length > 0) {
            setMarkets(data.markets);
          }
        }
      } catch {
        // Fallback intact
      }
    };
    loadAllData();
    return () => {
      active = false;
    };
  }, []);

  // Genuine stats calculation directly from active requests and enclaves (no fake inflation)
  const stats = useMemo(() => {
    const totalRequests = requests.length;
    const pendingCount = requests.filter(r => r.status === 'PENDING').length;
    const resolvedCount = requests.filter(r => r.status === 'RESOLVED').length;
    const cancelledCount = requests.filter(r => r.status === 'CANCELLED').length;
    const totalBountiesPaidNear = requests
      .filter(r => r.status === 'RESOLVED')
      .reduce((sum, r) => sum + Number(r.bountyNear || 0), 0);
    const activeEnclavesCount = enclaves.filter(e => e.active).length;

    return {
      totalRequests,
      pendingCount,
      resolvedCount,
      cancelledCount,
      totalBountiesPaidNear,
      activeEnclavesCount
    };
  }, [requests, enclaves]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (requestFilter === 'PENDING' && r.status !== 'PENDING') return false;
      if (requestFilter === 'RESOLVED' && r.status !== 'RESOLVED') return false;
      if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        return r.query.toLowerCase().includes(q) || r.requester.toLowerCase().includes(q);
      }
      return true;
    });
  }, [requests, requestFilter, categoryFilter, searchQuery]);

  // Categories list
  const availableCategories = useMemo(() => {
    const cats = Array.from(new Set(requests.map(r => r.category)));
    return ['ALL', ...cats];
  }, [requests]);

  // Handle Trigger TEE Resolution (End-to-End Backend Resolve -> Fulfill Lifecycle)
  const handleTriggerResolution = async (req: OracleRequestItem) => {
    setResolvingRequestId(req.requestId);

    try {
      // Step 1: Execute TEE reasoning and cryptographic quote generation on backend
      const resolveRes = await fetch(`${API_BASE_URL}/api/oracle/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: req.requestId,
          query: req.query,
          category: req.category
        })
      });

      if (!resolveRes.ok) {
        throw new Error(`Resolve failed with status ${resolveRes.status}`);
      }
      const resolveData = await resolveRes.json();

      // Step 2: Fulfill on-chain resolution and release bounty via backend
      const fulfillRes = await fetch(`${API_BASE_URL}/api/oracle/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: req.requestId,
          outcome: resolveData.outcome,
          confidence_bps: resolveData.confidence_bps,
          attestation_hash: resolveData.tee_attestation.attestation_hash,
          enclave_measurement: resolveData.tee_attestation.enclave_measurement,
          evidence_digest: resolveData.evidence_digest,
          signer_address: resolveData.tee_attestation.attested_signing_address || resolveData.tee_attestation.signer_address,
          signed_text: resolveData.tee_attestation.signed_text,
          ecdsa_signature: resolveData.tee_attestation.ecdsa_signature,
          verification_mode: resolveData.tee_attestation.verification_mode,
          resolver: 'tee-node-intel-01.near',
          attestation_quote_b64: resolveData.tee_attestation.attestation_quote_b64,
          rationale: resolveData.rationale,
          evidence_sources: resolveData.evidence_sources
        })
      });

      if (!fulfillRes.ok) {
        throw new Error(`Fulfill failed with status ${fulfillRes.status}`);
      }
      const fulfillData = await fulfillRes.json();
      const verifiedRes: OracleResolutionData = fulfillData.resolution;

      setRequests(prev => prev.map(item => {
        if (item.requestId === req.requestId) {
          return {
            ...item,
            status: 'RESOLVED' as RequestStatus,
            resolvedAt: verifiedRes.resolvedAt,
            evidenceSources: resolveData.evidence_sources || item.evidenceSources,
            resolution: verifiedRes
          };
        }
        return item;
      }));

      // Refresh enclave stats
      await syncOracleBackendState();
      setResolvingRequestId(null);
      showToast(
        `Oracle Request #${req.requestId} fulfilled via TEE! Outcome: ${verifiedRes.outcome} (${(verifiedRes.confidenceBps / 100).toFixed(1)}%). Bounty ${req.bountyNear} NEAR paid to ${verifiedRes.resolver}.`,
        'success'
      );
    } catch (err) {
      setResolvingRequestId(null);
      showToast(
        `Backend service unreachable (${err instanceof Error ? err.message : 'offline'}). Ensure agent.py is running on ${API_BASE_URL}.`,
        'info'
      );
    }
  };

  // Handle Submit New Oracle Query (End-to-End Backend Creation)
  const handleSubmitNewQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQueryText.trim()) return;

    setIsSubmittingRequest(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/oracle/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: newQueryText.trim(),
          category: newCategory,
          bounty_near: newBountyNear,
          requester: currentAccount.accountId,
          callback_contract: newCallbackContract.trim() || null,
          callback_method: newCallbackMethod.trim() || null
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const createdReq: OracleRequestItem = {
        ...data.request,
        resolution: null
      };

      deductBalance(newBountyNear);
      setRequests(prev => [createdReq, ...prev]);
      setIsSubmittingRequest(false);
      setShowNewRequestModal(false);
      setNewQueryText('');
      showToast(
        `Oracle Inquiry submitted! Request ID: ${createdReq.requestId} (${newBountyNear} NEAR bounty locked from ${currentAccount.accountId}).`,
        'success'
      );
    } catch (err) {
      setIsSubmittingRequest(false);
      showToast(
        `Could not reach backend API (${err instanceof Error ? err.message : 'offline'}). Please run start.bat or python packages/agent/agent.py.`,
        'info'
      );
    }
  };

  // Open TEE Inspector Modal for Oracle Request
  const handleInspectRequestProof = (req: OracleRequestItem) => {
    if (!req.resolution) return;
    setActiveAttestationData({
      title: req.query,
      targetId: req.requestId,
      resolution: req.resolution
    });
    setShowTEEInspectorModal(true);
  };

  // Open TEE Inspector Modal for Market (Tab 2)
  const handleInspectMarketProof = (market: Market) => {
    if (!market.ai_analysis) return;
    setActiveAttestationData({
      title: market.title,
      targetId: market.id,
      marketAnalysis: market.ai_analysis
    });
    setShowTEEInspectorModal(true);
  };

  // Open 1-Click Order Modal
  const handleOpenOrderModal = (market: Market, side: 'BUY_YES' | 'BUY_NO') => {
    setSelectedMarket(market);
    setBetSide(side);
    setExecutionResult(null);
    setShowOrderModal(true);
  };

  // Execute Bet via NEAR Chain Signatures MPC
  const handleExecuteBet = async () => {
    if (!selectedMarket) return;
    setIsExecutingBet(true);
    const nearEquivalent = Math.max(0.5, Math.round((betAmount / 5.0) * 100) / 100);

    try {
      const res = await fetch(`${API_BASE_URL}/api/intent/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          near_account_id: currentAccount.accountId,
          market_id: selectedMarket.id,
          side: betSide,
          amount_usd: betAmount,
          limit_price: betSide === 'BUY_YES' ? selectedMarket.market_prob : (1 - selectedMarket.market_prob),
          tee_attestation_hash: selectedMarket.ai_analysis?.tee_attestation.attestation_hash || '0x0'
        })
      });

      if (res.ok) {
        const json = await res.json();
        const execRes = await fetch(`${API_BASE_URL}/api/intent/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: json.intent })
        });
        if (execRes.ok) {
          const execJson = await execRes.json();
          deductBalance(nearEquivalent);
          setExecutionResult(execJson.executed_order);
          showToast(`Polymarket order signed via NEAR MPC (v1.signer)! Deducted ${nearEquivalent} NEAR.`, 'success');
          return;
        }
      }
      throw new Error('Backend MPC endpoint unreachable');
    } catch (err) {
      showToast(`MPC Signer error: ${err instanceof Error ? err.message : 'offline'}`, 'info');
    } finally {
      setIsExecutingBet(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce duration-500 max-w-md bg-slate-900 border border-emerald-500/50 shadow-2xl shadow-emerald-500/20 rounded-2xl p-4 flex items-start space-x-3">
          <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/30 shrink-0 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <p className="font-bold text-white mb-0.5">PredicTEE Network Event</p>
            <p className="text-slate-300 leading-relaxed">{toastMessage.text}</p>
          </div>
          <button 
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800/90 bg-[#0d1424]/90 backdrop-blur sticky top-0 z-40 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Brand & Subtitle */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 ring-1 ring-white/20">
                <ShieldCheck className="w-6 h-6 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-black tracking-tight text-white">
                    Predic<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">TEE</span>
                  </span>
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40 font-mono font-semibold tracking-wide">
                    NEAR AI TEE
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Verifiable TEE AI Oracle &amp; Omnichain Resolution Engine
                </p>
              </div>
            </div>

            {/* Mobile Account pill */}
            <div className="md:hidden">
              <button 
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="flex items-center space-x-1.5 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-mono"
              >
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                <span>{currentAccount.accountId}</span>
              </button>
            </div>
          </div>

          {/* Network Indicators & Wallet Pill */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
            
            {/* Live Network Indicator */}
            <div className="hidden lg:flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
              <button
                onClick={() => setActiveNetwork(activeNetwork === 'mainnet' ? 'testnet' : 'mainnet')}
                className="flex items-center space-x-1.5 hover:text-white transition cursor-pointer"
              >
                <span className={`w-2 h-2 rounded-full ${activeNetwork === 'mainnet' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                <span className="text-slate-400">NEAR:</span>
                <span className="text-white font-semibold uppercase">{activeNetwork}</span>
              </button>
            </div>

            {/* TEE Enclave Status Badge */}
            <div className="hidden sm:flex items-center space-x-1.5 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-mono text-emerald-300">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>TEE Enclave:</span>
              <span className="font-bold text-white flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                <span>Intel TDX Online</span>
              </span>
            </div>

            {/* NEAR MPC Signer Badge */}
            <div className="hidden xl:flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-slate-400">NEAR MPC:</span>
              <span className="text-sky-300 font-semibold">v1.signer</span>
            </div>

            {/* Account Switcher Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="flex items-center space-x-2 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-850 hover:to-slate-750 border border-slate-700/80 hover:border-emerald-500/40 px-3.5 py-2 rounded-xl text-xs font-medium transition shadow-md group cursor-pointer"
              >
                <div className="w-5 h-5 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Wallet className="w-3 h-3" />
                </div>
                <div className="text-left font-mono">
                  <div className="text-white font-bold text-xs flex items-center space-x-1">
                    <span>{currentAccount.accountId}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-emerald-400 transition" />
                  </div>
                  <div className="text-[10px] text-slate-400">{currentAccount.nearBalance}</div>
                </div>
              </button>

              {/* Account Dropdown Menu */}
              {showAccountMenu && (
                <div className="absolute right-0 mt-2 w-80 bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl p-4 z-50 text-xs">
                  <div className="pb-3 border-b border-slate-800 mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">Connected NEAR Account</p>
                      <p className="text-[11px] text-slate-400">NEAR Chain Signatures Active</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      MPC Verified
                    </span>
                  </div>

                  <div className="space-y-2 mb-3">
                    <p className="text-[11px] text-slate-400 font-medium">Select Active Mock Account:</p>
                    {accounts.map(acc => (
                      <button
                        key={acc.accountId}
                        onClick={() => {
                          setCurrentAccount(acc);
                          setShowAccountMenu(false);
                          showToast(`Switched active account to ${acc.accountId}`, 'info');
                        }}
                        className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                          currentAccount.accountId === acc.accountId 
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' 
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="font-bold font-mono">{acc.accountId}</div>
                          <div className="text-[10px] text-slate-400">{acc.label}</div>
                        </div>
                        <span className="font-mono text-[11px] text-emerald-400 font-semibold">{acc.nearBalance}</span>
                      </button>
                    ))}
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 font-mono text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Derived Polygon Address:</span>
                      <button 
                        onClick={() => handleCopy(currentAccount.derivedPolygonAddress, 'polygon-addr')}
                        className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedKey === 'polygon-addr' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'polygon-addr' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="text-purple-300 break-all select-all text-[10px]">
                      {currentAccount.derivedPolygonAddress}
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                      Derivation: near-mpc-recovery v0.1.0 epsilon derivation
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Main Tab Navigation Bar */}
      <div className="border-b border-slate-800 bg-[#090e1a]/80 backdrop-blur sticky top-[69px] z-30 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between py-2">
          <div className="flex items-center space-x-2 md:space-x-3 overflow-x-auto no-scrollbar py-1">
            
            {/* Tab 1: Live Oracle Explorer */}
            <button
              onClick={() => setActiveTab('oracle')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm transition relative cursor-pointer ${
                activeTab === 'oracle' 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20' 
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Radio className={`w-4 h-4 ${activeTab === 'oracle' ? 'text-slate-950 animate-pulse' : 'text-emerald-400'}`} />
              <span>🔮 Live Oracle Explorer</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'oracle' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-emerald-400'
              }`}>
                {requests.length}
              </span>
            </button>

            {/* Tab 2: Prediction Markets & Alpha */}
            <button
              onClick={() => setActiveTab('markets')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm transition relative cursor-pointer ${
                activeTab === 'markets' 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20' 
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Zap className={`w-4 h-4 ${activeTab === 'markets' ? 'text-slate-950' : 'text-sky-400'}`} />
              <span>⚡ Prediction Markets &amp; Alpha</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'markets' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-sky-300'
              }`}>
                {markets.length}
              </span>
            </button>

            {/* Tab 3: Verified TEE Hardware Registry */}
            <button
              onClick={() => setActiveTab('hardware')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm transition relative cursor-pointer ${
                activeTab === 'hardware' 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20' 
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Server className={`w-4 h-4 ${activeTab === 'hardware' ? 'text-slate-950' : 'text-purple-400'}`} />
              <span>🛡️ Verified TEE Hardware Registry</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'hardware' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-purple-300'
              }`}>
                3 Enclaves
              </span>
            </button>

          </div>

          {/* Quick Submit Query CTA in Tab Nav */}
          <button
            onClick={() => setShowNewRequestModal(true)}
            className="hidden sm:flex items-center space-x-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/40 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit Oracle Query</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-6">

        {/* ======================================================== */}
        {/* TAB 1: 🔮 LIVE ORACLE EXPLORER (PRIMARY HACKATHON VIEW)   */}
        {/* ======================================================== */}
        {activeTab === 'oracle' && (
          <div className="space-y-6">
            
            {/* Real-time Oracle Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              
              <div className="bg-[#0e172a] border border-slate-800/90 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1.5 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Inquiries</span>
                  <Globe className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl md:text-3xl font-black text-white font-mono">{stats.totalRequests}</div>
                <div className="text-[11px] text-slate-400 mt-1 font-medium flex items-center space-x-1">
                  <span className="text-amber-400 font-semibold">{stats.pendingCount} pending</span>
                  <span>resolution</span>
                </div>
              </div>

              <div className="bg-[#0e172a] border border-slate-800/90 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1.5 text-xs font-semibold uppercase tracking-wider">
                  <span>Resolved Truths</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl md:text-3xl font-black text-emerald-400 font-mono">{stats.resolvedCount}</div>
                <div className="text-[11px] text-emerald-400 mt-1 font-medium flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>100% On-Chain ecrecover</span>
                </div>
              </div>

              <div className="bg-[#0e172a] border border-slate-800/90 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1.5 text-xs font-semibold uppercase tracking-wider">
                  <span>Active Bounties</span>
                  <TrendingUp className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-2xl md:text-3xl font-black text-teal-300 font-mono">
                  {stats.totalBountiesPaidNear.toFixed(1)} <span className="text-sm font-semibold">NEAR</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-medium">
                  Resolver incentives locked
                </div>
              </div>

              <div className="bg-[#0e172a] border border-slate-800/90 rounded-2xl p-4 shadow-sm hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1.5 text-xs font-semibold uppercase tracking-wider">
                  <span>Verified Enclaves</span>
                  <Cpu className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl md:text-3xl font-black text-purple-300 font-mono">
                  {stats.activeEnclavesCount} Nodes
                </div>
                <div className="text-[11px] text-purple-400 mt-1 font-medium">
                  Intel TDX + NVIDIA CC Mode
                </div>
              </div>

            </div>

            {/* Oracle Feed Control Bar */}
            <div className="bg-[#0d1424] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-md">
              
              {/* Search input & Category picker */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search queries, requesters, or keywords..."
                    className="w-full bg-[#080d1a] border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center space-x-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
                  <button
                    onClick={() => setRequestFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      requestFilter === 'ALL' 
                        ? 'bg-emerald-500 text-slate-950 font-bold' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({requests.length})
                  </button>
                  <button
                    onClick={() => setRequestFilter('PENDING')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer ${
                      requestFilter === 'PENDING' 
                        ? 'bg-amber-500 text-slate-950 font-bold' 
                        : 'text-amber-400 hover:text-amber-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>Pending ({requests.filter(r => r.status === 'PENDING').length})</span>
                  </button>
                  <button
                    onClick={() => setRequestFilter('RESOLVED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer ${
                      requestFilter === 'RESOLVED' 
                        ? 'bg-emerald-500 text-slate-950 font-bold' 
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Resolved ({requests.filter(r => r.status === 'RESOLVED').length})</span>
                  </button>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowNewRequestModal(true)}
                  className="flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 px-4 py-2.5 rounded-xl font-black text-xs transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Submit New Oracle Query</span>
                </button>
              </div>

            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold flex items-center space-x-1 mr-1">
                <Filter className="w-3 h-3" />
                <span>Category:</span>
              </span>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-lg font-mono text-xs transition whitespace-nowrap cursor-pointer ${
                    categoryFilter === cat 
                      ? 'bg-slate-700 text-white font-bold border border-slate-600' 
                      : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat === 'ALL' ? 'All Categories' : cat}
                </button>
              ))}
            </div>

            {/* Request Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredRequests.map(req => {
                const isResolved = req.status === 'RESOLVED';
                const isPending = req.status === 'PENDING';
                const res = req.resolution;
                const isAffirmative = res?.outcome === 'YES';
                const confidencePct = res ? (res.confidenceBps / 100).toFixed(1) : null;
                const isResolvingThis = resolvingRequestId === req.requestId;

                return (
                  <div
                    key={req.requestId}
                    className={`bg-[#0e172a] border rounded-2xl p-6 transition flex flex-col justify-between shadow-lg relative overflow-hidden group ${
                      isResolved 
                        ? 'border-slate-800 hover:border-emerald-500/40' 
                        : 'border-amber-500/40 bg-gradient-to-b from-[#131d33] to-[#0e172a]'
                    }`}
                  >
                    {/* Glowing Accent Corner */}
                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-full pointer-events-none transition ${
                      isResolved ? 'bg-emerald-500/5 group-hover:bg-emerald-500/10' : 'bg-amber-500/10'
                    }`}></div>

                    <div>
                      {/* Top Metadata Line */}
                      <div className="flex items-center justify-between mb-3 text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-semibold bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-md border border-slate-700">
                            {req.category}
                          </span>
                          <span className="font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">
                            {req.bountyNear} NEAR Bounty
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-1.5 text-slate-400 font-mono text-[11px]">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{req.requestId}</span>
                        </div>
                      </div>

                      {/* Requester & Callback Info */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3 font-mono">
                        <span className="flex items-center space-x-1 truncate max-w-[200px]">
                          <span className="text-slate-500">By:</span>
                          <span className="text-slate-300">{req.requester}</span>
                        </span>
                        {req.callbackContract && (
                          <span className="text-purple-300 truncate max-w-[180px] bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
                            callback: {req.callbackContract}
                          </span>
                        )}
                      </div>

                      {/* Query Title */}
                      <h3 className="text-lg font-bold text-white mb-4 leading-snug">
                        {req.query}
                      </h3>

                      {/* RESOLVED STATE UI */}
                      {isResolved && res && (
                        <div className="bg-[#090e1a] border border-slate-800 rounded-xl p-4 mb-4 space-y-3">
                          
                          {/* Outcome Header & Confidence Bar */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-slate-400 font-medium">TEE Decided Outcome:</span>
                              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black font-mono tracking-wider ${
                                isAffirmative 
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              }`}>
                                {res.outcome}
                              </span>
                            </div>
                            <div className="text-xs font-mono font-bold text-emerald-400">
                              {confidencePct}% Conviction
                            </div>
                          </div>

                          {/* Confidence Progress Bar */}
                          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-700"
                              style={{ width: `${confidencePct}%` }}
                            ></div>
                          </div>

                          {/* AI Reasoning Summary */}
                          {res.rationale && (
                            <p className="text-[11px] text-slate-300 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                              {res.rationale}
                            </p>
                          )}

                          {/* Evidence Sources Preview */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                              Ingested &amp; Verified Evidence Feeds:
                            </span>
                            <div className="space-y-1">
                              {req.evidenceSources.slice(0, 2).map((src, i) => (
                                <div key={i} className="flex items-center justify-between text-[11px] bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                                  <span className="text-slate-300 truncate max-w-[240px]">{src.name}</span>
                                  <span className="font-mono text-emerald-400 text-[10px]">{(src.weight * 100).toFixed(0)}% wt</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Resolver Node metadata */}
                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span className="flex items-center space-x-1 text-slate-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Resolver: {res.resolver}</span>
                            </span>
                            <span className="text-slate-500">Intel TDX Verified</span>
                          </div>

                        </div>
                      )}

                      {/* PENDING STATE UI */}
                      {isPending && (
                        <div className="bg-[#121a2d] border border-amber-500/30 rounded-xl p-4 mb-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                              <span className="text-xs font-bold text-amber-400 tracking-wide uppercase">
                                Awaiting TEE Attestation
                              </span>
                            </div>
                            <span className="text-xs font-mono text-slate-400">
                              Bounty Locked: {req.bountyNear} NEAR
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">
                            This inquiry is broadcasted to the NEAR AI TEE Enclave node cluster. Ready to be resolved by whitelisted hardware.
                          </p>

                          {/* Evidence Sources in evaluation */}
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                              Target Evidence Feeds:
                            </span>
                            <div className="space-y-1">
                              {req.evidenceSources.slice(0, 2).map((src, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-900/60 px-2.5 py-1 rounded border border-slate-800">
                                  <span className="text-slate-300">{src.name}</span>
                                  <span className="font-mono text-amber-400 text-[10px]">Weight: {(src.weight * 100).toFixed(0)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Bottom Card Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                      
                      {isResolved ? (
                        <>
                          <button
                            onClick={() => handleInspectRequestProof(req)}
                            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-emerald-400 transition font-mono cursor-pointer"
                          >
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Inspect TEE Proof</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>

                          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 font-semibold">
                            Bounty Claimed (NEAR)
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-slate-400 font-mono flex items-center space-x-1">
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Escrowed in Contract</span>
                          </span>

                          <button
                            disabled={isResolvingThis}
                            onClick={() => handleTriggerResolution(req)}
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
                          >
                            {isResolvingThis ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Generating Intel TDX Quote...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Trigger TEE Resolution</span>
                              </>
                            )}
                          </button>
                        </>
                      )}

                    </div>

                  </div>
                );
              })}
            </div>

            {/* Empty filter fallback */}
            {filteredRequests.length === 0 && (
              <div className="bg-[#0e172a] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-slate-500 mx-auto" />
                <h4 className="text-base font-bold text-white">No Oracle Requests Found</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No requests matched your active filter or search query. Try resetting filters or submit a new inquiry.
                </p>
                <button
                  onClick={() => {
                    setRequestFilter('ALL');
                    setCategoryFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            )}

          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: ⚡ PREDICTION MARKETS & ALPHA (CROSS-CHAIN MPC)    */}
        {/* ======================================================== */}
        {activeTab === 'markets' && (
          <div className="space-y-6">
            
            {/* Header / Intro banner for Cross-Chain Polymarket */}
            <div className="bg-gradient-to-r from-[#0e172a] via-[#101b33] to-[#0e172a] border border-slate-800 rounded-2xl p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2 text-xs font-mono text-sky-400 mb-1">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span>NEAR CHAIN SIGNATURES (MPC) + POLYMARKET LIQUIDITY</span>
                </div>
                <h2 className="text-xl font-bold text-white">
                  Cross-Chain Prediction Markets with Verifiable Alpha
                </h2>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  NEAR AI Cloud TEE models (z-ai/glm-5.3-flash &amp; Qwen/Qwen3.8-27B) evaluate Polymarket orderbooks inside Intel TDX &amp; NVIDIA H100 Confidential Enclaves to discover unpriced arbitrage. Sign with your NEAR account; execute on Polygon via v1.signer.
                </p>
              </div>

              <button
                onClick={handleManualRefreshMarkets}
                className="flex items-center space-x-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl border border-slate-700 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingMarkets ? 'animate-spin' : ''}`} />
                <span>Refresh Live Odds</span>
              </button>
            </div>

            {/* Markets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {markets.map((m) => {
                const ai = m.ai_analysis;
                const isBuyYes = ai?.recommended_action === 'BUY_YES';
                const divergence = ai?.alpha_divergence || 0;

                return (
                  <div 
                    key={m.id} 
                    className="bg-[#0e172a] border border-slate-800 hover:border-slate-700 rounded-2xl p-6 transition flex flex-col justify-between shadow-lg relative overflow-hidden group"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:bg-emerald-500/10 transition"></div>

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono font-semibold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">
                          {m.category}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">Vol: {m.volume_usd}</span>
                      </div>

                      <h3 className="text-lg font-bold text-white mb-4 leading-snug">{m.title}</h3>

                      {/* Probabilities Comparison Bar */}
                      <div className="bg-[#090e1a] border border-slate-800/80 rounded-xl p-4 mb-4">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-slate-400 font-medium">Polymarket Odds (Market Implied)</span>
                          <span className="font-mono font-bold text-white">{(m.market_prob * 100).toFixed(0)}% YES</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden mb-4">
                          <div 
                            className="bg-slate-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${m.market_prob * 100}%` }}
                          ></div>
                        </div>

                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-emerald-400 font-medium flex items-center space-x-1">
                            <Lock className="w-3 h-3 text-emerald-400" />
                            <span>NEAR AI True Prob (Confidential TEE)</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-400">
                            {ai ? `${(ai.ai_true_prob * 100).toFixed(0)}% YES` : 'Calculating...'}
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                            style={{ width: `${(ai?.ai_true_prob || 0.5) * 100}%` }}
                          ></div>
                        </div>

                        {/* Alpha Divergence EV Badge */}
                        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-slate-400">Alpha Divergence:</span>
                            <span className={`font-mono font-bold ${divergence > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {divergence > 0 ? `+${(divergence * 100).toFixed(1)}% (Underpriced)` : `${(divergence * 100).toFixed(1)}% (Overpriced)`}
                            </span>
                          </div>
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-medium">
                            Expected ROI: {ai?.expected_roi_percent}%
                          </span>
                        </div>
                      </div>

                      {/* AI Rationale Snippet */}
                      <div className="text-xs text-slate-300 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 mb-5 leading-relaxed font-sans">
                        <p className="text-slate-400 font-semibold mb-1 flex items-center space-x-1">
                          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                          <span>TEE Reasoning Digest:</span>
                        </p>
                        {ai?.rationale}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                      <button 
                        onClick={() => handleInspectMarketProof(m)}
                        className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-emerald-400 transition font-mono cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Inspect TEE Quote</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>

                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => handleOpenOrderModal(m, 'BUY_YES')}
                          className={`text-xs px-3.5 py-2 rounded-xl font-bold transition flex items-center space-x-1 shadow-sm cursor-pointer ${
                            isBuyYes 
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20' 
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          <span>Bet YES</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => handleOpenOrderModal(m, 'BUY_NO')}
                          className={`text-xs px-3.5 py-2 rounded-xl font-bold transition flex items-center space-x-1 cursor-pointer ${
                            !isBuyYes 
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20' 
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          <span>Bet NO</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: 🛡️ VERIFIED TEE HARDWARE REGISTRY                 */}
        {/* ======================================================== */}
        {activeTab === 'hardware' && (
          <div className="space-y-6">
            
            {/* Explanatory Banner */}
            <div className="bg-gradient-to-r from-[#0d1726] via-[#101b33] to-[#0d1726] border border-slate-800 rounded-2xl p-6 shadow-md">
              <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>ON-CHAIN VERIFIED TEE HARDWARE WHITELIST · NEP-297 COMPLIANT</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                Cryptographic Hardware Attestation &amp; Memory Enclaves
              </h2>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                Unlike traditional multi-sig or human committee oracles vulnerable to bribery and manipulation, PredicTEE resolutions are generated inside isolated Confidential Computing hardware enclaves. The NEAR smart contract validates both the TDX TD10 MRTD / RTMR0 hardware measurement and the EIP-191 ECDSA <code>signingAddress</code> via <code>near.ecrecover</code> before storing resolutions or distributing bounties.
              </p>
            </div>

            {/* Whitelisted Enclave Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {enclaves.map((enc) => (
                <div
                  key={enc.id}
                  className="bg-[#0e172a] border border-slate-800 hover:border-slate-700 rounded-2xl p-6 shadow-lg flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    
                    {/* Status Badge */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>ACTIVE &amp; VERIFIED</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">Uptime: {enc.uptime}</span>
                    </div>

                    {/* Label & Hardware */}
                    <div>
                      <h3 className="text-base font-bold text-white mb-1">{enc.label}</h3>
                      <p className="text-xs text-emerald-400/90 font-mono">{enc.hardware}</p>
                    </div>

                    {/* Model Details */}
                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5">
                      <span className="text-slate-400 block font-semibold text-[11px]">AI Model Execution Engine:</span>
                      <span className="text-purple-300 font-mono text-[11px] block">{enc.model}</span>
                    </div>

                    {/* TDX / NRAS Hardware Measurement Hash */}
                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span>TDX / NRAS Hardware Measurement:</span>
                        <button
                          onClick={() => handleCopy(enc.measurement, enc.id)}
                          className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedKey === enc.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span className="text-[10px]">{copiedKey === enc.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="font-mono text-sky-300 text-[10px] break-all select-all">
                        {enc.measurement}
                      </div>
                      {enc.signingAddress && (
                        <div className="pt-1.5 mt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400">Attested Signer:</span>
                          <span className="text-emerald-400 select-all">{enc.signingAddress}</span>
                        </div>
                      )}
                    </div>

                    {/* Isolation Guarantee */}
                    <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
                      <div className="flex items-center space-x-1 text-emerald-400 font-bold text-[11px]">
                        <Lock className="w-3 h-3" />
                        <span>Zero-Knowledge Isolation Guarantee:</span>
                      </div>
                      <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                        {enc.isolationGuarantee}
                      </p>
                    </div>

                  </div>

                  {/* Node Metrics Footer */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Resolved: <strong className="text-white">{enc.totalResolutions}</strong></span>
                    <span className="text-slate-500">{enc.attestationType.split(' ')[0]} Verified</span>
                  </div>

                </div>
              ))}
            </div>

            {/* Comparison Matrix Table */}
            <div className="bg-[#0e172a] border border-slate-800 rounded-2xl p-6 shadow-md overflow-x-auto">
              <h3 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Architectural Comparison: PredicTEE vs Legacy Oracles</span>
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Why hardware-enforced confidential AI solves the fundamental Oracle Trilemma on NEAR.
              </p>

              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-3">Feature Dimension</th>
                    <th className="py-2.5 px-3">Traditional Multi-Sig Oracles</th>
                    <th className="py-2.5 px-3">Optimistic Oracles (UMA)</th>
                    <th className="py-2.5 px-3 text-emerald-400 font-black">PredicTEE (NEAR AI + TEE)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  <tr>
                    <td className="py-3 px-3 font-semibold text-white">Trust Guarantee</td>
                    <td className="py-3 px-3 text-slate-400">Reputational (5/9 keys)</td>
                    <td className="py-3 px-3 text-slate-400">Economic Game Theory ($ Bond)</td>
                    <td className="py-3 px-3 text-emerald-300 font-semibold font-mono">Hardware Silicon Cryptographic Quote (Intel/NVIDIA)</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-semibold text-white">Resolution Latency</td>
                    <td className="py-3 px-3 text-slate-400">Minutes to hours</td>
                    <td className="py-3 px-3 text-slate-400">2 to 7 Day Dispute Window</td>
                    <td className="py-3 px-3 text-emerald-300 font-semibold font-mono">&lt; 3.0 Seconds Instant Verification</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-semibold text-white">Query Complexity</td>
                    <td className="py-3 px-3 text-slate-400">Simple Price Feeds only</td>
                    <td className="py-3 px-3 text-slate-400">Manual text token voting</td>
                    <td className="py-3 px-3 text-emerald-300 font-semibold font-mono">NEAR AI Cloud TEE (glm-5.3-flash / Qwen3.8-27B) + EIP-191 ecrecover</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-semibold text-white">Cross-Chain Execution</td>
                    <td className="py-3 px-3 text-slate-400">Requires bridge / relayer</td>
                    <td className="py-3 px-3 text-slate-400">Per-chain deployment required</td>
                    <td className="py-3 px-3 text-emerald-300 font-semibold font-mono">Native NEAR Chain Signatures (MPC) to Any Chain</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        )}

      </main>

      {/* ======================================================== */}
      {/* MODAL 1: TEE ATTESTATION PROOF INSPECTOR                 */}
      {/* ======================================================== */}
      {showTEEInspectorModal && activeAttestationData && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl relative my-8">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-emerald-400">
                  <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <span>Hardware Cryptographic Attestation</span>
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">
                      ON-CHAIN VERIFIED
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    NEAR AI Cloud Intel TDX / NVIDIA Confidential Computing Quote
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowTEEInspectorModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Inquiry / Subject Target:</span>
                <span className="text-white font-bold font-sans text-sm">{activeAttestationData.title}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block mb-1">Execution Hardware:</span>
                  <span className="text-emerald-400 font-bold flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{activeAttestationData.resolution?.hardware || activeAttestationData.marketAnalysis?.tee_attestation.hardware || 'Intel TDX / NVIDIA H100 GPU'}</span>
                  </span>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block mb-1">Model Inference Engine:</span>
                  <span className="text-purple-300 font-semibold">
                    {activeAttestationData.resolution?.model || activeAttestationData.marketAnalysis?.tee_attestation.model || 'z-ai/glm-5.3-flash'}
                  </span>
                </div>
              </div>

              {/* TDX TD10 MRTD / RTMR0 Measurement */}
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span>Enclave Measurement (TDX TD10 MRTD / RTMR0):</span>
                  <button 
                    onClick={() => handleCopy(
                      activeAttestationData.resolution?.enclaveMeasurement || activeAttestationData.marketAnalysis?.tee_attestation.enclave_measurement || 'tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b',
                      'pcr0'
                    )}
                    className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedKey === 'pcr0' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'pcr0' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <span className="text-sky-300 break-all select-all">
                  {activeAttestationData.resolution?.enclaveMeasurement || activeAttestationData.marketAnalysis?.tee_attestation.enclave_measurement || 'tdx-mrtd:df4d77c857de652bd0fafa343a2026b51071ee03773d076d283abf1a7d36ff91ffa279ee4a617ac664f7e2a2c8d5891b'}
                </span>
              </div>

              {/* Attested TEE Signing Address & EIP-191 ECDSA Signature */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span>TEE signing_address (TD10 Bound):</span>
                    <button
                      onClick={() => handleCopy(
                        activeAttestationData.resolution?.signerAddress || activeAttestationData.marketAnalysis?.tee_attestation.attested_signing_address || '0x3b753b4406613c5e70ae640508632b600424fa0c',
                        'tee-signer'
                      )}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
                    >
                      {copiedKey === 'tee-signer' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'tee-signer' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <span className="text-emerald-300 break-all select-all text-[11px]">
                    {activeAttestationData.resolution?.signerAddress || activeAttestationData.marketAnalysis?.tee_attestation.attested_signing_address || '0x3b753b4406613c5e70ae640508632b600424fa0c'}
                  </span>
                </div>

                <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span>EIP-191 ECDSA Signature (ecrecover):</span>
                    <button
                      onClick={() => handleCopy(
                        activeAttestationData.resolution?.ecdsaSignature || activeAttestationData.marketAnalysis?.tee_attestation.ecdsa_signature || '',
                        'tee-sig'
                      )}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
                    >
                      {copiedKey === 'tee-sig' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'tee-sig' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <span className="text-purple-300 break-all select-all text-[10px] block max-h-12 overflow-y-auto">
                    {activeAttestationData.resolution?.ecdsaSignature || activeAttestationData.marketAnalysis?.tee_attestation.ecdsa_signature || '0x7e4a9c2d1f8b3056a7c9e1d3f5b7092468ace13579bdf02468ace13579bdf0241b'}
                  </span>
                </div>
              </div>

              {/* Attestation Hash */}
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span>Attestation Hash (Emitted in NEP-297 Contract Event):</span>
                  <button 
                    onClick={() => handleCopy(
                      activeAttestationData.resolution?.attestationHash || activeAttestationData.marketAnalysis?.tee_attestation.attestation_hash || '0x0',
                      'att-hash'
                    )}
                    className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedKey === 'att-hash' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'att-hash' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <span className="text-amber-300 break-all select-all">
                  {activeAttestationData.resolution?.attestationHash || activeAttestationData.marketAnalysis?.tee_attestation.attestation_hash}
                </span>
              </div>

              {/* Evidence Digest */}
              {activeAttestationData.resolution?.evidenceDigest && (
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block mb-1">Evidence Feeds SHA-256 Digest:</span>
                  <span className="text-teal-300 break-all select-all">
                    {activeAttestationData.resolution.evidenceDigest}
                  </span>
                </div>
              )}

              {/* Base64 Signed Hardware Quote */}
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span>Base64 Signed Hardware Quote (Intel TDX ECDSA):</span>
                  <button 
                    onClick={() => handleCopy(
                      activeAttestationData.resolution?.attestationQuoteB64 || activeAttestationData.marketAnalysis?.tee_attestation.attestation_quote_b64 || '',
                      'quote-b64'
                    )}
                    className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
                  >
                    {copiedKey === 'quote-b64' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'quote-b64' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-950 rounded text-slate-400 text-[10px] break-all max-h-20 overflow-y-auto font-mono select-all">
                  {activeAttestationData.resolution?.attestationQuoteB64 || activeAttestationData.marketAnalysis?.tee_attestation.attestation_quote_b64}
                </div>
              </div>

              {/* Zero-Knowledge Memory Notice */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs flex items-start space-x-2.5 font-sans">
                <Lock className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                <span className="leading-relaxed">
                  <strong>Zero-Knowledge Memory Isolation Guarantee:</strong> Model weights and inference prompts were loaded into an encrypted hardware memory domain. The cloud host, hypervisor, and node operators have zero read or write visibility into runtime states.
                </span>
              </div>

            </div>

            <div className="mt-6 flex items-center justify-between">
              <a 
                href={`https://nearblocks.io/address/v1.signer`} 
                target="_blank" 
                rel="noreferrer"
                className="text-xs text-slate-400 hover:text-emerald-400 flex items-center space-x-1 font-mono transition"
              >
                <span>NEAR MPC: v1.signer (Mainnet)</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <button 
                onClick={() => setShowTEEInspectorModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: SUBMIT NEW ORACLE QUERY MODAL                   */}
      {/* ======================================================== */}
      {showNewRequestModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-slate-700 w-full max-w-xl rounded-2xl p-6 shadow-2xl relative my-8">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-emerald-400">
                  <Sparkles className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Submit New Oracle Query</h3>
                  <p className="text-xs text-slate-400">
                    Deposit NEAR bounty to incentivize verifiable resolution by Intel TDX enclaves
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewRequestModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewQuery} className="space-y-4">
              
              {/* Query Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Resolution Query / Question Prompt:
                </label>
                <textarea
                  required
                  rows={3}
                  value={newQueryText}
                  onChange={(e) => setNewQueryText(e.target.value)}
                  placeholder="e.g. Will Fed cut interest rates in Q1 2027?"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans transition"
                ></textarea>

                {/* Quick Suggestion Pills */}
                <div className="mt-2 space-y-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">Or try an example prompt:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Will Fed cut interest rates in Q1 2027?',
                      'Did Ethereum gas fee average stay below 15 gwei in Q4 2026?',
                      'Will Solana daily DEX volume surpass Uniswap in March 2027?'
                    ].map((example, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setNewQueryText(example)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-emerald-300 px-2 py-1 rounded-lg border border-slate-700 text-left transition cursor-pointer"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Category Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Category:
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {['Macro & Fed', 'Crypto Milestones', 'AI Benchmarks', 'Global Events', 'NEAR Ecosystem'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      className={`p-2 rounded-xl text-center font-medium transition border text-[11px] cursor-pointer ${
                        newCategory === cat 
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Attached Bounty Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Attached Resolver Bounty ($NEAR):
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[1.0, 2.5, 5.0, 10.0].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setNewBountyNear(amt)}
                      className={`py-2 rounded-xl font-mono text-xs font-bold transition border cursor-pointer ${
                        newBountyNear === amt 
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {amt.toFixed(1)} NEAR
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Callback contract */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Callback Contract (Optional):
                  </label>
                  <input
                    type="text"
                    value={newCallbackContract}
                    onChange={(e) => setNewCallbackContract(e.target.value)}
                    placeholder="e.g. polymarket-bridge.near"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Callback Method (Optional):
                  </label>
                  <input
                    type="text"
                    value={newCallbackMethod}
                    onChange={(e) => setNewCallbackMethod(e.target.value)}
                    placeholder="e.g. receive_resolution"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Requester Account badge */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Submitting From:</span>
                <span className="text-emerald-400 font-semibold">{currentAccount.accountId}</span>
              </div>

              {/* Submit CTA */}
              <button
                disabled={isSubmittingRequest || !newQueryText.trim()}
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold py-3 rounded-xl text-xs md:text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingRequest ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Broadcasting Query to NEAR Contract...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm &amp; Deposit {newBountyNear} NEAR Bounty</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </form>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: NEAR CHAIN SIGNATURE 1-CLICK ORDER MODAL        */}
      {/* ======================================================== */}
      {showOrderModal && selectedMarket && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-sky-500/10 rounded-xl border border-sky-500/30 text-sky-400">
                  <Activity className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">NEAR Chain Signatures 1-Click Order</h3>
                  <p className="text-xs text-slate-400">Trade on Polymarket (Polygon) gaslessly using your NEAR account</p>
                </div>
              </div>
              <button 
                onClick={() => setShowOrderModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!executionResult ? (
              <div className="space-y-4">
                <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Market:</span>
                    <span className="text-white font-semibold text-right max-w-[280px] truncate">{selectedMarket.title}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Target Outcome:</span>
                    <span className={`font-bold font-mono px-2 py-0.5 rounded ${betSide === 'BUY_YES' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {betSide} @ {(selectedMarket.market_prob * 100).toFixed(0)}¢
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">NEAR Source Account:</span>
                    <span className="text-sky-300 font-mono">{currentAccount.accountId}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-slate-400">Derived Polygon Address (MPC):</span>
                    <span className="text-purple-300 font-mono text-[11px] truncate max-w-[200px]">{currentAccount.derivedPolygonAddress}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Bet Amount (USD Equivalent in NEAR):</label>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[10, 50, 100, 250].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setBetAmount(amt)}
                        className={`py-2 rounded-xl text-xs font-mono font-bold transition border cursor-pointer ${
                          betAmount === amt 
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>NEAR MPC Contract:</span>
                    <span className="text-slate-200 font-mono">v1.signer</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Est. MPC Sign Latency:</span>
                    <span className="text-emerald-400 font-mono">~ 2.8s</span>
                  </div>
                </div>

                <button
                  disabled={isExecutingBet}
                  onClick={handleExecuteBet}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 py-3.5 rounded-xl font-bold text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isExecutingBet ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Requesting NEAR MPC Signature...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm &amp; Sign via NEAR MPC</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Order Executed Successfully!</h4>
                  <p className="text-xs text-slate-400 mt-1">Cross-chain order confirmed on Polygon CTF Exchange via NEAR MPC</p>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-left text-xs font-mono space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status:</span>
                    <span className="text-emerald-400 font-bold">{executionResult.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Derived Polygon Address:</span>
                    <span className="text-purple-300 text-[11px] select-all">
                      {executionResult.derived_polygon_address || currentAccount.derivedPolygonAddress}
                    </span>
                  </div>
                  {executionResult.eip712_digest && (
                    <div>
                      <span className="text-slate-400 block mb-0.5">EIP-712 Order Digest (chainId=137):</span>
                      <span className="text-amber-300 break-all text-[10px] select-all">{executionResult.eip712_digest}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block mb-0.5">Polygon CLOB Order Hash (Sandbox Signed):</span>
                    <span className="text-sky-300 break-all text-[10px] select-all">
                      {executionResult.polygon_tx_hash || executionResult.clob_order_hash || executionResult.eip712_digest}
                    </span>
                  </div>
                  {executionResult.mpc_sign_request && (
                    <div>
                      <span className="text-slate-400 block mb-0.5">NEAR MPC (v1.signer) Sign Request Payload:</span>
                      <div className="p-2 bg-slate-950 rounded border border-slate-800 text-[10px] text-slate-300 max-h-24 overflow-y-auto break-all select-all">
                        {JSON.stringify(executionResult.mpc_sign_request)}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400">Explorer:</span>
                    <a 
                      href={executionResult.explorer_url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline flex items-center space-x-1"
                    >
                      <span>View Derived Account on Polygonscan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <button
                  onClick={() => setShowOrderModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#0d1424] px-6 py-5 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            <strong>PredicTEE</strong> · Verifiable TEE AI Oracle on NEAR · Powered by Intel TDX &amp; NEAR Chain Signatures
          </p>
          <div className="flex items-center space-x-4 font-mono text-[11px]">
            <span className="text-emerald-400">TEE: cloud-api.near.ai (TDX + NRAS)</span>
            <span className="text-slate-600">|</span>
            <a href="https://nearblocks.io/address/v1.signer" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
              MPC: v1.signer
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
