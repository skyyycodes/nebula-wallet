'use client';

import React from 'react';
import ArchitectureTitleComponent from './ArchitectureTitleComponent';
import FeatureOne from './FeatureOne';
import DonutComponent from '../ui/DonutComponent';

const productMetaOptions = [
    {
        title: 'Nebula Core',
        subtitle: 'x402-native Stellar wallet engine',
        description:
            'Nebula Core handles your Stellar accounts, signing, and x402 payment flows. It understands HTTP 402 challenges, builds the right Stellar transactions, and settles in XLM or stablecoins while keeping the UX simple for humans and AI agents.',
    },
    {
        title: 'Quantum Layer',
        subtitle: 'Post‑quantum signing & durable receipts',
        description:
            'The Quantum Layer dual‑signs every critical transaction with both classic Ed25519 and post‑quantum cryptography. It anchors compact receipts on Soroban, giving you verifiable payment proofs that stay secure even in a post‑quantum world.',
    },
    {
        title: 'Agent Control Plane',
        subtitle: 'Budgets, policies, and endpoint controls',
        description:
            'The Agent Control Plane lets you fund AI agents without losing control. Define per‑agent budgets, daily caps, and domain whitelists so Nebula can approve x402 payments automatically while enforcing your safety rules in real time.',
    },
];

export default function WhoWeAre() {
    const containerRef = React.useRef<HTMLDivElement>(null);

    return (
        <>
            <ArchitectureTitleComponent firstText="NEBULA's" secondText="ARCHITECTURE" />
            <section ref={containerRef} className="bg-[#0a0c0d] w-screen">
                <div className="grid md:grid-cols-2 gap-0">
                    <div className="h-screen hidden md:sticky top-0 md:flex items-center justify-center bg-[#0a0c0d]">
                        <DonutComponent />
                    </div>

                    <div className="min-h-[300vh] flex flex-col justify-between z-10 bg-[#0a0c0d]">
                        {productMetaOptions.map((option, index) => (
                            <FeatureOne
                                key={index}
                                title={option.title}
                                subTitle={option.subtitle}
                                description={option.description}
                            />
                        ))}
                    </div>
                </div>
            </section>
        </>
    );
}
