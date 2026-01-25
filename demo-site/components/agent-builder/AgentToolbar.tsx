'use client';

import React from 'react';
import { Agent } from '@/types/agent-builder';
import { AgentValidator } from '@/lib/agent-builder/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play,
  Pause,
  RotateCcw,
  Save,
  Download,
  Upload,
  Settings,
  CheckCircle2,
  AlertCircle,
  Activity,
  MoreVertical,
  Wallet,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuantumWallet } from '@/hooks/useQuantumWallet';

interface AgentToolbarProps {
  agent: Agent;
  onAgentUpdate: (updates: Partial<Agent>) => void;
  onSave: () => void;
  onReset: () => void;
}

export default function AgentToolbar({
  agent,
  onAgentUpdate,
  onSave,
  onReset,
}: AgentToolbarProps) {
  const [showResetDialog, setShowResetDialog] = React.useState(false);
  const [isValidating, setIsValidating] = React.useState(false);
  const { isInstalled, isConnected, address, isLoading, connect, disconnect } = useQuantumWallet();

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleWalletClick = async () => {
    if (!isInstalled) {
      toast.error('Wallet not installed', {
        description: 'Please install the Quantum Stellar Wallet extension',
      });
      return;
    }

    try {
      if (isConnected) {
        await disconnect();
        toast.success('Wallet disconnected');
      } else {
        await connect();
        toast.success('Wallet connected');
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'User rejected connection') {
        toast.error('Connection failed', {
          description: error.message,
        });
      }
    }
  };

  const handleToggleActive = () => {
    if (!agent.isActive) {
      // Validate before activating
      const validation = AgentValidator.validate(agent);
      if (!validation.valid) {
        toast.error('Cannot activate agent', {
          description: validation.errors[0],
        });
        return;
      }
    }

    onAgentUpdate({
      isActive: !agent.isActive,
      status: !agent.isActive ? 'active' : 'paused',
    });

    toast.success(
      agent.isActive ? 'Agent paused' : 'Agent activated',
      {
        description: agent.isActive
          ? 'Your agent has been paused'
          : 'Your agent is now running',
      }
    );
  };

  const handleValidate = () => {
    setIsValidating(true);
    
    setTimeout(() => {
      const validation = AgentValidator.validate(agent);
      
      if (validation.isValid) {
        toast.success('Validation passed!', {
          description: 'Your agent is ready to run',
        });
      } else {
        toast.error('Validation failed', {
          description: validation.errors.join(', '),
        });
      }

      if (validation.warnings.length > 0) {
        toast.warning('Warnings found', {
          description: validation.warnings.join(', '),
        });
      }

      setIsValidating(false);
    }, 500);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(agent, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${agent.name.replace(/\s+/g, '_')}_agent.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Agent exported');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          // Basic validation
          if (imported.blocks && imported.connections) {
            onAgentUpdate({
              blocks: imported.blocks,
              connections: imported.connections,
            });
            toast.success('Agent imported successfully');
          } else {
            toast.error('Invalid agent file');
          }
        } catch (error) {
          toast.error('Failed to import agent');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleReset = () => {
    setShowResetDialog(false);
    onReset();
    toast.success('Agent reset');
  };

  const validation = AgentValidator.validate(agent);

  return (
    <>
      <div className="flex items-center justify-between p-3 bg-transparent">
        {/* Agent Info */}
        <div className="flex items-center gap-4 flex-1">
          <Input
            value={agent.name}
            onChange={(e) => onAgentUpdate({ name: e.target.value })}
            className="max-w-xs font-semibold"
            placeholder="Agent name"
          />

          <div className="flex items-center gap-2">
            <Badge
              variant={agent.isActive ? 'default' : 'secondary'}
              className="gap-1"
            >
              <Activity className="w-3 h-3" />
              {agent.status}
            </Badge>

            <Badge
              key={validation.isValid ? 'valid-badge' : 'error-badge'}
              variant="outline"
              className={validation.isValid
                ? "gap-1 text-green-600 border-green-600"
                : "gap-1 text-destructive border-destructive"
              }
            >
              {validation.isValid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {validation.isValid ? 'Valid' : `${validation.errors.length} error(s)`}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Wallet Connection Button */}
          {isConnected ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20"
                >
                  <Wallet className="w-4 h-4" />
                  {truncateAddress(address || '')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(address || '');
                    toast.success('Address copied');
                  }}
                >
                  Copy Address
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleWalletClick} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleWalletClick}
              disabled={isLoading}
              className="gap-2"
            >
              <Wallet className="w-4 h-4" />
              {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}

          <Button
            key={agent.isActive ? 'pause-btn' : 'activate-btn'}
            variant={agent.isActive ? 'destructive' : 'default'}
            size="sm"
            onClick={handleToggleActive}
            className="gap-2"
          >
            {agent.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {agent.isActive ? 'Pause' : 'Activate'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={isValidating}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Validate
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            Save
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export Agent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImport}>
                <Upload className="w-4 h-4 mr-2" />
                Import Agent
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowResetDialog(true)}
                className="text-destructive"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all blocks and connections. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-destructive">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
