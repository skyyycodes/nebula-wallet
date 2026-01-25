import { useState, useEffect, useCallback } from 'react';
import type { SpendingAccount, ServicePolicy, TransactionActivity, AgentConfig, AgentStatus } from '../../types';

interface SpendingHookState {
  spendingAccount: { exists: boolean; address?: string; createdAt?: number } | null;
  balance: string;
  services: ServicePolicy[];
  activity: TransactionActivity[];
  agentStatus: AgentStatus | null;
  agentConfig: AgentConfig | null;
  loading: boolean;
  error: string | null;
}

function sendMessage(type: string, payload?: unknown): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

export function useSpending() {
  const [state, setState] = useState<SpendingHookState>({
    spendingAccount: null,
    balance: '0',
    services: [],
    activity: [],
    agentStatus: null,
    agentConfig: null,
    loading: true,
    error: null
  });

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }));

      const [accountRes, balanceRes, servicesRes, activityRes, agentRes] = await Promise.all([
        sendMessage('X402_GET_SPENDING_ACCOUNT'),
        sendMessage('X402_GET_SPENDING_BALANCE'),
        sendMessage('X402_GET_SERVICES'),
        sendMessage('X402_GET_ACTIVITY'),
        sendMessage('X402_GET_AGENT_STATUS')
      ]);

      setState(s => ({
        ...s,
        spendingAccount: accountRes.success ? accountRes.data : null,
        balance: balanceRes.success ? balanceRes.data.balance : '0',
        services: servicesRes.success ? servicesRes.data.services : [],
        activity: activityRes.success ? activityRes.data.activity : [],
        agentStatus: agentRes.success ? agentRes.data.status : null,
        agentConfig: agentRes.success ? agentRes.data.config : null,
        loading: false
      }));
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data'
      }));
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actions
  const createSpendingAccount = async () => {
    const res = await sendMessage('X402_CREATE_SPENDING_ACCOUNT');
    if (res.success) {
      setState(s => ({
        ...s,
        spendingAccount: { exists: true, address: res.data.address, createdAt: res.data.createdAt }
      }));
    }
    return res;
  };

  const fundSpendingAccount = async () => {
    const res = await sendMessage('X402_FUND_SPENDING_ACCOUNT');
    if (res.success) {
      setState(s => ({ ...s, balance: res.data.balance }));
    }
    return res;
  };

  const refreshBalance = async () => {
    const res = await sendMessage('X402_GET_SPENDING_BALANCE');
    if (res.success) {
      setState(s => ({ ...s, balance: res.data.balance }));
    }
    return res;
  };

  const updateServicePolicy = async (policy: ServicePolicy) => {
    const res = await sendMessage('X402_UPDATE_SERVICE_POLICY', policy);
    if (res.success) {
      setState(s => ({
        ...s,
        services: s.services.map(p => p.origin === policy.origin ? policy : p)
      }));
    }
    return res;
  };

  const deleteService = async (origin: string) => {
    const res = await sendMessage('X402_DELETE_SERVICE', { origin });
    if (res.success) {
      setState(s => ({
        ...s,
        services: s.services.filter(p => p.origin !== origin)
      }));
    }
    return res;
  };

  const updateAgentConfig = async (updates: Partial<AgentConfig>) => {
    const res = await sendMessage('X402_SET_AGENT_CONFIG', updates);
    if (res.success) {
      setState(s => ({ ...s, agentConfig: res.data.config }));
    }
    return res;
  };

  const refreshAgentStatus = async () => {
    const res = await sendMessage('X402_GET_AGENT_STATUS');
    if (res.success) {
      setState(s => ({
        ...s,
        agentStatus: res.data.status,
        agentConfig: res.data.config
      }));
    }
    return res;
  };

  return {
    ...state,
    loadData,
    createSpendingAccount,
    fundSpendingAccount,
    refreshBalance,
    updateServicePolicy,
    deleteService,
    updateAgentConfig,
    refreshAgentStatus
  };
}
