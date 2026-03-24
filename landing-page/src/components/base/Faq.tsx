'use client';
import { cn } from '@/src/lib/utils';
import { useState, useRef, memo } from 'react';
import { AiOutlinePlus } from 'react-icons/ai';
import { doto } from './FeatureOne';
import { motion, useInView } from 'framer-motion';
import { Button } from '../ui/button';
import { FaGithub } from 'react-icons/fa';

const GITHUB_URL = 'https://github.com/Eshan276/nebulav2';

/* eslint-disable react/prop-types */
interface FaqData {
    question: string;
    answer: string;
}

interface FaqItemProps {
    faq: FaqData;
    index: number;
    isOpen: boolean;
    onToggle: () => void;
}

const FaqItem = memo<FaqItemProps>(({ faq, index, isOpen, onToggle }) => {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: '-50px' });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={cn(
                'overflow-hidden transition-all duration-300',
                index <= 6 ? 'border-b border-neutral-300' : '',
            )}
        >
            <div
                onClick={onToggle}
                className="w-full py-5 flex items-center justify-between text-left transition-colors duration-200 cursor-pointer hover:opacity-80"
            >
                <span className="text-lg font-semibold text-[#141517] pr-4 hover:text-[#14151795] transition-colors">
                    {faq.question}
                </span>
                <AiOutlinePlus
                    className={`w-6 h-6 text-primary flex-shrink-0 transition-transform duration-300 ${
                        isOpen ? 'rotate-45' : ''
                    }`}
                />
            </div>
            <div
                className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? 'max-h-96' : 'max-h-0'
                }`}
            >
                <div className="pb-6 pt-1">
                    <p className="text-darkest/70 leading-relaxed text-left">{faq.answer}</p>
                </div>
            </div>
        </motion.div>
    );
});

FaqItem.displayName = 'FaqItem';

export default function Faq() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const faqs: FaqData[] = [
        {
            question: 'What is Nebula Wallet?',
            answer: 'Nebula Wallet is a quantum-safe Chrome extension wallet for the Stellar blockchain. It combines post-quantum cryptography (XMSS), zero-knowledge proofs, and secure agent automation to provide future-proof security against quantum computer attacks.',
        },
        {
            question: 'What makes Nebula "quantum-safe"?',
            answer: 'Traditional wallets use Ed25519 signatures which are vulnerable to quantum computers running Shor\'s algorithm. Nebula disables your Ed25519 key entirely and instead uses XMSS (a hash-based post-quantum signature scheme) combined with ZK-SNARKs to authorize transactions through a smart contract. This means even if quantum computers break Ed25519, your funds remain secure.',
        },
        {
            question: 'Why did Nebula choose XMSS?',
            answer: 'XMSS is a practical hash-based signature approach designed for post-quantum security. It avoids the assumptions used by classical public-key systems and gives Nebula a clear path for long-term key protection while keeping signing logic deterministic and verifiable.',
        },
        {
            question: 'How does the AI Agent Builder work?',
            answer: 'The Agent Builder is a visual drag-and-drop workflow designer that lets you automate trading and payments without coding. You can create triggers (price thresholds, time-based), set conditions, and execute actions (swaps, transfers). Agents have built-in spending limits and domain whitelisting for security.',
        },
        {
            question: 'What blockchain does Nebula use?',
            answer: 'Nebula is built on Stellar and Soroban (Stellar\'s smart contract platform). We chose Stellar for its fast finality (3-5 seconds), low fees, and built-in DEX. The quantum-safe verification happens through a Soroban smart contract that validates ZK proofs of your XMSS signatures.',
        },
        {
            question: 'Is my private key safe?',
            answer: 'Yes, and here\'s why: Your original Ed25519 key is permanently disabled (masterWeight=0) so it cannot sign transactions. Your XMSS key signs locally, and a ZK proof is generated to verify the signature without revealing it. The relayer only pays gas fees and never has custody of your funds. There\'s no private key that can be stolen to drain your wallet.',
        },
        {
            question: 'Can I swap tokens with Nebula?',
            answer: 'Yes! Nebula includes a built-in DEX aggregator that fetches quotes from multiple sources including Stellar\'s native SDEX orderbook. It finds the best route, calculates price impact, handles slippage, and automatically creates trustlines for new assets. You can swap any Stellar token with just a few clicks.',
        },
        {
            question: 'How do I get started?',
            answer: 'Download the Chrome extension from our GitHub repository, create a new wallet or import an existing Stellar account, and you\'re ready to go. For quantum-safe mode, you\'ll need to register your XMSS public key with our verification contract. Check out the README for detailed setup instructions.',
        },
    ];

    const toggleFaq = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section
            id="faq"
            className="relative min-h-screen bg-light px-6 md:px-12 lg:px-20 py-16 lg:py-20 z-10"
        >
            <div
                className="absolute inset-0 z-0"
                style={{
                    backgroundImage: `
        radial-gradient(circle, rgb(108, 68, 252) 2px, transparent 2px)
      `,
                    backgroundSize: '40px 40px',
                    backgroundPosition: '0 0',
                }}
            />
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
                    <div className="flex flex-col items-start justify-start gap-8 lg:gap-12">
                        <h1
                            className={cn(
                                'text-6xl lg:text-[12rem] font-black text-darkest leading-tight text-left bg-light z-10 select-none',
                                doto.className,
                            )}
                        >
                            FAQs
                        </h1>
                        <div className="absolute bottom-2 left-0 md:bottom-12 md:left-10 text-[10px] md:text-[18px] z-10 bg-light p-3">
                            <div className="md:max-w-2xl max-w-sm flex flex-col justify-start items-start text-dark text-md font-normal">
                                <span>Spotted an issue?</span>
                                <span>Help us improve — open it on GitHub.</span>
                                <div className="flex items-end justify-center gap-x-2 md:gap-x-3 mt-2">
                                    <Button
                                        onClick={() => window.open(GITHUB_URL, '_blank')}
                                        className="font-semibold text-xs md:text-base !px-4 md:!px-6 rounded-[4px]"
                                    >
                                        <FaGithub className="mr-2" />
                                        GitHub
                                    </Button>
                                    <span className="font-light text-primary tracking-wide md:text-xs border-b border-primary py-1 cursor-pointer">
                                        Stay in the loop
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 bg-light z-10 py-6 px-6">
                        {faqs.map((faq, index) => (
                            <FaqItem
                                key={index}
                                faq={faq}
                                index={index}
                                isOpen={openIndex === index}
                                onToggle={() => toggleFaq(index)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
