'use client';
import { Dispatch, SetStateAction } from 'react';
import { FiDownload } from 'react-icons/fi';
import { VscExtensions } from 'react-icons/vsc';
import { GoPackage } from 'react-icons/go';
import OpacityBackground from './OpacityBackground';
import { Button } from '../ui/button';
import { cn } from '@/src/lib/utils';

const DOWNLOAD_URL = 'https://drive.google.com/file/d/1fhWnvHnMaJy8UQa5iNWRLCPIi64uhrDG/view?usp=drive_link';

interface InstallModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
}

const steps = [
    {
        icon: <FiDownload className="text-[#14F195] text-lg" />,
        title: 'Unzip the file',
        description: 'Extract the downloaded nebula.zip file to a folder on your computer.',
    },
    {
        icon: <VscExtensions className="text-[#9e83ff] text-lg" />,
        title: 'Enable Developer Mode',
        description:
            'Open chrome://extensions in your browser and toggle "Developer mode" on (top right).',
    },
    {
        icon: <GoPackage className="text-[#38bdf8] text-lg" />,
        title: 'Load Unpacked',
        description:
            'Click "Load unpacked" and select the dist folder from the extracted files.',
    },
];

export default function InstallModal({ open, setOpen }: InstallModalProps) {
    if (!open) return null;

    return (
        <OpacityBackground className="bg-darkest/70 z-[200]" onBackgroundClick={() => setOpen(false)}>
            <div
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className={cn(
                    'max-w-[420px] w-full mx-4',
                    'bg-gradient-to-b from-[#0a0a0a] via-darkest to-[#0d0d0d]',
                    'border border-neutral-800 rounded-[12px]',
                    'p-6 md:p-8 space-y-6',
                    'shadow-2xl',
                )}
            >
                <div className="space-y-2">
                    <h2
                        className={cn(
                            'text-xl font-bold tracking-wide',
                            'bg-gradient-to-br from-[#e9e9e9] to-[#575757]',
                            'bg-clip-text text-transparent',
                        )}
                    >
                        Install Nebula Wallet
                    </h2>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                        Follow these steps after downloading the extension.
                    </p>
                </div>

                <div className="space-y-3">
                    {steps.map((step, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 p-3 bg-neutral-900/40 border border-neutral-800 rounded-[8px]"
                        >
                            <div className="mt-0.5 flex-shrink-0 h-8 w-8 flex items-center justify-center border border-neutral-700 rounded-[6px]">
                                {step.icon}
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium text-neutral-200">
                                    <span className="text-neutral-500 mr-1.5">{i + 1}.</span>
                                    {step.title}
                                </p>
                                <p className="text-xs text-neutral-500 leading-relaxed">
                                    {step.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 w-full pt-2">
                    <Button
                        onClick={() => setOpen(false)}
                        className={cn(
                            'flex-1 px-6 py-5 text-sm font-medium',
                            'bg-[#0f0f0f] hover:bg-[#141414]',
                            'border border-neutral-800 rounded-[8px]',
                            'cursor-pointer tracking-wide transition-all',
                        )}
                    >
                        <span className="text-[#d4d8de]">Close</span>
                    </Button>
                    <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button
                            className={cn(
                                'w-full px-6 py-5 text-sm font-medium',
                                'bg-primary hover:bg-primary/80',
                                'rounded-[8px]',
                                'cursor-pointer tracking-wide transition-all',
                            )}
                        >
                            <FiDownload className="mr-1" />
                            <span className="text-light">Download</span>
                        </Button>
                    </a>
                </div>
            </div>
        </OpacityBackground>
    );
}
