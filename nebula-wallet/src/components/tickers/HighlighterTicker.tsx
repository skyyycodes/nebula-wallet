import { motion } from 'framer-motion';
import { Highlighter } from '@/src/components/ui/highlighter';

export default function HighlighterTicker() {
    return (
        <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="text-[#a7a7a7] text-xs md:text-sm mb-6 font-mono tracking-normal md:tracking-wider"
        >
            Secure payments for humans and{' '}
            <Highlighter action="highlight" color="#7C3AED" padding={2}>
                AI agents
            </Highlighter>{' '}
            across the{' '}
            <Highlighter action="underline" padding={0} color="#FFC412">
                Stellar x402 economy
            </Highlighter>
        </motion.p>
    );
}
