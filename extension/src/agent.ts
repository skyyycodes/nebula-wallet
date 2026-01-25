/**
 * Agent Module
 * 
 * Monitors spending account balance and triggers automatic recharges
 * from the main quantum-safe wallet when balance falls below threshold.
 * 
 * Uses chrome.alarms API for Manifest V3 compliance (service worker lifecycle).
 */

import type { AgentConfig, AgentStatus } from './types';
import {
  loadAgentConfig,
  saveAgentConfig,
  updateAgentRechargeTracking,
  loadSpendingAccount
} from './storage';
import { getSpendingBalance } from './spending';

const AGENT_ALARM_NAME = 'x402-agent-check';
const CHECK_INTERVAL_MINUTES = 5;

// In-memory cache of last check result
let lastCheckTime = 0;
let lastStatus: AgentStatus | null = null;

/**
 * Initialize the agent (called on extension startup)
 */
export async function initializeAgent(): Promise<void> {
  const config = await loadAgentConfig();
  
  if (config.enabled) {
    await startAgent();
  }
  
  console.log('[Agent] Initialized, enabled:', config.enabled);
}

/**
 * Start the agent monitoring
 */
export async function startAgent(): Promise<void> {
  // Clear any existing alarm
  await chrome.alarms.clear(AGENT_ALARM_NAME);
  
  // Create recurring alarm
  chrome.alarms.create(AGENT_ALARM_NAME, {
    periodInMinutes: CHECK_INTERVAL_MINUTES,
    delayInMinutes: 0.1 // Start first check in ~6 seconds
  });
  
  // Update config
  const config = await loadAgentConfig();
  config.enabled = true;
  await saveAgentConfig(config);
  
  console.log('[Agent] Started, checking every', CHECK_INTERVAL_MINUTES, 'minutes');
}

/**
 * Stop the agent monitoring
 */
export async function stopAgent(): Promise<void> {
  await chrome.alarms.clear(AGENT_ALARM_NAME);
  
  // Update config
  const config = await loadAgentConfig();
  config.enabled = false;
  await saveAgentConfig(config);
  
  console.log('[Agent] Stopped');
}

/**
 * Get current agent status
 */
export async function getAgentStatus(): Promise<AgentStatus> {
  const config = await loadAgentConfig();
  const balance = await getSpendingBalance();
  
  // Get next alarm time
  const alarm = await chrome.alarms.get(AGENT_ALARM_NAME);
  const nextCheck = alarm?.scheduledTime || 0;
  
  // Calculate recharges today
  const today = new Date().toDateString();
  let rechargesToday = 0;
  
  if (config.lastResetDate === today) {
    const rechargeAmount = parseFloat(config.rechargeAmount) || 10;
    const rechargedToday = parseFloat(config.rechargedToday) || 0;
    rechargesToday = Math.floor(rechargedToday / rechargeAmount);
  }
  
  lastStatus = {
    spendingBalance: balance,
    isEnabled: config.enabled,
    lastCheck: lastCheckTime,
    rechargesToday,
    nextCheck
  };
  
  return lastStatus;
}

/**
 * Update agent configuration
 */
export async function updateAgentConfig(
  updates: Partial<AgentConfig>
): Promise<AgentConfig> {
  const config = await loadAgentConfig();
  const newConfig = { ...config, ...updates };
  await saveAgentConfig(newConfig);
  
  // Start/stop based on enabled state
  if (updates.enabled === true && !config.enabled) {
    await startAgent();
  } else if (updates.enabled === false && config.enabled) {
    await stopAgent();
  }
  
  return newConfig;
}

/**
 * Check balance and trigger recharge if needed
 * This is called by the alarm handler
 */
export async function performAgentCheck(): Promise<{
  checked: boolean;
  rechargeTriggered: boolean;
  reason?: string;
}> {
  lastCheckTime = Date.now();
  
  const config = await loadAgentConfig();
  
  if (!config.enabled) {
    return { checked: false, rechargeTriggered: false, reason: 'Agent disabled' };
  }
  
  // Check if spending account exists
  const spendingAccount = await loadSpendingAccount();
  if (!spendingAccount) {
    return { checked: true, rechargeTriggered: false, reason: 'No spending account' };
  }
  
  // Get current balance
  const balance = await getSpendingBalance();
  const balanceNum = parseFloat(balance);
  const threshold = parseFloat(config.rechargeThreshold);
  
  console.log(`[Agent] Balance check: ${balanceNum} XLM, threshold: ${threshold} XLM`);
  
  if (balanceNum >= threshold) {
    return { checked: true, rechargeTriggered: false, reason: 'Balance sufficient' };
  }
  
  // Check daily recharge limit
  const today = new Date().toDateString();
  let rechargedToday = parseFloat(config.rechargedToday) || 0;
  
  if (config.lastResetDate !== today) {
    rechargedToday = 0;
  }
  
  const maxRechargePerDay = parseFloat(config.maxRechargePerDay);
  const rechargeAmount = parseFloat(config.rechargeAmount);
  
  if (rechargedToday + rechargeAmount > maxRechargePerDay) {
    console.log('[Agent] Daily recharge limit reached');
    
    // Send notification if email alerts enabled
    if (config.emailOnLowBalance && config.alertEmail) {
      // TODO: Integrate with email service
      console.log('[Agent] Would send low balance alert to:', config.alertEmail);
    }
    
    return {
      checked: true,
      rechargeTriggered: false,
      reason: 'Daily recharge limit reached'
    };
  }
  
  // Trigger recharge notification
  console.log(`[Agent] Triggering recharge of ${rechargeAmount} XLM`);
  
  // Update recharge tracking
  await updateAgentRechargeTracking(config.rechargeAmount);
  
  // Create notification for user
  try {
    await chrome.notifications.create(`recharge-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.svg',
      title: 'Low Spending Balance',
      message: `Your spending account balance is ${balanceNum.toFixed(2)} XLM. Tap to recharge ${rechargeAmount} XLM.`,
      priority: 2
    });
  } catch (err) {
    console.log('[Agent] Could not create notification:', err);
  }
  
  return {
    checked: true,
    rechargeTriggered: true,
    reason: `Balance ${balanceNum.toFixed(2)} XLM below threshold ${threshold} XLM`
  };
}

/**
 * Handle alarm events
 */
export function setupAlarmHandler(): void {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === AGENT_ALARM_NAME) {
      console.log('[Agent] Alarm triggered');
      await performAgentCheck();
    }
  });
}

/**
 * Request manual recharge (placeholder for future implementation)
 */
export async function requestManualRecharge(): Promise<{
  success: boolean;
  error?: string;
}> {
  // This would trigger a recharge from the main quantum-safe wallet
  // For now, just return a message to fund via Friendbot
  return {
    success: false,
    error: 'Manual recharge not yet implemented. Use Friendbot on testnet.'
  };
}
