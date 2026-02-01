'use client';

import React from 'react';
import ArchitectureTitleComponent from './ArchitectureTitleComponent';
import FeatureOne from './FeatureOne';
import DonutComponent from '../ui/DonutComponent';

const productMetaOptions = [
    {
        title: 'Nebula Core',
        subtitle: 'x402-native Stellar wallet with built-in DEX',
        description:
            'Nebula Core is your gateway to Stellar. Manage multiple accounts, send payments, and swap tokens through our DEX aggregator that finds the best rates across Stellar SDEX. Native x402 support means one-click payments for paywalls, APIs, and premium content — no more subscription fatigue.',
    },
    {
        title: 'Quantum Shield',
        subtitle: 'SPHINCS+ signatures with ZK-SNARK verification',
        description:
            'Your Ed25519 key is permanently disabled (masterWeight=0). Instead, transactions are signed locally with SPHINCS+ — a NIST-approved post-quantum algorithm. A ZK proof verifies your signature on-chain without revealing it. No private key to steal, no quantum vulnerability to exploit.',
    },
    {
        title: 'Agent Builder',
        subtitle: 'Visual automation for trading and payments',
        description:
            'Drag-and-drop workflow designer for AI agents and automated strategies. Set price triggers, define swap actions, and chain conditions — no coding required. Built-in spending limits, domain whitelists, and per-agent budgets keep your funds safe while agents work autonomously.',
    },
    {
        title: 'Soroban Integration',
        subtitle: 'Smart contract verification on Stellar',
        description:
            'Our Soroban smart contract acts as the transaction gatekeeper. It verifies ZK proofs, stores pending approvals, and authorizes payments — all without holding any private keys. The relayer only pays gas fees and never has custody of your funds. True non-custodial security.',
    },
];

export default function WhoWeAre() {
    const containerRef = React.useRef<HTMLDivElement>(null);

    return (
        <>
            <ArchitectureTitleComponent firstText="HOW" secondText="IT WORKS" />
            <section id="about" ref={containerRef} className="bg-[#0a0c0d] w-screen">
                <div className="grid md:grid-cols-2 gap-0">
                    <div className="h-screen hidden md:sticky top-0 md:flex items-center justify-center bg-[#0a0c0d]">
                        <DonutComponent />
                    </div>

                    <div className="min-h-[400vh] flex flex-col justify-between z-10 bg-[#0a0c0d]">
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
